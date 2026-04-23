import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import ResearchAssistant from './ResearchAssistant'

export default function Layout({ children, dark, setDark }) {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const location = useLocation()
  return (
    <div className="min-h-screen text-text-main selection:bg-primary/20 selection:text-primary">
      {/* Background Layer */}
      <div className="mesh-gradient">
        <div className="mesh-gradient scientific-dot-bg"></div>
      </div>

      <Header dark={dark} setDark={setDark} setIsAssistantOpen={setIsAssistantOpen} />
      {/* Espaçador para compensar o header fixed */}
      <div className="h-[52px]" />

      <div className="flex">
        <Sidebar />
        <main className="lg:ml-24 xl:ml-64 w-full p-6 lg:p-10 space-y-10 max-w-[1600px] mx-auto z-10 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <ResearchAssistant isOpen={isAssistantOpen} setIsOpen={setIsAssistantOpen} />
      <MobileNav />
    </div>
  )
}
