import { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Register() {
  const { register, isAuthenticated, loading: authLoading } = useAuth()
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Preencha todos os campos.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await register(name, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao criar conta.')
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a1a] selection:bg-primary/30">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-[440px] p-12 rounded-[3rem] border-white/5 relative z-10"
      >
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 mb-6 group hover:scale-110 transition-transform cursor-pointer">
             <span className="material-symbols-rounded text-primary text-3xl group-hover:rotate-12 transition-transform">science</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-2">SciStat <span className="text-primary italic">v4</span></h1>
          <p className="text-slate-500 font-medium px-4">Crie sua conta para começar.</p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-[10px] font-black uppercase text-center tracking-widest">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
           <input
             type="text"
             value={name}
             onChange={e => setName(e.target.value)}
             placeholder="Nome completo"
             className="w-full py-4 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm outline-none text-white placeholder-slate-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
           />
           <input
             type="email"
             value={email}
             onChange={e => setEmail(e.target.value)}
             placeholder="E-mail"
             className="w-full py-4 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm outline-none text-white placeholder-slate-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
           />
           <input
             type="password"
             value={password}
             onChange={e => setPassword(e.target.value)}
             placeholder="Senha (mín. 6 caracteres)"
             className="w-full py-4 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm outline-none text-white placeholder-slate-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
           />
           <input
             type="password"
             value={confirmPassword}
             onChange={e => setConfirmPassword(e.target.value)}
             placeholder="Confirmar senha"
             className="w-full py-4 px-6 bg-white/5 border border-white/5 rounded-2xl text-sm outline-none text-white placeholder-slate-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
           />
           <button
             type="submit"
             disabled={submitting}
             className="w-full py-4 bg-primary/10 border border-primary/20 text-primary font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-primary/20 transition-all disabled:opacity-50"
           >
             {submitting ? 'Criando conta...' : 'Criar Conta'}
           </button>
        </form>

        <p className="text-center text-slate-500 text-sm mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary hover:underline font-semibold">Entrar</Link>
        </p>

        <footer className="mt-12 pt-8 border-t border-white/5 text-center">
           <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.2em] leading-relaxed">
             Ao criar sua conta você concorda com nossos <br />
             <span className="text-slate-400 hover:text-primary transition-colors cursor-pointer">Termos de Uso</span> e <span className="text-slate-400 hover:text-primary transition-colors cursor-pointer">Políticas de Privacidade</span>
           </p>
        </footer>
      </motion.div>
    </div>
  )
}
