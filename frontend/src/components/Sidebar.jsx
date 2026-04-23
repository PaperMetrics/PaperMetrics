import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
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

function SidebarItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `relative z-10 flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-colors duration-200 ${
          isActive
            ? 'text-primary'
            : 'text-text-muted hover:text-text-main'
        }`
      }
    >
      <span className="material-symbols-rounded text-[20px]">{icon}</span>
      <span className="hidden xl:block text-[13px] font-medium truncate">
        {label}
      </span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showNewProject, setShowNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const navRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0, opacity: 0 })

  // Sliding indicator — tracks active NavLink position
  useEffect(() => {
    if (!navRef.current) return
    const activeLink = navRef.current.querySelector('a.text-primary')
    if (activeLink) {
      const navRect = navRef.current.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      setIndicatorStyle({
        top: linkRect.top - navRect.top,
        height: linkRect.height,
        opacity: 1,
      })
    }
  }, [location.pathname])

  const handleNewProject = (e) => {
    e.preventDefault()
    if (!projectName.trim()) return
    setShowNewProject(false)
    setProjectName('')
    navigate('/clinical-trials')
  }

  return (
    <aside className="hidden lg:flex flex-col items-center gap-3 fixed left-3 top-[92px] bottom-[22px] z-40 w-[72px] xl:w-64 transition-all duration-300">
      {/* Glass nav pill */}
      <div
        ref={navRef}
        className="relative flex flex-col gap-0.5 w-full rounded-[28px] p-2 overflow-hidden"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Sliding active indicator */}
        <motion.div
          className="absolute left-2 right-2 rounded-2xl pointer-events-none"
          style={{
            background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
          }}
          animate={{
            top: indicatorStyle.top,
            height: indicatorStyle.height,
            opacity: indicatorStyle.opacity,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />

        {NAV.map(({ to, icon, label }, index) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.04 * index, duration: 0.25 }}
          >
            <SidebarItem to={to} icon={icon} label={label} />
          </motion.div>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User card — glass style */}
      {user && (
        <div
          className="hidden xl:flex items-center gap-3 w-full p-3 rounded-2xl"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div className="w-7 h-7 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs">
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

      {/* FAB — circular glass button */}
      <button
        onClick={() => setShowNewProject(true)}
        className="w-14 h-14 xl:w-full xl:h-auto flex items-center justify-center gap-2 xl:py-3 rounded-full xl:rounded-2xl font-medium text-[13px] transition-all active:scale-95 hover:scale-105 text-white dark:text-accent"
        style={{
          background: 'var(--color-primary)',
          boxShadow: '0 4px 20px rgba(13,148,136,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        <span className="material-symbols-rounded text-[22px] xl:text-[18px]">add</span>
        <span className="hidden xl:block">Novo projeto</span>
      </button>

      {/* New project modal */}
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
              className="bg-surface w-full max-w-md rounded-2xl p-8 border border-border-subtle shadow-lg"
            >
              <h2 className="text-lg font-semibold text-text-main mb-2">Novo projeto</h2>
              <p className="text-sm text-text-muted mb-6">Crie um novo projeto de pesquisa estatística.</p>
              <form onSubmit={handleNewProject}>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="Nome do projeto..."
                  className="w-full py-3 px-4 bg-background border border-border-subtle rounded-xl text-sm outline-none text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary/40 mb-4"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowNewProject(false)} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-medium text-text-muted hover:bg-surface transition-all">Cancelar</button>
                  <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary text-white dark:text-accent text-sm font-medium hover:opacity-90 transition-all">Criar</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  )
}
