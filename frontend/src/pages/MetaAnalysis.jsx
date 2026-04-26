import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'

const META_ICONS = {
  settings: <span className="material-symbols-rounded text-[18px]">settings</span>,
  play: <span className="material-symbols-rounded text-[18px]">play_arrow</span>,
  layers: <span className="material-symbols-rounded text-[18px]">stacks</span>,
  add: <span className="material-symbols-rounded text-[18px]">add</span>,
  delete: <span className="material-symbols-rounded text-[18px]">delete</span>,
  link: <span className="material-symbols-rounded text-[18px]">link</span>,
  upload: <span className="material-symbols-rounded text-[18px]">upload_file</span>,
  extract: <span className="material-symbols-rounded text-[18px]">auto_awesome</span>,
  check: <span className="material-symbols-rounded text-[18px]">check_circle</span>,
  warn: <span className="material-symbols-rounded text-[18px]">warning</span>,
  download: <span className="material-symbols-rounded text-[18px]">download</span>,
  roc: <span className="material-symbols-rounded text-[18px]">show_chart</span>,
}

function ci95(effect, se) {
  return [effect - 1.96 * se, effect + 1.96 * se]
}

function computePooled(studies, model) {
  const w = studies.map(st => 1 / (st.se * st.se))
  const wSum = w.reduce((a, b) => a + b, 0)
  if (model === 'fixed') {
    const pooled = studies.reduce((s, st, i) => s + w[i] * st.effect, 0) / wSum
    return { effect: pooled, se: Math.sqrt(1 / wSum) }
  }
  const yBar = studies.reduce((s, st, i) => s + w[i] * st.effect, 0) / wSum
  const Q = studies.reduce((s, st, i) => s + w[i] * (st.effect - yBar) ** 2, 0)
  const c = wSum - w.reduce((s, wi) => s + wi * wi / wSum, 0)
  const tau2 = Math.max(0, (Q - (studies.length - 1)) / c)
  const wStar = studies.map(st => 1 / (st.se * st.se + tau2))
  const wStarSum = wStar.reduce((a, b) => a + b, 0)
  return { effect: studies.reduce((s, st, i) => s + wStar[i] * st.effect, 0) / wStarSum, se: Math.sqrt(1 / wStarSum) }
}

function computeHeterogeneity(studies, pooled) {
  const k = studies.length
  if (k < 2) return { i2: 0, q: 0, p: 1 }
  const w = studies.map(st => 1 / (st.se * st.se))
  const wSum = w.reduce((a, b) => a + b, 0)
  const yBar = studies.reduce((s, st, i) => s + w[i] * st.effect, 0) / wSum
  const Q = studies.reduce((s, st, i) => s + w[i] * (st.effect - yBar) ** 2, 0)
  const df = k - 1
  const p = Q > df ? Math.exp(-0.5 * (Q - df)) : 1 - Math.exp(-0.5 * (df - Q))
  const I2 = Math.max(0, ((Q - df) / Q) * 100)
  return { i2: I2.toFixed(1), q: Q.toFixed(2), p: parseFloat(p.toFixed(4)) }
}

