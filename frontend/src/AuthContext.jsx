import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { createAuthClient } from '@neondatabase/auth'

const AuthContext = createContext()

const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessStatus, setAccessStatus] = useState('loading') // loading | approved | pending | unknown
  const [isAdmin, setIsAdmin] = useState(false)
  const hasCheckedSession = useRef(false)

  const checkAccess = async (sessionToken, userEmail) => {
    try {
      const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : ''
      const res = await fetch(`${API_BASE}/api/auth/check-access${emailParam}`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAccessStatus(data.approved ? 'approved' : (data.status || 'pending'))
        setIsAdmin(data.is_admin || false)
        return data
      }
    } catch (e) {
      console.error('Access check error:', e)
    }
    setAccessStatus('unknown')
    return null
  }

  const fetchSession = async (retryCount = 0) => {
    try {
      const result = await authClient.getSession()
      if (result.data?.session && result.data?.user) {
        setSession(result.data.session)
        setUser(result.data.user)
        await checkAccess(result.data.session.token, result.data.user.email)
      } else if (retryCount < 3) {
        setTimeout(() => fetchSession(retryCount + 1), 500)
        return
      } else {
        setSession(null)
        setUser(null)
        setAccessStatus('unknown')
      }
    } catch (error) {
      console.error('Session error:', error)
      if (retryCount < 3) {
        setTimeout(() => fetchSession(retryCount + 1), 500)
        return
      }
    } finally {
      if (retryCount >= 3 || hasCheckedSession.current) {
        setLoading(false)
      }
      hasCheckedSession.current = true
    }
  }

  useEffect(() => {
    fetchSession()
  }, [])

  const signInWithGoogle = async () => {
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin + '/login'
      })
      if (result.error) throw result.error
    } catch (error) {
      console.error('Google Sign-In Error:', error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      await authClient.signOut()
      setSession(null)
      setUser(null)
      setAccessStatus('unknown')
      setIsAdmin(false)
      window.location.href = '/'
    } catch (error) {
      console.error('Sign Out Error:', error)
    }
  }

  const value = {
    user,
    session,
    loading,
    signInWithGoogle,
    signOut,
    isAuthenticated: !!session,
    isApproved: accessStatus === 'approved',
    isAdmin,
    accessStatus
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
