import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoadingScreen from './components/LoadingScreen'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import PowerCalculator from './pages/PowerCalculator'
import SurvivalAnalysis from './pages/SurvivalAnalysis'
import MetaAnalysis from './pages/MetaAnalysis'
import Visualizations from './pages/Visualizations'
import ClinicalTrials from './pages/ClinicalTrials'
import Archive from './pages/Archive'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Admin from './pages/Admin'
import { SciStatProvider } from './SciStatContext'
import { AuthProvider } from './AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('pm-theme-mode')
    if (saved) return saved === 'dark'
    return true // Default dark
  })

  const [showLoading, setShowLoading] = useState(() => {
    const shown = sessionStorage.getItem('pm-loading-shown')
    return !shown
  })

  const handleLoadingFinish = useCallback(() => {
    setShowLoading(false)
    sessionStorage.setItem('pm-loading-shown', '1')
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('pm-theme-mode', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('pm-theme-mode', 'light')
    }
  }, [dark])

  return (
    <AuthProvider>
      {showLoading && <LoadingScreen onFinish={handleLoadingFinish} />}
      <SciStatProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/" element={<Landing />} />
          
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout dark={dark} setDark={setDark}>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />

          {[
            { path: '/clinical-trials', element: <ClinicalTrials /> },
            { path: '/survival-analysis', element: <SurvivalAnalysis /> },
            { path: '/meta-analysis', element: <MetaAnalysis /> },
            { path: '/visualizations', element: <Visualizations /> },
            { path: '/power-calculator', element: <PowerCalculator /> },
            { path: '/archive', element: <Archive /> },
            { path: '/profile', element: <Profile /> },
            { path: '/settings', element: <Settings /> },
          ].map((r) => (
            <Route 
              key={r.path}
              path={r.path} 
              element={
                <ProtectedRoute>
                  <Layout dark={dark} setDark={setDark}>
                    {r.element}
                  </Layout>
                </ProtectedRoute>
              } 
            />
          ))}

          <Route path="/admin" element={
            <ProtectedRoute requireAdmin>
              <Layout dark={dark} setDark={setDark}>
                <Admin />
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </SciStatProvider>
    </AuthProvider>
  )
}

export default App
