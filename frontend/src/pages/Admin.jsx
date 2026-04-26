import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../AuthContext'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.pending}`}>
      {status === 'pending' ? 'Pendente' : status === 'approved' ? 'Aprovado' : 'Rejeitado'}
    </span>
  )
}

function RoleBadge({ role }) {
  return role === 'admin' ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">Admin</span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-border-subtle text-text-muted">Usuario</span>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('waitlist')
  const [waitlist, setWaitlist] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast] = useState(null)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const { session, user } = useAuth()
  const sessionRef = useRef(session)
  const userRef = useRef(user)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { userRef.current = user }, [user])

  const apiCall = async (url, method = 'GET', body = null) => {
    const s = sessionRef.current
    const u = userRef.current
    const headers = {
      'Content-Type': 'application/json',
      ...(s?.token ? { 'Authorization': `Bearer ${s.token}` } : {}),
      ...(u?.email ? { 'X-User-Email': u.email } : {})
    }
    const opts = { method, headers }
    if (body) opts.body = JSON.stringify(body)
    const res = await fetch(`${API_BASE}${url}`, opts)
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Erro')
    return res.json()
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchWaitlist = useCallback(async () => {
    try {
      const data = await apiCall(`/api/waitlist${filter ? `?status=${filter}` : ''}`)
      setWaitlist(data)
    } catch (e) {
      console.error('Waitlist fetch error:', e)
    }
  }, [filter])

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiCall('/api/admin/users')
      setUsers(data)
    } catch (e) {
      console.error('Users fetch error:', e)
    }
  }, [])

  useEffect(() => {
    if (!session?.token) return
    setLoading(true)
    Promise.all([fetchWaitlist(), fetchUsers()]).finally(() => setLoading(false))
  }, [session])

  useEffect(() => {
    fetchWaitlist()
  }, [filter])

  const approveEntry = async (id) => {
    setActionLoading(id)
    try {
      const result = await apiCall(`/api/waitlist/${id}/approve`, 'POST')
      showToast(result.email_sent ? 'Aprovado e email enviado!' : 'Aprovado! (email nao configurado)')
      fetchWaitlist()
      fetchUsers()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const rejectEntry = async (id) => {
    setActionLoading(id)
    try {
      await apiCall(`/api/waitlist/${id}/reject`, 'POST')
      showToast('Rejeitado.')
      fetchWaitlist()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const toggleAdmin = async (id) => {
    setActionLoading(`user-${id}`)
    try {
      const result = await apiCall(`/api/admin/users/${id}/toggle-admin`, 'POST')
      showToast(`Role alterada para: ${result.new_role}`)
      fetchUsers()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const revokeUser = async (id, email) => {
    if (!confirm(`Revogar acesso de ${email}?`)) return
    setActionLoading(`user-${id}`)
    try {
      await apiCall(`/api/admin/users/${id}`, 'DELETE')
      showToast('Acesso revogado.')
      fetchUsers()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setActionLoading(null)
  }

  const addAdmin = async (e) => {
    e.preventDefault()
    const email = newAdminEmail.trim().toLowerCase()
    if (!email) return
    setAddingAdmin(true)
    try {
      const result = await apiCall('/api/admin/users', 'POST', { email, role: 'admin' })
      showToast(result.message)
      setNewAdminEmail('')
      fetchUsers()
    } catch (e) {
      showToast(e.message, 'error')
    }
    setAddingAdmin(false)
  }

  const formatDate = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${
              toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-main">Painel Admin</h1>
        <p className="text-text-muted text-sm mt-1">Gerencie acessos e usuarios da plataforma.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg border border-border-subtle mb-6 w-fit">
        {[
          { id: 'waitlist', label: 'Waitlist', icon: 'mail' },
          { id: 'users', label: 'Usuarios', icon: 'group' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-main'
            }`}
          >
            <span className="material-symbols-rounded text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : tab === 'users' ? (
        <div>
          {/* Add admin form */}
          <form onSubmit={addAdmin} className="flex gap-2 mb-6">
            <input
              type="email"
              placeholder="Email do novo admin..."
              value={newAdminEmail}
              onChange={e => setNewAdminEmail(e.target.value)}
              className="flex-1 max-w-sm px-3 py-2 bg-surface border border-border-subtle rounded-lg text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/40 transition-colors"
              required
            />
            <button
              type="submit"
              disabled={addingAdmin || !newAdminEmail.trim()}
              className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm font-medium hover:bg-primary/20 transition-all disabled:opacity-50"
            >
              {addingAdmin ? '...' : 'Adicionar Admin'}
            </button>
          </form>

          {users.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <span className="material-symbols-rounded text-4xl mb-3 block opacity-30">group</span>
              <p className="text-sm">Nenhum usuario cadastrado.</p>
            </div>
          ) : (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface text-text-muted text-xs font-medium">
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-left p-3 hidden sm:table-cell">Ativo</th>
                    <th className="text-left p-3 hidden sm:table-cell">Desde</th>
                    <th className="text-right p-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className={`border-t border-border-subtle hover:bg-surface/50 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}>
                      <td className="p-3 text-sm text-text-main font-medium">{user.email}</td>
                      <td className="p-3"><RoleBadge role={user.role} /></td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className={`w-2 h-2 rounded-full inline-block ${user.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      </td>
                      <td className="p-3 text-xs text-text-muted hidden sm:table-cell">{formatDate(user.created_at)}</td>
                      <td className="p-3 text-right">
                        {user.email !== 'cauazcontato@gmail.com' && user.is_active && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleAdmin(user.id)}
                              disabled={actionLoading === `user-${user.id}`}
                              className="px-3 py-1.5 border border-border-subtle rounded-md text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface transition-all disabled:opacity-50"
                            >
                              {user.role === 'admin' ? 'Rebaixar' : 'Promover'}
                            </button>
                            <button
                              onClick={() => revokeUser(user.id, user.email)}
                              disabled={actionLoading === `user-${user.id}`}
                              className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
                            >
                              Revogar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'waitlist' ? (
        <div>
          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {[
              { value: 'pending', label: 'Pendentes' },
              { value: 'approved', label: 'Aprovados' },
              { value: 'rejected', label: 'Rejeitados' },
              { value: '', label: 'Todos' }
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === f.value ? 'bg-primary/10 text-primary border border-primary/20' : 'text-text-muted hover:text-text-main border border-border-subtle'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {waitlist.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <span className="material-symbols-rounded text-4xl mb-3 block opacity-30">inbox</span>
              <p className="text-sm">Nenhum pedido {filter === 'pending' ? 'pendente' : filter ? `com status "${filter}"` : ''}.</p>
            </div>
          ) : (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface text-text-muted text-xs font-medium">
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3 hidden sm:table-cell">Nome</th>
                    <th className="text-left p-3 hidden md:table-cell">Instituicao</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3 hidden sm:table-cell">Data</th>
                    <th className="text-right p-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map(entry => (
                    <tr key={entry.id} className="border-t border-border-subtle hover:bg-surface/50 transition-colors">
                      <td className="p-3 text-sm text-text-main font-medium">{entry.email}</td>
                      <td className="p-3 text-sm text-text-muted hidden sm:table-cell">{entry.name || '-'}</td>
                      <td className="p-3 text-sm text-text-muted hidden md:table-cell">{entry.institution || '-'}</td>
                      <td className="p-3"><StatusBadge status={entry.status} /></td>
                      <td className="p-3 text-xs text-text-muted hidden sm:table-cell">{formatDate(entry.created_at)}</td>
                      <td className="p-3 text-right">
                        {entry.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => approveEntry(entry.id)}
                              disabled={actionLoading === entry.id}
                              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                            >
                              {actionLoading === entry.id ? '...' : 'Aprovar'}
                            </button>
                            <button
                              onClick={() => rejectEntry(entry.id)}
                              disabled={actionLoading === entry.id}
                              className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
