import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'

const NAV = [
  { to: '/dashboard',          icon: 'dashboard',         label: 'Painel Central' },
  { to: '/clinical-trials',    icon: 'biotech',           label: 'Ensaios Clínicos' },
  { to: '/survival-analysis',  icon: 'monitoring',        label: 'Sobrevivência' },
  { to: '/meta-analysis',      icon: 'stacked_bar_chart', label: 'Metanálise' },
  { to: '/visualizations',     icon: 'stacked_line_chart',label: 'Visualizações' },
  { to: '/power-calculator',   icon: 'calculate',         label: 'Cálculo de Poder' },
  { to: '/archive',            icon: 'inventory_2',       label: 'Histórico' },
  { to: '/settings',           icon: 'settings',          label: 'Ajustes' },
]

function SidebarItem({ to, icon, label, index }) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative ${
          isActive
            ? 'text-primary'
            : 'text-slate-500 hover:text-slate-200'
        }`
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {({ isActive }) => (
        <>
          <motion.div 
            className="shrink-0 w-5 h-5 flex items-center justify-center"
            animate={{
              scale: isActive ? 1.15 : isHovered ? 1.2 : 1,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            {isActive && (
              <div className="absolute w-8 h-8 bg-primary/20 rounded-full blur-md"
                style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <motion.div
                  className="w-full h-full bg-primary/20 rounded-full blur-md"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            )}
            <span className="material-symbols-rounded text-[20px] relative z-10">{icon}</span>
          </motion.div>
          <motion.span 
            className="hidden xl:block text-[11px] font-black uppercase tracking-widest truncate"
            animate={{ x: isActive ? 4 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {label}
          </motion.span>
          {isActive && (
            <motion.div 
              layoutId="sidebar-active"
              className="absolute inset-0 bg-primary/5 border border-primary/20 rounded-2xl -z-10"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          {isHovered && !isActive && (
            <motion.div
              layoutId="sidebar-hover"
              className="absolute inset-0 bg-white/5 rounded-2xl -z-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            />
          )}
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{
              opacity: isHovered || isActive ? 1 : 0,
              scaleY: isHovered || isActive ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          />
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')

  const handleNewProject = (e) => {
    e.preventDefault()
    if (!projectName.trim()) return
    setShowNewProject(false)
    setProjectName('')
    navigate('/clinical-trials')
  }
  
  return (
    <aside className="hidden lg:flex flex-col w-20 xl:w-64 h-[calc(100vh-32px)] fixed left-4 top-4 z-40 glass-sidebar rounded-[40px] p-6 transition-all duration-500 hover:shadow-[0_0_40px_rgba(0,255,163,0.08)] border border-white/5">
      <motion.div 
        className="mb-10 text-center xl:text-left overflow-hidden"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-3 justify-center xl:justify-start">
          <motion.div 
            className="w-8 h-8 rounded-xl bg-primary shadow-[0_0_15px_rgba(0,255,163,0.4)] flex items-center justify-center shrink-0"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <span className="material-symbols-rounded text-background text-lg font-black italic">sc</span>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden xl:block">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">SciStat</h2>
            <p className="text-[9px] font-bold tracking-widest text-slate-500 uppercase leading-none">Analysis Engine</p>
          </motion.div>
        </div>
      </motion.div>

      <nav className="flex flex-col gap-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
        {NAV.map(({ to, icon, label }, index) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index, duration: 0.4 }}
          >
            <SidebarItem to={to} icon={icon} label={label} index={index} />
          </motion.div>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        {user && (
          <motion.div 
            className="hidden xl:flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5"
            whileHover={{ scale: 1.02, borderColor: 'rgba(0,255,163,0.2)' }}
            transition={{ type: "spring", stiffness: 300 }}
          >
             <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-black text-xs">
                {user.name?.[0] || 'U'}
             </div>
             <div className="flex-1 overflow-hidden">
                <p className="text-[10px] font-black text-white truncate">{user.name || 'Pesquisador'}</p>
                <p className="text-[8px] font-bold text-slate-500 truncate uppercase tracking-widest">Acesso Autorizado</p>
             </div>
             <motion.button 
               onClick={signOut} 
               className="text-slate-600 hover:text-rose-400 transition-colors"
               whileHover={{ scale: 1.2, rotate: -10 }}
               whileTap={{ scale: 0.9 }}
             >
                <span className="material-symbols-rounded text-sm">logout</span>
             </motion.button>
          </motion.div>
        )}
        
        <motion.button 
          onClick={() => setShowNewProject(true)} 
          className="w-full h-12 xl:h-auto flex items-center justify-center gap-3 bg-primary text-background py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_4px_20px_rgba(0,255,163,0.3)] active:scale-95 group relative overflow-hidden"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <motion.div 
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <span className="material-symbols-rounded text-sm font-black group-hover:rotate-90 transition-transform relative z-10">add</span>
          <span className="hidden xl:block relative z-10">Novo Projeto</span>
        </motion.button>

        <AnimatePresence>
          {showNewProject && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowNewProject(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="glass-card w-full max-w-md rounded-[2rem] p-8 border-white/10"
              >
                <h2 className="text-xl font-black text-white mb-2">Novo Projeto</h2>
                <p className="text-xs text-slate-500 mb-6">Crie um novo projeto de pesquisa estatística.</p>
                <form onSubmit={handleNewProject}>
                  <input
                    type="text"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Nome do projeto..."
                    className="w-full py-4 px-6 bg-white/5 border border-white/10 rounded-2xl text-sm outline-none text-white placeholder-slate-600 focus:ring-1 focus:ring-primary/40 mb-4"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowNewProject(false)} className="flex-1 py-3 rounded-2xl border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/5 transition-all">Cancelar</button>
                    <button type="submit" className="flex-1 py-3 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-widest hover:brightness-110 transition-all">Criar</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  )
}