export default function MetaAnalysis() {
  const { session } = useAuth()
  const [mainTab, setMainTab] = useState('meta')

  return (
    <div className="space-y-10">
      <header>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-main">
            Metanálise Avançada
          </h1>
          <p className="text-sm text-text-muted font-medium">Combine resultados de múltiplos estudos ou avalie poder discriminativo com Curva ROC.</p>
        </motion.div>
      </header>

      <div className="flex gap-2 bg-surface rounded-2xl p-1.5 w-fit">
        <button
          onClick={() => setMainTab('meta')}
          className={`px-6 py-3 rounded-xl text-[10px] font-semibold tracking-wide transition-all ${
            mainTab === 'meta'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-text-muted hover:text-text-main border border-transparent'
          }`}
        >
          {META_ICONS.layers} Metanálise
        </button>
        <button
          onClick={() => setMainTab('roc')}
          className={`px-6 py-3 rounded-xl text-[10px] font-semibold tracking-wide transition-all ${
            mainTab === 'roc'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-text-muted hover:text-text-main border border-transparent'
          }`}
        >
          {META_ICONS.roc} Curva ROC
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mainTab === 'meta' ? (
          <motion.div key="meta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <MetaAnalysisContent session={session} />
          </motion.div>
        ) : (
          <motion.div key="roc" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <RocCurveContent session={session} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PIPELINE_STEPS = [
  { key: 'classifier', label: 'Classificação', icon: 'category' },
  { key: 'structure', label: 'Mapeamento', icon: 'account_tree' },
  { key: 'extractor', label: 'Extração', icon: 'auto_awesome' },
  { key: 'validator', label: 'Validação', icon: 'verified' },
  { key: 'plot_data', label: 'Geração', icon: 'insert_chart' },
]

function MetaAnalysisContent({ session }) {
  const API_URL = import.meta.env.VITE_API_BASE_URL
  const [settings, setSettings] = useState({ measure: 'MD', model: 'random' })
  const [importUrl, setImportUrl] = useState('')
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineError, setPipelineError] = useState(null)
  const [pipelineResult, setPipelineResult] = useState(null)
  const [pipelineSteps, setPipelineSteps] = useState({})
  const [studies, setStudies] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tableSelectModal, setTableSelectModal] = useState(null)
  const [expandedWarnings, setExpandedWarnings] = useState({})
  const pdfInputRef = useRef(null)
  const forestRef = useRef(null)

  const addStudy = () => setStudies(prev => [...prev, { name: '', n: '', effect: '', se: '', ci_lower: '', ci_upper: '', weight: null, subgroup: null, source: 'manual', warnings: [] }])
  const removeStudy = (idx) => setStudies(prev => prev.filter((_, i) => i !== idx))
  const updateStudy = (idx, field, value) => {
    setStudies(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const _mapStudy = (s, i, source) => ({
    name: s.name || `Estudo ${i + 1}`,
    n: s.n?.toString() || '',
    effect: s.effect?.toString() || '',
    se: s.se?.toString() || '',
    ci_lower: s.ci_lower?.toString() || '',
    ci_upper: s.ci_upper?.toString() || '',
    weight: s.weight,
    subgroup: s.subgroup,
    source: source || 'ai',
    warnings: s.warnings || []
  })

  const runPipeline = async (formData) => {
    setPipelineRunning(true)
    setPipelineError(null)
    setPipelineResult(null)
    setPipelineSteps({})

    PIPELINE_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setPipelineSteps(prev => {
          if (prev[step.key]?.status === 'done' || prev[step.key]?.status === 'failed') return prev
          return { ...prev, [step.key]: { status: 'running', duration_ms: null } }
        })
      }, i * 600)
    })

    try {
      const res = await fetch(`${API_URL}/api/meta/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.token}` },
        body: formData
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao processar o pipeline.')
      }

      const data = await res.json()
      setPipelineResult(data)

      const finalSteps = {}
      PIPELINE_STEPS.forEach(step => {
        const stepData = data.pipeline?.[step.key]
        if (stepData) {
          const failed = step.key === 'classifier' ? !stepData.passed :
                         step.key === 'validator' ? !stepData.passed : false
          finalSteps[step.key] = {
            status: failed ? 'failed' : 'done',
            duration_ms: stepData.duration_ms,
            data: stepData
          }
        } else {
          finalSteps[step.key] = { status: data.status === 'failed' ? 'failed' : 'done', duration_ms: null }
        }
      })
      setPipelineSteps(finalSteps)

      if (data.pipeline?.classifier && !data.pipeline.classifier.passed) {
        setPipelineError(`Artigo não classificado como metanálise (probabilidade: ${data.pipeline.classifier.probability}%). ${data.pipeline.classifier.reason || ''}`)
        setPipelineRunning(false)
        return
      }

      if (data.needs_user_input?.type === 'multiple_tables') {
        setTableSelectModal(data.needs_user_input.details)
      }

      // Extrair novos estudos e ADICIONAR aos existentes (não substituir)
      const source = data.pipeline?.extractor?.method || 'ai'
      let newStudies = []
      if (data.pipeline?.validator?.studies?.length > 0) {
        newStudies = data.pipeline.validator.studies.map((s, i) => _mapStudy(s, i, source))
      } else if (data.studies?.length > 0) {
        newStudies = data.studies.map((s, i) => _mapStudy(s, i, source))
      }

      if (newStudies.length > 0) {
        // Filtrar estudos vazios existentes (placeholders) antes de adicionar
        setStudies(prev => {
          const existing = prev.filter(s => s.name || s.effect || s.se)
          return [...existing, ...newStudies]
        })
        setImportUrl('')
      } else if (data.needs_user_input?.type === 'no_data') {
        setPipelineError('Nenhum dado numérico encontrado neste artigo. Tente outro link ou insira os dados manualmente.')
      }

    } catch (err) {
      setPipelineError(err.message)
      const failedSteps = {}
      PIPELINE_STEPS.forEach(step => {
        failedSteps[step.key] = { status: 'failed', duration_ms: null }
      })
      setPipelineSteps(failedSteps)
    }
    setPipelineRunning(false)
  }

  const submitUrl = async () => {
    if (!importUrl.trim()) return
    const formData = new FormData()
    formData.append('url', importUrl.trim())
    await runPipeline(formData)
  }

  const submitPdf = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    await runPipeline(formData)
    e.target.value = ''
  }

  const runAnalysis = () => {
    setLoading(true)
    const validStudies = studies
      .filter(s => s.name && s.effect && s.se)
      .map((s, i) => ({
        id: `S${String(i + 1).padStart(3, '0')}`,
        name: s.name,
        n: parseInt(s.n) || 0,
        effect: parseFloat(s.effect),
        se: parseFloat(s.se)
      }))

    if (validStudies.length < 2) {
      setResult({ error: 'Insira pelo menos 2 estudos válidos com nome, efeito e erro-padrão.' })
      setLoading(false)
      return
    }

    const wTotal = validStudies.reduce((sum, s) => sum + 1 / (s.se * s.se), 0)
    const annotated = validStudies.map(s => {
      const [ciLow, ciHigh] = ci95(s.effect, s.se)
      const w = 1 / (s.se * s.se)
      return { ...s, ciLow, ciHigh, weight: (w / wTotal) * 100 }
    })

    const pooledData = computePooled(annotated, settings.model)
    const [pLow, pHigh] = ci95(pooledData.effect, pooledData.se)
    const heterogeneity = computeHeterogeneity(annotated, pooledData)

    const plotStudies = pipelineResult?.pipeline?.plot_data?.studies
    const plotPooledRandom = pipelineResult?.pipeline?.plot_data?.pooled_random
    const plotPooledFixed = pipelineResult?.pipeline?.plot_data?.pooled_fixed
    const plotHeterogeneity = pipelineResult?.pipeline?.plot_data?.heterogeneity
    const plotScale = pipelineResult?.pipeline?.plot_data?.scale

    if (plotStudies && plotStudies.length > 0) {
      setResult({
        studies: annotated,
        pooled: settings.model === 'random'
          ? { effect: plotPooledRandom?.effect ?? pooledData.effect, ciLow: plotPooledRandom?.ci_lower ?? pLow, ciHigh: plotPooledRandom?.ci_upper ?? pHigh }
          : { effect: plotPooledFixed?.effect ?? pooledData.effect, ciLow: plotPooledFixed?.ci_lower ?? pLow, ciHigh: plotPooledFixed?.ci_upper ?? pHigh },
        heterogeneity: plotHeterogeneity
          ? { i2: plotHeterogeneity.i2?.toFixed(1), q: plotHeterogeneity.q?.toFixed(2), tau2: plotHeterogeneity.tau2?.toFixed(4), p: plotHeterogeneity.p, df: plotHeterogeneity.df }
          : heterogeneity,
        scale: plotScale
      })
    } else {
      setResult({
        studies: annotated,
        pooled: { effect: pooledData.effect, ciLow: pLow, ciHigh: pHigh },
        heterogeneity,
        scale: null
      })
    }
    setLoading(false)
  }

  const getNullValue = () => (settings.measure === 'OR' || settings.measure === 'RR') ? 1 : 0

  const getForestScale = () => {
    if (result?.scale) return result.scale
    if (!result?.studies) return { min: -2, max: 4, null_value: getNullValue() }
    const allVals = []
    result.studies.forEach(s => { allVals.push(s.ciLow, s.ciHigh, s.effect) })
    if (result.pooled) { allVals.push(result.pooled.ciLow, result.pooled.ciHigh) }
    const dataMin = Math.min(...allVals)
    const dataMax = Math.max(...allVals)
    const pad = (dataMax - dataMin) * 0.15 || 0.5
    return { min: dataMin - pad, max: dataMax + pad, null_value: getNullValue() }
  }

  const exportForestPng = () => {
    if (!forestRef.current) return
    const svgEl = forestRef.current.querySelector('svg')
    if (!svgEl) return

    // Clonar SVG e adaptar cores para fundo branco
    const clone = svgEl.cloneNode(true)

    // Mapa de substituição: cores escuras do tema → cores para fundo branco
    const colorMap = {
      'rgba(255,255,255,0.35)': 'rgba(0,0,0,0.5)',
      'rgba(255,255,255,0.25)': 'rgba(0,0,0,0.35)',
      'rgba(255,255,255,0.15)': 'rgba(0,0,0,0.2)',
      'rgba(255,255,255,0.1)': 'rgba(0,0,0,0.12)',
      'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.1)',
      'rgba(148,163,184,0.3)': 'rgba(100,116,139,0.5)',
    }

    // Trocar cores inline (stroke, fill)
    clone.querySelectorAll('*').forEach(el => {
      const stroke = el.getAttribute('stroke')
      if (stroke && colorMap[stroke]) el.setAttribute('stroke', colorMap[stroke])
      const fill = el.getAttribute('fill')
      if (fill && colorMap[fill]) el.setAttribute('fill', colorMap[fill])
    })

    // Trocar gradientes do hover para transparente (não aparece no export)
    clone.querySelectorAll('stop').forEach(stop => {
      const color = stop.getAttribute('stop-color') || ''
      if (color.includes('0,255,163')) {
        stop.setAttribute('stop-color', 'rgba(0,0,0,0)')
      }
    })

    // Trocar marcadores de efeito (verde → preto)
    clone.querySelectorAll('rect[fill="#5eead4"], polygon[fill="#5eead4"]').forEach(el => {
      el.setAttribute('fill', '#111827')
    })

    // Remover filtros de glow (não fazem sentido em fundo branco)
    clone.querySelectorAll('[filter]').forEach(el => el.removeAttribute('filter'))

    // Injetar estilo para sobrescrever classes Tailwind
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      text { fill: #1e293b !important; font-family: Arial, Helvetica, sans-serif !important; }
      .fill-stone-400, .fill-stone-500, .fill-stone-600 { fill: #475569 !important; }
      .fill-white { fill: #111827 !important; }
      .fill-primary { fill: #059669 !important; }
    `
    clone.insertBefore(style, clone.firstChild)

    const svgData = new XMLSerializer().serializeToString(clone)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const scale = 3
      const plotW = 900
      const plotH = 600
      const footerH = 40
      const canvas = document.createElement('canvas')
      canvas.width = plotW * scale
      canvas.height = (plotH + footerH) * scale
      const ctx = canvas.getContext('2d')

      // Fundo branco
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)

      // Desenhar SVG
      ctx.drawImage(img, 0, 0, plotW, plotH)
      URL.revokeObjectURL(url)

      // Footer: "Feito com PaperMetrics ©"
      ctx.fillStyle = '#9ca3af'
      ctx.font = '12px Arial, Helvetica, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Feito com PaperMetrics \u00A9', plotW / 2, plotH + 26)

      const link = document.createElement('a')
      link.download = `forest_plot_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = url
  }

  const sourceBadge = (src) => {
    const conf = {
      'ai': { label: 'AI', cls: 'text-violet-400 bg-violet-400/10 border-violet-400/20' },
      'ai+regex': { label: 'AI+Regex', cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
      'regex': { label: 'Regex', cls: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20' },
      'manual': { label: 'Manual', cls: 'text-text-muted bg-surface border-border-subtle' },
      'link': { label: 'Link', cls: 'text-primary bg-primary/10 border-primary/20' },
      'pdf': { label: 'PDF', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    }
    const c = conf[src] || conf.manual
    return <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${c.cls}`}>{c.label}</span>
  }

  const studyValidationClass = (s) => {
    if (!s.effect || !s.se) return 'border-stone-500/30 bg-stone-500/5'
    if (s.warnings && s.warnings.length > 0) return 'border-amber-500/30 bg-amber-500/5'
    return 'border-primary/20 bg-primary/5'
  }

  const validStudyCount = studies.filter(s => s.name && s.effect && s.se).length

  const allWarnings = pipelineResult?.pipeline?.validator?.warnings || []
  const validityScore = pipelineResult?.pipeline?.validator?.validity_score

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* ===== LEFT PANEL ===== */}
      <div className="space-y-6">

        {/* Import Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h3 className="text-[10px] font-semibold tracking-wide text-primary mb-6 flex items-center gap-2">
            {META_ICONS.link} Importar Artigo
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold tracking-wider text-text-muted block mb-2">Colar link do artigo</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                  className="flex-1 bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitUrl() } }}
                  disabled={pipelineRunning}
                />
                <button
                  onClick={submitUrl}
                  disabled={pipelineRunning || !importUrl.trim()}
                  className="px-4 bg-primary/10 border border-primary/20 text-primary rounded-xl hover:bg-primary/20 transition-all disabled:opacity-40"
                >
                  {pipelineRunning ? <span className="animate-spin block w-[18px] h-[18px] border-2 border-primary/30 border-t-primary rounded-full"></span> : META_ICONS.extract}
                </button>
              </div>
              <p className="text-[9px] text-stone-600 mt-1.5">PubMed, SciELO, Google Scholar, DOI, ou qualquer URL</p>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle"></div></div>
              <div className="relative flex justify-center text-[9px] font-bold text-stone-600 bg-transparent px-3">ou</div>
            </div>

            <button
              onClick={() => pdfInputRef.current?.click()}
              disabled={pipelineRunning}
              className="w-full py-3.5 border border-dashed border-border-subtle rounded-xl text-xs font-bold text-text-muted hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {pipelineRunning ? <span className="animate-spin w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full"></span> : META_ICONS.upload}
              {pipelineRunning ? 'Processando pipeline...' : 'Anexar PDF do artigo'}
            </button>
            <input ref={pdfInputRef} type="file" accept=".pdf" onChange={submitPdf} className="hidden" />
          </div>
        </motion.div>

        {/* Pipeline Progress */}
        {Object.keys(pipelineSteps).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted mb-5 flex items-center gap-2">
              <span className="material-symbols-rounded text-[18px]">timeline</span> Pipeline de Processamento
            </h3>
            <div className="space-y-1">
              {PIPELINE_STEPS.map((step, idx) => {
                const stepState = pipelineSteps[step.key] || { status: 'pending' }
                const statusColors = {
                  pending: 'text-stone-600 border-border-subtle bg-white/[0.02]',
                  running: 'text-amber-400 border-amber-400/20 bg-amber-400/5',
                  done: 'text-primary border-primary/20 bg-primary/5',
                  failed: 'text-text-muted border-stone-400/20 bg-stone-400/5',
                }
                const statusIcons = {
                  pending: 'radio_button_unchecked',
                  running: 'sync',
                  done: 'check_circle',
                  failed: 'cancel',
                }
                return (
                  <motion.div
                    key={step.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${statusColors[stepState.status]}`}
                  >
                    <span className={`material-symbols-rounded text-[16px] ${stepState.status === 'running' ? 'animate-spin' : ''}`}>
                      {statusIcons[stepState.status]}
                    </span>
                    <span className="material-symbols-rounded text-[16px] opacity-60">{step.icon}</span>
                    <span className="text-[10px] font-bold tracking-wider flex-1">{step.label}</span>
                    {stepState.duration_ms != null && (
                      <span className="text-[9px] font-mono text-text-muted">{stepState.duration_ms}ms</span>
                    )}
                  </motion.div>
                )
              })}
            </div>
            {pipelineError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-3 bg-stone-500/10 border border-stone-500/20 rounded-xl text-text-muted text-[10px] font-bold leading-relaxed">
                {META_ICONS.warn} <span className="ml-1">{pipelineError}</span>
              </motion.div>
            )}
            {pipelineResult?.pipeline?.classifier && !pipelineResult.pipeline.classifier.passed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 bg-stone-500/10 border border-stone-500/20 rounded-xl space-y-2">
                <p className="text-text-muted text-[10px] font-semibold tracking-wider">Artigo não reconhecido como metanálise</p>
                <p className="text-text-muted text-[10px] leading-relaxed">
                  Probabilidade: <span className="text-text-muted font-bold">{pipelineResult.pipeline.classifier.probability}%</span>
                </p>
                {pipelineResult.pipeline.classifier.reason && (
                  <p className="text-text-muted text-[9px] leading-relaxed">{pipelineResult.pipeline.classifier.reason}</p>
                )}
              </motion.div>
            )}
            {validityScore != null && (
              <div className="mt-4 flex items-center gap-3 px-3 py-2 bg-surface rounded-lg border border-border-subtle">
                <span className="text-[10px] font-bold tracking-wider text-text-muted">Score de Validade</span>
                <span className={`text-lg font-semibold ${validityScore >= 80 ? 'text-primary' : validityScore >= 50 ? 'text-amber-400' : 'text-text-muted'}`}>
                  {validityScore}%
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Validation Warnings */}
        {allWarnings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 border-amber-500/10">
            <h3 className="text-[10px] font-semibold tracking-wide text-amber-400 mb-4 flex items-center gap-2">
              {META_ICONS.warn} Avisos de Validação
            </h3>
            <div className="space-y-2">
              {allWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-400/5 border border-amber-400/10 rounded-lg">
                  <span className="material-symbols-rounded text-[14px] text-amber-400 mt-0.5 shrink-0">info</span>
                  <span className="text-[10px] text-stone-300 leading-relaxed">{w}</span>
                </div>
              ))}
            </div>
            {studies.some(s => s.warnings && s.warnings.length > 0) && (
              <div className="mt-4 space-y-2">
                <p className="text-[9px] font-bold tracking-wider text-text-muted">Avisos por estudo</p>
                {studies.map((s, idx) => (s.warnings && s.warnings.length > 0) ? (
                  <div key={idx}>
                    <button
                      onClick={() => setExpandedWarnings(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      className="flex items-center gap-2 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors w-full text-left"
                    >
                      <span className="material-symbols-rounded text-[14px]">{expandedWarnings[idx] ? 'expand_less' : 'expand_more'}</span>
                      {s.name || `Estudo ${idx + 1}`} ({s.warnings.length})
                    </button>
                    <AnimatePresence>
                      {expandedWarnings[idx] && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="pl-6 pt-1 space-y-1">
                            {s.warnings.map((w, wi) => (
                              <p key={wi} className="text-[9px] text-text-muted">{w}</p>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : null)}
              </div>
            )}
          </motion.div>
        )}

        {/* Settings Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
          <h3 className="text-[10px] font-semibold tracking-wide text-primary mb-6 flex items-center gap-2">
            {META_ICONS.settings} Parâmetros do Modelo
          </h3>
          <div className="space-y-5">
            {[
              {
                label: 'Medida de Efeito',
                key: 'measure',
                hint: 'Tipo de dado que os estudos reportam',
                options: [
                  { v: 'MD', l: 'MD — Diferença de Médias' },
                  { v: 'OR', l: 'OR — Odds Ratio (Razão de Chances)' },
                  { v: 'RR', l: 'RR — Risco Relativo' },
                  { v: 'SMD', l: 'SMD — Diferença de Médias Padronizada' },
                ],
                descriptions: {
                  MD: 'Use quando os estudos medem o mesmo desfecho na mesma escala (ex: pressão arterial em mmHg).',
                  OR: 'Use para desfechos binários (sim/não). Compara as chances de um evento entre grupos.',
                  RR: 'Use para desfechos binários. Compara a probabilidade do evento entre grupos.',
                  SMD: 'Use quando os estudos medem o mesmo desfecho mas em escalas diferentes (ex: dor em escalas distintas).',
                }
              },
              {
                label: 'Modelo de Agrupamento',
                key: 'model',
                hint: 'Como combinar os resultados dos estudos',
                options: [
                  { v: 'random', l: 'Efeitos Aleatórios' },
                  { v: 'fixed', l: 'Efeitos Fixos' },
                ],
                descriptions: {
                  random: 'Recomendado na maioria dos casos. Assume que os estudos estimam efeitos diferentes (heterogeneidade esperada).',
                  fixed: 'Use quando os estudos são muito semelhantes (mesma população, intervenção e desfecho).',
                }
              },
            ].map(field => (
              <div key={field.key} className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider text-text-muted block">{field.label}</label>
                <select
                  value={settings[field.key]}
                  onChange={e => setSettings(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {field.options.map(o => <option key={o.v} value={o.v} className="bg-stone-900">{o.l}</option>)}
                </select>
                {field.hint && <p className="text-[9px] text-stone-600">{field.hint}</p>}
                {field.descriptions && (
                  <p className="text-[9px] text-text-muted bg-surface rounded-lg px-3 py-2 leading-relaxed">
                    {field.descriptions[settings[field.key]]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={runAnalysis}
            disabled={loading || validStudyCount < 2}
            className="w-full bg-primary hover:bg-primary-hover text-stone-900 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-6"
          >
            <span className={loading ? 'animate-spin' : ''}>{META_ICONS.play}</span>
            {loading ? 'Processando...' : `Executar Metanálise (${validStudyCount} estudos)`}
          </button>
        </motion.div>

        {/* Heterogeneity / Stats Summary (left panel, compact) */}
        {result && !result.error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 border-primary/20">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted mb-4 flex items-center gap-2">
              {META_ICONS.layers} Estatísticas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                <p className="text-xl font-semibold text-primary">{result.heterogeneity.i2}%</p>
                <p className="text-[9px] font-bold text-text-muted">I-Quadrado</p>
              </div>
              <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                <p className="text-xl font-semibold text-text-main">{result.heterogeneity.q}</p>
                <p className="text-[9px] font-bold text-text-muted">Q de Cochran</p>
              </div>
              {result.heterogeneity.tau2 != null && (
                <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                  <p className="text-lg font-semibold text-text-main">{result.heterogeneity.tau2}</p>
                  <p className="text-[9px] font-bold text-text-muted">Tau-quadrado</p>
                </div>
              )}
              <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                <p className={`text-lg font-semibold ${parseFloat(result.heterogeneity.p) < 0.05 ? 'text-amber-400' : 'text-primary'}`}>{result.heterogeneity.p}</p>
                <p className="text-[9px] font-bold text-text-muted">P-Valor (Q)</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-surface rounded-xl border border-border-subtle">
              <p className="text-[9px] font-bold text-text-muted mb-1">Efeito Combinado ({settings.model === 'random' ? 'Aleatório' : 'Fixo'})</p>
              <p className="text-lg font-semibold text-primary">
                {result.pooled.effect.toFixed(3)}{' '}
                <span className="text-text-muted text-xs font-mono">[{result.pooled.ciLow.toFixed(3)}, {result.pooled.ciHigh.toFixed(3)}]</span>
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ===== RIGHT PANEL ===== */}
      <div className="lg:col-span-2 space-y-6">

        {/* Table Select Modal */}
        <AnimatePresence>
          {tableSelectModal && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card p-6 border-amber-400/20">
              <h3 className="text-[10px] font-semibold tracking-wide text-amber-400 mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-[18px]">table_chart</span> Múltiplas Tabelas Detectadas
              </h3>
              <p className="text-[10px] text-text-muted mb-4">Selecione qual tabela contém os dados dos estudos para a metanálise:</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(tableSelectModal.tables || []).map((tbl, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (tbl.studies) {
                        setStudies(tbl.studies.map((s, si) => ({
                          name: s.name || `Estudo ${si + 1}`,
                          n: s.n?.toString() || '',
                          effect: s.effect?.toString() || '',
                          se: s.se?.toString() || '',
                          ci_lower: s.ci_lower?.toString() || '',
                          ci_upper: s.ci_upper?.toString() || '',
                          weight: s.weight,
                          subgroup: s.subgroup,
                          source: 'ai',
                          warnings: s.warnings || []
                        })))
                      }
                      setTableSelectModal(null)
                    }}
                    className="w-full text-left p-4 bg-surface border border-border-subtle rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all"
                  >
                    <p className="text-xs font-bold text-text-main">{tbl.id || `Tabela ${i + 1}`}</p>
                    {tbl.preview && <p className="text-[9px] text-text-muted mt-1 truncate">{tbl.preview}</p>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setTableSelectModal(null)}
                className="mt-4 w-full py-2 border border-border-subtle rounded-xl text-[10px] font-bold text-text-muted hover:text-text-main transition-colors"
              >
                Ignorar e inserir manualmente
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Document Structure (shown on no_data) */}
        {pipelineResult?.needs_user_input?.type === 'no_data' && pipelineResult?.pipeline?.structure && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 border-stone-500/20">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted mb-4 flex items-center gap-2">
              <span className="material-symbols-rounded text-[18px]">description</span> Estrutura do Documento
            </h3>
            <p className="text-[10px] text-text-muted mb-3">Seções encontradas no documento. Insira os estudos manualmente na tabela abaixo.</p>
            <div className="flex flex-wrap gap-2">
              {(pipelineResult.pipeline.structure.sections || []).map((sec, i) => (
                <span key={i} className="text-[9px] font-bold text-text-muted bg-surface px-3 py-1.5 rounded-lg border border-border-subtle">{sec.name}</span>
              ))}
            </div>
            {(pipelineResult.pipeline.structure.tables || []).length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] font-bold tracking-wider text-text-muted mb-2">Tabelas encontradas</p>
                <div className="flex flex-wrap gap-2">
                  {pipelineResult.pipeline.structure.tables.map((tbl, i) => (
                    <span key={i} className="text-[9px] font-bold text-amber-400 bg-amber-400/5 px-3 py-1.5 rounded-lg border border-amber-400/10">{tbl.id}</span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Studies Table */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted border-l-2 border-primary/30 pl-4">
              Estudos Extraídos ({studies.length})
            </h3>
            <button
              onClick={addStudy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-[10px] font-semibold tracking-wide hover:bg-primary/20 transition-all"
            >
              {META_ICONS.add} Adicionar
            </button>
          </div>

          {studies.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-600 text-xs italic">
              <span className="material-symbols-rounded text-[40px] mb-3 opacity-30">science</span>
              Importe um artigo por link ou PDF para extrair os estudos automaticamente, ou adicione manualmente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-left py-2 px-2 min-w-[140px]">Estudo</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[60px]">N</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[80px]">Efeito</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[80px]">IC Inf</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[80px]">IC Sup</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[70px]">SE</th>
                    <th className="text-[9px] font-semibold tracking-wider text-text-muted text-center py-2 px-1 w-[60px]">Fonte</th>
                    <th className="w-[30px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {studies.map((s, idx) => (
                    <tr key={idx} className={`border-b border-border-subtle transition-colors ${studyValidationClass(s)} rounded`}>
                      <td className="py-1.5 px-1">
                        <input
                          placeholder="Nome do estudo"
                          value={s.name}
                          onChange={e => updateStudy(idx, 'name', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-main placeholder-stone-600 focus:outline-none focus:ring-0 py-1"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number" placeholder="N"
                          value={s.n}
                          onChange={e => updateStudy(idx, 'n', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-main text-center placeholder-stone-600 focus:outline-none focus:ring-0 py-1 font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number" step="0.01" placeholder="0.00"
                          value={s.effect}
                          onChange={e => updateStudy(idx, 'effect', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-main text-center placeholder-stone-600 focus:outline-none focus:ring-0 py-1 font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number" step="0.01" placeholder="IC-"
                          value={s.ci_lower}
                          onChange={e => updateStudy(idx, 'ci_lower', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-muted text-center placeholder-stone-600 focus:outline-none focus:ring-0 py-1 font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number" step="0.01" placeholder="IC+"
                          value={s.ci_upper}
                          onChange={e => updateStudy(idx, 'ci_upper', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-muted text-center placeholder-stone-600 focus:outline-none focus:ring-0 py-1 font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="number" step="0.01" placeholder="SE"
                          value={s.se}
                          onChange={e => updateStudy(idx, 'se', e.target.value)}
                          className="w-full bg-transparent border-0 text-xs text-text-main text-center placeholder-stone-600 focus:outline-none focus:ring-0 py-1 font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-1 text-center">{sourceBadge(s.source)}</td>
                      <td className="py-1.5 px-1">
                        <button onClick={() => removeStudy(idx)} className="text-text-muted/40 hover:text-text-muted transition-colors">
                          {META_ICONS.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Forest Plot */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-8 min-h-[500px] flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted border-l-2 border-primary/30 pl-4">Gráfico de Floresta (Forest Plot)</h3>
            {result && !result.error && (
              <button
                onClick={exportForestPng}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-[10px] font-semibold tracking-wide hover:bg-primary/20 transition-all"
              >
                {META_ICONS.download} Exportar PNG
              </button>
            )}
          </div>

          <div ref={forestRef} className="flex-1 flex items-center justify-center">
            {result?.error ? (
              <div className="text-text-muted text-xs font-bold">{result.error}</div>
            ) : !result ? (
              <div className="text-stone-600 text-xs italic text-center max-w-sm">
                Importe estudos por link/PDF ou insira manualmente, configure os parametros e execute o modelo para gerar o grafico.
              </div>
            ) : (() => {
              const scale = getForestScale()
              const svgW = 900
              const leftMargin = 180
              const rightMargin = 180
              const plotLeft = leftMargin
              const plotRight = svgW - rightMargin
              const plotWidth = plotRight - plotLeft
              const studyCount = result.studies.length
              const rowH = Math.min(35, Math.max(22, 350 / studyCount))
              const topPad = 50
              const bottomPad = 80
              const svgH = topPad + studyCount * rowH + bottomPad

              const toX = (v) => {
                const ratio = (v - scale.min) / (scale.max - scale.min)
                return plotLeft + ratio * plotWidth
              }

              const nullX = toX(scale.null_value)
              const maxWeight = Math.max(...result.studies.map(s => s.weight || 0), 1)

              return (
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto">
                  <defs>
                    <filter id="glow-forest" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="forest-row-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(94,234,212,0)" />
                      <stop offset="50%" stopColor="rgba(94,234,212,0.08)" />
                      <stop offset="100%" stopColor="rgba(94,234,212,0)" />
                    </linearGradient>
                  </defs>

                  {/* Header */}
                  <text x={plotLeft - 10} y={topPad - 20} textAnchor="end" className="fill-stone-500 font-semibold" style={{ fontSize: '9px' }}>ESTUDO</text>
                  <text x={plotLeft + plotWidth / 2} y={topPad - 20} textAnchor="middle" className="fill-stone-500 font-semibold" style={{ fontSize: '9px' }}>EFEITO (IC 95%)</text>
                  <text x={svgW - 10} y={topPad - 20} textAnchor="end" className="fill-stone-500 font-semibold" style={{ fontSize: '9px' }}>PESO</text>

                  {/* Null line */}
                  <line x1={nullX} y1={topPad - 5} x2={nullX} y2={topPad + studyCount * rowH + 5} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 3" />
                  <text x={nullX} y={topPad - 8} textAnchor="middle" className="fill-stone-600" style={{ fontSize: '8px' }}>{scale.null_value}</text>

                  {/* Tick marks */}
                  {(() => {
                    const range = scale.max - scale.min
                    const rawStep = range / 6
                    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
                    const stepOptions = [1, 2, 2.5, 5, 10]
                    const step = stepOptions.map(s => s * mag).find(s => range / s <= 8) || rawStep
                    const ticks = []
                    let t = Math.ceil(scale.min / step) * step
                    while (t <= scale.max) {
                      ticks.push(parseFloat(t.toFixed(6)))
                      t += step
                    }
                    return ticks.map(tick => {
                      const x = toX(tick)
                      return (
                        <g key={tick}>
                          <line x1={x} y1={topPad + studyCount * rowH + 5} x2={x} y2={topPad + studyCount * rowH + 10} stroke="rgba(255,255,255,0.1)" />
                          <text x={x} y={topPad + studyCount * rowH + 22} textAnchor="middle" className="fill-stone-600" style={{ fontSize: '8px' }}>{tick}</text>
                        </g>
                      )
                    })
                  })()}

                  {/* Study rows */}
                  {result.studies.map((s, i) => {
                    const y = topPad + i * rowH + rowH / 2
                    const ciLowX = toX(Math.max(s.ciLow, scale.min))
                    const ciHighX = toX(Math.min(s.ciHigh, scale.max))
                    const effectX = toX(s.effect)
                    const w = s.weight || (1 / result.studies.length * 100)
                    const markerSize = Math.max(4, Math.min(14, 4 + (w / maxWeight) * 10))

                    return (
                      <g key={s.id || i} className="group">
                        <rect x="0" y={y - rowH / 2} width={svgW} height={rowH} fill="url(#forest-row-grad)" className="opacity-0 group-hover:opacity-100 transition-opacity" />

                        {/* Study name */}
                        <text x={plotLeft - 10} y={y + 4} textAnchor="end" className="fill-stone-400" style={{ fontSize: '10px' }}>
                          {s.name.length > 22 ? s.name.substring(0, 22) + '...' : s.name}
                        </text>

                        {/* CI line */}
                        <line x1={ciLowX} y1={y} x2={ciHighX} y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />

                        {/* CI whiskers */}
                        {s.ciLow >= scale.min && <line x1={ciLowX} y1={y - 3} x2={ciLowX} y2={y + 3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />}
                        {s.ciHigh <= scale.max && <line x1={ciHighX} y1={y - 3} x2={ciHighX} y2={y + 3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />}

                        {/* Arrow if CI extends beyond scale */}
                        {s.ciLow < scale.min && <polygon points={`${plotLeft},${y} ${plotLeft + 5},${y - 3} ${plotLeft + 5},${y + 3}`} fill="rgba(255,255,255,0.25)" />}
                        {s.ciHigh > scale.max && <polygon points={`${plotRight},${y} ${plotRight - 5},${y - 3} ${plotRight - 5},${y + 3}`} fill="rgba(255,255,255,0.25)" />}

                        {/* Effect marker (square proportional to weight) */}
                        <rect
                          x={effectX - markerSize / 2}
                          y={y - markerSize / 2}
                          width={markerSize}
                          height={markerSize}
                          fill="#5eead4"
                          rx="1"
                          
                        />

                        {/* Effect value + CI */}
                        <text x={plotRight + 8} y={y + 4} className="fill-stone-400 font-mono" style={{ fontSize: '9px' }}>
                          {s.effect.toFixed(2)} [{s.ciLow.toFixed(2)}, {s.ciHigh.toFixed(2)}]
                        </text>

                        {/* Weight */}
                        <text x={svgW - 10} y={y + 4} textAnchor="end" className="fill-stone-600 font-mono" style={{ fontSize: '9px' }}>
                          {w.toFixed(1)}%
                        </text>
                      </g>
                    )
                  })}

                  {/* Separator line */}
                  <line x1={plotLeft - 10} y1={topPad + studyCount * rowH + 2} x2={plotRight + 10} y2={topPad + studyCount * rowH + 2} stroke="rgba(255,255,255,0.08)" />

                  {/* Pooled diamond */}
                  {(() => {
                    const dy = topPad + studyCount * rowH + 30
                    const diamondCenterX = toX(result.pooled.effect)
                    const diamondLeftX = toX(Math.max(result.pooled.ciLow, scale.min))
                    const diamondRightX = toX(Math.min(result.pooled.ciHigh, scale.max))
                    const diamondH = 8
                    return (
                      <g>
                        <text x={plotLeft - 10} y={dy + 4} textAnchor="end" className="fill-white font-semibold" style={{ fontSize: '10px' }}>
                          {settings.model === 'random' ? 'Ef. Aleatório' : 'Ef. Fixo'}
                        </text>
                        <polygon
                          points={`${diamondCenterX},${dy - diamondH} ${diamondRightX},${dy} ${diamondCenterX},${dy + diamondH} ${diamondLeftX},${dy}`}
                          fill="#5eead4"
                          
                        />
                        <text x={plotRight + 8} y={dy + 4} className="fill-primary font-mono font-bold" style={{ fontSize: '10px' }}>
                          {result.pooled.effect.toFixed(2)} [{result.pooled.ciLow.toFixed(2)}, {result.pooled.ciHigh.toFixed(2)}]
                        </text>
                      </g>
                    )
                  })()}

                  {/* Bottom labels */}
                  {(() => {
                    const labelY = topPad + studyCount * rowH + 55
                    return (
                      <g>
                        <text x={toX(scale.null_value) - 30} y={labelY} textAnchor="end" className="fill-stone-500" style={{ fontSize: '9px' }}>
                          Favorece Controle
                        </text>
                        <text x={toX(scale.null_value) + 30} y={labelY} textAnchor="start" className="fill-stone-500" style={{ fontSize: '9px' }}>
                          Favorece Tratamento
                        </text>
                        {/* Arrows */}
                        <line x1={toX(scale.null_value) - 35} y1={labelY - 4} x2={plotLeft + 20} y2={labelY - 4} stroke="rgba(148,163,184,0.3)" strokeWidth="1" markerEnd="" />
                        <polygon points={`${plotLeft + 20},${labelY - 4} ${plotLeft + 26},${labelY - 7} ${plotLeft + 26},${labelY - 1}`} fill="rgba(148,163,184,0.3)" />
                        <line x1={toX(scale.null_value) + 35} y1={labelY - 4} x2={plotRight - 20} y2={labelY - 4} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                        <polygon points={`${plotRight - 20},${labelY - 4} ${plotRight - 26},${labelY - 7} ${plotRight - 26},${labelY - 1}`} fill="rgba(148,163,184,0.3)" />
                      </g>
                    )
                  })()}
                </svg>
              )
            })()}
          </div>
        </motion.div>

        {/* Stats Summary (below forest) */}
        {result && !result.error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted mb-4 border-l-2 border-primary/30 pl-4">Resumo Estatístico</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-surface rounded-xl border border-border-subtle text-center">
                <p className={`text-2xl font-semibold ${parseFloat(result.heterogeneity.i2) > 50 ? 'text-amber-400' : parseFloat(result.heterogeneity.i2) > 75 ? 'text-text-muted' : 'text-primary'}`}>
                  {result.heterogeneity.i2}%
                </p>
                <p className="text-[9px] font-bold text-text-muted mt-1">Heterogeneidade (I2)</p>
                <p className="text-[8px] text-stone-600 mt-0.5">
                  {parseFloat(result.heterogeneity.i2) < 25 ? 'Baixa' : parseFloat(result.heterogeneity.i2) < 50 ? 'Moderada' : parseFloat(result.heterogeneity.i2) < 75 ? 'Substancial' : 'Considerável'}
                </p>
              </div>
              <div className="p-3 bg-surface rounded-xl border border-border-subtle text-center">
                <p className="text-2xl font-semibold text-primary">{result.pooled.effect.toFixed(3)}</p>
                <p className="text-[9px] font-bold text-text-muted mt-1">Efeito Combinado</p>
                <p className="text-[8px] text-stone-600 mt-0.5 font-mono">[{result.pooled.ciLow.toFixed(3)}, {result.pooled.ciHigh.toFixed(3)}]</p>
              </div>
              <div className="p-3 bg-surface rounded-xl border border-border-subtle text-center">
                <p className="text-2xl font-semibold text-text-main">{result.studies.length}</p>
                <p className="text-[9px] font-bold text-text-muted mt-1">Estudos Incluídos</p>
                <p className="text-[8px] text-stone-600 mt-0.5">N total: {result.studies.reduce((sum, s) => sum + (s.n || 0), 0)}</p>
              </div>
              <div className="p-3 bg-surface rounded-xl border border-border-subtle text-center">
                <p className="text-lg font-semibold text-text-main">{settings.model === 'random' ? 'Aleatório' : 'Fixo'}</p>
                <p className="text-[9px] font-bold text-text-muted mt-1">Modelo</p>
                <p className="text-[8px] text-stone-600 mt-0.5">{settings.measure}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function RocCurveContent({ session }) {
  const API_URL = import.meta.env.VITE_API_BASE_URL
  const [rocTab, setRocTab] = useState('upload')
  const [rocFile, setRocFile] = useState(null)
  const [scoreCol, setScoreCol] = useState('')
  const [labelCol, setLabelCol] = useState('')
  const [availableCols, setAvailableCols] = useState([])
  const [rocResult, setRocResult] = useState(null)
  const [rocLoading, setRocLoading] = useState(false)
  const [rocError, setRocError] = useState(null)
  const [manualScores, setManualScores] = useState('')
  const [manualLabels, setManualLabels] = useState('')
  const svgRef = useRef(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRocFile(file)
    setRocError(null)
    setRocResult(null)

    try {
      const contents = await file.text()
      const lines = contents.split('\n').filter(l => l.trim())
      if (lines.length > 0) {
        const sep = lines[0].includes(';') ? ';' : ','
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''))
        setAvailableCols(headers)
        if (headers.length >= 2) {
          setScoreCol(headers[headers.length - 2])
          setLabelCol(headers[headers.length - 1])
        }
      }
    } catch {
      setRocError('Não foi possível ler o arquivo.')
    }
  }

  const runRoc = async () => {
    setRocLoading(true)
    setRocError(null)
    setRocResult(null)

    try {
      if (rocTab === 'upload' && rocFile) {
        const formData = new FormData()
        formData.append('file', rocFile)
        if (scoreCol) formData.append('score_column', scoreCol)
        if (labelCol) formData.append('label_column', labelCol)

        const res = await fetch(`${API_URL}/api/meta/roc`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.token}` },
          body: formData
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Erro ao calcular curva ROC.')
        }

        const data = await res.json()
        setRocResult(data)
      } else if (rocTab === 'manual') {
        const scores = manualScores.split(/[,;\s]+/).map(Number).filter(n => !isNaN(n))
        const labels = manualLabels.split(/[,;\s]+/).map(Number).filter(n => !isNaN(n))

        if (scores.length !== labels.length) {
          throw new Error('Número de scores e labels deve ser igual.')
        }
        if (scores.length < 3) {
          throw new Error('Mínimo de 3 observações necessário.')
        }

        const formData = new FormData()
        formData.append('data', JSON.stringify({ scores, labels }))

        const res = await fetch(`${API_URL}/api/meta/roc`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.token}` },
          body: formData
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Erro ao calcular curva ROC.')
        }

        const data = await res.json()
        setRocResult(data)
      }
    } catch (err) {
      setRocError(err.message)
    }
    setRocLoading(false)
  }

  const exportRocPng = () => {
    if (!svgRef.current) return
    const svgEl = svgRef.current.querySelector('svg')
    if (!svgEl) return

    // Clonar e adaptar cores para fundo branco
    const clone = svgEl.cloneNode(true)

    const colorMap = {
      'rgba(255,255,255,0.04)': 'rgba(0,0,0,0.06)',
      'rgba(255,255,255,0.15)': 'rgba(0,0,0,0.2)',
    }
    clone.querySelectorAll('*').forEach(el => {
      const stroke = el.getAttribute('stroke')
      if (stroke && colorMap[stroke]) el.setAttribute('stroke', colorMap[stroke])
    })

    // Substituir gradientes para fundo branco
    clone.querySelectorAll('stop').forEach(stop => {
      const color = stop.getAttribute('stop-color') || ''
      if (color === 'rgba(94,234,212,0.25)') stop.setAttribute('stop-color', 'rgba(5,150,105,0.15)')
      if (color === 'rgba(94,234,212,0.02)') stop.setAttribute('stop-color', 'rgba(5,150,105,0.02)')
      if (color === '#5eead4') stop.setAttribute('stop-color', '#059669')
      if (color === '#2dd4bf') stop.setAttribute('stop-color', '#047857')
    })

    // Trocar cores da curva e badge
    clone.querySelectorAll('path[stroke="url(#roc-line-grad)"]').forEach(el => {
      el.setAttribute('stroke', '#059669')
    })
    clone.querySelectorAll('rect[fill="rgba(10,10,26,0.85)"]').forEach(el => {
      el.setAttribute('fill', 'rgba(255,255,255,0.9)')
      el.setAttribute('stroke', 'rgba(5,150,105,0.4)')
    })

    // Remover filtros de glow
    clone.querySelectorAll('[filter]').forEach(el => el.removeAttribute('filter'))

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      text { fill: #334155 !important; font-family: Arial, Helvetica, sans-serif !important; }
      .fill-stone-400, .fill-stone-500, .fill-stone-600 { fill: #475569 !important; }
      .fill-primary { fill: #059669 !important; }
    `
    clone.insertBefore(style, clone.firstChild)

    const svgData = new XMLSerializer().serializeToString(clone)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      const scale = 3
      const plotW = 800
      const plotH = 500
      const footerH = 40
      const canvas = document.createElement('canvas')
      canvas.width = plotW * scale
      canvas.height = (plotH + footerH) * scale
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, plotW, plotH)
      URL.revokeObjectURL(url)

      // Footer
      ctx.fillStyle = '#9ca3af'
      ctx.font = '12px Arial, Helvetica, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Feito com PaperMetrics \u00A9', plotW / 2, plotH + 26)

      const link = document.createElement('a')
      link.download = `curva_roc_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = url
  }

  const rocWidth = 700
  const rocHeight = 400
  const rocPad = 60
  const toRocX = (v) => rocPad + v * (rocWidth - 2 * rocPad)
  const toRocY = (v) => rocHeight - rocPad - v * (rocHeight - 2 * rocPad)

  const buildRocPath = (fpr, tpr) => {
    if (fpr.length === 0) return ''
    let d = `M ${toRocX(fpr[0])} ${toRocY(tpr[0])}`
    for (let i = 1; i < fpr.length; i++) {
      d += ` L ${toRocX(fpr[i])} ${toRocY(tpr[i])}`
    }
    return d
  }

  const aucInterpretation = (auc) => {
    if (auc >= 0.9) return { label: 'Excelente', color: 'text-primary' }
    if (auc >= 0.8) return { label: 'Bom', color: 'text-teal-300' }
    if (auc >= 0.7) return { label: 'Razoável', color: 'text-amber-400' }
    if (auc >= 0.6) return { label: 'Ruim', color: 'text-orange-400' }
    return { label: 'Sem poder', color: 'text-text-muted' }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h3 className="text-[10px] font-semibold tracking-wide text-primary mb-6 flex items-center gap-2">
            {META_ICONS.roc} Dados para Curva ROC
          </h3>

          <div className="flex gap-1 mb-4 bg-surface rounded-xl p-1">
            <button onClick={() => setRocTab('upload')} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${rocTab === 'upload' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-main'}`}>
              {META_ICONS.upload} Upload CSV
            </button>
            <button onClick={() => setRocTab('manual')} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${rocTab === 'manual' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-main'}`}>
              {META_ICONS.add} Manual
            </button>
          </div>

          <AnimatePresence mode="wait">
            {rocTab === 'upload' ? (
              <motion.div key="roc-upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-text-muted block mb-2">Arquivo CSV</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-[10px] file:font-semibold file:uppercase file:tracking-wide file:cursor-pointer focus:outline-none"
                  />
                  <p className="text-[9px] text-stone-600 mt-1.5">CSV com coluna de scores (contínua) e desfecho (0/1 ou 2 categorias)</p>
                </div>

                {rocFile && availableCols.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold tracking-wider text-text-muted block">Coluna de Score (preditor)</label>
                      <select
                        value={scoreCol}
                        onChange={e => setScoreCol(e.target.value)}
                        className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {availableCols.map(c => <option key={c} value={c} className="bg-stone-900">{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold tracking-wider text-text-muted block">Coluna de Desfecho (0=negativo, 1=positivo)</label>
                      <select
                        value={labelCol}
                        onChange={e => setLabelCol(e.target.value)}
                        className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {availableCols.map(c => <option key={c} value={c} className="bg-stone-900">{c}</option>)}
                      </select>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="roc-manual" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-wider text-text-muted block">Scores (valores contínuos, separados por vírgula)</label>
                  <textarea
                    value={manualScores}
                    onChange={e => setManualScores(e.target.value)}
                    placeholder="0.85, 0.72, 0.91, 0.33, 0.67, ..."
                    rows={4}
                    className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-wider text-text-muted block">Labels (0 ou 1, mesma quantidade)</label>
                  <textarea
                    value={manualLabels}
                    onChange={e => setManualLabels(e.target.value)}
                    placeholder="1, 1, 1, 0, 0, ..."
                    rows={4}
                    className="w-full bg-surface border border-border-subtle rounded-xl text-xs py-3 px-4 text-text-main placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-mono"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {rocError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-stone-500/10 border border-stone-500/20 rounded-xl text-text-muted text-[10px] font-bold mt-4">
              {META_ICONS.warn} <span className="ml-1">{rocError}</span>
            </motion.div>
          )}

          <button
            onClick={runRoc}
            disabled={rocLoading || (rocTab === 'upload' && !rocFile) || (rocTab === 'manual' && (!manualScores || !manualLabels))}
            className="w-full bg-primary hover:bg-primary-hover text-stone-900 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            <span className={rocLoading ? 'animate-spin' : ''}>{META_ICONS.play}</span>
            {rocLoading ? 'Calculando...' : 'Calcular Curva ROC'}
          </button>
        </motion.div>

        {rocResult && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 border-primary/20 space-y-4">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted flex items-center gap-2">
              {META_ICONS.layers} Resultados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                <p className={`text-2xl font-semibold ${aucInterpretation(rocResult.auc).color}`}>{rocResult.auc.toFixed(4)}</p>
                <p className="text-[9px] font-bold text-text-muted">AUC (Área sob a Curva)</p>
                <p className={`text-[10px] font-semibold mt-0.5 ${aucInterpretation(rocResult.auc).color}`}>{aucInterpretation(rocResult.auc).label}</p>
              </div>
              <div className="grid grid-rows-3 gap-2">
                <div className="p-2 bg-surface rounded-lg border border-border-subtle">
                  <p className="text-sm font-semibold text-text-main">{rocResult.n_total}</p>
                  <p className="text-[8px] font-bold text-text-muted">Total</p>
                </div>
                <div className="p-2 bg-surface rounded-lg border border-border-subtle">
                  <p className="text-sm font-semibold text-primary">{rocResult.n_pos}</p>
                  <p className="text-[8px] font-bold text-text-muted">Positivos</p>
                </div>
                <div className="p-2 bg-surface rounded-lg border border-border-subtle">
                  <p className="text-sm font-semibold text-blue-400">{rocResult.n_neg}</p>
                  <p className="text-[8px] font-bold text-text-muted">Negativos</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="lg:col-span-2 space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-8 min-h-[500px] flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-semibold tracking-wide text-text-muted border-l-2 border-primary/30 pl-4">Curva ROC</h3>
            {rocResult && (
              <button
                onClick={exportRocPng}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-[10px] font-semibold tracking-wide hover:bg-primary/20 transition-all"
              >
                {META_ICONS.download} Exportar PNG
              </button>
            )}
          </div>

          <div ref={svgRef} className="flex-1 flex items-center justify-center">
            {!rocResult ? (
              <div className="text-stone-600 text-xs italic">Faça upload de um CSV ou insira dados manualmente para gerar a Curva ROC...</div>
            ) : (
              <svg viewBox={`0 0 ${rocWidth} ${rocHeight}`} className="w-full h-auto text-text-main">
                <defs>
                  <filter id="glow-roc" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="roc-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(94,234,212,0.25)" />
                    <stop offset="100%" stopColor="rgba(94,234,212,0.02)" />
                  </linearGradient>
                  <linearGradient id="roc-line-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5eead4" />
                    <stop offset="100%" stopColor="#2dd4bf" />
                  </linearGradient>
                </defs>

                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(v => (
                  <g key={v}>
                    <line x1={toRocX(v)} y1={toRocY(0)} x2={toRocX(v)} y2={toRocY(1)} stroke="rgba(255,255,255,0.04)" />
                    <line x1={toRocX(0)} y1={toRocY(v)} x2={toRocX(1)} y2={toRocY(v)} stroke="rgba(255,255,255,0.04)" />
                    <text x={toRocX(v)} y={toRocY(0) + 18} textAnchor="middle" className="fill-stone-600 text-[9px]">{v.toFixed(1)}</text>
                    <text x={toRocX(0) - 8} y={toRocY(v) + 3} textAnchor="end" className="fill-stone-600 text-[9px]">{v.toFixed(1)}</text>
                  </g>
                ))}

                {/* Diagonal de referência */}
                <line x1={toRocX(0)} y1={toRocY(0)} x2={toRocX(1)} y2={toRocY(1)} stroke="rgba(255,255,255,0.15)" strokeDasharray="6 4" />
                <text x={toRocX(0.5) + 8} y={toRocY(0.5) - 8} className="fill-stone-600 text-[9px]">Ação aleatória (AUC=0.5)</text>

                {/* Área sob a curva */}
                {rocResult.fpr.length > 0 && (
                  <path
                    d={`${buildRocPath(rocResult.fpr, rocResult.tpr)} L ${toRocX(rocResult.fpr[rocResult.fpr.length - 1])} ${toRocY(0)} L ${toRocX(0)} ${toRocY(0)} Z`}
                    fill="url(#roc-grad)"
                  />
                )}

                {/* Curva ROC */}
                {rocResult.fpr.length > 0 && (
                  <path
                    d={buildRocPath(rocResult.fpr, rocResult.tpr)}
                    fill="none"
                    stroke="url(#roc-line-grad)"
                    strokeWidth="2.5"
                    
                  />
                )}

                {/* Labels */}
                <text x={rocWidth / 2} y={rocHeight - 8} textAnchor="middle" className="fill-stone-400 text-[10px] font-bold" style={{ fontSize: '11px' }}>1 - Especificidade (Taxa de Falso Positivo)</text>
                <text x={14} y={rocHeight / 2} textAnchor="middle" className="fill-stone-400 text-[10px] font-bold" transform={`rotate(-90, 14, ${rocHeight / 2})`} style={{ fontSize: '11px' }}>Sensibilidade (Taxa de Verdadeiro Positivo)</text>

                {/* AUC badge */}
                <rect x={rocWidth - 180} y={10} width={170} height={40} rx={10} fill="rgba(10,10,26,0.85)" stroke="rgba(94,234,212,0.3)" strokeWidth="1" />
                <text x={rocWidth - 170} y={30} className="fill-stone-400 text-[9px] font-bold" style={{ fontSize: '10px' }}>AUC =</text>
                <text x={rocWidth - 115} y={32} className="fill-primary font-semibold" style={{ fontSize: '14px' }}>{rocResult.auc.toFixed(4)}</text>
                <text x={rocWidth - 170} y={46} className="fill-stone-500 text-[8px] font-bold" style={{ fontSize: '9px' }}>{aucInterpretation(rocResult.auc).label} · n={rocResult.n_total}</text>
              </svg>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
