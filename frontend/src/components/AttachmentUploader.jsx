import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../AuthContext'

const API_URL = import.meta.env.VITE_API_BASE_URL

export default function AttachmentUploader({ projectId, onPreview }) {
  const { session } = useAuth()
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/attachments`, {
        headers: { 'Authorization': `Bearer ${session?.sessionToken}` }
      })
      if (res.ok) {
        setAttachments(await res.json())
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [projectId, session])

  useEffect(() => {
    if (projectId && session) {
      fetchAttachments()
    }
  }, [projectId, session, fetchAttachments])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) await uploadFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const uploadChunked = async (file) => {
    const CHUNK_SIZE = 1024 * 1024; // 1MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Math.random().toString(36).substring(2, 15);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const formData = new FormData();
      formData.append('upload_id', uploadId);
      formData.append('chunk_index', i);
      formData.append('total_chunks', totalChunks);
      formData.append('original_filename', file.name);
      formData.append('file', chunk);
      
      try {
        const res = await fetch(`${API_URL}/api/projects/${projectId}/attachments/chunk`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.sessionToken}` },
            body: formData
        });
        
        if (!res.ok) {
            alert('Erro no upload dividido.');
            setUploading(false);
            return;
        }
        
        setProgress(Math.round(((i + 1) * 100) / totalChunks));
      } catch(err) {
        console.error(err);
        alert('Erro de conexão no upload dividido.');
        setUploading(false);
        return;
      }
    }
    fetchAttachments();
    setUploading(false);
    setProgress(0);
  }

  const uploadFile = async (file) => {
    // Check if valid type
    const validTypes = ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
    if (!validTypes.includes(file.type) && !file.name.endsWith('.csv')) {
      alert("Formato não suportado. Use PDF ou CSV.")
      return
    }

    setUploading(true)
    setProgress(0)

    if (file.size > 5 * 1024 * 1024) {
      await uploadChunked(file);
      return;
    }

    try {
      const formData = new FormData()
      formData.append('file', file)

      // We use XMLHttpRequest here to be able to track progress
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_URL}/api/projects/${projectId}/attachments`)
      xhr.setRequestHeader('Authorization', `Bearer ${session.sessionToken}`)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded * 100) / event.total))
        }
      }

      xhr.onload = () => {
        if (xhr.status === 201 || xhr.status === 200) {
          fetchAttachments()
        } else {
          alert("Falha no upload.")
        }
        setUploading(false)
        setProgress(0)
      }

      xhr.onerror = () => {
        alert("Erro na conexão.")
        setUploading(false)
      }

      xhr.send(formData)
    } catch (err) {
      console.error(err)
      setUploading(false)
    }
  }

  const deleteAttachment = async (id) => {
    if (!confirm("Deletar este anexo?")) return
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/attachments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.sessionToken}` }
      })
      if (res.ok) fetchAttachments()
    } catch (err) {
      console.error(err)
    }
  }

  const getIconForType = (type) => {
    if (type === 'pdf') return 'picture_as_pdf'
    if (type === 'csv' || type === 'xlsx') return 'table_chart'
    return 'insert_drive_file'
  }

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-6">
      <div 
        onDrop={handleDrop} 
        onDragOver={handleDragOver}
        className="relative border-2 border-dashed border-white/10 hover:border-primary/50 transition-colors rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-white/[0.02]"
      >
        <div className="p-3 bg-white/5 rounded-full mb-3 text-primary">
          <span className="material-symbols-rounded text-3xl">upload_file</span>
        </div>
        <h4 className="text-white font-bold mb-1">Upload de Anexos</h4>
        <p className="text-xs text-zinc-400 mb-4 max-w-sm">Arraste seus relatórios em PDF, dados em CSV ou tabelas XLSX. Você poderá visualizá-los diretamente aqui.</p>
        
        <input 
          type="file" 
          id={`file-upload-${projectId}`}
          className="hidden" 
          onChange={handleFileChange}
          accept=".pdf,.csv,.xlsx"
        />
        <label 
          htmlFor={`file-upload-${projectId}`}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
        >
          Selecionar Arquivo
        </label>

        {uploading && (
          <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1 mb-3">Arquivos no Projeto ({attachments.length})</h4>
        
        {loading ? (
          <div className="text-center py-4 text-xs text-zinc-400 animate-pulse">Carregando anexos...</div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-500 bg-white/5 rounded-xl border border-white/5">
            Nenhum arquivo anexado.
          </div>
        ) : (
          <AnimatePresence>
            {attachments.map(att => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                key={att.id} 
                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
              >
                <div 
                  className="flex items-center gap-3 flex-1 overflow-hidden cursor-pointer"
                  onClick={() => onPreview && onPreview(att)}
                >
                  <div className="p-2 bg-white/5 rounded-lg text-primary">
                    <span className="material-symbols-rounded text-lg">{getIconForType(att.file_type)}</span>
                  </div>
                  <div className="truncate pr-4">
                    <p className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">{att.original_name}</p>
                    <p className="text-[10px] text-zinc-500 flex gap-2">
                      <span className="uppercase">{att.file_type}</span>
                      <span>•</span>
                      <span>{formatSize(att.file_size)}</span>
                      <span>•</span>
                      <span>{new Date(att.created_at).toLocaleDateString('pt-BR')}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => onPreview && onPreview(att)}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Visualizar"
                  >
                    <span className="material-symbols-rounded text-[18px]">visibility</span>
                  </button>
                  <a 
                    href={`${API_URL}/api/attachments/${att.id}/file?token=${session?.sessionToken}`}
                    className="p-2 text-zinc-400 hover:text-primary hover:bg-white/10 rounded-lg transition-colors"
                    title="Baixar"
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="material-symbols-rounded text-[18px]">download</span>
                  </a>
                  <button 
                    onClick={() => deleteAttachment(att.id)}
                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Deletar"
                  >
                    <span className="material-symbols-rounded text-[18px]">delete</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
