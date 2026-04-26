import { Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { motion } from 'framer-motion'

function PendingScreen() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface w-full max-w-md p-10 rounded-xl border border-border-subtle text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-rounded text-primary text-3xl">hourglass_top</span>
        </div>
        <h2 className="text-xl font-semibold text-text-main mb-3">Aguardando aprovacao</h2>
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          Seu pedido de acesso foi recebido{user?.email ? ` para ${user.email}` : ''}.
          Nossa equipe esta analisando e voce recebera um email quando seu acesso for liberado.
        </p>
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-6">
          <p className="text-primary text-xs font-medium">
            Fique tranquilo — aprovamos a maioria dos pedidos em ate 24 horas.
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-text-muted text-sm hover:text-text-main transition-colors"
        >
          Sair e voltar ao inicio
        </button>
      </motion.div>
    </div>
  )
}

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, loading, isApproved, isAdmin, accessStatus } = useAuth()

  if (loading || accessStatus === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  if (!isApproved && !requireAdmin) {
    return <PendingScreen />
  }

  return children
}
