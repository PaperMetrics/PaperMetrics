import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configuração do Worker do PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function PDFViewer({ url }) {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset)
  }

  const previousPage = () => changePage(-1)
  const nextPage = () => changePage(1)

  return (
    <div className="flex flex-col items-center bg-slate-900/80 rounded-xl overflow-hidden shadow-2xl h-full border border-white/10">
      
      {/* Controles do PDF */}
      <div className="flex items-center justify-between w-full p-4 bg-slate-800 border-b border-white/10">
        <div className="flex gap-2">
          <button 
            disabled={pageNumber <= 1} 
            onClick={previousPage}
            className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center"
          >
            <span className="material-symbols-rounded text-sm">chevron_left</span>
          </button>
          <span className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-900 rounded-lg border border-white/5">
            Página {pageNumber || (numPages ? 1 : '--')} de {numPages || '--'}
          </span>
          <button 
            disabled={pageNumber >= numPages} 
            onClick={nextPage}
            className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center"
          >
            <span className="material-symbols-rounded text-sm">chevron_right</span>
          </button>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setScale(s => s - 0.2)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors flex items-center"
            title="Diminuir Zoom"
          >
            <span className="material-symbols-rounded text-sm">zoom_out</span>
          </button>
          <span className="px-3 py-2 text-xs font-bold text-slate-300 bg-transparent flex items-center">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={() => setScale(s => s + 0.2)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors flex items-center"
            title="Aumentar Zoom"
          >
            <span className="material-symbols-rounded text-sm">zoom_in</span>
          </button>
        </div>
      </div>

      {/* Renderização do PDF */}
      <div className="flex-1 overflow-auto w-full custom-scrollbar p-6 bg-slate-950 flex justify-center items-start">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="text-center py-20 text-slate-400 flex flex-col items-center gap-4">
              <span className="material-symbols-rounded animate-spin text-3xl text-primary">autorenew</span>
              <p className="text-sm">Carregando documento...</p>
            </div>
          }
          error={
            <div className="text-center py-20 text-red-400">
              <p>Falha ao carregar o PDF.</p>
            </div>
          }
        >
          <div className="shadow-xl ring-1 ring-white/10 rounded overflow-hidden bg-white">
            <Page 
              pageNumber={pageNumber} 
              scale={scale} 
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </div>
        </Document>
      </div>
    </div>
  )
}
