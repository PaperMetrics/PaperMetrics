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
  'concluido': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
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
   
   // Analyses state and functions
   const [analyses, setAnalyses] = useState([])
   const [analysesLoading, setAnalysesLoading] = useState(false)
   const [fullHistory, setFullHistory] = useState([])
   const [isLinkingModalOpen, setIsLinkingModalOpen] = useState(false)
  
  // Modal Novo Projeto
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newProject, setNewProject] = useState({ title: '', author: '', institution: '', doi: '', status: 'em_andamento', notes: '', tags: '' })
  
  // Expandir Card
  const [expandedCard, setExpandedCard] = useState(null)
  const [activeTabUrl, setActiveTabUrl] = useState('detalhes') // 'detalhes', 'anexos', 'graficos', 'analises'
  const [editingProject, setEditingProject] = useState(null)
  const [editFormData, setEditFormData] = useState({})

  // Modal para visualização do arquivo
  const [previewFile, setPreviewFile] = useState(null)

  const searchInputRef = useRef(null)

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
           headers: { 'Authorization': `Bearer ${session?.sessionToken}` }
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
     
     if (isAuthenticated && session?.sessionToken) {
       fetchTags()
     }
   }, [isAuthenticated, session])

    useEffect(() => {
      fetchProjects()
    }, [isAuthenticated, session, page, statusFilter, tagFilter, sortBy])

    // Fetch analyses for the currently expanded project
    useEffect(() => {
      const fetchAnalysesData = async () => {
        if (!expandedCard || !isAuthenticated || !session?.sessionToken) {
          setAnalyses([])
          return
        }
        
        setAnalysesLoading(true)
        try {
          const res = await fetch(`${API_URL}/api/projects/${expandedCard}/analyses`, {
            headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
      
      if (isAuthenticated && session?.sessionToken && activeTabUrl === 'analises') {
        fetchAnalysesData()
      }
    }, [expandedCard, isAuthenticated, session, activeTabUrl])

   const fetchProjects = async () => {
     if (!isAuthenticated || !session?.sessionToken) {
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
         headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
    if (!newProject.title) return

    let tagsArr = []
    if (newProject.tags) {
      tagsArr = newProject.tags.split(',').map(t => t.trim()).filter(Boolean)
    }

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newProject,
          tags: JSON.stringify(tagsArr)
        })
      })
      if (res.ok) {
        setIsModalOpen(false)
        setNewProject({ title: '', author: '', institution: '', doi: '', status: 'em_andamento', notes: '', tags: '' })
        fetchProjects()
        refreshContext()
      }
    } catch (err) {
      console.error('Create error:', err)
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
          'Authorization': `Bearer ${session.sessionToken}`,
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
        headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
     if (!confirm('Deseja realmente deletar este projeto e todos os seus anexos e gráficos?')) return
     try {
       const res = await fetch(`${API_URL}/api/projects/${id}`, {
         method: 'DELETE',
         headers: { 'Authorization': `Bearer ${session.sessionToken}` }
       })
       if (res.ok) {
         if (expandedCard === id) setExpandedCard(null)
         fetchProjects()
         refreshContext()
       }
     } catch (err) {
       console.error(err)
     }
   }

    const fetchFullHistory = async () => {
      if (!isAuthenticated || !session?.sessionToken) return
      try {
        const res = await fetch(`${API_URL}/api/history`, {
          headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
            'Authorization': `Bearer ${session.sessionToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        })
        if (res.ok) {
          // Refresh linked analyses
          const refetchRes = await fetch(`${API_URL}/api/projects/${projectId}/analyses`, {
            headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
          headers: { 'Authorization': `Bearer ${session.sessionToken}` }
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
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
            <span className="text-primary glow-text-sm">Projetos de Pesquisa</span>
          </h1>
          <p className="text-slate-400 max-w-2xl">Gerencie seus estudos, visualize gráficos salvos, e gerencie anexos (PDFs, CSVs) em um só lugar.</p>
        </motion.div>
        
        <motion.button 
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-secondary font-black uppercase tracking-widest text-xs rounded-xl hover:bg-primary-light transition-all active:scale-95 shadow-lg shadow-primary/20"
        >
          <span className="material-symbols-rounded text-lg">add_box</span>
          Novo Projeto
        </motion.button>
      </header>

      {/* Cards de Estatística */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
         {[
           { label: 'Projetos', value: totalProjects, icon: 'folder', color: 'text-primary' },
           { label: 'Publicados', value: projects.filter(p => p.status === 'publicado').length, icon: 'public', color: 'text-fuchsia-400' },
           { label: 'Anexos', value: projects.reduce((total, p) => total + (p.attachment_count || 0), 0), icon: 'attachment', color: 'text-slate-400' },
           { label: 'Gráficos', value: projects.reduce((total, p) => total + (p.chart_count || 0), 0), icon: 'insert_chart', color: 'text-emerald-400' },
         ].map((s, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass-card p-5 flex items-center gap-4 hover:border-white/20 transition-colors"
          >
            <div className={`p-3 bg-white/5 rounded-2xl ${s.color}`}>
              <span className="material-symbols-rounded">{s.icon}</span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{s.value}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Barra de Filtros */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/5 border border-white/10 p-3 rounded-2xl"
      >
        <div className="flex bg-white/5 p-1 rounded-xl">
          {['todos', 'em_andamento', 'concluido', 'publicado'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all capitalize ${statusFilter === status ? 'bg-primary/20 text-primary shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              {status === 'todos' ? 'Todos' : STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        
        <div className="relative flex-1 max-w-md w-full">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar por título, autor... (Ctrl+K)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50"
          />
        </div>
         <div className="flex gap-4">
           <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
             <button 
               onClick={() => setViewMode('compacto')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'compacto' ? 'bg-primary text-secondary shadow-lg' : 'text-zinc-400 hover:text-white'}`}
               title="Modo Compacto (Tabela)"
             >
               <span className="material-symbols-rounded text-sm">view_list</span>
               <span className="hidden sm:inline">Lista</span>
             </button>
             <button 
               onClick={() => setViewMode('detalhado')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'detalhado' ? 'bg-primary text-secondary shadow-lg' : 'text-zinc-400 hover:text-white'}`}
               title="Modo Detalhado (Cards)"
             >
               <span className="material-symbols-rounded text-sm">grid_view</span>
               <span className="hidden sm:inline">Cards</span>
             </button>
             <button 
               onClick={() => setViewMode('timeline')}
               className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'timeline' ? 'bg-primary text-secondary shadow-lg' : 'text-zinc-400 hover:text-white'}`}
               title="Linha do Tempo"
             >
               <span className="material-symbols-rounded text-sm">timeline</span>
               <span className="hidden sm:inline">Tempo</span>
             </button>
           </div>
           <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
             <select 
               value={tagFilter}
               onChange={e => setTagFilter(e.target.value)}
               className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50 appearance-none"
             >
               <option value="">Filtrar por tag</option>
               {availableTags.map(tag => (
                 <option key={tag} value={tag}>
                   #{tag}
                 </option>
               ))}
             </select>
           </div>
           <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
             <select 
               value={sortBy}
               onChange={e => setSortBy(e.target.value)}
               className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50 appearance-none"
             >
               <option value="created_at_desc">Ordenar: Mais recente</option>
               <option value="created_at_asc">Ordenar: Mais antigo</option>
               <option value="title_asc">Ordenar: Nome A-Z</option>
               <option value="title_desc">Ordenar: Nome Z-A</option>
               <option value="analyses_desc">Ordenar: Mais análises</option>
               <option value="analyses_asc">Ordenar: Menos análises</option>
             </select>
           </div>
         </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
        className={viewMode === 'detalhado' ? "grid grid-cols-1 gap-6" : "space-y-4"}
      >
        <AnimatePresence>
          {loading ? (
            <div className="text-center py-20 animate-pulse text-zinc-500 col-span-full">Carregando projetos...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 col-span-full">Nenhum projeto encontrado.</div>
          ) : viewMode === 'detalhado' ? (
            projects.map((item) => {
              const tags = getTags(item.tags)
              const isExpanded = expandedCard === item.id
              
              return (
                <motion.div 
                  layout
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`glass-card overflow-hidden transition-colors border ${isExpanded ? 'border-primary/30 ring-1 ring-primary/20' : 'border-white/5 hover:border-white/20'}`}
                >
                  {/* Cabeçalho do Card */}
                  <div 
                    onClick={() => setExpandedCard(isExpanded ? null : item.id)}
                    className="p-6 cursor-pointer flex flex-col md:flex-row gap-6 justify-between items-start md:items-center hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[item.status || 'em_andamento']}`}>
                          {STATUS_LABELS[item.status || 'em_andamento']}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-medium">#{item.id}</span>
                        <span className="text-[10px] text-zinc-500 font-medium">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{item.title}</h3>
                      <p className="text-sm text-zinc-400">{item.author} {item.institution ? `• ${item.institution}` : ''}</p>
                      
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {tags.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[10px] text-zinc-300">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-4 items-center">
                      <div className="text-center px-4 border-r border-white/10">
                        <span className="block text-xl font-black text-white">{item.attachment_count || 0}</span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500">Arquivos</span>
                      </div>
                      <div className="text-center px-4 border-r border-white/10">
                        <span className="block text-xl font-black text-white">{item.chart_count || 0}</span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500">Gráficos</span>
                      </div>
                      <div className="text-center px-4 border-r border-white/10">
                        <span className="block text-xl font-black text-white">{item.analysis_count || 0}</span>
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500">Análises</span>
                      </div>
                      
                      <button className="p-2 ml-2 rounded-full hover:bg-white/10 text-zinc-400 transition-colors">
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
                        className="border-t border-white/5 bg-slate-900/50"
                      >
                        {/* Abas */}
                        <div className="flex border-b border-white/5 overflow-x-auto custom-scrollbar">
                          {[
                            { id: 'detalhes', label: 'Detalhes', icon: 'info' },
                            { id: 'anexos', label: 'Anexos & Dados', icon: 'attachment' },
                            { id: 'graficos', label: 'Gráficos Salvos', icon: 'insert_chart' },
                            { id: 'analises', label: 'Análises Clínicas', icon: 'science' },
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTabUrl(tab.id)}
                              className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
                                activeTabUrl === tab.id 
                                  ? 'border-primary text-primary bg-primary/5' 
                                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                              }`}
                            >
                              <span className="material-symbols-rounded text-sm">{tab.icon}</span>
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        
                        <div className="p-6">
                          {activeTabUrl === 'detalhes' && (
                            editingProject === item.id ? (
                              <div className="space-y-4 max-w-3xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Título</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.title || ''} 
                                      onChange={e => setEditFormData({...editFormData, title: e.target.value})}
                                      className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">DOI / Referência</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.doi || ''} 
                                      onChange={e => setEditFormData({...editFormData, doi: e.target.value})}
                                      className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Autor / PI</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.author || ''} 
                                      onChange={e => setEditFormData({...editFormData, author: e.target.value})}
                                      className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Instituição</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.institution || ''} 
                                      onChange={e => setEditFormData({...editFormData, institution: e.target.value})}
                                      className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Tags (separadas por vírgula)</label>
                                    <input 
                                      type="text" 
                                      value={editFormData.tags || ''} 
                                      onChange={e => setEditFormData({...editFormData, tags: e.target.value})}
                                      className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50" 
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Status</label>
                                    <div className="relative">
                                      <select 
                                        value={editFormData.status || 'em_andamento'} 
                                        onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                                        className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-2.5 text-white outline-none focus:border-primary/50 appearance-none" 
                                      >
                                        <option value="em_andamento">Em Andamento</option>
                                        <option value="concluido">Concluído</option>
                                        <option value="publicado">Publicado</option>
                                      </select>
                                      <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">expand_more</span>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Anotações do Projeto</label>
                                  <textarea 
                                    value={editFormData.notes || ''} 
                                    onChange={e => setEditFormData({...editFormData, notes: e.target.value})}
                                    className="w-full text-sm border border-white/20 bg-slate-900/50 rounded-lg p-4 text-zinc-300 min-h-[100px] outline-none focus:border-primary/50 resize-y"
                                  />
                                </div>
                                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                                  <button
                                    onClick={() => setEditingProject(null)}
                                    className="px-4 py-2 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-white rounded-lg transition-colors"
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
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Título</label>
                                    <p className="text-sm border border-white/10 bg-white/5 rounded-lg p-3 text-white">{item.title}</p>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">DOI / Referência</label>
                                    <p className="text-sm border border-white/10 bg-white/5 rounded-lg p-3 text-white">{item.doi || 'Não especificado'}</p>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Anotações do Projeto</label>
                                  <div className="text-sm border border-white/10 bg-white/5 rounded-lg p-4 text-zinc-300 min-h-[100px] whitespace-pre-wrap">
                                    {item.notes || 'Nenhuma anotação inserida para este projeto.'}
                                  </div>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-white/10">
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
                                      className="px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors flex items-center gap-2 border border-emerald-400/20"
                                    >
                                      <span className="material-symbols-rounded text-sm">download</span>
                                      Exportar (.zip)
                                    </button>
                                    <button
                                      onClick={() => handleDeleteProject(item.id)}
                                      className="px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex items-center gap-2 border border-red-400/20"
                                    >
                                      <span className="material-symbols-rounded text-sm">delete</span>
                                      Deletar
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
                                  <h3 className="text-xl font-bold text-white">Análises Vinculadas</h3>
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
                                     <div key={analysis.id} className="border border-white/10 rounded-lg p-4 bg-slate-900/50">
                                       <div className="flex justify-between items-start">
                                         <div>
                                           <h4 className="font-bold text-white">{analysis.filename}</h4>
                                           <p className="text-zinc-400 text-sm">
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
                                 <div className="py-10 text-center border-2 border-dashed border-white/10 rounded-2xl">
                                   <span className="material-symbols-rounded text-4xl text-zinc-600 mb-2">dataset</span>
                                   <p className="text-zinc-500 text-sm">Nenhuma análise vinculada a este projeto</p>
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
            <div className="relative border-l-2 border-white/10 ml-6 md:ml-20 py-8 space-y-12">
              {projects.map((item) => {
                return (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="relative pl-8 md:pl-0"
                  >
                    <div className={`absolute left-[-5px] md:left-[-11px] top-6 w-4 h-4 md:w-5 md:h-5 rounded-full border-4 border-slate-900 bg-current z-10 ${STATUS_COLORS[item.status || 'em_andamento'].includes('emerald') ? 'text-emerald-400' : STATUS_COLORS[item.status || 'em_andamento'].includes('fuchsia') ? 'text-fuchsia-400' : 'text-amber-400'}`}></div>
                    
                    <div className="md:absolute top-5 md:left-[-150px] text-xs font-bold text-zinc-500 mb-2 md:mb-0 w-32 md:text-right mt-1">
                      {new Date(item.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', day: 'numeric'})}
                    </div>

                    <div className="glass-card p-5 border border-white/5 hover:border-white/20 transition-all cursor-pointer w-full md:ml-12 max-w-3xl" onClick={() => { setViewMode('detalhado'); setExpandedCard(item.id); }}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className={`self-start px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${STATUS_COLORS[item.status || 'em_andamento']}`}>
                            {STATUS_LABELS[item.status || 'em_andamento']}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-white leading-tight">{item.title}</h3>
                        <p className="text-sm text-zinc-400">{item.author}</p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            // Modo Compacto (Tabela/Lista Simples)
            <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/50 text-xs uppercase text-zinc-500 font-black border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4">Projeto</th>
                    <th className="px-6 py-4 hidden sm:table-cell">Status</th>
                    <th className="px-6 py-4 hidden md:table-cell">Estatísticas</th>
                    <th className="px-6 py-4 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {projects.map(item => (
                    <tr 
                      key={item.id} 
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => setExpandedCard(expandedCard === item.id ? null : item.id)}
                    >
                      <td className="px-6 py-4 font-bold text-white">
                        {item.title}
                        <div className="text-xs text-zinc-500 font-normal mt-0.5">{item.author || 'Sem autor'} • {getTags(item.tags).length} tags</div>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex gap-3 text-xs text-zinc-400">
                          <span className="flex items-center gap-1" title="Anexos"><span className="material-symbols-rounded text-sm">attach_file</span>{item.attach_count || 0}</span>
                          <span className="flex items-center gap-1" title="Gráficos"><span className="material-symbols-rounded text-sm">bar_chart</span>{item.chart_count || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-zinc-500">
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-8 bg-white/5 border border-white/10 p-4 rounded-2xl gap-4">
          <div className="text-xs text-zinc-500">
            Mostrando <span className="font-bold text-white">{(page - 1) * limit + 1}</span> a <span className="font-bold text-white">{Math.min(page * limit, totalProjects)}</span> de <span className="font-bold text-white">{totalProjects}</span> projetos
          </div>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${page === i + 1 ? 'bg-primary text-secondary' : 'bg-transparent text-zinc-400 hover:bg-white/10 hover:text-white'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
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
              className="glass-card relative z-10 w-full max-w-lg overflow-hidden border border-white/10 shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-rounded text-primary">add_box</span>
                  Criar Novo Projeto
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              
              <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Título do Projeto *</label>
                  <input
                    required
                    type="text"
                    value={newProject.title}
                    onChange={e => setNewProject({...newProject, title: e.target.value})}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                    placeholder="Ex: Ensaio Clínico Randomizado FASE III..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Autor / PI</label>
                    <input
                      type="text"
                      value={newProject.author}
                      onChange={e => setNewProject({...newProject, author: e.target.value})}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                      placeholder="Dr. João Silva"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Instituição</label>
                    <input
                      type="text"
                      value={newProject.institution}
                      onChange={e => setNewProject({...newProject, institution: e.target.value})}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                      placeholder="HCFMUSP"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">DOI (opcional)</label>
                    <input
                      type="text"
                      value={newProject.doi}
                      onChange={e => setNewProject({...newProject, doi: e.target.value})}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                      placeholder="10.1038/s41591..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Status</label>
                    <div className="relative">
                      <select 
                        value={newProject.status}
                        onChange={e => setNewProject({...newProject, status: e.target.value})}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 appearance-none"
                      >
                        <option value="em_andamento">Em Andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="publicado">Publicado</option>
                      </select>
                      <span className="material-symbols-rounded absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">expand_more</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={newProject.tags}
                    onChange={e => setNewProject({...newProject, tags: e.target.value})}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                    placeholder="Pediatria, RCT, Placebo..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Anotações</label>
                  <textarea
                    value={newProject.notes}
                    onChange={e => setNewProject({...newProject, notes: e.target.value})}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 min-h-[100px] resize-y"
                    placeholder="Detalhes adicionais, hipóteses, resumos..."
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10 mt-6 !mb-2 text-right">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-primary text-secondary rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-light transition-colors active:scale-95 shadow-lg shadow-primary/20"
                  >
                    Salvar Projeto
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
              <div className="flex justify-between items-center bg-slate-900 border border-white/10 p-4 rounded-xl shadow-2xl mb-4 pointer-events-auto">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <span className="material-symbols-rounded text-xl">
                      {previewFile.file_type === 'pdf' ? 'picture_as_pdf' : previewFile.file_type === 'csv' ? 'table_chart' : 'insert_drive_file'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{previewFile.original_name}</h3>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">{previewFile.file_type} • Upload em {new Date(previewFile.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <a 
                    href={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.sessionToken}`}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors"
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="material-symbols-rounded text-[18px]">download</span>
                    Baixar
                  </a>
                  <button 
                    onClick={() => setPreviewFile(null)} 
                    className="p-2 ml-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-rounded text-[18px]">close</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 pointer-events-auto shadow-2xl rounded-xl overflow-hidden">
                {previewFile.file_type === 'pdf' ? (
                  <PDFViewer url={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.sessionToken}`} />
                ) : previewFile.file_type === 'csv' ? (
                  <CSVPreview url={`${API_URL}/api/attachments/${previewFile.id}/file?token=${session?.sessionToken}`} />
                ) : (
                  <div className="flex items-center justify-center h-full bg-slate-900 border border-white/10 rounded-xl">
                    <div className="text-center">
                      <span className="material-symbols-rounded text-6xl text-zinc-600 mb-4 block">insert_drive_file</span>
                      <p className="text-zinc-500 text-sm">Pré-visualização indisponível para este tipo de arquivo.<br/>Use o botão Baixar para abrir o arquivo localmente.</p>
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
              className="glass-card relative z-10 w-full max-w-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-rounded text-primary">add_link</span>
                  Vincular Análise do Histórico
                </h2>
                <button onClick={() => setIsLinkingModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <p className="text-sm text-zinc-400 mb-4">Selecione uma análise estatística realizada anteriormente para vincular a este projeto.</p>
                
                {fullHistory.filter(h => !analyses.some(a => a.id === h.id)).length > 0 ? (
                  <div className="space-y-2">
                    {fullHistory
                      .filter(h => !analyses.some(a => a.id === h.id))
                      .map(h => (
                        <div 
                          key={h.id} 
                          className="flex justify-between items-center p-4 rounded-xl border border-white/5 bg-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group"
                          onClick={() => linkAnalysis(expandedCard, h.id)}
                        >
                          <div>
                            <p className="font-bold text-white group-hover:text-primary transition-colors">{h.filename}</p>
                            <p className="text-xs text-zinc-500">{h.outcome} • {new Date(h.created_at).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <span className="material-symbols-rounded text-zinc-600 group-hover:text-primary transition-colors">link</span>
                        </div>
                      ))
                    }
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <span className="material-symbols-rounded text-4xl text-zinc-700 mb-2">history</span>
                    <p className="text-zinc-500">Nenhuma análise disponível para vincular.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
