import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'
import DynamicChart from '../components/DynamicChart'
import BioSummaryTable from '../components/BioSummaryTable'
import AnalysisReviewPlan from '../components/AnalysisReviewPlan'
import ChartGeneratorModal from '../components/ChartGeneratorModal'

const MOCK_CHARTS = {
  barData: {
    labels: ['Controle', 'Tratamento A', 'Tratamento B', 'Placebo', 'Combo'],
    datasets: [
      {
        label: 'Resposta Média',
        data: [42.5, 68.3, 55.1, 38.7, 72.9],
        backgroundColor: [
          'rgba(148, 163, 184, 0.2)',
          'rgba(0, 255, 163, 0.3)',
          'rgba(59, 130, 246, 0.3)',
          'rgba(148, 163, 184, 0.2)',
          'rgba(0, 255, 163, 0.5)'
        ],
        borderColor: [
          'rgba(148, 163, 184, 0.5)',
          '#00FFA3',
          '#3B82F6',
          'rgba(148, 163, 184, 0.5)',
          '#00FFA3'
        ],
        borderWidth: 1,
        borderRadius: 6
      }
    ]
  },
  lineLabels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  lineDatasets: [
    {
      label: 'Inclusão de Pacientes',
      data: [12, 19, 15, 25, 22, 30, 35, 32, 40, 45, 42, 50],
      borderColor: '#00FFA3',
      backgroundColor: 'rgba(0, 255, 163, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#00FFA3',
      pointBorderColor: '#00FFA3',
      pointHoverRadius: 6,
      borderWidth: 2
    },
    {
      label: 'Eventos Adversos',
      data: [3, 5, 4, 7, 6, 8, 5, 4, 6, 3, 5, 4],
      borderColor: '#F43F5E',
      backgroundColor: 'rgba(244, 63, 94, 0.05)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#F43F5E',
      pointBorderColor: '#F43F5E',
      pointHoverRadius: 6,
      borderWidth: 2
    }
  ],
  radarLabels: ['Eficácia', 'Segurança', 'Tolerabilidade', 'Adesão', 'Custo-efetividade', 'Qualidade de Vida'],
  radarDatasets: [
    {
      label: 'Tratamento A',
      data: [85, 70, 90, 65, 55, 78],
      backgroundColor: 'rgba(0, 255, 163, 0.15)',
      borderColor: '#00FFA3',
      borderWidth: 2,
      pointBackgroundColor: '#00FFA3',
      pointRadius: 4
    },
    {
      label: 'Tratamento B',
      data: [72, 80, 68, 75, 70, 65],
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      borderColor: '#3B82F6',
      borderWidth: 2,
      pointBackgroundColor: '#3B82F6',
      pointRadius: 4
    }
  ],
  doughnutLabels: ['Respondedores', 'Não Respondedores', 'Perda de Follow-up', 'Efeito Adverso'],
  doughnutDatasets: [{
    data: [45, 25, 15, 15],
    backgroundColor: [
      'rgba(0, 255, 163, 0.8)',
      'rgba(148, 163, 184, 0.5)',
      'rgba(251, 146, 60, 0.7)',
      'rgba(244, 63, 94, 0.7)'
    ],
    borderColor: [
      '#00FFA3',
      'rgba(148, 163, 184, 0.8)',
      '#FB923C',
      '#F43F5E'
    ],
    borderWidth: 2,
    hoverOffset: 8
  }]
}

