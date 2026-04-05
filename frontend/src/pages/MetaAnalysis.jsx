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
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
            Metanálise <span className="text-primary glow-text-sm">Avançada</span>
          </h1>
          <p className="text-slate-400 max-w-2xl">Combine resultados de múltiplos estudos ou avalie poder discriminativo com Curva ROC.</p>
        </motion.div>
      </header>

      <div className="flex gap-2 bg-white/5 rounded-2xl p-1.5 w-fit">
        <button
          onClick={() => setMainTab('meta')}
          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            mainTab === 'meta'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(0,255,163,0.1)]'
              : 'text-slate-500 hover:text-white border border-transparent'
          }`}
        >
          {META_ICONS.layers} Metanálise
        </button>
        <button
          onClick={() => setMainTab('roc')}
          className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            mainTab === 'roc'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(0,255,163,0.1)]'
              : 'text-slate-500 hover:text-white border border-transparent'
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

function MetaAnalysisContent({ session }) {
  const [settings, setSettings] = useState({ measure: 'MD', model: 'random', ci: '95' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [studies, setStudies] = useState([
    { name: '', n: '', effect: '', se: '', source: 'manual', confidence: null }
  ])
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [activeTab, setActiveTab] = useState('import')
  const pdfInputRef = useRef(null)

  const addStudy = () => setStudies(prev => [...prev, { name: '', n: '', effect: '', se: '', source: 'manual', confidence: null }])
  const removeStudy = (idx) => setStudies(prev => prev.filter((_, i) => i !== idx))
  const updateStudy = (idx, field, value) => {
    setStudies(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const extractFromUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = new FormData()
      formData.append('url', importUrl.trim())

      const res = await fetch(`${API_URL}/api/meta/extract`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.sessionToken}` },
        body: formData
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao extrair dados do artigo.')
      }

      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setStudies(prev => [...prev, {
          name: data.name || '',
          n: data.n?.toString() || '',
          effect: data.effect?.toString() || '',
          se: data.se?.toString() || '',
          source: 'link',
          confidence: data.confidence || 'baixa',
          year: data.year,
          journal: data.journal,
          design: data.design,
          outcome: data.outcome,
          measure: data.measure
        }])
        setImportUrl('')
        setActiveTab('manual')
      }
    } catch (err) {
      setImportError(err.message)
    }
    setImporting(false)
  }

  const extractFromPdf = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/api/meta/extract`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.sessionToken}` },
        body: formData
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao extrair dados do PDF.')
      }

      const data = await res.json()
      if (data.error) {
        setImportError(data.error)
      } else {
        setStudies(prev => [...prev, {
          name: data.name || file.name.replace('.pdf', ''),
          n: data.n?.toString() || '',
          effect: data.effect?.toString() || '',
          se: data.se?.toString() || '',
          source: 'pdf',
          confidence: data.confidence || 'baixa',
          year: data.year,
          journal: data.journal,
          design: data.design,
          outcome: data.outcome,
          measure: data.measure
        }])
        setActiveTab('manual')
      }
    } catch (err) {
      setImportError(err.message)
    }
    setImporting(false)
    e.target.value = ''
  }

  const runAnalysis = async () => {
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

    const annotated = validStudies.map(s => {
      const [ciLow, ciHigh] = ci95(s.effect, s.se)
      return { ...s, ciLow, ciHigh }
    })
    const pooledData = computePooled(annotated, settings.model)
    const [pLow, pHigh] = ci95(pooledData.effect, pooledData.se)
    const heterogeneity = computeHeterogeneity(annotated, pooledData)
    setResult({
      studies: annotated,
      pooled: { effect: pooledData.effect, ciLow: pLow, ciHigh: pHigh },
      heterogeneity
    })
    setLoading(false)
  }

  const toX = (v) => 200 + ((v + 0.2) / 1.4) * 350

  const confidenceBadge = (conf) => {
    if (!conf) return null
    const colors = { alta: 'text-primary bg-primary/10 border-primary/20', média: 'text-amber-400 bg-amber-400/10 border-amber-400/20', baixa: 'text-rose-400 bg-rose-400/10 border-rose-400/20' }
    return <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${colors[conf] || colors.baixa}`}>{conf}</span>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-6 flex items-center gap-2">
            {META_ICONS.settings} Parâmetros do Modelo
          </h3>
          <div className="space-y-5">
            {[
              { label: 'Medida de Efeito', key: 'measure', options: ['MD', 'OR', 'RR', 'SMD'] },
              { label: 'Modelo de Agrupamento', key: 'model', options: [{ v: 'random', l: 'Efeitos Aleatórios' }, { v: 'fixed', l: 'Efeitos Fixos' }] },
            ].map(field => (
              <div key={field.key} className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">{field.label}</label>
                <select
                  value={settings[field.key]}
                  onChange={e => setSettings(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {field.options.map(o => <option key={o.v || o} value={o.v || o} className="bg-slate-900">{o.l || o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
          <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
            <button onClick={() => setActiveTab('import')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'import' ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-white'}`}>
              {META_ICONS.link} Importar
            </button>
            <button onClick={() => setActiveTab('manual')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-white'}`}>
              {META_ICONS.add} Manual
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'import' ? (
              <motion.div key="import" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">Colar link do artigo</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={importUrl}
                      onChange={e => setImportUrl(e.target.value)}
                      placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); extractFromUrl() } }}
                    />
                    <button
                      onClick={extractFromUrl}
                      disabled={importing || !importUrl.trim()}
                      className="px-4 bg-primary/10 border border-primary/20 text-primary rounded-xl hover:bg-primary/20 transition-all disabled:opacity-40"
                    >
                      {importing ? <span className="animate-spin block w-[18px] h-[18px] border-2 border-primary/30 border-t-primary rounded-full"></span> : META_ICONS.extract}
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1.5">PubMed, SciELO, Google Scholar, DOI, ou qualquer URL</p>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                  <div className="relative flex justify-center text-[9px] font-bold text-slate-600 bg-transparent px-3">ou</div>
                </div>

                <button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={importing}
                  className="w-full py-3.5 border border-dashed border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {importing ? <span className="animate-spin w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full"></span> : META_ICONS.upload}
                  {importing ? 'Extraindo dados...' : 'Anexar PDF do artigo'}
                </button>
                <input ref={pdfInputRef} type="file" accept=".pdf" onChange={extractFromPdf} className="hidden" />

                {importError && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold">
                    {META_ICONS.warn} <span className="ml-1">{importError}</span>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="manual" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {studies.map((s, idx) => (
                    <div key={idx} className={`p-3 rounded-xl border space-y-2 ${s.source === 'link' ? 'bg-primary/5 border-primary/10' : s.source === 'pdf' ? 'bg-accent/5 border-accent/10' : 'bg-white/5 border-white/5'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">Estudo {idx + 1}</span>
                          {s.source === 'link' && <span className="text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">link</span>}
                          {s.source === 'pdf' && <span className="text-[8px] font-black text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase">pdf</span>}
                          {confidenceBadge(s.confidence)}
                        </div>
                        {studies.length > 1 && (
                          <button onClick={() => removeStudy(idx)} className="text-rose-400/60 hover:text-rose-400 transition-colors">
                            {META_ICONS.delete}
                          </button>
                        )}
                      </div>
                      <input
                        placeholder="Nome (ex: Smith et al. 2019)"
                        value={s.name}
                        onChange={e => updateStudy(idx, 'name', e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg text-xs py-2 px-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      {(s.year || s.journal || s.design) && (
                        <div className="flex flex-wrap gap-1.5">
                          {s.year && <span className="text-[8px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{s.year}</span>}
                          {s.journal && <span className="text-[8px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[150px]">{s.journal}</span>}
                          {s.design && <span className="text-[8px] text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{s.design}</span>}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          placeholder="N" type="number"
                          value={s.n} onChange={e => updateStudy(idx, 'n', e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg text-xs py-2 px-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <input
                          placeholder="Efeito" type="number" step="0.01"
                          value={s.effect} onChange={e => updateStudy(idx, 'effect', e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg text-xs py-2 px-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <input
                          placeholder="SE" type="number" step="0.01"
                          value={s.se} onChange={e => updateStudy(idx, 'se', e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg text-xs py-2 px-3 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStudy}
                  className="w-full mt-4 py-2 border border-dashed border-white/10 rounded-xl text-xs font-bold text-slate-500 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center gap-2"
                >
                  {META_ICONS.add} Adicionar Estudo Manual
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-slate-900 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            <span className={loading ? 'animate-spin' : ''}>{META_ICONS.play}</span>
            {loading ? 'Processando...' : `Executar Metanálise (${studies.filter(s => s.name && s.effect && s.se).length} estudos)`}
          </button>
        </motion.div>

        {result && !result.error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 border-primary/20">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
              {META_ICONS.layers} Heterogeneidade
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-xl font-black text-primary">{result.heterogeneity.i2}%</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase">I-Quadrado</p>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-xl font-black text-white">{result.heterogeneity.p}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase">P-Valor (Q)</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="lg:col-span-2 space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-8 min-h-[500px] flex flex-col justify-center">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 border-l-2 border-primary/30 pl-4">Gráfico de Floresta (Forest Plot)</h3>
          {result?.error ? (
            <div className="flex-1 flex items-center justify-center text-rose-400 text-xs font-bold">{result.error}</div>
          ) : !result ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-xs italic">Importe estudos por link/PDF ou insira manualmente e execute o modelo...</div>
          ) : (
            <svg viewBox="0 0 600 400" className="w-full h-auto text-white">
              <defs>
                <filter id="glow-meta" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="forest-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(0,255,163,0)" />
                  <stop offset="50%" stopColor="rgba(0,255,163,0.1)" />
                  <stop offset="100%" stopColor="rgba(0,255,163,0)" />
                </linearGradient>
              </defs>
              <line x1={toX(0)} y1="40" x2={toX(0)} y2="340" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 2" />
              {result.studies.map((s, i) => {
                const y = 60 + i * 35; return (
                  <g key={s.id} className="group">
                    <rect x="0" y={y - 15} width="600" height="30" fill="url(#forest-grad)" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    <text x="10" y={y + 4} className="text-[10px] fill-slate-400 font-medium">{s.name}</text>
                    <line x1={toX(s.ciLow)} y1={y} x2={toX(s.ciHigh)} y2={y} stroke="white" strokeWidth="1" strokeOpacity="0.3" />
                    <rect x={toX(s.effect) - 3} y={y - 3} width={6} height={6} fill="#00FFA3" rx="1" filter="url(#glow-meta)" />
                    <text x="590" y={y + 4} textAnchor="end" className="text-[9px] fill-slate-500 font-mono">{s.effect.toFixed(2)} [{s.ciLow.toFixed(2)}, {s.ciHigh.toFixed(2)}]</text>
                  </g>
                )
              })}
              <g className="result-diamond">
                <line x1="10" y1="360" x2="590" y2="360" stroke="rgba(255,255,255,0.05)" />
                <text x="10" y="385" className="fill-white font-black text-[11px] uppercase tracking-wider">Efeito Combinado</text>
                <polygon
                  points={`${toX(result.pooled.effect)},370 ${toX(result.pooled.ciHigh)},380 ${toX(result.pooled.effect)},390 ${toX(result.pooled.ciLow)},380`}
                  fill="#00FFA3" filter="url(#glow-meta)"
                />
                <text x="590" y="385" textAnchor="end" className="fill-primary font-black text-xs font-mono">{result.pooled.effect.toFixed(2)}</text>
              </g>
            </svg>
          )}
        </motion.div>
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
          headers: { 'Authorization': `Bearer ${session?.sessionToken}` },
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
          headers: { 'Authorization': `Bearer ${session?.sessionToken}` },
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
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = 800 * scale
      canvas.height = 500 * scale
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#0a0a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, 800, 500)
      URL.revokeObjectURL(url)

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
    if (auc >= 0.8) return { label: 'Bom', color: 'text-emerald-400' }
    if (auc >= 0.7) return { label: 'Razoável', color: 'text-amber-400' }
    if (auc >= 0.6) return { label: 'Ruim', color: 'text-orange-400' }
    return { label: 'Sem poder', color: 'text-rose-400' }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-6 flex items-center gap-2">
            {META_ICONS.roc} Dados para Curva ROC
          </h3>

          <div className="flex gap-1 mb-4 bg-white/5 rounded-xl p-1">
            <button onClick={() => setRocTab('upload')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${rocTab === 'upload' ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-white'}`}>
              {META_ICONS.upload} Upload CSV
            </button>
            <button onClick={() => setRocTab('manual')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${rocTab === 'manual' ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-white'}`}>
              {META_ICONS.add} Manual
            </button>
          </div>

          <AnimatePresence mode="wait">
            {rocTab === 'upload' ? (
              <motion.div key="roc-upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">Arquivo CSV</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-[10px] file:font-black file:uppercase file:tracking-widest file:cursor-pointer focus:outline-none"
                  />
                  <p className="text-[9px] text-slate-600 mt-1.5">CSV com coluna de scores (contínua) e desfecho (0/1 ou 2 categorias)</p>
                </div>

                {rocFile && availableCols.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Coluna de Score (preditor)</label>
                      <select
                        value={scoreCol}
                        onChange={e => setScoreCol(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {availableCols.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Coluna de Desfecho (0=negativo, 1=positivo)</label>
                      <select
                        value={labelCol}
                        onChange={e => setLabelCol(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {availableCols.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                      </select>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="roc-manual" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Scores (valores contínuos, separados por vírgula)</label>
                  <textarea
                    value={manualScores}
                    onChange={e => setManualScores(e.target.value)}
                    placeholder="0.85, 0.72, 0.91, 0.33, 0.67, ..."
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Labels (0 ou 1, mesma quantidade)</label>
                  <textarea
                    value={manualLabels}
                    onChange={e => setManualLabels(e.target.value)}
                    placeholder="1, 1, 1, 0, 0, ..."
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl text-xs py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none font-mono"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {rocError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold mt-4">
              {META_ICONS.warn} <span className="ml-1">{rocError}</span>
            </motion.div>
          )}

          <button
            onClick={runRoc}
            disabled={rocLoading || (rocTab === 'upload' && !rocFile) || (rocTab === 'manual' && (!manualScores || !manualLabels))}
            className="w-full bg-primary hover:bg-primary-hover text-slate-900 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            <span className={rocLoading ? 'animate-spin' : ''}>{META_ICONS.play}</span>
            {rocLoading ? 'Calculando...' : 'Calcular Curva ROC'}
          </button>
        </motion.div>

        {rocResult && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-6 border-primary/20 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              {META_ICONS.layers} Resultados
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className={`text-2xl font-black ${aucInterpretation(rocResult.auc).color}`}>{rocResult.auc.toFixed(4)}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase">AUC (Área sob a Curva)</p>
                <p className={`text-[10px] font-black mt-0.5 ${aucInterpretation(rocResult.auc).color}`}>{aucInterpretation(rocResult.auc).label}</p>
              </div>
              <div className="grid grid-rows-3 gap-2">
                <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-sm font-black text-white">{rocResult.n_total}</p>
                  <p className="text-[8px] font-bold text-slate-500 uppercase">Total</p>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-sm font-black text-primary">{rocResult.n_pos}</p>
                  <p className="text-[8px] font-bold text-slate-500 uppercase">Positivos</p>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-sm font-black text-blue-400">{rocResult.n_neg}</p>
                  <p className="text-[8px] font-bold text-slate-500 uppercase">Negativos</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="lg:col-span-2 space-y-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-8 min-h-[500px] flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 border-l-2 border-primary/30 pl-4">Curva ROC</h3>
            {rocResult && (
              <button
                onClick={exportRocPng}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
              >
                {META_ICONS.download} Exportar PNG
              </button>
            )}
          </div>

          <div ref={svgRef} className="flex-1 flex items-center justify-center">
            {!rocResult ? (
              <div className="text-slate-600 text-xs italic">Faça upload de um CSV ou insira dados manualmente para gerar a Curva ROC...</div>
            ) : (
              <svg viewBox={`0 0 ${rocWidth} ${rocHeight}`} className="w-full h-auto text-white">
                <defs>
                  <filter id="glow-roc" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="roc-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,255,163,0.25)" />
                    <stop offset="100%" stopColor="rgba(0,255,163,0.02)" />
                  </linearGradient>
                  <linearGradient id="roc-line-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00FFA3" />
                    <stop offset="100%" stopColor="#00CC82" />
                  </linearGradient>
                </defs>

                {/* Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(v => (
                  <g key={v}>
                    <line x1={toRocX(v)} y1={toRocY(0)} x2={toRocX(v)} y2={toRocY(1)} stroke="rgba(255,255,255,0.04)" />
                    <line x1={toRocX(0)} y1={toRocY(v)} x2={toRocX(1)} y2={toRocY(v)} stroke="rgba(255,255,255,0.04)" />
                    <text x={toRocX(v)} y={toRocY(0) + 18} textAnchor="middle" className="fill-slate-600 text-[9px]">{v.toFixed(1)}</text>
                    <text x={toRocX(0) - 8} y={toRocY(v) + 3} textAnchor="end" className="fill-slate-600 text-[9px]">{v.toFixed(1)}</text>
                  </g>
                ))}

                {/* Diagonal de referência */}
                <line x1={toRocX(0)} y1={toRocY(0)} x2={toRocX(1)} y2={toRocY(1)} stroke="rgba(255,255,255,0.15)" strokeDasharray="6 4" />
                <text x={toRocX(0.5) + 8} y={toRocY(0.5) - 8} className="fill-slate-600 text-[9px]">Ação aleatória (AUC=0.5)</text>

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
                    filter="url(#glow-roc)"
                  />
                )}

                {/* Labels */}
                <text x={rocWidth / 2} y={rocHeight - 8} textAnchor="middle" className="fill-slate-400 text-[10px] font-bold" style={{ fontSize: '11px' }}>1 - Especificidade (Taxa de Falso Positivo)</text>
                <text x={14} y={rocHeight / 2} textAnchor="middle" className="fill-slate-400 text-[10px] font-bold" transform={`rotate(-90, 14, ${rocHeight / 2})`} style={{ fontSize: '11px' }}>Sensibilidade (Taxa de Verdadeiro Positivo)</text>

                {/* AUC badge */}
                <rect x={rocWidth - 180} y={10} width={170} height={40} rx={10} fill="rgba(10,10,26,0.85)" stroke="rgba(0,255,163,0.3)" strokeWidth="1" />
                <text x={rocWidth - 170} y={30} className="fill-slate-400 text-[9px] font-bold" style={{ fontSize: '10px' }}>AUC =</text>
                <text x={rocWidth - 115} y={32} className="fill-primary font-black" style={{ fontSize: '14px' }}>{rocResult.auc.toFixed(4)}</text>
                <text x={rocWidth - 170} y={46} className="fill-slate-500 text-[8px] font-bold" style={{ fontSize: '9px' }}>{aucInterpretation(rocResult.auc).label} · n={rocResult.n_total}</text>
              </svg>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
