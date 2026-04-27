import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'
import AttachmentUploader from '../components/AttachmentUploader'
import PDFViewer from '../components/PDFViewer'
import CSVPreview from '../components/CSVPreview'
import ChartGallery from '../components/ChartGallery'

const API_URL = import.meta.env.VITE_API_BASE_URL

const STATUS_COLORS = {
  'em_andamento': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  'concluido': 'text-teal-300 bg-teal-300/10 border-teal-300/20',
  'publicado': 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
}

const STATUS_LABELS = {
  'em_andamento': 'Em Andamento',
  'concluido': 'Concluído',
  'publicado': 'Publicado',
}

export default function Archive() {
  const { session, isAuthenticated } = useAuth()
  const { projects: contextProjects, refresh: refreshContext } = useSciStat()

  const getTags = (tagStr) => {
    try {
      if (!tagStr) return []
      const parsed = JSON.parse(tagStr)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  }
  
   const [projects, setProjects] = useState([])
   const [loading, setLoading] = useState(true)
   const [search, setSearch] = useState('')
   const [statusFilter, setStatusFilter] = useState('todos')
   const [tagFilter, setTagFilter] = useState('')
   const [availableTags, setAvailableTags] = useState([])
   const [sortBy, setSortBy] = useState('created_at_desc') // created_at_desc, created_at_asc, title_asc, title_desc, analyses_desc, analyses_asc
   const [page, setPage] = useState(1)
   const [totalProjects, setTotalProjects] = useState(0)
    const [viewMode, setViewMode] = useState('detalhado')
    const limit = 10
    const totalPages = Math.ceil(totalProjects / limit)
   
   // Analyses state and functions
   const [analyses, setAnalyses] = useState([])
   const [analysesLoading, setAnalysesLoading] = useState(false)
   const [fullHistory, setFullHistory] = useState([])
   const [isLinkingModalOpen, setIsLinkingModalOpen] = useState(false)
  
   // Modal Novo Projeto
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newProject, setNewProject] = useState({ title: '', author: '', institution: '', doi: '', status: 'em_andamento', notes: '', tags: '' })
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(null)
  const [notification, setNotification] = useState(null)
  
  // Expandir Card
  const [expandedCard, setExpandedCard] = useState(null)
  const [activeTabUrl, setActiveTabUrl] = useState('detalhes') // 'detalhes', 'anexos', 'graficos', 'analises'
  const [editingProject, setEditingProject] = useState(null)
  const [editFormData, setEditFormData] = useState({})

  // Modal para visualização do arquivo
  const [previewFile, setPreviewFile] = useState(null)

  // Modal de detalhes do projeto (para viewMode compacto)
  const [projectDetailModal, setProjectDetailModal] = useState(null)
  const [projectDetailLoading, setProjectDetailLoading] = useState(false)
  const [projectDetailData, setProjectDetailData] = useState(null)

  // Tooltip do gráfico timeline
  const [tooltipData, setTooltipData] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const searchInputRef = useRef(null)

  // Toast notification helper
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K -> Focus in Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // N -> Novo Projeto (if not in an input)
      if (e.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault()
        setIsModalOpen(true)
      }
      // Esc -> close modais
      if (e.key === 'Escape') {
        setIsModalOpen(false)
        setPreviewFile(null)
        setProjectDetailModal(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

   useEffect(() => {
     const handler = setTimeout(() => {
       setPage(1)
       fetchProjects()
     }, 500)
     return () => clearTimeout(handler)
   }, [search, tagFilter, sortBy])

   // Fetch available tags for the filter dropdown
   useEffect(() => {
     const fetchTags = async () => {
       try {
         const res = await fetch(`${API_URL}/api/projects`, {
           headers: { 'Authorization': `Bearer ${session?.token}` }
         })
         if (res.ok) {
           const data = await res.json()
           const allTags = new Set()
           data.projects?.forEach(project => {
             const tags = getTags(project.tags)
             tags.forEach(tag => allTags.add(tag))
           })
           setAvailableTags(Array.from(allTags).sort())
         }
       } catch (err) {
         console.error('Failed to fetch tags:', err)
       }
     }
     
     if (isAuthenticated && session?.token) {
       fetchTags()
     }
   }, [isAuthenticated, session])

    useEffect(() => {
      fetchProjects()
    }, [isAuthenticated, session, page, statusFilter, tagFilter, sortBy])

    // Fetch analyses for the currently expanded project
    useEffect(() => {
      const fetchAnalysesData = async () => {
        if (!expandedCard || !isAuthenticated || !session?.token) {
          setAnalyses([])
          return
        }
        
        setAnalysesLoading(true)
        try {
          const res = await fetch(`${API_URL}/api/projects/${expandedCard}/analyses`, {
            headers: { 'Authorization': `Bearer ${session.token}` }
          })
          
          if (res.ok) {
            const data = await res.json()
            setAnalyses(data || [])
          } else {
            setAnalyses([])
          }
        } catch (err) {
          console.error('Failed to fetch analyses:', err)
          setAnalyses([])
        } finally {
          setAnalysesLoading(false)
        }
      }
      
      if (isAuthenticated && session?.token && activeTabUrl === 'analises') {
        fetchAnalysesData()
      }
    }, [expandedCard, isAuthenticated, session, activeTabUrl])

   const fetchProjects = async () => {
     if (!isAuthenticated || !session?.token) {
       setLoading(false)
       return
     }
     
     setLoading(true)
     try {
       const url = new URL(`${API_URL}/api/projects`)
       url.searchParams.append('page', page)
       url.searchParams.append('limit', limit)
       if (statusFilter !== 'todos') {
         url.searchParams.append('status', statusFilter)
       }
       if (tagFilter) {
         url.searchParams.append('tag', tagFilter)
       }
       if (search) {
         url.searchParams.append('q', search)
       }
       if (sortBy) {
         url.searchParams.append('sort', sortBy)
       }
       
       const res = await fetch(url.toString(), {
         headers: { 'Authorization': `Bearer ${session.token}` }
       })
       if (res.ok) {
         const data = await res.json()
         setProjects(data.projects || [])
         setTotalProjects(data.total || 0)
       }
     } catch (err) {
       console.error('Failed to fetch projects:', err)
     } finally {
       setLoading(false)
     }
   }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    
    if (!newProject.title?.trim()) {
      showNotification('Por favor, insira um título para o projeto.', 'error')
      return
    }

    if (!session?.token) {
      showNotification('Sessão expirada. Faça login novamente.', 'error')
      return
    }

    setIsCreating(true)

    let tagsArr = []
    if (newProject.tags) {
      tagsArr = newProject.tags.split(',').map(t => t.trim()).filter(Boolean)
    }

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newProject,
          tags: tagsArr
        })
      })
      if (res.ok) {
        showNotification('Projeto criado com sucesso!', 'success')
        setIsModalOpen(false)
        setNewProject({ title: '', author: '', institution: '', doi: '', status: 'em_andamento', notes: '', tags: '' })
        fetchProjects()
        refreshContext()
      } else {
        const errorData = await res.json().catch(() => ({}))
        showNotification(errorData.detail || 'Erro ao criar projeto.', 'error')
      }
    } catch (err) {
      console.error('Create error:', err)
      showNotification('Erro de conexão. Tente novamente.', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdateProject = async (id) => {
    if (!editFormData.title) return

    let tagsArr = []
    if (editFormData.tags) {
      tagsArr = editFormData.tags.split(',').map(t => t.trim()).filter(Boolean)
    }

    try {
      const res = await fetch(`${API_URL}/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...editFormData,
          tags: JSON.stringify(tagsArr)
        })
      })
      if (res.ok) {
        setEditingProject(null)
        setEditFormData({})
        fetchProjects()
        refreshContext()
      }
    } catch (err) {
      console.error('Update error:', err)
    }
  }

  const handleExportProject = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}/export`, {
        headers: { 'Authorization': `Bearer ${session.token}` }
      })
      if (!res.ok) throw new Error('Falha na exportação')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `projeto_${id}_export.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert("Erro ao exportar o projeto.")
      console.error(err)
    }
  }

  const handleDeleteProject = async (id) => {
    setIsDeleting(id)
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.token}` }
      })
      if (res.ok) {
        showNotification('Projeto deletado com sucesso.', 'success')
        if (expandedCard === id) setExpandedCard(null)
        fetchProjects()
        refreshContext()
      } else {
        showNotification('Erro ao deletar projeto.', 'error')
      }
    } catch (err) {
      console.error(err)
      showNotification('Erro de conexão.', 'error')
    } finally {
      setIsDeleting(null)
    }
  }

  const fetchProjectDetails = async (projectId) => {
    if (!session?.token) return
    setProjectDetailLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${session.token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setProjectDetailData(data)
      }
    } catch (err) {
      console.error('Error fetching project details:', err)
      showNotification('Erro ao carregar detalhes.', 'error')
    } finally {
      setProjectDetailLoading(false)
    }
  }

  const handleOpenProjectDetail = (project) => {
    setProjectDetailModal(project)
    fetchProjectDetails(project.id)
  }

    const fetchFullHistory = async () => {
      if (!isAuthenticated || !session?.token) return
      try {
        const res = await fetch(`${API_URL}/api/history`, {
          headers: { 'Authorization': `Bearer ${session.token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setFullHistory(data || [])
        }
      } catch (err) {
        console.error('Failed to fetch full history:', err)
      }
    }

    const linkAnalysis = async (projectId, historyId) => {
      try {
        const formData = new URLSearchParams()
        formData.append('history_id', historyId)
        
        const res = await fetch(`${API_URL}/api/projects/${projectId}/analyses`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        })
        if (res.ok) {
          // Refresh linked analyses
          const refetchRes = await fetch(`${API_URL}/api/projects/${projectId}/analyses`, {
            headers: { 'Authorization': `Bearer ${session.token}` }
          })
          if (refetchRes.ok) {
            const data = await refetchRes.json()
            setAnalyses(data || [])
          }
          setIsLinkingModalOpen(false)
          // Also refresh project list for counts
          fetchProjects()
        }
      } catch (err) {
        console.error('Link analysis error:', err)
        alert('Erro ao vincular análise')
      }
    }

    const unlinkAnalysis = async (projectId, historyId) => {
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/analyses/${historyId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session.token}` }
        })
        if (res.ok) {
          setAnalyses(prev => prev.filter(a => a.id !== historyId))
          // Also refresh project list for counts
          fetchProjects()
        }
      } catch (err) {
        console.error('Unlink analysis error:', err)
        alert('Erro ao desvincular análise')
      }
    }

  // Filtragem
  const filtered = projects.filter(p => {
    let matchStatus = statusFilter === 'todos' || p.status === statusFilter
    let matchSearch = true
    if (search) {
      const q = search.toLowerCase()
      matchSearch = (
        (p.title || '').toLowerCase().includes(q) || 
        (p.author || '').toLowerCase().includes(q) || 
        (p.institution || '').toLowerCase().includes(q)
      )
    }
    return matchStatus && matchSearch
  })


  return (
    <div className="space-y-10 pb-20">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className={`fixed top-6 left-1/2 z-[200] px-6 py-3 rounded-xl shadow-2xl backdrop-blur-md border-2 ${
              notification.type === 'success' ? 'bg-teal-600 border-teal-300 text-text-main' :
              notification.type === 'error' ? 'bg-red-600 border-red-400 text-text-main' :
              'bg-stone-800 border-stone-600 text-text-main'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="material-symbols-rounded">
                {notification.type === 'success' ? 'check_circle' : notification.type === 'error' ? 'error' : 'info'}
              </span>
              {notification.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 relative z-10">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-main">
            Projetos de Pesquisa
          </h1>
          <p className="text-sm text-text-muted font-medium">Gerencie seus estudos, visualize gráficos salvos, e gerencie anexos em um só lugar.</p>
        </motion.div>
        
        <motion.button 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-5 md:px-6 py-3 bg-primary text-secondary font-semibold tracking-wide text-xs rounded-xl hover:bg-primary-light transition-all active:scale-95 shadow-lg shadow-primary/20 hover:shadow-primary/40"
        >
          <span className="material-symbols-rounded text-lg">add_box</span>
          <span className="hidden sm:inline">Novo Projeto</span>
          <span className="sm:hidden">Novo</span>
        </motion.button>
      </header>

      {/* Cards de Estatística */}
      {loading && totalProjects === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-5 flex items-center gap-4 animate-pulse">
              <div className="p-3 bg-surface rounded-2xl">
                <div className="w-6 h-6 bg-white/10 rounded" />
              </div>
              <div>
                <div className="h-6 w-12 bg-white/10 rounded mb-2" />
                <div className="h-3 w-20 bg-surface rounded" />
              </div>
            </div>
          ))}
        </div>
) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
         {[
           { label: 'Projetos', value: totalProjects, icon: 'folder', color: 'text-primary' },
           { label: 'Publicados', value: projects.filter(p => p.status === 'publicado').length, icon: 'public', color: 'text-fuchsia-400' },
           { label: 'Anexos', value: projects.reduce((total, p) => total + (p.attachment_count || 0), 0), icon: 'attachment', color: 'text-text-muted' },
           { label: 'Gráficos', value: projects.reduce((total, p) => total + (p.chart_count || 0), 0), icon: 'insert_chart', color: 'text-teal-300' },
         ].map((s, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 150, damping: 20 }}
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="glass-card p-4 md:p-5 flex items-center gap-3 md:gap-4 hover:border-primary/30 cursor-pointer"
          >
           <motion.div 
             className={`p-3 bg-surface rounded-2xl ${s.color}`}
             whileHover={{ rotate: 5, scale: 1.1 }}
             transition={{ type: "spring", stiffness: 300 }}
           >
             <span className="material-symbols-rounded">{s.icon}</span>
           </motion.div>
           <div>
             <motion.p 
               className="text-xl font-semibold text-text-main"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: i * 0.1 + 0.2 }}
             >
               {s.value}
             </motion.p>
             <p className="text-[9px] font-semibold tracking-wide text-text-muted">{s.label}</p>
           </div>
          </motion.div>
        ))}
        </div>
      )}

{/* Barra de Filtros */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between bg-surface border border-border-subtle p-3 rounded-2xl"
      >
        {/* Status Pills */}
        <div className="flex bg-surface p-1 rounded-xl overflow-x-auto">
          {['todos', 'em_andamento', 'concluido', 'publicado'].map((status, i) => (
            <motion.button
              key={status}
              onClick={() => setStatusFilter(status)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize whitespace-nowrap ${statusFilter === status ? 'bg-primary/20 text-primary shadow-sm' : 'text-text-muted hover:text-text-main hover:bg-surface'}`}
            >
              {status === 'todos' ? 'Todos' : STATUS_LABELS[status]}
            </motion.button>
          ))}
        </div>
        
        {/* Search */}
        <div className="relative flex-1 max-w-full sm:max-w-xs lg:max-w-sm">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-text-muted text-sm">search</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar... (Ctrl+K)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border-subtle rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-main placeholder-stone-500 focus:outline-none focus:border-primary/50"
          />
        </div>
        
        {/* View Mode + Tag + Sort */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* View Mode Toggle */}
          <div className="flex bg-surface p-1 rounded-xl border border-border-subtle">
            <button 
              onClick={() => setViewMode('compacto')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'compacto' ? 'bg-primary text-secondary' : 'text-text-muted hover:text-text-main'}`}
              title="Modo Lista"
            >
              <span className="material-symbols-rounded text-sm">view_list</span>
              <span className="hidden md:inline">Lista</span>
            </button>
            <button 
              onClick={() => setViewMode('detalhado')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'detalhado' ? 'bg-primary text-secondary' : 'text-text-muted hover:text-text-main'}`}
              title="Modo Cards"
            >
              <span className="material-symbols-rounded text-sm">grid_view</span>
              <span className="hidden md:inline">Cards</span>
            </button>
            <button 
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'timeline' ? 'bg-primary text-secondary' : 'text-text-muted hover:text-text-main'}`}
              title="Linha do Tempo"
            >
              <span className="material-symbols-rounded text-sm">timeline</span>
              <span className="hidden md:inline">Tempo</span>
            </button>
          </div>
          
          {/* Tag Filter */}
          <select 
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="text-xs border border-border-subtle bg-surface rounded-lg px-3 py-2 text-text-main outline-none focus:border-primary/50 appearance-none cursor-pointer"
          >
            <option value="">Tag</option>
            {availableTags.map(tag => (
              <option key={tag} value={tag}>#{tag}</option>
            ))}
          </select>
          
          {/* Sort */}
          <select 
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs border border-border-subtle bg-surface rounded-lg px-3 py-2 text-text-main outline-none focus:border-primary/50 appearance-none cursor-pointer"
          >
            <option value="created_at_desc">Recente</option>
            <option value="created_at_asc">Antigo</option>
            <option value="title_asc">A-Z</option>
            <option value="title_desc">Z-A</option>
            <option value="analyses_desc">+Análises</option>
          </select>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className={viewMode === 'detalhado' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6" : "space-y-4"}
      >
        <AnimatePresence>
          {loading ? (
            <div className="text-center py-20 animate-pulse text-text-muted col-span-full">Carregando projetos...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 text-text-muted col-span-full">Nenhum projeto encontrado.</div>
          ) : viewMode === 'detalhado' ? (
            projects.map((item) => {
              const tags = getTags(item.tags)
              const isExpanded = expandedCard === item.id
              
              return (
                <motion.div 
                  layout
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  className={`glass-card overflow-hidden transition-colors border ${isExpanded ? 'border-primary/30 ring-1 ring-primary/20' : 'border-border-subtle hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10'}`}
                >
                  {/* Cabeçalho do Card */}
                  <div 
                    onClick={() => setExpandedCard(isExpanded ? null : item.id)}
                    className="p-4 sm:p-6 cursor-pointer flex flex-col md:flex-row gap-4 sm:gap-6 justify-between items-start md:items-center hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider border ${STATUS_COLORS[item.status || 'em_andamento']}`}>
                          {STATUS_LABELS[item.status || 'em_andamento']}
                        </span>
                        <span className="text-[10px] text-text-muted font-medium">#{item.id}</span>
                        <span className="text-[10px] text-text-muted font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <h3 className="text-xl font-bold text-text-main mb-1">{item.title}</h3>
                      <p className="text-sm text-text-muted">{item.author} {item.institution ? `• ${item.institution}` : ''}</p>
                      
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {tags.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-surface border border-border-subtle rounded-md text-[10px] text-text-main">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-4 items-center">
                      <div className="text-center px-4 border-r border-border-subtle">
                        <span className="block text-xl font-semibold text-text-main">{item.attachment_count || 0}</span>
                        <span className="text-[9px] tracking-wider text-text-muted">Arquivos</span>
                      </div>
                      <div className="text-center px-4 border-r border-border-subtle">
                        <span className="block text-xl font-semibold text-text-main">{item.chart_count || 0}</span>
                        <span className="text-[9px] tracking-wider text-text-muted">Gráficos</span>
                      </div>
                      <div className="text-center px-4 border-r border-border-subtle">
                        <span className="block text-xl font-semibold text-text-main">{item.analysis_count || 0}</span>
                        <span className="text-[9px] tracking-wider text-text-muted">Análises</span>
                      </div>
                      
                      <button className="p-2 ml-2 rounded-full hover:bg-white/10 text-text-muted transition-colors">
                        <span className="material-symbols-rounded transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          expand_more
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Painel Expandido */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border-subtle bg-surface"
                      >
                        {/* Abas */}
                        <div className="flex border-b border-border-subtle overflow-x-auto custom-scrollbar">
                          {[
                            { id: 'detalhes', label: 'Detalhes', icon: 'info' },
                            { id: 'anexos', label: 'Anexos & Dados', icon: 'attachment' },
                            { id: 'graficos', label: 'Gráficos Salvos', icon: 'insert_chart' },
                            { id: 'analises', label: 'Análises Clínicas', icon: 'science' },
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTabUrl(tab.id)}
                              className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-xs font-bold tracking-wider transition-colors border-b-2 whitespace-nowrap ${
                                activeTabUrl === tab.id 
                                  ? 'border-primary text-primary bg-primary/5' 
                                  : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface'
                              }`}
                            >
                              <span className="material-symbols-rounded text-sm">{tab.icon}</span>
                              <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                          ))}
                        </div>
                        
                        <div className="p-4 sm:p-6">
                          {activeTabUrl === 'detalhes' && (
                            editingProject === item.id ? (
                              <div className="space-y-4 max-w-3xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Título</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.title || ''} 
                                      onChange={e => setEditFormData({...editFormData, title: e.target.value})}
                                      className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">DOI / Referência</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.doi || ''} 
                                      onChange={e => setEditFormData({...editFormData, doi: e.target.value})}
                                      className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Autor / PI</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.author || ''} 
                                      onChange={e => setEditFormData({...editFormData, author: e.target.value})}
                                      className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Instituição</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.institution || ''} 
                                      onChange={e => setEditFormData({...editFormData, institution: e.target.value})}
                                      className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Tags (separadas por vírgula)</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.tags || ''} 
                                      onChange={e => setEditFormData({...editFormData, tags: e.target.value})}
                                      className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Status</label>
                                    <div className="relative">
                                      <select 
                                        value={editFormData.status || 'em_andamento'} 
                                        onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                                        className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-2.5 text-text-main outline-none focus:border-primary/50 appearance-none" 
                                      >
                                        <option value="em_andamento">Em Andamento</option>
                                        <option value="concluido">Concluído</option>
                                        <option value="publicado">Publicado</option>
                                      </select>
                                      <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">expand_more</span>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-text-muted mb-1">Anotações do Projeto</label>
                                  <textarea 
                                    value={editFormData.notes || ''} 
                                    onChange={e => setEditFormData({...editFormData, notes: e.target.value})}
                                    className="w-full text-sm border border-border-subtle bg-surface rounded-lg p-4 text-text-main min-h-[100px] outline-none focus:border-primary/50 resize-y"
                                  />
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
                                  <button
                                    onClick={() => setEditingProject(null)}
                                    className="px-4 py-2 text-xs font-bold text-text-muted hover:bg-surface hover:text-text-main rounded-lg transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleUpdateProject(item.id)}
                                    className="px-4 py-2 text-xs font-bold bg-primary text-secondary hover:bg-primary-light rounded-lg transition-colors shadow-lg shadow-primary/20"
                                  >
                                    Salvar Alterações
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4 max-w-3xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">Título</label>
                                    <p className="text-sm border border-border-subtle bg-surface rounded-lg p-3 text-text-main">{item.title}</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">DOI / Referência</label>
                                    <p className="text-sm border border-border-subtle bg-surface rounded-lg p-3 text-text-main">{item.doi || 'Não especificado'}</p>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-text-muted mb-1">Anotações do Projeto</label>
                                  <div className="text-sm border border-border-subtle bg-surface rounded-lg p-4 text-text-main min-h-[100px] whitespace-pre-wrap">
                                    {item.notes || 'Nenhuma anotação inserida para este projeto.'}
                                  </div>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-border-subtle">
                                  <button
                                    onClick={() => {
                                      let tagsStr = '';
                                      try { tagsStr = (JSON.parse(item.tags) || []).join(', '); } catch(e) {}
                                      setEditFormData({
                                        title: item.title || '',
                                        doi: item.doi || '',
                                        author: item.author || '',
                                        institution: item.institution || '',
                                        tags: tagsStr,
                                        status: item.status || 'em_andamento',
                                        notes: item.notes || ''
                                      });
                                      setEditingProject(item.id);
                                    }}
                                    className="px-4 py-2 text-xs font-bold text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors flex items-center gap-2 border border-blue-400/20"
                                  >
                                    <span className="material-symbols-rounded text-[18px]">edit</span>
                                    Editar Info
                                  </button>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleExportProject(item.id)}
                                      className="px-4 py-2 text-xs font-bold text-teal-300 hover:bg-teal-300/10 rounded-lg transition-colors flex items-center gap-2 border border-teal-300/20"
                                    >
                                      <span className="material-symbols-rounded text-sm">download</span>
                                      Exportar (.zip)
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Deseja realmente deletar este projeto e todos os seus anexos e gráficos?')) {
                                          handleDeleteProject(item.id)
                                        }
                                      }}
                                      disabled={isDeleting === item.id}
                                      className="px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex items-center gap-2 border border-red-400/20 disabled:opacity-50"
                                    >
                                      {isDeleting === item.id ? (
                                        <span className="animate-spin material-symbols-rounded text-sm">sync</span>
                                      ) : (
                                        <span className="material-symbols-rounded text-sm">delete</span>
                                      )}
                                      {isDeleting === item.id ? 'Deletando...' : 'Deletar'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                          
                          {activeTabUrl === 'anexos' && (
                            <AttachmentUploader 
                              projectId={item.id} 
                              onPreview={setPreviewFile}
                            />
                          )}
                          
                          {activeTabUrl === 'graficos' && (
                            <ChartGallery projectId={item.id} />
                          )}
                          
                            {activeTabUrl === 'analises' && (
                              <div className="space-y-4">
                                <div className="flex justify-between items-center mb-4">
                                  <h3 className="text-xl font-bold text-text-main">Análises Vinculadas</h3>
                                  <button 
                                    onClick={() => {
                                      fetchFullHistory()
                                      setIsLinkingModalOpen(true)
                                    }}
                                    className="px-4 py-2 text-xs font-bold bg-primary text-secondary hover:bg-primary-light rounded-lg transition-colors shadow-lg shadow-primary/20"
                                  >
                                    Vincular Análise
                                  </button>
                                </div>
                               {analyses.length > 0 ? (
                                 <div className="space-y-3">
                                   {analyses.map(analysis => (
                                     <div key={analysis.id} className="border border-border-subtle rounded-lg p-4 bg-surface">
                                       <div className="flex justify-between items-start">
                                         <div>
                                           <h4 className="font-bold text-text-main">{analysis.title || analysis.filename}</h4>
                                           <p className="text-text-muted text-sm">
                                             {analysis.outcome} • {new Date(analysis.created_at).toLocaleDateString('pt-BR')}
                                           </p>
                                         </div>
                                         <button 
                                           onClick={() => {
                                             // Unlink analysis
                                             unlinkAnalysis(item.id, analysis.id);
                                           }}
                                           className="p-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                         >
                                           <span className="material-symbols-rounded">unlink</span>
                                           Desvincular
                                         </button>
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               ) : (
                                 <div className="py-10 text-center border-2 border-dashed border-border-subtle rounded-2xl">
                                   <span className="material-symbols-rounded text-4xl text-zinc-600 mb-2">dataset</span>
                                   <p className="text-text-muted text-sm">Nenhuma análise vinculada a este projeto</p>
                                 </div>
                               )}
                             </div>
                           )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })
) : viewMode === 'timeline' ? (
            <div className="space-y-8">
              {/* Gráfico de Timeline Estilo CDF */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="glass-card p-6 border border-border-subtle"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-semibold tracking-wide text-text-muted">Linha do Tempo de Projetos</h3>
                  <span className="material-symbols-rounded text-primary/50">timeline</span>
                </div>
                
                {/* Tooltip State */}
                {(() => {
                  return (
                    <>
                      <div className="h-64 relative">
                        <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="xMidYMid meet">
                          {/* Eixo horizontal com ticks */}
                          <line x1="60" y1="180" x2="760" y2="180" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                          
                          {/* Ticks do eixo X (marcações de tempo) */}
                          {(() => {
                            const sorted = [...projects].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                            if (sorted.length < 2) return null
                            const minDate = new Date(sorted[0].created_at).getTime()
                            const maxDate = new Date(sorted[sorted.length - 1].created_at).getTime()
                            const range = maxDate - minDate || 1
                            const numTicks = Math.min(5, sorted.length)
                            const ticks = []
                            for (let i = 0; i <= numTicks; i++) {
                              const x = 60 + (i / numTicks) * 700
                              const date = new Date(minDate + (i / numTicks) * range)
                              ticks.push({ x, date })
                            }
                            return ticks.map((tick, i) => (
                              <g key={i}>
                                <line x1={tick.x} y1="180" x2={tick.x} y2="185" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                                <text 
                                  x={tick.x} 
                                  y="198" 
                                  fill="#71717a" 
                                  fontSize="9" 
                                  fontFamily="inherit" 
                                  textAnchor="middle"
                                >
                                  {tick.date.toLocaleDateString('pt-BR', { month: 'short' })}
                                </text>
                              </g>
                            ))
})()}
                           
                           {/* Gradiente para linha */}
                           <defs>
                            <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#22c55e" />
                              <stop offset="50%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#a855f7" />
                            </linearGradient>
                            <filter id="glow">
                              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                              <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                              </feMerge>
                            </filter>
                          </defs>
                          
                          {/* Linha da CDF - curva suave */}
                          <motion.path 
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 1.5, ease: "easeInOut" }}
                            d={(() => {
                              const sorted = [...projects].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                              if (sorted.length === 0) return ''
                              const minDate = new Date(sorted[0].created_at).getTime()
                              const maxDate = new Date(sorted[sorted.length - 1].created_at).getTime()
                              const range = maxDate - minDate || 1
                              
                              const points = sorted.map((p, i) => {
                                const x = 60 + ((new Date(p.created_at).getTime() - minDate) / range) * 700
                                const y = 180 - ((i + 1) / sorted.length) * 130
                                return `${x},${y}`
                              })
                              
                              let d = `M 60,180 `
                              points.forEach((pt, i) => {
                                const [x, y] = pt.split(',').map(Number)
                                if (i === 0) {
                                  d += `L ${x},${y} `
                                } else {
                                  const prev = points[i-1].split(',').map(Number)
                                  const cp1x = prev[0] + (x - prev[0]) * 0.5
                                  const cp2x = prev[0] + (x - prev[0]) * 0.5
                                  d += `C ${cp1x},${prev[1]} ${cp2x},${y} ${x},${y} `
                                }
                              })
                              return d
                            })()}
                            fill="none"
                            stroke="url(#timelineGradient)"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          
                          {/* Pontos nos projetos com labels e tooltips */}
                          {(() => {
                            const sorted = [...projects].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                            if (sorted.length === 0) return null
                            const minDate = new Date(sorted[0].created_at).getTime()
                            const maxDate = new Date(sorted[sorted.length - 1].created_at).getTime()
                            const range = maxDate - minDate || 1
                            
                            return sorted.map((p, i) => {
                              const x = 60 + ((new Date(p.created_at).getTime() - minDate) / range) * 700
                              const y = 180 - ((i + 1) / sorted.length) * 130
                              const color = p.status === 'publicado' ? '#a855f7' : p.status === 'concluido' ? '#22c55e' : '#f59e0b'
                              const dateStr = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                              const title = p.title.length > 25 ? p.title.substring(0, 25) + '...' : p.title
                              const statusLabel = p.status === 'publicado' ? 'Publicado' : p.status === 'concluido' ? 'Concluído' : 'Em Andamento'
                              
                              return (
                                <g 
                                  key={p.id} 
                                  className="cursor-pointer"
                                  onClick={() => handleOpenProjectDetail(p)}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const containerRect = e.currentTarget.closest('svg').getBoundingClientRect()
                                    setTooltipPos({ 
                                      x: x, 
                                      y: y - 50 
                                    })
                                    setTooltipData({ title: p.title, status: p.status, statusLabel, dateStr, color })
                                  }}
                                  onMouseLeave={() => setTooltipData(null)}
                                  tabIndex={0}
                                  onKeyDown={(e) => e.key === 'Enter' && handleOpenProjectDetail(p)}
                                  role="button"
                                  aria-label={`Projeto ${p.title}, ${statusLabel}, ${dateStr}`}
                                >
                                  {/* Label do nome acima do ponto */}
                                  <text 
                                    x={x} 
                                    y={y - 15} 
                                    fill="#e4e4e7" 
                                    fontSize="9" 
                                    fontFamily="inherit" 
                                    textAnchor="middle"
                                    className="font-bold"
                                  >
                                    {title}
                                  </text>
                                  
                                  {/* Linha tracejada para o ponto */}
                                  <line 
                                    x1={x} 
                                    y1={y - 5} 
                                    x2={x} 
                                    y2={y + 5} 
                                    stroke={color} 
                                    strokeWidth="1" 
                                    strokeDasharray="2,2"
                                    opacity="0.5"
                                  />
                                  
                                  {/* Ponto principal com glow effect */}
                                  <motion.circle 
                                    cx={x} 
                                    cy={y} 
                                    r="6" 
                                    fill={color}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.5 + i * 0.1 }}
                                    whileHover={{ scale: 1.8 }}
                                    style={{ filter: 'url(#glow)' }}
                                    className="drop-shadow-lg"
                                  />
                                  
                                  {/* Label da data abaixo do eixo */}
                                  <text 
                                    x={x} 
                                    y="205" 
                                    fill="#71717a" 
                                    fontSize="8" 
                                    fontFamily="inherit" 
                                    textAnchor="middle"
                                  >
                                    {dateStr}
                                  </text>
                                </g>
                              )
                            })
                          })()}
                          
                          {/* Labels do eixo */}
                          <text x="60" y="220" fill="#52525b" fontSize="9" fontFamily="inherit">Mais antigo</text>
                          <text x="760" y="220" fill="#52525b" fontSize="9" fontFamily="inherit" textAnchor="end">Mais recente</text>
                        </svg>
                      </div>
                      
                      {/* Tooltip Flutuante com Glassmorphism */}
                      <AnimatePresence>
                        {tooltipData && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.9 }}
                            transition={{ duration: 0.15 }}
                            className="absolute pointer-events-none"
                            style={{
                              left: tooltipPos.x,
                              top: tooltipPos.y,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className="bg-stone-800/90 backdrop-blur-md border border-border-subtle rounded-lg shadow-xl p-3 min-w-[180px]">
                              {/* Seta do tooltip */}
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-stone-800/90 border-r border-b border-border-subtle rotate-45" />
                              
                              <p className="text-text-main font-bold text-sm mb-1 truncate">{tooltipData.title}</p>
                              <div className="flex items-center gap-2 mb-1">
                                <span 
                                  className="px-2 py-0.5 rounded text-[10px] font-bold"
                                  style={{ 
                                    backgroundColor: `${tooltipData.color}20`, 
                                    color: tooltipData.color,
                                    border: `1px solid ${tooltipData.color}30`
                                  }}
                                >
                                  {tooltipData.statusLabel}
                                </span>
                              </div>
                              <p className="text-text-muted text-xs">{tooltipData.dateStr}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="text-xs text-text-muted text-center mt-2"
                      >
                        Passe o cursor ou clique nos pontos para ver os detalhes do projeto
                      </motion.p>
                    </>
                  )
                })()}
              </motion.div>
              
              {/* Lista de projetos no modo timeline */}
              <div className="relative border-l-2 border-border-subtle ml-6 md:ml-20 py-8 space-y-8">
                {projects.map((item, index) => {
                  return (
                    <motion.div 
                      key={item.id}
                      initial={{ opacity: 0, x: -30, scale: 0.95 }}
                      whileInView={{ opacity: 1, x: 0, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.05, duration: 0.4, type: "spring", stiffness: 100 }}
                      whileHover={{ x: 5, scale: 1.02 }}
                      className="relative pl-8 md:pl-0 group"
                    >
                      <motion.div 
                        className={`absolute left-[-5px] md:left-[-11px] top-6 w-4 h-4 md:w-5 md:h-5 rounded-full border-4 border-stone-900 z-10 transition-all group-hover:scale-125 ${item.status === 'publicado' ? 'bg-fuchsia-500' : item.status === 'concluido' ? 'bg-teal-400' : 'bg-amber-500'}`}
                      />
                      
                      <div className="md:absolute top-5 md:left-[-150px] text-xs font-bold text-text-muted mb-2 md:mb-0 w-32 md:text-right mt-1">
                        {new Date(item.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', day: 'numeric'})}
                      </div>

                      <motion.div 
                        className="glass-card p-5 border border-border-subtle hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer w-full md:ml-12 max-w-3xl"
                        onClick={() => handleOpenProjectDetail(item)}
                        whileHover={{ y: -2 }}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                              <span className={`self-start px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-wider border ${STATUS_COLORS[item.status || 'em_andamento']}`}>
                              {STATUS_LABELS[item.status || 'em_andamento']}
                              </span>
                          </div>
                          <h3 className="text-xl font-bold text-text-main leading-tight group-hover:text-primary transition-colors">{item.title}</h3>
                          <p className="text-sm text-text-muted">{item.author}</p>
                        </div>
                      </motion.div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ) : (
            // Modo Compacto (Tabela/Lista Simples)
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-stone-900 border border-border-subtle rounded-2xl overflow-hidden shadow-xl"
            >
              <table className="w-full text-left text-sm text-stone-300">
                <thead className="bg-stone-950/50 text-xs text-text-muted font-semibold border-b border-border-subtle">
                  <tr>
                    <th className="px-6 py-4">Projeto</th>
                    <th className="px-6 py-4 hidden sm:table-cell">Status</th>
                    <th className="px-6 py-4 hidden md:table-cell">Estatísticas</th>
                    <th className="px-6 py-4 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {projects.map((item, index) => (
                    <motion.tr 
                      key={item.id} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.05)" }}
                      className="cursor-pointer"
                      onClick={() => handleOpenProjectDetail(item)}
                    >
                      <td className="px-6 py-4 font-bold text-text-main">
                        {item.title}
                        <div className="text-xs text-text-muted font-normal mt-0.5">{item.author || 'Sem autor'} • {getTags(item.tags).length} tags</div>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold tracking-wider border ${STATUS_COLORS[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex gap-3 text-xs text-text-muted">
                          <span className="flex items-center gap-1" title="Anexos"><span className="material-symbols-rounded text-sm">attach_file</span>{item.attach_count || 0}</span>
                          <span className="flex items-center gap-1" title="Gráficos"><span className="material-symbols-rounded text-sm">bar_chart</span>{item.chart_count || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-text-muted">
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Paginação */}
      {totalPages > 1 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row justify-between items-center mt-8 bg-surface border border-border-subtle p-4 rounded-2xl gap-4"
        >
          <div className="text-xs text-text-muted">
            Mostrando <span className="font-bold text-text-main">{(page - 1) * limit + 1}</span> a <span className="font-bold text-text-main">{Math.min(page * limit, totalProjects)}</span> de <span className="font-bold text-text-main">{totalProjects}</span> projetos
          </div>
          <div className="flex gap-2">
            <motion.button 
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              whileHover={{ scale: page > 1 ? 1.05 : 1 }}
              whileTap={{ scale: page > 1 ? 0.95 : 1 }}
              className="px-4 py-2 bg-surface hover:bg-white/10 disabled:opacity-50 text-text-main rounded-lg text-xs font-bold transition-colors"
            >
              Anterior
            </motion.button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <motion.button
                  key={i + 1}
                  onClick={() => setPage(i + 1)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${page === i + 1 ? 'bg-primary text-secondary' : 'bg-transparent text-text-muted hover:bg-white/10 hover:text-text-main'}`}
                >
                  {i + 1}
                </motion.button>
              ))}
            </div>
            <motion.button 
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              whileHover={{ scale: page < totalPages ? 1.05 : 1 }}
              whileTap={{ scale: page < totalPages ? 0.95 : 1 }}
              className="px-4 py-2 bg-surface hover:bg-white/10 disabled:opacity-50 text-text-main rounded-lg text-xs font-bold transition-colors"
            >
              Próxima
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Modal Criar Novo Projeto */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary/80 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card relative z-10 w-full max-w-lg md:max-w-xl lg:max-w-2xl overflow-hidden border border-border-subtle shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="p-4 md:p-6 border-b border-border-subtle flex justify-between items-center bg-surface shrink-0">
                <h2 className="text-lg md:text-xl font-bold text-text-main flex items-center gap-2">
                  <span className="material-symbols-rounded text-primary">add_box</span>
                  Criar Novo Projeto
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-text-muted hover:text-text-main transition-colors p-1">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              
              <form onSubmit={handleCreateProject} className="p-4 md:p-6 space-y-4 md:space-y-5">
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1">Título do Projeto *</label>
                  <input
                    required
                    type="text"
                    value={newProject.title}
                    onChange={e => setNewProject({...newProject, title: e.target.value})}
                    className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50"
                    placeholder="Ex: Ensaio Clínico Randomizado FASE III..."
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1">Autor / PI</label>
                    <input
                      type="text"
                      value={newProject.author}
                      onChange={e => setNewProject({...newProject, author: e.target.value})}
                      className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50"
                      placeholder="Dr. João Silva"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1">Instituição</label>
                    <input
                      type="text"
                      value={newProject.institution}
                      onChange={e => setNewProject({...newProject, institution: e.target.value})}
                      className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50"
                      placeholder="HCFMUSP"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1">DOI (opcional)</label>
                    <input
                      type="text"
                      value={newProject.doi}
                      onChange={e => setNewProject({...newProject, doi: e.target.value})}
                      className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50"
                      placeholder="10.1038/s41591..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1">Status</label>
                    <div className="relative">
                      <select 
                        value={newProject.status}
                        onChange={e => setNewProject({...newProject, status: e.target.value})}
                        className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50 appearance-none"
                      >
                        <option value="em_andamento">Em Andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="publicado">Publicado</option>
                      </select>
                      <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">expand_more</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={newProject.tags}
                    onChange={e => setNewProject({...newProject, tags: e.target.value})}
                    className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50"
                    placeholder="Pediatria, RCT, Placebo..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1">Anotações</label>
                  <textarea
                    value={newProject.notes}
                    onChange={e => setNewProject({...newProject, notes: e.target.value})}
                    className="w-full bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary/50 min-h-[100px] resize-y"
                    placeholder="Detalhes adicionais, hipóteses, resumos..."
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle mt-6 !mb-2 text-right">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-text-muted hover:bg-surface hover:text-text-main transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-6 py-2.5 bg-primary text-secondary rounded-xl text-xs font-semibold tracking-wide hover:bg-primary-light transition-colors active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <span className="animate-spin material-symbols-rounded text-sm">sync</span>
                        Criando...
                      </>
                    ) : (
                      'Salvar Projeto'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Visualizador de Arquivo */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[100] flex flex-col p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary/90 backdrop-blur-md"
              onClick={() => setPreviewFile(null)}
            />
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative z-10 w-full h-full flex flex-col pointer-events-none"
            >
              <div className="flex justify-between items-center bg-stone-900 border border-border-subtle p-4 rounded-xl shadow-2xl mb-4 pointer-events-auto">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <span className="material-symbols-rounded text-xl">
                      {previewFile.file_type === 'pdf' ? 'picture_as_pdf' : previewFile.file_type === 'csv' ? 'table_chart' : 'insert_drive_file'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-text-main font-bold">{previewFile.original_name}</h3>
                    <p className="text-xs text-text-muted tracking-wide">{previewFile.file_type} • Upload em {new Date(previewFile.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <a 
                    href={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.token}`}
                    className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-white/10 text-text-main rounded-lg text-xs font-bold transition-colors"
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="material-symbols-rounded text-[18px]">download</span>
                    Baixar
                  </a>
                  <button 
                    onClick={() => setPreviewFile(null)} 
                    className="p-2 ml-2 text-text-muted hover:text-text-main bg-surface hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-rounded text-[18px]">close</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 pointer-events-auto shadow-2xl rounded-xl overflow-hidden">
                {previewFile.file_type === 'pdf' ? (
                  <PDFViewer url={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.token}`} />
                ) : previewFile.file_type === 'csv' ? (
                  <CSVPreview url={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.token}`} />
                ) : (
                  <div className="flex items-center justify-center h-full bg-stone-900 border border-border-subtle rounded-xl">
                    <div className="text-center">
                      <span className="material-symbols-rounded text-6xl text-zinc-600 mb-4 block">insert_drive_file</span>
                      <p className="text-text-muted text-sm">Pré-visualização indisponível para este tipo de arquivo.<br/>Use o botão Baixar para abrir o arquivo localmente.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Vincular Análise */}
      <AnimatePresence>
        {isLinkingModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary/80 backdrop-blur-sm"
              onClick={() => setIsLinkingModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card relative z-10 w-full max-w-xl overflow-hidden border border-border-subtle shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-border-subtle flex justify-between items-center bg-surface">
                <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
                  <span className="material-symbols-rounded text-primary">add_link</span>
                  Vincular Análise do Histórico
                </h2>
                <button onClick={() => setIsLinkingModalOpen(false)} className="text-text-muted hover:text-text-main transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <p className="text-sm text-text-muted mb-4">Selecione uma análise estatística realizada anteriormente para vincular a este projeto.</p>
                
                {fullHistory.filter(h => !analyses.some(a => a.id === h.id)).length > 0 ? (
                  <div className="space-y-2">
                    {fullHistory
                      .filter(h => !analyses.some(a => a.id === h.id))
                      .map(h => (
                        <div 
                          key={h.id} 
                          className="flex justify-between items-center p-4 rounded-xl border border-border-subtle bg-surface hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group"
                          onClick={() => linkAnalysis(expandedCard, h.id)}
                        >
                          <div>
                            <p className="font-bold text-text-main group-hover:text-primary transition-colors">{h.title || h.filename}</p>
                            <p className="text-xs text-text-muted">{h.outcome} • {new Date(h.created_at).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <span className="material-symbols-rounded text-zinc-600 group-hover:text-primary transition-colors">link</span>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <span className="material-symbols-rounded text-4xl text-zinc-700 mb-2">history</span>
                    <p className="text-text-muted">Nenhuma análise disponível para vincular.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Detalhes do Projeto (Pop-up para modo compacto) */}
      <AnimatePresence>
        {projectDetailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary/80 backdrop-blur-md"
              onClick={() => setProjectDetailModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="glass-card relative z-10 w-full max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-hidden border border-border-subtle shadow-2xl"
            >
              {/* Header com Glassmorphism Premium */}
              <div className="relative p-4 md:p-6 border-b border-border-subtle overflow-hidden">
                {/* Background gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50" />
                
                <div className="relative flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-center gap-3 mb-3 flex-wrap"
                    >
                      <motion.span 
                        whileHover={{ scale: 1.05 }}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wider border cursor-default ${STATUS_COLORS[projectDetailModal.status || 'em_andamento']}`}
                      >
                        {STATUS_LABELS[projectDetailModal.status || 'em_andamento']}
                      </motion.span>
                      <span className="text-[10px] text-text-muted font-medium bg-surface px-2 py-1 rounded-md">#{projectDetailModal.id}</span>
                      <span className="text-[10px] text-text-muted font-medium flex items-center gap-1 bg-surface px-2 py-1 rounded-md">
                        <span className="material-symbols-rounded text-[12px]">calendar_today</span>
                        {new Date(projectDetailModal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </motion.div>
                    <motion.h2 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-xl md:text-2xl font-bold text-text-main leading-tight"
                    >
                      {projectDetailModal.title}
                    </motion.h2>
                    {projectDetailModal.author && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-text-muted mt-2 flex items-center gap-2"
                      >
                        <span className="material-symbols-rounded text-[16px] text-primary/70">person</span>
                        {projectDetailModal.author}
                        {projectDetailModal.institution && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-text-muted">{projectDetailModal.institution}</span>
                          </>
                        )}
                      </motion.p>
                    )}
                    {projectDetailModal.doi && (
                      <motion.a 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.25 }}
                        href={`https://doi.org/${projectDetailModal.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary mt-2 flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span className="material-symbols-rounded text-[12px]">link</span>
                        DOI: {projectDetailModal.doi}
                      </motion.a>
                    )}
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setProjectDetailModal(null)} 
                    className="text-text-muted hover:text-text-main transition-colors p-2 shrink-0 bg-surface hover:bg-white/10 rounded-lg"
                  >
                    <span className="material-symbols-rounded text-xl">close</span>
                  </motion.button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(85vh-200px)] custom-scrollbar">
                {projectDetailLoading ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center py-12"
                  >
                    <div className="animate-spin text-primary">
                      <span className="material-symbols-rounded text-4xl">sync</span>
                    </div>
                  </motion.div>
                ) : projectDetailData ? (
                  <div className="space-y-6">
                    {/* Tags com animação stagger */}
                    {projectDetailData.tags?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <h4 className="text-xs font-bold text-text-muted tracking-wider mb-3 flex items-center gap-2">
                          <span className="material-symbols-rounded text-sm">sell</span>
                          Tags
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {projectDetailData.tags.map((t, i) => (
                            <motion.span 
                              key={t}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.35 + i * 0.05 }}
                              whileHover={{ scale: 1.05 }}
                              className="px-3 py-1.5 bg-surface border border-border-subtle rounded-full text-xs text-text-main hover:border-primary/30 hover:text-primary transition-all cursor-default"
                            >
                              #{t}
                            </motion.span>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Notes */}
                    {projectDetailData.notes && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                      >
                        <h4 className="text-xs font-bold text-text-muted tracking-wider mb-3 flex items-center gap-2">
                          <span className="material-symbols-rounded text-sm">notes</span>
                          Notas
                        </h4>
                        <motion.div 
                          whileHover={{ borderColor: 'rgba(255,255,255,0.2)' }}
                          className="p-4 bg-surface border border-border-subtle rounded-xl text-sm text-text-main transition-colors"
                        >
                          {projectDetailData.notes}
                        </motion.div>
                      </motion.div>
                    )}

                    {/* Stats com cards aprimorados */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 }}
                    >
                      <h4 className="text-xs font-bold text-text-muted tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-rounded text-sm">analytics</span>
                        Estatísticas
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        <motion.div 
                          whileHover={{ y: -4, borderColor: 'rgba(34, 197, 94, 0.3)' }}
                          className="glass-card p-4 text-center border border-border-subtle hover:border-primary/30 transition-all cursor-default"
                        >
                          <div className="flex justify-center mb-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <span className="material-symbols-rounded text-primary">attach_file</span>
                            </div>
                          </div>
                          <p className="text-2xl font-semibold text-primary">{projectDetailData.attachment_count || 0}</p>
                          <p className="text-[10px] font-bold text-text-muted mt-1">Anexos</p>
                        </motion.div>
                        <motion.div 
                          whileHover={{ y: -4, borderColor: 'rgba(34, 197, 94, 0.3)' }}
                          className="glass-card p-4 text-center border border-border-subtle hover:border-teal-300/30 transition-all cursor-default"
                        >
                          <div className="flex justify-center mb-2">
                            <div className="p-2 bg-teal-400/10 rounded-lg">
                              <span className="material-symbols-rounded text-teal-300">show_chart</span>
                            </div>
                          </div>
                          <p className="text-2xl font-semibold text-teal-300">{projectDetailData.chart_count || 0}</p>
                          <p className="text-[10px] font-bold text-text-muted mt-1">Gráficos</p>
                        </motion.div>
                        <motion.div 
                          whileHover={{ y: -4, borderColor: 'rgba(34, 197, 94, 0.3)' }}
                          className="glass-card p-4 text-center border border-border-subtle hover:border-fuchsia-400/30 transition-all cursor-default"
                        >
                          <div className="flex justify-center mb-2">
                            <div className="p-2 bg-fuchsia-500/10 rounded-lg">
                              <span className="material-symbols-rounded text-fuchsia-400">science</span>
                            </div>
                          </div>
                          <p className="text-2xl font-semibold text-fuchsia-400">{projectDetailData.analysis_count || 0}</p>
                          <p className="text-[10px] font-bold text-text-muted mt-1">Análises</p>
                        </motion.div>
                      </div>
                    </motion.div>

                    {/* Quick Actions com micro-interactions */}
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-wrap gap-3 pt-4 border-t border-border-subtle"
                    >
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setExpandedCard(projectDetailModal.id)
                          setProjectDetailModal(null)
                          setViewMode('detalhado')
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-bold hover:bg-primary/30 transition-colors"
                      >
                        <span className="material-symbols-rounded text-sm">edit</span>
                        Editar
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleExportProject(projectDetailModal.id)}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-teal-300 border border-teal-300/20 rounded-lg hover:bg-teal-300/10 transition-colors"
                      >
                        <span className="material-symbols-rounded text-sm">download</span>
                        Exportar
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (window.confirm('Deseja realmente deletar este projeto?')) {
                            handleDeleteProject(projectDetailModal.id)
                            setProjectDetailModal(null)
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors"
                      >
                        <span className="material-symbols-rounded text-sm">delete</span>
                        Deletar
                      </motion.button>
                    </motion.div>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                  >
                    <span className="material-symbols-rounded text-5xl text-zinc-700 mb-4 block">error</span>
                    <p className="text-text-muted">Não foi possível carregar os detalhes.</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
