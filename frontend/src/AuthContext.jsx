import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext()

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('scistat-token')
    if (!token) {
      setLoading(false)
      return
    }
    // Validar token com o backend
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('invalid')
        return res.json()
      })
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem('scistat-token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const signInWithEmail = async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Credenciais inválidas.')
    localStorage.setItem('scistat-token', data.token)
    setUser(data.user)
    return data
  }

  const register = async (name, email, password) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Erro ao criar conta.')
    localStorage.setItem('scistat-token', data.token)
    setUser(data.user)
    return data
  }

  const signOut = () => {
    localStorage.removeItem('scistat-token')
    setUser(null)
    window.location.href = '/login'
  }

  // Compatibilidade: componentes existentes usam session.sessionToken
  const token = localStorage.getItem('scistat-token')
  const session = token ? { sessionToken: token } : null

  const value = {
    user,
    session,
    loading,
    signInWithEmail,
    register,
    signOut,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