const STATISTICAL_TESTS = [
  { name: 'Teste Qui-Quadrado (χ²)', icon: 'grid_4x4', desc: 'Associação entre variáveis categóricas', category: 'Categórico' },
  { name: 'Teste Exato de Fisher', icon: 'precision_manufacturing', desc: 'Associação em tabelas 2x2 com amostras pequenas', category: 'Categórico' },
  { name: 'Teste t de Student (pareado)', icon: 'compare_arrows', desc: 'Comparação de médias em grupos pareados', category: 'Paramétrico' },
  { name: 'Teste t de Student (independente)', icon: 'compare', desc: 'Comparação de médias entre grupos independentes', category: 'Paramétrico' },
  { name: 'ANOVA One-Way', icon: 'stacked_bar_chart', desc: 'Comparação de médias entre 3+ grupos', category: 'Paramétrico' },
  { name: 'ANOVA Two-Way', icon: 'grid_on', desc: 'Análise fatorial com duas variáveis independentes', category: 'Paramétrico' },
  { name: 'ANOVA com Medidas Repetidas', icon: 'repeat', desc: 'Mesmos sujeitos em múltiplas condições', category: 'Paramétrico' },
  { name: 'Teste de Tukey (Post-hoc)', icon: 'tune', desc: 'Comparações múltiplas pós-ANOVA', category: 'Post-hoc' },
  { name: 'Teste de Bonferroni', icon: 'shield', desc: 'Correção para comparações múltiplas', category: 'Post-hoc' },
  { name: 'Teste de Kruskal-Wallis', icon: 'leaderboard', desc: 'Alternativa não-paramétrica à ANOVA', category: 'Não-Paramétrico' },
  { name: 'Teste de Mann-Whitney U', icon: 'swap_horiz', desc: 'Comparação não-paramétrica entre 2 grupos', category: 'Não-Paramétrico' },
  { name: 'Teste de Wilcoxon', icon: 'swap_vertical_circle', desc: 'Versão não-paramétrica do t-test pareado', category: 'Não-Paramétrico' },
  { name: 'Teste de Friedman', icon: 'view_list', desc: 'ANOVA não-paramétrica com medidas repetidas', category: 'Não-Paramétrico' },
  { name: 'Teste de Spearman', icon: 'trending_up', desc: 'Correlação não-paramétrica', category: 'Correlação' },
  { name: 'Correlação de Pearson', icon: 'scatter_plot', desc: 'Correlação linear entre variáveis contínuas', category: 'Correlação' },
  { name: 'Regressão Linear Simples', icon: 'show_chart', desc: 'Modelo preditivo com uma variável independente', category: 'Regressão' },
  { name: 'Regressão Linear Múltipla', icon: 'stacked_line_chart', desc: 'Modelo preditivo com múltiplas variáveis', category: 'Regressão' },
  { name: 'Regressão Logística', icon: 'functions', desc: 'Predição de variável dependente binária', category: 'Regressão' },
  { name: 'Teste de Shapiro-Wilk', icon: 'water_drop', desc: 'Verificação de normalidade dos dados', category: 'Normalidade' },
  { name: 'Teste de Kolmogorov-Smirnov', icon: 'waves', desc: 'Aderência à distribuição teórica', category: 'Normalidade' },
  { name: 'Teste de Levene', icon: 'balance', desc: 'Homogeneidade de variâncias', category: 'Normalidade' },
  { name: 'Análise de Sobrevivência (Kaplan-Meier)', icon: 'monitoring', desc: 'Estimativa de sobrevivência ao longo do tempo', category: 'Sobrevivência' },
  { name: 'Modelo de Cox (Riscos Proporcionais)', icon: 'speed', desc: 'Regressão para dados de sobrevivência', category: 'Sobrevivência' },
  { name: 'Teste Log-Rank', icon: 'equalizer', desc: 'Comparação de curvas de sobrevivência', category: 'Sobrevivência' },
  { name: 'Metanálise (Efeito Fixo)', icon: 'hub', desc: 'Combinação de estudos com efeito fixo', category: 'Metanálise' },
  { name: 'Metanálise (Efeito Aleatório)', icon: 'random', desc: 'Combinação de estudos com efeito aleatório', category: 'Metanálise' },
  { name: 'Funnel Plot / Viés de Publicação', icon: 'filter_alt', desc: 'Detecção de viés de publicação', category: 'Metanálise' },
  { name: 'Cálculo de Poder Amostral', icon: 'bolt', desc: 'Determinação do tamanho amostral necessário', category: 'Poder' },
  { name: 'Teste de McNemar', icon: 'toggle_on', desc: 'Comparação de proporções pareadas', category: 'Categórico' },
  { name: 'Teste de Cochran Q', icon: 'checklist', desc: 'Extensão do McNemar para 3+ grupos', category: 'Categórico' },
]

