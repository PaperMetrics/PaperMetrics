import { useState, useEffect } from 'react'
import Papa from 'papaparse'

export default function CSVPreview({ url }) {
  const [data, setData] = useState([])
  const [columns, setColumns] = useState([])
  const [stats, setStats] = useState({})
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [page, setPage] = useState(1)
  const rowsPerPage = 50

  useEffect(() => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true, // auto convert numbers
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn("CSV parser errors:", results.errors)
        }
        const parsedData = results.data
        if (parsedData.length > 0) {
          const cols = Object.keys(parsedData[0])
          setColumns(cols)
          setData(parsedData)
          
          // Calculate basic stats for numeric columns
          const columnStats = {}
          cols.forEach(c => {
            const values = parsedData.map(row => row[c]).filter(v => typeof v === 'number' && !isNaN(v))
            if (values.length > 0) {
              const min = Math.min(...values)
              const max = Math.max(...values)
              const avg = values.reduce((a, b) => a + b, 0) / values.length
              columnStats[c] = {
                min: min.toFixed(2),
                max: max.toFixed(2),
                avg: avg.toFixed(2),
                count: values.length
              }
            }
          })
          setStats(columnStats)
        }
        setLoading(false)
      },
      error: (err) => {
        setError(err.message)
        setLoading(false)
      }
    })
  }, [url])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <span className="material-symbols-rounded animate-spin text-3xl text-primary">autorenew</span>
        <p className="text-sm">Processando dataset...</p>
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
        <span className="material-symbols-rounded text-3xl text-red-400">error</span>
        <p className="text-sm">{error || "Arquivo vazio ou inválido."}</p>
      </div>
    )
  }

  const totalPages = Math.ceil(data.length / rowsPerPage)
  const currentData = data.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
      
      {/* Header Info */}
      <div className="p-4 bg-slate-800 border-b border-white/10 flex justify-between items-center">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-primary/20 text-primary rounded-lg material-symbols-rounded text-sm">dataset</span>
            <span className="text-xs font-bold text-white">{data.length} Linhas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-accent/20 text-accent rounded-lg material-symbols-rounded text-sm">view_column</span>
            <span className="text-xs font-bold text-white">{columns.length} Colunas</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            disabled={page <= 1} 
            onClick={() => setPage(p => p - 1)}
            className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg text-white transition-colors"
          >
            <span className="material-symbols-rounded text-sm">arrow_back_ios_new</span>
          </button>
          <span className="text-xs text-slate-400 font-medium px-2">
            Página {page} de {totalPages}
          </span>
          <button 
            disabled={page >= totalPages} 
            onClick={() => setPage(p => p + 1)}
            className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded-lg text-white transition-colors"
          >
            <span className="material-symbols-rounded text-sm">arrow_forward_ios</span>
          </button>
        </div>
      </div>

      {/* Tabela de Dados */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-950">
        <table className="w-full text-left border-collapse border-spacing-0">
          <thead className="sticky top-0 bg-slate-900 border-b border-white/10 shadow-sm z-10">
            <tr>
              <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 whitespace-nowrap bg-slate-900 w-12 text-center border-r border-white/5">
                #
              </th>
              {columns.map(col => (
                <th key={col} className="px-4 py-3 text-[10px] font-black uppercase text-slate-300 whitespace-nowrap bg-slate-900 border-r border-white/5 group relative hover:bg-slate-800 transition-colors">
                  {col}
                  {stats[col] && (
                    <div className="absolute opacity-0 invisible group-hover:opacity-100 group-hover:visible z-20 bg-slate-800 border border-white/10 p-3 rounded-xl shadow-xl top-full left-0 mt-2 whitespace-nowrap">
                      <p className="text-[10px] uppercase text-primary mb-2 font-black border-b border-white/10 pb-1">Estatísticas Numéricas</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-slate-500">Mínimo:</span> <span className="text-white font-mono">{stats[col].min}</span>
                        <span className="text-slate-500">Médio:</span> <span className="text-white font-mono">{stats[col].avg}</span>
                        <span className="text-slate-500">Máximo:</span> <span className="text-white font-mono">{stats[col].max}</span>
                        <span className="text-slate-500">Valores N°s:</span> <span className="text-white font-mono">{stats[col].count}</span>
                      </div>
                    </div>
                  )}
                  {stats[col] && (
                    <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" title="Variável Numérica (Passe o mouse)"></span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-xs">
            {currentData.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2 text-slate-600 font-mono text-center border-r border-white/5">
                  {(page - 1) * rowsPerPage + idx + 1}
                </td>
                {columns.map(col => (
                  <td key={col} className="px-4 py-2 text-slate-300 truncate max-w-[200px] border-r border-white/5" title={String(row[col])}>
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-600 italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
