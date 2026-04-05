import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler
)

const CHART_TYPES = [
  { value: 'bar', label: 'Barras', icon: 'bar_chart' },
  { value: 'line', label: 'Linha', icon: 'show_chart' },
  { value: 'doughnut', label: 'Rosca', icon: 'donut_large' },
]

export default function ChartGeneratorModal({ isOpen, onClose, chartData, varName }) {
  const [selectedType, setSelectedType] = useState('bar')
  const chartRef = useRef(null)

  if (!chartData || !isOpen) return null

  const labels = chartData.labels || []
  const values = chartData.values || []
  const q1 = chartData.q1 || []
  const q3 = chartData.q3 || []

  const barData = {
    labels,
    datasets: [{
      label: 'Contagem (N)',
      data: values,
      backgroundColor: values.map((_, i) => `rgba(0, 255, 163, ${0.2 + i * 0.1})`),
      borderColor: '#00FFA3',
      borderWidth: 2,
      borderRadius: 8,
      borderSkipped: false,
    }]
  }

  const lineData = {
    labels,
    datasets: [{
      label: 'Contagem (N)',
      data: values,
      borderColor: '#00FFA3',
      backgroundColor: 'rgba(0, 255, 163, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 6,
      pointBackgroundColor: '#00FFA3',
      pointBorderColor: '#00FFA3',
      pointHoverRadius: 9,
      borderWidth: 3,
    }]
  }

  const doughnutData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: [
        'rgba(0, 255, 163, 0.8)',
        'rgba(59, 130, 246, 0.7)',
        'rgba(147, 51, 234, 0.7)',
        'rgba(251, 146, 60, 0.7)',
        'rgba(244, 63, 94, 0.7)',
        'rgba(34, 211, 238, 0.7)',
      ],
      borderColor: [
        '#00FFA3', '#3B82F6', '#9333EA', '#FB923C', '#F43F5E', '#22D3EE'
      ],
      borderWidth: 2,
      hoverOffset: 12
    }]
  }

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `${varName} — Contagem (N) por Grupo`,
        color: 'rgba(255, 255, 255, 0.8)',
        font: { size: 16, family: 'Inter', weight: '700' }
      },
      tooltip: {
        backgroundColor: '#1E293B',
        titleColor: '#00FFA3',
        bodyColor: '#fff',
        borderColor: 'rgba(0, 255, 163, 0.3)',
        borderWidth: 1,
        cornerRadius: 10,
        padding: 14,
        bodyFont: { size: 13 },
        titleFont: { size: 14, weight: '700' }
      }
    },
    scales: selectedType === 'doughnut' ? {} : {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 12, weight: '600' } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 12 } }
      }
    }
  }

  const handleExport = () => {
    if (chartRef.current) {
      const url = chartRef.current.toBase64Image()
      const link = document.createElement('a')
      link.download = `grafico_${varName.replace(/\s+/g, '_').toLowerCase()}_${selectedType}_${Date.now()}.png`
      link.href = url
      link.click()
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 30 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          onClick={e => e.stopPropagation()}
          className="glass-card w-full max-w-3xl rounded-[2.5rem] border border-white/10 overflow-hidden"
        >
          <div className="flex items-center justify-between p-8 border-b border-white/5">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-3">
                <span className="material-symbols-rounded text-primary neon-glow-sm">bar_chart</span>
                Gerar Gráfico
              </h3>
              <p className="text-slate-500 text-xs mt-1 font-medium">{varName}</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
              <span className="material-symbols-rounded text-xl">close</span>
            </button>
          </div>

          <div className="p-6">
            <div className="flex gap-3 mb-6">
              {CHART_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    selectedType === type.value
                      ? 'bg-primary/15 text-primary border-2 border-primary/40 shadow-[0_0_20px_rgba(0,255,163,0.1)]'
                      : 'bg-white/5 text-slate-500 border border-white/10 hover:border-white/20 hover:text-slate-300'
                  }`}
                >
                  <span className="material-symbols-rounded text-sm">{type.icon}</span>
                  {type.label}
                </button>
              ))}
            </div>

            <div className="h-[350px] bg-white/[0.02] rounded-2xl border border-white/5 p-4">
              {selectedType === 'bar' && <Bar ref={chartRef} options={commonOptions} data={barData} />}
              {selectedType === 'line' && <Line ref={chartRef} options={commonOptions} data={lineData} />}
              {selectedType === 'doughnut' && <Doughnut ref={chartRef} options={commonOptions} data={doughnutData} />}
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-0">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-background py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_4px_20px_rgba(0,255,163,0.3)] active:scale-[0.98]"
            >
              <span className="material-symbols-rounded text-sm">download</span>
              Exportar PNG
            </button>
            <button
              onClick={onClose}
              className="px-8 py-4 rounded-2xl border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-all"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
