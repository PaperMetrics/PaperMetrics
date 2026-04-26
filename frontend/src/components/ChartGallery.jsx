import { useState } from 'react'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'

const API_URL = import.meta.env.VITE_API_BASE_URL

export default function ChartGallery({ projectId }) {
  const { session } = useAuth()
  const [selectedChart, setSelectedChart] = useState(null)
  const [selectedChartIndex, setSelectedChartIndex] = useState(-1)
  const [typeFilter, setTypeFilter] = useState('todos')

  const fetcher = (url) => fetch(url, {
    headers: { 'Authorization': `Bearer ${session?.token}` }
  }).then(res => res.json())

  const { data: charts = [], mutate: fetchCharts, isLoading: loading } = useSWR(
    (projectId && session?.token) ? `${API_URL}/api/projects/${projectId}/charts` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const deleteChart = async (id) => {
    if (!confirm('Deletar este gráfico?')) return
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/charts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.token}` }
      })
      if (res.ok) {
        setSelectedChart(null)
        fetchCharts()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Generate unique chart types for the filter options, derived from charts metadata (chart_type)
  const chartTypes = Array.from(new Set(charts.map(c => c.chart_type || 'Desconhecido')))
  
  const filteredCharts = charts.filter(c => typeFilter === 'todos' || (c.chart_type || 'Desconhecido') === typeFilter)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h4 className="text-xs font-bold text-zinc-500 tracking-wide pl-1">
          Gráficos Salvos ({charts.length})
        </h4>

        {/* Filtros de Tipos (se houver mais de um tipo) */}
        {chartTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('todos')}
              className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded-lg transition-colors ${
                typeFilter === 'todos' ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-white/5 text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              Todos
            </button>
            {chartTypes.map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded-lg transition-colors ${
                  typeFilter === type ? 'bg-teal-300/20 text-teal-300 border border-teal-300/20' : 'bg-white/5 text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-zinc-400 animate-pulse text-sm flex flex-col items-center gap-2">
          <span className="material-symbols-rounded animate-spin text-3xl text-teal-300">autorenew</span>
          <p>Carregando galeria...</p>
        </div>
      ) : charts.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl p-10 text-center bg-white/[0.02]">
          <span className="material-symbols-rounded text-4xl text-zinc-600 mb-2">image_not_supported</span>
          <p className="text-zinc-400 font-bold mb-1">Nenhum gráfico disponível</p>
          <p className="text-zinc-500 text-xs">Acesse o Dashboard para realizar análises e salvar os gráficos gerados neste projeto.</p>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
           <AnimatePresence>
             {filteredCharts.map((chart, index) => (
               <motion.div
                 layout
                 key={chart.id}
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 whileHover={{ y: -5 }}
                 className="group relative cursor-pointer rounded-xl overflow-hidden bg-stone-900 border border-white/10 aspect-square shadow-lg"
                 onClick={() => {
                   setSelectedChart(chart);
                   setSelectedChartIndex(index);
                 }}
               >
                <img 
                  src={`${API_URL}/api/charts/${chart.id}/thumb?token=${session?.token}`} 
                  alt={chart.filename}
                  className="w-full h-full object-contain p-2"
                  loading="lazy"
                  onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="none" viewBox="0 0 24 24" stroke="%233f3f46"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>' }}
                />
                
                {/* Informações sobrepostas (Hover) */}
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                  <span className="text-[10px] font-semibold tracking-wide text-teal-300 mb-1">{chart.chart_type || 'Dashboard'}</span>
                  <p className="text-white text-sm font-bold truncate" title={chart.filename}>{chart.filename}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">{new Date(chart.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Lightbox do Gráfico */}
      <AnimatePresence>
        {selectedChart && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary/95 backdrop-blur-md"
              onClick={() => setSelectedChart(null)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-5xl max-h-full flex flex-col pointer-events-none"
            >
              <div className="flex justify-between items-center bg-stone-900 border border-white/10 p-4 rounded-t-2xl shadow-2xl pointer-events-auto">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-300/10 text-teal-300 rounded-lg">
                    <span className="material-symbols-rounded">insert_chart</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{selectedChart.filename}</h3>
                    <p className="text-xs text-zinc-500 flex gap-2">
                      <span className="uppercase">{selectedChart.chart_type}</span>
                      <span>•</span>
                      <span>{new Date(selectedChart.created_at).toLocaleDateString('pt-BR')}</span>
                    </p>
                  </div>
                </div>
                
                 <div className="flex items-center gap-2">
                   <button 
                     onClick={() => {
                       const prevIndex = selectedChartIndex > 0 ? selectedChartIndex - 1 : filteredCharts.length - 1;
                       setSelectedChart(filteredCharts[prevIndex]);
                       setSelectedChartIndex(prevIndex);
                     }}
                     className="p-2 ml-1 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                   >
                     <span className="material-symbols-rounded text-[18px]">chevron_left</span>
                     Anterior
                   </button>
                   <a 
                     href={`${API_URL}/api/charts/${selectedChart.id}/file?token=${session?.token}`}
                     download
                     target="_blank"
                     rel="noreferrer"
                     className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-teal-300/20 hover:text-teal-300 text-white border border-transparent hover:border-teal-300/20 rounded-lg text-xs font-bold transition-colors"
                   >
                     <span className="material-symbols-rounded text-[18px]">download</span>
                     <span className="hidden sm:inline">Baixar Completo</span>
                   </a>
                   <button 
                     onClick={() => deleteChart(selectedChart.id)}
                     className="p-2 ml-1 text-zinc-400 hover:text-red-400 bg-white/5 hover:bg-red-400/10 rounded-lg transition-colors border border-transparent hover:border-red-400/20"
                     title="Excluir Gráfico"
                   >
                     <span className="material-symbols-rounded text-[18px]">delete</span>
                   </button>
                   <button 
                     onClick={() => {
                       const nextIndex = selectedChartIndex < filteredCharts.length - 1 ? selectedChartIndex + 1 : 0;
                       setSelectedChart(filteredCharts[nextIndex]);
                       setSelectedChartIndex(nextIndex);
                     }}
                     className="p-2 ml-1 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                   >
                     Próximo
                     <span className="material-symbols-rounded text-[18px]">chevron_right</span>
                   </button>
                   <button 
                     onClick={() => setSelectedChart(null)}
                     className="p-2 ml-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                   >
                     <span className="material-symbols-rounded text-[18px]">close</span>
                   </button>
                 </div>
              </div>

              <div className="flex-1 min-h-0 bg-stone-950/80 p-4 sm:p-8 rounded-b-2xl border-x border-b border-white/10 shadow-2xl overflow-auto custom-scrollbar flex items-center justify-center pointer-events-auto">
                <img 
                  src={`${API_URL}/api/charts/${selectedChart.id}/file?token=${session?.token}`} 
                  alt={selectedChart.filename}
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
