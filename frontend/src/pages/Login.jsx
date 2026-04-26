import { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

function ForestPlot({ className }) {
  return (
    <svg viewBox="0 0 40 20" preserveAspectRatio="xMidYMid meet" className={className} fill="currentColor">
      <rect x="0" y="8" width="40" height="4" />
      <polygon points="20,0 30,10 20,20 10,10" />
    </svg>
  )
}

export default function Login() {
  const { signInWithGoogle, isAuthenticated, loading: authLoading } = useAuth()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError('Falha ao autenticar com Google. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background selection:bg-primary/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface w-full max-w-[420px] p-10 rounded-xl border border-border-subtle relative z-10"
      >
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-primary mb-6">
            <span className="text-2xl font-semibold tracking-[-1px]">Paper</span>
            <ForestPlot className="w-6 h-3" />
            <span className="text-2xl font-semibold tracking-[-1px]">Metrics</span>
          </div>
          {inviteToken ? (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-3">
                <span className="material-symbols-rounded text-sm">celebration</span>
                Convite aprovado
              </div>
              <p className="text-text-muted text-sm leading-relaxed px-4">
                Seu acesso foi liberado! Entre com Google para comecar.
              </p>
            </div>
          ) : (
            <p className="text-text-muted text-sm leading-relaxed px-4">Plataforma de analise estatistica para pesquisa cientifica.</p>
          )}
        </header>

        {error && (
          <div className="mb-6 p-3 bg-stone-100 dark:bg-stone-900 border border-border-subtle rounded-lg text-text-main text-xs font-medium text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3.5 bg-text-main text-background font-medium text-sm rounded-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></div>
              Conectando...
            </span>
          ) : (
            <>
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Continuar com Google
            </>
          )}
        </button>

        <footer className="mt-10 pt-6 border-t border-border-subtle text-center">
           <p className="text-text-muted text-[11px] leading-relaxed">
             Ao entrar voce concorda com nossos <br />
             <span className="text-text-main hover:text-primary transition-colors cursor-pointer">Termos de Uso</span> e <span className="text-text-main hover:text-primary transition-colors cursor-pointer">Politicas de Privacidade</span>
           </p>
        </footer>
      </motion.div>
    </div>
  )
}
