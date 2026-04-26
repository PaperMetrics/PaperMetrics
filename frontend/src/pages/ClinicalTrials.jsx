import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'
import UploadZone from '../components/UploadZone'

const PHASES = ['Todas as Fases', 'Fase I', 'Fase II', 'Fase III', 'Fase IV']

const STATUS_ICONS = {
  search: <span className="material-symbols-rounded text-[20px]">search</span>,
  filter: <span className="material-symbols-rounded text-[20px]">filter_list</span>,
  chevron: <span className="material-symbols-rounded text-[18px]">chevron_right</span>
}

const statusConfig = {
  'Ativo': 'bg-primary/10 text-primary border-primary/20',
  'Recrutando': 'bg-accent/10 text-accent border-accent/20',
  'Concluído': 'bg-surface text-text-muted border-border-subtle',
  'Suspenso': 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  'Terminado': 'bg-stone-500/10 text-text-muted border-stone-500/20',
}

const ITEMS_PER_PAGE = 10

export default function ClinicalTrials() {
  const { session } = useAuth()
  const { trials, loading, error, refresh } = useSciStat()
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState('Todas as Fases')
  const [showUpload, setShowUpload] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedTrial, setSelectedTrial] = useState(null)

  const handleUploadSuccess = async (data) => {
    if (data.data_preview) {
      const trial = data.data_preview[0]
      const API_URL = import.meta.env.VITE_API_BASE_URL
      try {
        await fetch(`${API_URL}/api/trials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.token}`
          },
          body: JSON.stringify({
            title: trial.name || trial.title || 'Novo Estudo',
            status: trial.status || 'Recrutando',
            phase: trial.phase || 'II',
            n_target: trial.enrollment || trial.n_target || 100,
            n_actual: 0
          })
        })
        refresh()
      } catch (err) {
        setLocalError('Erro ao salvar no banco de dados.')
      }
    }
    setShowUpload(false)
    setLocalError(null)
  }

  const filtered = trials.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.id && t.id.toLowerCase().includes(search.toLowerCase()))
    const matchPhase = phase === 'Todas as Fases' || t.phase === phase
    return matchSearch && matchPhase
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const goToPage = (p) => {
    if (p >= 1 && p <= totalPages) setPage(p)
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-main">Ensaios Clínicos</h1>
          <p className="text-sm text-text-muted font-medium mt-2">Monitoramento global de protocolos e recrutamento científico.</p>
        </motion.div>
        <motion.div 
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           className="flex gap-4"
        >
          <button 
            onClick={() => setShowUpload(!showUpload)}
            className="px-6 py-2 bg-primary text-black font-semibold text-[10px] tracking-wide rounded-full transition-all"
          >
            {showUpload ? 'Cancelar' : 'Importar Dados'}
          </button>
          <div className="px-6 py-2 bg-primary/10 border border-primary/20 rounded-full flex items-center">
            <span className="text-[10px] font-semibold text-primary tracking-wide">{trials.length} Registros Encontrados</span>
          </div>
        </motion.div>
      </header>

      <AnimatePresence>
        {showUpload && (
          <UploadZone 
            onUploadSuccess={handleUploadSuccess} 
            onUploadError={setLocalError}
          />
        )}
      </AnimatePresence>

      {error && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="p-4 bg-stone-500/10 border border-stone-500/20 rounded-xl text-text-muted text-xs font-bold text-center tracking-wide"
        >
          {error}
        </motion.div>
      )}

      {/* Grid de Status Rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
        {['Ativo', 'Recrutando', 'Concluído', 'Suspenso', 'Terminado'].map((s, i) => {
          const count = trials.filter(t => t.status === s).length
          const config = statusConfig[s]
          return (
            <motion.div 
              key={s} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card rounded-[1.5rem] p-6 text-center border-border-subtle"
            >
              <p className="text-3xl font-semibold text-text-main mb-1">{count}</p>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config}`}>
                 <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                 <span className="text-[9px] font-semibold tracking-wide">{s}</span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Busca e Filtros Progressivos */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4 sm:p-8"
      >
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <div className="flex-1 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
              {STATUS_ICONS.search}
            </div>
            <input
              type="text"
              placeholder="Pesquisar por protocolo, patrocinador ou alvo terapêutico..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-16 pr-8 py-5 bg-surface border border-border-subtle rounded-[1.5rem] text-sm focus:ring-1 focus:ring-primary/40 focus:border-primary/40 focus:bg-white/10 transition-all outline-none text-text-main placeholder-stone-600"
            />
          </div>
          <div className="relative group min-w-[240px]">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
              {STATUS_ICONS.filter}
            </div>
            <select value={phase} onChange={e => setPhase(e.target.value)} className="w-full pl-16 pr-12 py-5 bg-surface border border-border-subtle rounded-[1.5rem] text-sm focus:ring-1 focus:ring-primary/40 text-text-main appearance-none transition-all outline-none cursor-pointer">
              {PHASES.map(p => <option key={p} value={p} className="bg-stone-900">{p}</option>)}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none rotate-90">
               {STATUS_ICONS.chevron}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabela de Alta Fidelidade */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface border-b border-border-subtle">
                <th className="text-left px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Protocolo ID</th>
                <th className="text-left px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Estudo Clínico</th>
                <th className="text-left px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Fase</th>
                <th className="text-center px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Status Equipe</th>
                <th className="text-right px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Coorte (N)</th>
                <th className="text-left px-8 py-6 font-semibold text-text-muted text-[10px] tracking-wide">Início</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/2">
              {loading ? (
                <tr><td colSpan="6" className="px-8 py-20 text-center animate-pulse text-primary font-semibold tracking-wide bg-white/1">Sincronizando com Banco de Dados Neon...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6" className="px-8 py-20 text-center text-text-muted font-bold tracking-wide bg-white/1">Vazio: Ajuste os filtros ou importe dados</td></tr>
              ) : (
                paginated.map((t) => (
                  <tr key={t.id} className="hover:bg-primary/2 transition-colors group">
                    <td className="px-8 py-6">
                       <span className="font-mono font-semibold text-primary bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10">{t.id.toString().slice(0,8)}</span>
                    </td>
                    <td className="px-8 py-6">
                       <div>
                          <p onClick={() => setSelectedTrial(t)} className="font-semibold text-text-main group-hover:text-primary transition-colors cursor-pointer">{t.title}</p>
                          <p className="text-[10px] font-bold text-text-muted tracking-tighter mt-1">{t.drug || 'Protocolo Standard'}</p>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <span className="text-[11px] font-semibold text-text-muted border border-border-subtle px-2 py-1 rounded-md">Fase {t.phase}</span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-4 py-2 rounded-xl text-[10px] font-semibold tracking-wide border ${statusConfig[t.status] || statusConfig['Ativo']}`}>{t.status}</span>
                    </td>
                    <td className="px-8 py-6 text-right font-semibold text-text-main/80">{(t.n_actual || 0).toLocaleString()} <span className="text-text-muted text-[10px]">/ {t.n_target}</span></td>
                    <td className="px-8 py-6 text-text-muted font-medium">2026</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 sm:px-10 py-4 sm:py-6 border-t border-border-subtle bg-surface flex flex-col sm:flex-row justify-between items-center gap-3 text-[10px] font-semibold tracking-wide text-text-muted">
          <span>Data Insights: Exibindo {paginated.length} de {filtered.length} estudos</span>
          <div className="flex gap-4 items-center">
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} className={`p-2 hover:bg-surface rounded-xl transition-all rotate-180 group ${currentPage <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}>
              <div className="text-text-muted group-hover:text-primary">{STATUS_ICONS.chevron}</div>
            </button>
            <span className="text-text-main">Página {String(currentPage).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</span>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} className={`p-2 hover:bg-surface rounded-xl transition-all group ${currentPage >= totalPages ? 'opacity-30 cursor-not-allowed' : ''}`}>
               <div className="text-text-muted group-hover:text-primary">{STATUS_ICONS.chevron}</div>
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedTrial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedTrial(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="glass-card w-full max-w-lg rounded-xl p-8 border-border-subtle relative"
            >
              <button onClick={() => setSelectedTrial(null)} className="absolute top-6 right-6 text-text-muted hover:text-text-main transition-colors">
                <span className="material-symbols-rounded">close</span>
              </button>
              <div className="mb-6">
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-semibold tracking-wide ${statusConfig[selectedTrial.status] || statusConfig['Ativo']}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                  {selectedTrial.status}
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-text-main mb-2">{selectedTrial.title}</h2>
              <p className="text-xs text-text-muted font-mono mb-6">ID: {selectedTrial.id}</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-surface rounded-2xl">
                  <p className="text-[9px] font-bold text-text-muted tracking-wide">Fase</p>
                  <p className="text-lg font-semibold text-text-main mt-1">Fase {selectedTrial.phase}</p>
                </div>
                <div className="p-4 bg-surface rounded-2xl">
                  <p className="text-[9px] font-bold text-text-muted tracking-wide">Recrutamento</p>
                  <p className="text-lg font-semibold text-text-main mt-1">{(selectedTrial.n_actual || 0).toLocaleString()} <span className="text-[10px] text-text-muted">/ {selectedTrial.n_target}</span></p>
                </div>
              </div>
              <div className="w-full bg-surface rounded-full h-2 mb-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(100, Math.round(((selectedTrial.n_actual || 0) / selectedTrial.n_target) * 100))}%` }}></div>
              </div>
              <p className="text-[10px] text-text-muted text-right">{Math.round(((selectedTrial.n_actual || 0) / selectedTrial.n_target) * 100)}% do alvo recrutado</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
