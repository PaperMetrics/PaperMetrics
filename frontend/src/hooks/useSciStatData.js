import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL + '/api'

export function useSciStatData() {
  const { session, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [history, setHistory] = useState([])
  const [trials, setTrials] = useState([])
  const [projects, setProjects] = useState([])
  const [activeProjectId, setActiveProjectId] = useState(() => {
    return localStorage.getItem('scistat_active_project') || null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('scistat_active_project', activeProjectId)
    } else {
      localStorage.removeItem('scistat_active_project')
    }
  }, [activeProjectId])

  const fetchData = useCallback(async () => {
    if (!isAuthenticated || !session?.sessionToken) return

    const headers = {
        'Authorization': `Bearer ${session.sessionToken}`
    }

    try {
      setError(null)
      const [notifRes, histRes, trialsRes, projectsRes] = await Promise.all([
        fetch(`${API_BASE}/notifications`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/history`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/trials`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/projects?limit=100`, { headers }).then(r => r.ok ? r.json() : { projects: [] })
      ])

      setNotifications(Array.isArray(notifRes) ? notifRes : [])
      setHistory(Array.isArray(histRes) ? histRes : [])
      setTrials(Array.isArray(trialsRes) ? trialsRes : [])
      setProjects(projectsRes.projects || [])
    } catch (err) {
      console.error("Failed to fetch SciStat authenticated data:", err)
      setError('Falha ao conectar com o servidor. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, session])

  const clearNotifications = async () => {
    if (!isAuthenticated || !session?.sessionToken) return
    const headers = { 'Authorization': `Bearer ${session.sessionToken}` }
    try {
      await fetch(`${API_BASE}/notifications/clear`, { method: 'POST', headers })
      setNotifications([])
    } catch (err) {
      console.error("Failed to clear notifications")
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
      const interval = setInterval(fetchData, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, fetchData])

  return { 
    notifications, 
    history, 
    trials, 
    projects,
    activeProjectId,
    setActiveProjectId,
    loading, 
    error, 
    refresh: fetchData, 
    clearNotifications 
  }
}