export default function Dashboard() {
  const { session, isAuthenticated } = useAuth()
  const { history, trials, loading: dataLoading } = useSciStat()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [selectedTests, setSelectedTests] = useState({})

  function significance(p) {
    if (p == null) return ''
    if (p < 0.001) return '***'
    if (p < 0.01) return '**'
    if (p < 0.05) return '*'
    return 'ns'
  }
  const [fileData, setFileData] = useState(null)
  const [descriptiveData, setDescriptiveData] = useState(null)
  const [groupedSummary, setGroupedSummary] = useState(null)
  const [analysisProtocol, setAnalysisProtocol] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [outcomeOptions, setOutcomeOptions] = useState([])
  const [chartModal, setChartModal] = useState({ open: false, data: null, varName: '' })
  const fileInputRef = useRef(null)

  const toggleTest = (id) => setSelectedTests(prev => ({ ...prev, [id]: !prev[id] }))

  const handleFileUpload = async (e) => {
    let file;
    if (e.target && e.target.files) {
      file = e.target.files[0];
    } else if (e.dataTransfer && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }
    
    if (!file) return
    
    setResults([])
    setDescriptiveData(null)
    setGroupedSummary(null)
    setAnalysisProtocol(null)
    setShowReview(false)
    
    setLoading(true)
    setIsDragging(false)
    
    const formData = new FormData()
    formData.append('file', file)
    
    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const protocolRes = await fetch(`${API_URL}/api/data/analyze-protocol`, {
        method: 'POST',
        headers,
        body: formData
      })
      
      if (!protocolRes.ok) throw new Error(`Erro no servidor: ${protocolRes.status}`);

      const protocolData = await protocolRes.json()
      if (protocolData.protocol) {
        const allVars = protocolData.protocol.map(v => v.name)
        setOutcomeOptions(allVars)
        setAnalysisProtocol({
          items: protocolData.protocol,
          outcome: protocolData.outcome
        })
        setShowReview(true)
      }

      setFileData({ filename: file.name, formData })

    } catch (err) {
      alert(`Erro no upload: ${err.message}`);
    }
    setLoading(false)
  }

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); }
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }

  const handleProtocolOptionChange = (idx, newTest) => {
    setAnalysisProtocol(prev => {
      const copy = { ...prev }
      copy.items[idx] = { ...copy.items[idx], selected_test: newTest }
      return copy
    })
  }

  const handleOutcomeChange = (newOutcome) => {
    setAnalysisProtocol(prev => ({ ...prev, outcome: newOutcome }))
  }

  const confirmProtocolAndRun = async () => {
    setLoading(true)
    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = fileData.formData
      formData.set('protocol', JSON.stringify(analysisProtocol.items))
      if (analysisProtocol?.outcome) {
        formData.set('outcome', analysisProtocol.outcome)
        formData.set('group_by', analysisProtocol.outcome)
      }

      const descRes = await fetch(`${API_URL}/api/data/upload`, { method: 'POST', body: formData, headers })
      if (descRes.ok) setDescriptiveData(await descRes.json());

      const groupRes = await fetch(`${API_URL}/api/data/summary-grouped`, { method: 'POST', body: formData, headers })
      if (groupRes.ok) setGroupedSummary(await groupRes.json());

      const execRes = await fetch(`${API_URL}/api/data/execute-protocol`, { method: 'POST', body: formData, headers })
      if (execRes.ok) {
        const resultsData = await execRes.json()
        setResults(resultsData.results || [])
        setShowReview(false) 
      }
    } catch (err) {
      alert(`Falha: ${err.message}`);
    }
    setLoading(false)
  }

  return (
    <div className="space-y-12 pb-20">
      <AnimatePresence>
        {showReview && (
          <section className="mb-12">
              <AnalysisReviewPlan 
                protocol={analysisProtocol?.items || []} 
                outcome={analysisProtocol?.outcome || 'Resultado'} 
                outcomeOptions={outcomeOptions}
                onOptionChange={handleProtocolOptionChange}
                onOutcomeChange={handleOutcomeChange}
                onConfirm={confirmProtocolAndRun}
              />
          </section>
        )}
      </AnimatePresence>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black tracking-tight text-white italic">SciStat <span className="text-primary">AI</span></h1>
            <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/30 mt-2 uppercase">v3.0 - Neon Cloud Sync</span>
          </div>
          <p className="text-slate-500 font-medium mt-2 max-w-md">Consultoria Estatística Inteligente e Inferência Clínica.</p>
        </motion.div>
      </header>
      
      {/* Resumo de Ensaios Clínicos */}
      {!showReview && results.length === 0 && trials.length > 0 && (
        <motion.section 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {trials.slice(0,3).map((t, i) => (
             <div key={i} className="glass-card p-6 rounded-[2rem] border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-symbols-rounded text-6xl">clinical_notes</span>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Fase {t.phase} • {t.status}</p>
                <h4 className="text-sm font-bold text-white mb-4 line-clamp-2 leading-tight">{t.title}</h4>
                <div className="flex items-end justify-between mt-auto">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500">Recrutamento</p>
                        <p className="text-lg font-black text-white">{t.n_actual} <span className="text-[10px] text-slate-600">/ {t.n_target}</span></p>
                    </div>
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center text-[10px] font-black text-primary">
                        {Math.round((t.n_actual / t.n_target)*100)}%
                    </div>
                </div>
             </div>
          ))}
        </motion.section>
      )}

      {!showReview && results.length === 0 && (
        <section className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-12 flex flex-col gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, scale: isDragging ? 1.02 : 1 }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`glass-card rounded-[3rem] p-20 border-2 transition-all flex flex-col items-center text-center relative overflow-hidden ${isDragging ? 'border-primary bg-primary/5' : 'border-primary/10'}`}
            >
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 relative">
                    <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
                    <span className="material-symbols-rounded text-primary text-3xl">analytics</span>
                  </motion.div>
                  <p className="text-slate-300 font-medium">A Máquina está analisando o seu protocolo...</p>
                  <motion.div className="flex gap-1 mt-4">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 bg-primary rounded-full" animate={{ y: [0, -8, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }} />
                    ))}
                  </motion.div>
                </div>
            ) : !fileData ? (
              <>
                <div className="relative mb-6">
                  <motion.div 
                    className="absolute inset-0 bg-primary/10 rounded-full blur-xl"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                  />
                  <motion.div 
                    onClick={() => fileInputRef.current.click()} 
                    className="cursor-pointer w-28 h-28 bg-gradient-to-br from-primary/10 to-primary/5 rounded-[2.5rem] flex items-center justify-center text-primary relative border border-primary/20"
                    whileHover={{ scale: 1.1, rotate: 3 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <motion.span 
                      className="material-symbols-rounded text-6xl font-bold"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    >
                      cloud_upload
                    </motion.span>
                    <motion.div 
                      className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <span className="material-symbols-rounded text-background text-sm">add</span>
                    </motion.div>
                  </motion.div>
                </div>
                <motion.h3 
                  className="text-2xl font-black text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Envie seu arquivo
                </motion.h3>
                <motion.p 
                  className="text-slate-500 font-medium text-sm mt-3 px-4 max-w-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Arraste seus datasets (.csv, .xlsx) ou clique para upload.
                </motion.p>
                <motion.div 
                  className="flex gap-3 mt-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-black uppercase tracking-widest text-primary/70 border border-primary/10">CSV</span>
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-black uppercase tracking-widest text-primary/70 border border-primary/10">XLSX</span>
                  <span className="px-3 py-1.5 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-500 border border-white/5">Máx 50MB</span>
                </motion.div>
                <motion.button 
                  onClick={() => fileInputRef.current.click()} 
                  className="mt-8 w-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 hover:from-primary/20 hover:via-primary/10 hover:to-primary/20 py-5 rounded-2xl font-black text-xs uppercase tracking-widest text-primary border border-primary/30 transition-all relative overflow-hidden group"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                  <span className="relative z-10">Selecionar Arquivo</span>
                </motion.button>
              </>
            ) : (
              <div className="w-full text-left">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <span className="material-symbols-rounded text-3xl">dataset</span>
                  </div>
                  <button onClick={() => setFileData(null)} className="text-slate-500 hover:text-rose-400">
                    <span className="material-symbols-rounded text-xl">close</span>
                  </button>
                </div>
                <h4 className="text-lg font-black text-white truncate">{fileData.filename}</h4>
                <p className="text-primary text-[10px] font-black uppercase tracking-widest mt-1 opacity-70">Arquivo Ativo</p>
                
                <AnimatePresence>
                  {descriptiveData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 pt-6 border-t border-white/5">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
                        <span className="material-symbols-rounded text-sm">analytics</span>
                        Análise Descritiva Completa
                      </h5>
                      {descriptiveData.descriptive_stats ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/5">
                                  <th className="text-left py-3 px-2 font-black text-slate-500 uppercase text-[9px] tracking-widest">Variável</th>
                                  <th className="text-center py-3 px-2 font-black text-slate-500 uppercase text-[9px] tracking-widest">n</th>
                                  <th className="text-right py-3 px-2 font-black text-slate-500 uppercase text-[9px] tracking-widest">Média ± DP</th>
                                  <th className="text-right py-3 px-2 font-black text-primary uppercase text-[9px] tracking-widest neon-glow-sm">Mediana (IQR)</th>
                                  <th className="text-right py-3 px-2 font-black text-slate-500 uppercase text-[9px] tracking-widest">Min – Max</th>
                                  <th className="text-right py-3 px-2 font-black text-slate-500 uppercase text-[9px] tracking-widest">Assimetria</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {Object.entries(descriptiveData.descriptive_stats).map(([col, s]) => (
                                  <tr key={col} className="hover:bg-primary/5 transition-colors group">
                                    <td className="py-3 px-2 font-bold text-white group-hover:text-primary text-xs truncate max-w-[150px]">{col}</td>
                                    <td className="py-3 px-2 text-center font-mono text-slate-400">{s.n}</td>
                                    <td className="py-3 px-2 text-right font-mono text-slate-400">{s.mean} ± {s.std}</td>
                                    <td className="py-3 px-2 text-right font-mono font-bold text-primary">{s.median_iqr}</td>
                                    <td className="py-3 px-2 text-right font-mono text-slate-500">{s.min} – {s.max}</td>
                                    <td className="py-3 px-2 text-right font-mono">
                                      <span className={`${Math.abs(s.skewness) > 1 ? 'text-amber-400' : 'text-slate-500'}`}>
                                        {s.skewness}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-4 flex gap-3 flex-wrap">
                            <span className="px-2 py-1 bg-primary/5 rounded-lg text-[8px] font-bold text-primary/70 border border-primary/10">IQR = Q3 - Q1</span>
                            <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-slate-500 border border-white/5">|Assimetria| &gt; 1 = Não-normal</span>
                            <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-slate-500 border border-white/5">Padrão: Mediana (IQR) para não-normais</span>
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Mediana</p>
                            <p className="text-lg font-black text-white mt-1">{descriptiveData.median?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">IQR</p>
                            <p className="text-lg font-black text-white mt-1">{descriptiveData.iqr?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Média ± DP</p>
                            <p className="text-lg font-black text-white mt-1">{descriptiveData.mean?.toFixed(2)} ± {descriptiveData.std?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Mín – Máx</p>
                            <p className="text-lg font-black text-white mt-1">{descriptiveData.min?.toFixed(2)} – {descriptiveData.max?.toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            </motion.div>

            {!fileData && history.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 space-y-4">
                <div className="flex justify-between items-center px-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Histórico Recente</h3>
                  <Link to="/archive" className="text-[10px] font-bold text-primary hover:underline">Ver tudo</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.slice(0, 4).map((h, i) => (
                    <div key={i} className="glass-card p-4 rounded-3xl flex items-center gap-4 hover:bg-white/5 transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><span className="material-symbols-rounded text-xl">history</span></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-white truncate">{h.filename}</p>
                        <p className="text-[9px] text-slate-500 truncate">Proc: {h.outcome || 'Indefinido'}</p>
                      </div>
                      <span className="text-[9px] font-mono text-slate-600">{new Date(h.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </section>
      )}

      <AnimatePresence>
        {groupedSummary && (
          <section className="mt-12">
            <BioSummaryTable data={groupedSummary?.results || []} outcomeName={groupedSummary?.outcome || ''} />
          </section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-12 glass-card rounded-[2.5rem] overflow-hidden">
              <div className="p-8 border-b border-white/5 bg-white/2 flex items-center justify-between">
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-text-muted">Relatório Consolidado</h3>
                <span className="text-[9px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">{results.length} testes executados</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/1">
                      <th className="text-left px-6 py-5 font-black text-text-muted uppercase text-[10px] tracking-widest">Variável / Teste</th>
                      <th className="text-left px-6 py-5 font-black text-text-muted uppercase text-[10px] tracking-widest">Mediana (IQR) por Grupo</th>
                      <th className="text-right px-6 py-5 font-black text-text-muted uppercase text-[10px] tracking-widest">Valor P</th>
                      <th className="text-center px-6 py-5 font-black text-text-muted uppercase text-[10px] tracking-widest">Sig.</th>
                      <th className="text-center px-6 py-5 font-black text-text-muted uppercase text-[10px] tracking-widest">Gráfico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-text-main group-hover:text-primary text-xs transition-colors">{r?.testLabel || r?.error}</span>
                            {r?.group_stats && r.group_stats.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {r.group_stats.map(g => (
                                  <span key={g.group} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-lg border border-white/5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
                                    <span className="text-[10px] font-bold text-text-muted">{g.group}</span>
                                    <span className="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">N:{g.n}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1.5 items-end">
                            {r?.group_stats && r.group_stats.length > 0 ? (
                              r.group_stats.map(g => (
                                <div key={g.group} className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-text-muted text-right">{g.group}:</span>
                                  <span className="text-xs font-mono font-bold text-text-main">{g.median_iqr}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-xs font-mono font-bold text-text-muted">{r?.median_iqr || '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right font-mono">
                          <span className={`font-black ${(r?.p_value != null && r.p_value < 0.05) ? 'text-primary' : 'text-text-muted'}`}>
                            {r?.p_value != null ? (r.p_value < 0.001 ? '<0.001' : r.p_value.toFixed(4)) : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center"><span className={`text-[12px] font-black tracking-widest ${(r?.p_value != null && r.p_value < 0.05) ? 'text-primary' : 'text-text-muted'}`}>{significance(r?.p_value)}</span></td>
                        <td className="px-6 py-5 text-center">
                          {r?.chart_data && (
                            <motion.button
                              whileHover={{ scale: 1.15 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setChartModal({ open: true, data: r.chart_data, varName: r.testLabel.split(' (')[0] })}
                              className="w-9 h-9 rounded-xl bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-all mx-auto"
                              title="Gerar gráfico"
                            >
                              <span className="material-symbols-rounded text-sm">bar_chart</span>
                            </motion.button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <ChartGeneratorModal
        isOpen={chartModal.open}
        onClose={() => setChartModal({ open: false, data: null, varName: '' })}
        chartData={chartModal.data}
        varName={chartModal.varName}
      />

      {!showReview && results.length === 0 && !fileData && (
        <>
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-3">
                  <span className="material-symbols-rounded text-primary neon-glow-sm">insights</span>
                  Métricas em Destaque
                </h2>
                <p className="text-slate-500 text-xs mt-1 font-medium">Visão geral dos indicadores estatísticos</p>
              </div>
              <div className="flex gap-2">
                {['7D', '30D', '90D'].map((period, i) => (
                  <button key={period} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${i === 1 ? 'bg-primary/10 text-primary border border-primary/30' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Análises Realizadas', value: '147', change: '+12%', icon: 'analytics', color: 'primary' },
                { label: 'Significância (p<0.05)', value: '89%', change: '+5.2%', icon: 'verified', color: 'primary' },
                { label: 'Dados Processados', value: '2.4GB', change: '+18%', icon: 'database', color: 'accent' },
                { label: 'Ensaios Ativos', value: '23', change: '+3', icon: 'biotech', color: 'accent' },
              ].map((stat, i) => (
                <motion.div 
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-card rounded-3xl p-5 stat-card group hover:border-primary/20 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color === 'primary' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'} group-hover:scale-110 transition-transform`}>
                      <span className="material-symbols-rounded text-lg">{stat.icon}</span>
                    </div>
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{stat.change}</span>
                  </div>
                  <p className="text-2xl font-black text-white">{stat.value}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid lg:grid-cols-2 gap-6"
          >
            <motion.div 
              className="glass-card rounded-[2rem] p-6 h-[350px]"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <DynamicChart 
                type="bar" 
                labels={MOCK_CHARTS.barData.labels} 
                datasets={MOCK_CHARTS.barData.datasets} 
                title="Comparação de Grupos — Resposta Média" 
              />
            </motion.div>
            <motion.div 
              className="glass-card rounded-[2rem] p-6 h-[350px]"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <DynamicChart 
                type="line" 
                labels={MOCK_CHARTS.lineLabels} 
                datasets={MOCK_CHARTS.lineDatasets} 
                title="Evolução Temporal — Inclusão vs Eventos" 
              />
            </motion.div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid lg:grid-cols-2 gap-6"
          >
            <motion.div 
              className="glass-card rounded-[2rem] p-6 h-[350px]"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <DynamicChart 
                type="radar" 
                labels={MOCK_CHARTS.radarLabels} 
                datasets={MOCK_CHARTS.radarDatasets} 
                title="Análise Multidimensional — Perfil de Tratamentos" 
              />
            </motion.div>
            <motion.div 
              className="glass-card rounded-[2rem] p-6 h-[350px]"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <DynamicChart 
                type="doughnut" 
                labels={MOCK_CHARTS.doughnutLabels} 
                datasets={MOCK_CHARTS.doughnutDatasets} 
                title="Distribuição de Desfechos Clínicos" 
              />
            </motion.div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-3">
                  <span className="material-symbols-rounded text-primary neon-glow-sm">model_training</span>
                  Análises Estatísticas Disponíveis
                </h2>
                <p className="text-slate-500 text-xs mt-1 font-medium">Todas as opções de testes e modelos estatísticos suportados pela plataforma</p>
              </div>
            </div>

            {['Paramétrico', 'Não-Paramétrico', 'Categórico', 'Correlação', 'Regressão', 'Normalidade', 'Sobrevivência', 'Metanálise', 'Post-hoc', 'Poder'].map((category) => (
              <div key={category} className="mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {STATISTICAL_TESTS.filter(t => t.category === category).map((test, i) => (
                    <motion.div
                      key={test.name}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2, scale: 1.01 }}
                      className="glass-card rounded-2xl p-4 cursor-pointer group hover:border-primary/20 transition-all analysis-grid-item relative"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center text-primary/70 group-hover:text-primary group-hover:bg-primary/10 transition-all shrink-0">
                          <span className="material-symbols-rounded text-sm">{test.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">{test.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{test.desc}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.section>
        </>
      )}
    </div>
  )
}
