import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'

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
    <header className="sticky top-0 z-50 w-full bg-background/30 backdrop-blur-xl border-b border-white/5">
      <div className="flex justify-between items-center px-6 lg:px-10 py-4 w-full mx-auto max-w-[1600px]">
        <div className="flex items-center gap-12">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="material-symbols-rounded text-primary text-[20px]">science</span>
            </div>
            <span className="text-sm font-black tracking-tighter text-white">SciStat <span className="text-primary italic">v4</span></span>
          </Link>
          
          <div className="relative group hidden md:block">
            <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px] group-focus-within:text-primary transition-colors">search</span>
            <input
              type="text"
              placeholder="Pesquisar análises..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => { if (!searchQuery) setIsAssistantOpen(true) }}
              className="bg-white/5 border border-white/5 rounded-2xl py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:bg-white/10 transition-all placeholder:text-slate-600"
            />
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearchSelect(r)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-3 border-b border-white/5 last:border-0"
                    >
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-md">{r.type}</span>
                      <span className="text-xs text-white truncate">{r.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/5">
            {/* Seletor de Projeto Ativo */}
            <div className="relative group/project">
              <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-xl border-dashed border border-transparent hover:border-white/20 text-xs text-slate-300 transition-all font-medium">
                <span className="material-symbols-rounded text-[16px] text-primary">folder_open</span>
                <span className="truncate max-w-[120px]">
                   {activeProjectId ? projects?.find(p => p.id == activeProjectId)?.title || 'Projeto' : 'Vincular Projeto'}
                </span>
                <span className="material-symbols-rounded text-[16px]">expand_more</span>
              </button>
              
              <div className="absolute right-0 top-full mt-3 w-64 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] opacity-0 invisible group-hover/project:opacity-100 group-hover/project:visible transition-all">
                <div className="p-2">
                  <div className="text-[10px] font-black uppercase text-slate-500 mb-2 px-2 pt-2">Projeto Ativo</div>
                  <button
                    onClick={() => setActiveProjectId(null)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors ${!activeProjectId ? 'bg-primary/20 text-primary font-bold' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    Nenhum (Modo Livre)
                  </button>
                  {projects?.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProjectId(p.id)}
                      className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors truncate ${activeProjectId == p.id ? 'bg-primary/20 text-primary font-bold' : 'text-slate-300 hover:bg-white/5'}`}
                      title={p.title}
                    >
                      {p.title}
                    </button>
                  ))}
                  {(!projects || projects.length === 0) && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      Nenhum projeto criado.
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

            <button
              onClick={() => setDark(!dark)}
              className="p-2 hover:bg-white/10 rounded-xl transition-all group"
              title="Trocar Tema"
            >
              <span className="material-symbols-rounded text-[20px] text-slate-400 group-hover:text-primary transition-colors">
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={`p-2 hover:bg-white/10 rounded-xl transition-all group relative ${isNotificationsOpen ? 'bg-white/10 text-primary' : ''}`}
              >
                <span className="material-symbols-rounded text-[20px] text-slate-400 group-hover:text-primary transition-colors">notifications</span>
                {notifications.length > 0 && <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-primary rounded-full ring-2 ring-background"></span>}
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-80 bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl p-4 backdrop-blur-2xl overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-4 px-2">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Notificações</h4>
                       <button 
                        onClick={clearNotifications}
                        className="text-[9px] text-slate-500 hover:text-white uppercase font-bold"
                       >
                        Limpar tudo
                       </button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {notifications.length === 0 && (
                        <p className="text-[10px] text-slate-500 text-center py-6">Nenhum alerta recente</p>
                      )}
                      {notifications.map(n => (
                        <div key={n.id} className="p-4 hover:bg-white/5 rounded-2xl transition-colors border border-transparent hover:border-white/5">
                          <div className="flex gap-3">
                            <span className="material-symbols-rounded text-primary text-[18px]">{getIcon(n.type)}</span>
                            <div className="flex-1">
                              <p className="text-xs font-bold text-white leading-none mb-1">{n.title}</p>
                              <p className="text-[10px] text-slate-500 leading-tight">{n.message}</p>
                            </div>
                            <span className="text-[9px] text-slate-600 font-medium whitespace-nowrap">
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
            className="hidden sm:flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            <span className="material-symbols-rounded text-[16px]">logout</span>
            Sair
          </button>
          
          <Link to="/profile" className="flex items-center gap-3 pl-4 border-l border-white/10 hover:bg-white/5 pr-2 py-1 rounded-xl transition-all group">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-bold text-white leading-none group-hover:text-primary transition-colors">
                {user?.name || 'Cientista'}
              </p>
              <p className="text-[9px] text-slate-500 font-medium">
                {user?.email || 'Acesso Bioestático'}
              </p>
            </div>
            {user?.image ? (
              <img src={user.image} className="w-9 h-9 rounded-2xl border border-white/10 object-cover" alt="User" />
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border border-white/10 flex items-center justify-center text-[10px] font-black text-primary italic shadow-lg active:scale-90 transition-transform">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SC'}
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
