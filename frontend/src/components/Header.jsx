import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'

/* Forest-plot inline SVG used in the lockup */
function ForestPlot({ className }) {
  return (
    <svg viewBox="0 0 40 20" preserveAspectRatio="xMidYMid meet" className={className} fill="currentColor">
      <rect x="0" y="8" width="40" height="4" />
      <polygon points="20,0 30,10 20,20 10,10" />
    </svg>
  )
}

export default function Header({ dark, setDark, setIsAssistantOpen }) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { notifications, clearNotifications, trials, history, projects, activeProjectId, setActiveProjectId } = useSciStat()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const getIcon = (type) => {
    switch(type) {
      case 'success': return 'check_circle'
      case 'warning': return 'warning'
      default: return 'info'
    }
  }

  const searchResults = searchQuery.trim().length > 1 ? [
    ...trials.filter(t => t.title?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(t => ({ type: 'Ensaio Clínico', label: t.title, route: '/clinical-trials' })),
    ...history.filter(h => h.filename?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map(h => ({ type: 'Análise', label: h.filename, route: '/archive' })),
  ] : []

  const handleSearchSelect = (result) => {
    setSearchQuery('')
    navigate(result.route)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border-subtle">
      <div className="flex justify-between items-center px-6 lg:px-10 py-3 w-full mx-auto max-w-[1600px]">
        <div className="flex items-center gap-12">
          <Link to="/" className="flex items-center gap-2 group text-primary">
            <span className="text-[18px] font-semibold tracking-[-1px]">Paper</span>
            <ForestPlot className="w-5 h-2.5" />
            <span className="text-[18px] font-semibold tracking-[-1px]">Metrics</span>
          </Link>

          <div className="relative group hidden md:block">
            <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px] group-focus-within:text-primary transition-colors">search</span>
            <input
              type="text"
              placeholder="Pesquisar análises..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => { if (!searchQuery) setIsAssistantOpen(true) }}
              className="bg-surface border border-border-subtle rounded-lg py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-text-muted"
            />
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 mt-2 w-80 bg-surface border border-border-subtle rounded-xl shadow-lg overflow-hidden z-50"
                >
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearchSelect(r)}
                      className="w-full text-left px-4 py-3 hover:bg-primary/5 transition-colors flex items-center gap-3 border-b border-border-subtle last:border-0"
                    >
                      <span className="text-[11px] font-medium tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded">{r.type}</span>
                      <span className="text-xs text-text-main truncate">{r.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border-subtle">
            {/* Seletor de Projeto Ativo */}
            <div className="relative group/project">
              <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-primary/5 rounded-md text-xs text-text-muted transition-all font-medium">
                <span className="material-symbols-rounded text-[16px] text-primary">folder_open</span>
                <span className="truncate max-w-[120px]">
                   {activeProjectId ? projects?.find(p => p.id == activeProjectId)?.title || 'Projeto' : 'Vincular Projeto'}
                </span>
                <span className="material-symbols-rounded text-[16px]">expand_more</span>
              </button>

              <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border-subtle rounded-xl shadow-lg overflow-hidden z-[100] opacity-0 invisible group-hover/project:opacity-100 group-hover/project:visible transition-all">
                <div className="p-2">
                  <div className="text-[11px] font-medium text-text-muted mb-2 px-2 pt-2 tracking-wide">Projeto ativo</div>
                  <button
                    onClick={() => setActiveProjectId(null)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors ${!activeProjectId ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-primary/5'}`}
                  >
                    Nenhum (Modo Livre)
                  </button>
                  {projects?.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProjectId(p.id)}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors truncate ${activeProjectId == p.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-primary/5'}`}
                      title={p.title}
                    >
                      {p.title}
                    </button>
                  ))}
                  {(!projects || projects.length === 0) && (
                    <div className="text-center py-4 text-xs text-text-muted">
                      Nenhum projeto criado.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-[1px] h-5 bg-border-subtle mx-0.5"></div>

            <button
              onClick={() => setDark(!dark)}
              className="p-2 hover:bg-primary/5 rounded-md transition-all group"
              title="Trocar Tema"
            >
              <span className="material-symbols-rounded text-[20px] text-text-muted group-hover:text-primary transition-colors">
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <div className="relative">
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={`p-2 hover:bg-primary/5 rounded-md transition-all group relative ${isNotificationsOpen ? 'bg-primary/5 text-primary' : ''}`}
              >
                <span className="material-symbols-rounded text-[20px] text-text-muted group-hover:text-primary transition-colors">notifications</span>
                {notifications.length > 0 && <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full ring-2 ring-background"></span>}
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.97 }}
                    className="absolute right-0 mt-2 w-80 bg-surface border border-border-subtle rounded-xl shadow-lg p-4 overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-4 px-2">
                       <h4 className="text-[12px] font-medium tracking-wide text-primary">Notificações</h4>
                       <button
                        onClick={clearNotifications}
                        className="text-[11px] text-text-muted hover:text-text-main font-medium"
                       >
                        Limpar tudo
                       </button>
                    </div>
                    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                      {notifications.length === 0 && (
                        <p className="text-[12px] text-text-muted text-center py-6">Nenhum alerta recente</p>
                      )}
                      {notifications.map(n => (
                        <div key={n.id} className="p-3 hover:bg-primary/5 rounded-lg transition-colors">
                          <div className="flex gap-3">
                            <span className="material-symbols-rounded text-primary text-[18px]">{getIcon(n.type)}</span>
                            <div className="flex-1">
                              <p className="text-xs font-medium text-text-main leading-none mb-1">{n.title}</p>
                              <p className="text-[11px] text-text-muted leading-tight">{n.message}</p>
                            </div>
                            <span className="text-[10px] text-text-muted font-medium whitespace-nowrap">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button
            onClick={signOut}
            className="hidden sm:flex items-center gap-2 border border-border-subtle hover:border-text-muted text-text-muted px-4 py-2 rounded-lg text-[12px] font-medium transition-all active:scale-95"
          >
            <span className="material-symbols-rounded text-[16px]">logout</span>
            Sair
          </button>

          <Link to="/profile" className="flex items-center gap-3 pl-4 border-l border-border-subtle hover:bg-primary/5 pr-2 py-1 rounded-lg transition-all group">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-medium text-text-main leading-none group-hover:text-primary transition-colors">
                {user?.name || 'Cientista'}
              </p>
              <p className="text-[10px] text-text-muted">
                {user?.email || 'Acesso Bioestático'}
              </p>
            </div>
            {user?.image ? (
              <img src={user.image} className="w-8 h-8 rounded-lg border border-border-subtle object-cover" alt="User" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-border-subtle flex items-center justify-center text-[11px] font-semibold text-primary">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'PM'}
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
