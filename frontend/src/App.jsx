import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
import Register from './pages/Register'
import { SciStatProvider } from './SciStatContext'
import { AuthProvider } from './AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('scistat-theme-mode')
    if (saved) return saved === 'dark'
    return true // Default dark
  })

  useEffect(() => {
    const root = window.document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('scistat-theme-mode', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('scistat-theme-mode', 'light')
    }
  }, [dark])

  return (
    <AuthProvider>
      <SciStatProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout dark={dark} setDark={setDark}>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={<Navigate to="/" replace />} />

          {[
            { path: '/clinical-trials', element: <ClinicalTrials /> },
            { path: '/survival-analysis', element: <SurvivalAnalysis /> },
            { path: '/meta-analysis', element: <MetaAnalysis /> },
            { path: '/visualizations', element: <Visualizations /> },
            { path: '/power-calculator', element: <PowerCalculator /> },
            { path: '/archive', element: <Archive /> },
            { path: '/profile', element: <Profile /> },
            { path: '/settings', element: <Settings /> }
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
        </Routes>
      </SciStatProvider>
    </AuthProvider>
  )
}

export default App
