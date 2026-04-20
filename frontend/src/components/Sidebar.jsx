import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'

const NAV = [
  { to: '/dashboard',          icon: 'dashboard',         label: 'Painel central' },
  { to: '/archive',            icon: 'folder',            label: 'Meus projetos' },
  { to: '/survival-analysis',  icon: 'monitoring',        label: 'Sobrevivência' },
  { to: '/meta-analysis',      icon: 'stacked_bar_chart', label: 'Metanálise' },
  { to: '/visualizations',     icon: 'stacked_line_chart',label: 'Visualizações' },
  { to: '/power-calculator',   icon: 'calculate',         label: 'Cálculo de poder' },
  { to: '/settings',           icon: 'settings',          label: 'Ajustes' },
]

function ForestPlot({ className }) {
  return (
    <svg viewBox="0 0 40 20" preserveAspectRatio="xMidYMid meet" className={className} fill="currentColor">
      <rect x="0" y="8" width="40" height="4" />
      <polygon points="20,0 30,10 20,20 10,10" />
    </svg>
  )
}

function SidebarItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors duration-150 ${
          isActive
            ? 'text-primary bg-primary/8'
            : 'text-text-muted hover:text-text-main hover:bg-surface'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-primary" />
          )}
          <span className="material-symbols-rounded text-[20px]">{icon}</span>
          <span className="hidden xl:block text-[13px] font-medium truncate">
            {label}
          </span>
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
    <aside className="hidden lg:flex flex-col w-20 xl:w-64 h-[calc(100vh-16px)] fixed left-2 top-2 z-40 bg-[var(--sidebar-bg)] backdrop-blur-xl rounded-xl p-4 transition-all duration-300 border border-border-subtle">
      <motion.div
        className="mb-8 text-center xl:text-left overflow-hidden"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 justify-center xl:justify-start text-primary">
          <ForestPlot className="w-5 h-5 shrink-0" />
          <div className="hidden xl:block">
            <span className="text-[15px] font-semibold tracking-[-0.5px]">Paper Metrics</span>
          </div>
        </div>
      </motion.div>

      <nav className="flex flex-col gap-y-0.5 overflow-y-auto pr-1">
        {NAV.map(({ to, icon, label }, index) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.3 }}
          >
            <SidebarItem to={to} icon={icon} label={label} />
          </motion.div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-4">
        {user && (
          <div className="hidden xl:flex items-center gap-3 p-3 bg-surface rounded-lg border border-border-subtle">
             <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                {user.name?.[0] || 'U'}
             </div>
             <div className="flex-1 overflow-hidden">
                <p className="text-[12px] font-medium text-text-main truncate">{user.name || 'Pesquisador'}</p>
                <p className="text-[10px] text-text-muted truncate">Acesso autorizado</p>
             </div>
             <button
               onClick={signOut}
               className="text-text-muted hover:text-text-main transition-colors"
             >
                <span className="material-symbols-rounded text-sm">logout</span>
             </button>
          </div>
        )}

        <button
          onClick={() => setShowNewProject(true)}
          className="w-full h-10 xl:h-auto flex items-center justify-center gap-2 bg-primary dark:text-accent text-white py-2.5 rounded-lg font-medium text-[13px] hover:opacity-90 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-rounded text-sm">add</span>
          <span className="hidden xl:block">Novo projeto</span>
        </button>

        <AnimatePresence>
          {showNewProject && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowNewProject(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 10 }}
                onClick={e => e.stopPropagation()}
                className="bg-surface w-full max-w-md rounded-xl p-8 border border-border-subtle shadow-lg"
              >
                <h2 className="text-lg font-semibold text-text-main mb-2">Novo projeto</h2>
                <p className="text-sm text-text-muted mb-6">Crie um novo projeto de pesquisa estatística.</p>
                <form onSubmit={handleNewProject}>
                  <input
                    type="text"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Nome do projeto..."
                    className="w-full py-3 px-4 bg-background border border-border-subtle rounded-lg text-sm outline-none text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary/40 mb-4"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowNewProject(false)} className="flex-1 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-muted hover:bg-surface transition-all">Cancelar</button>
                    <button type="submit" className="flex-1 py-2.5 rounded-lg bg-primary text-white dark:text-accent text-sm font-medium hover:opacity-90 transition-all">Criar</button>
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
