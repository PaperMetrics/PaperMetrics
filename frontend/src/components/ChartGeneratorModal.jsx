import { useState, useRef, useMemo, useEffect } from 'react'
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
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler
)

const CHART_TYPES = [
  { value: 'bar', label: 'Barras', icon: 'bar_chart' },
  { value: 'line', label: 'Linha', icon: 'show_chart' },
  { value: 'scatter', label: 'Dispersão', icon: 'scatter_plot' },
  { value: 'doughnut', label: 'Rosca', icon: 'donut_large' },
]

function computeRegressionLine(xVals, yVals) {
  const n = xVals.length
  if (n < 2) return null
  const sumX = xVals.reduce((a, b) => a + b, 0)
  const sumY = yVals.reduce((a, b) => a + b, 0)
  const sumXY = xVals.reduce((a, b, i) => a + b * yVals[i], 0)
  const sumX2 = xVals.reduce((a, b) => a + b * b, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const minX = Math.min(...xVals)
  const maxX = Math.max(...xVals)
  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept }
  ]
}

function buildHistogramBins(rawValues) {
  if (!rawValues || rawValues.length === 0) return null
  const min = Math.min(...rawValues)
  const max = Math.max(...rawValues)
  if (min === max) return { labels: [String(min)], counts: [rawValues.length] }
  const binCount = Math.min(Math.ceil(Math.sqrt(rawValues.length)), 30)
  const binWidth = (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, i) => min + i * binWidth)
  const counts = new Array(binCount).fill(0)
  rawValues.forEach(v => {
    let idx = Math.floor((v - min) / binWidth)
    if (idx >= binCount) idx = binCount - 1
    if (idx < 0) idx = 0
    counts[idx]++
  })
  const binLabels = bins.map((b) => {
    const upper = b + binWidth
    return `${b.toFixed(1)}–${upper.toFixed(1)}`
  })
  return { labels: binLabels, counts }
}

export default function ChartGeneratorModal({ isOpen, onClose, chartData, varName }) {
  const [selectedType, setSelectedType] = useState('bar')
  const chartRef = useRef(null)

  const safeLabels = chartData?.labels || []
  const safeValues = chartData?.values || []
  const stds = chartData?.stds || []
  const regression = chartData?.regression
  const cType = chartData?.type || 'bar'

  useEffect(() => {
    if (isOpen && chartData) {
      if (cType === 'histogram') setSelectedType('bar')
      else if (cType === 'scatter') setSelectedType('scatter')
      else if (cType === 'contingency_table') setSelectedType('bar')
      else setSelectedType('bar')
    }
  }, [isOpen, chartData, cType])

  if (!chartData || !isOpen) return null

  const histogramBins = useMemo(() => buildHistogramBins(chartData.values), [chartData.values])

  const scatterData = useMemo(() => {
    if (cType === 'scatter' && chartData.x && chartData.y) {
      const points = chartData.x.map((x, i) => ({ x, y: chartData.y[i] }))
      const regLine = chartData.regression
        ? [{ x: chartData.x[0], y: chartData.regression.intercept + chartData.regression.slope * chartData.x[0] },
           { x: chartData.x[chartData.x.length - 1], y: chartData.regression.intercept + chartData.regression.slope * chartData.x[chartData.x.length - 1] }]
        : computeRegressionLine(chartData.x, chartData.y)
      return { points, regLine }
    }
    return null
  }, [chartData, cType])

  const availableTypes = useMemo(() => {
    if (cType === 'histogram') {
      return CHART_TYPES.filter(t => t.value === 'bar' || t.value === 'line')
    }
    if (cType === 'scatter') {
      return CHART_TYPES.filter(t => t.value === 'scatter' || t.value === 'bar')
    }
    if (cType === 'contingency_table') {
      return CHART_TYPES.filter(t => t.value === 'bar' || t.value === 'doughnut')
    }
    return CHART_TYPES
  }, [cType])

  const barLabels = histogramBins ? histogramBins.labels : safeLabels
  const barValues = histogramBins ? histogramBins.counts : safeValues

  const contingencyBarData = useMemo(() => {
    if (cType === 'contingency_table' && chartData.table) {
      const tbl = chartData.table
      const cats = Object.keys(tbl[0]).filter(k => k !== 'row_label' && k !== 'total' && k !== 'total_pct')
      const rowLabels = tbl.map(r => r.row_label)
      const datasets = cats.map((cat, ci) => ({
        label: cat,
        data: tbl.map(r => r[cat]?.count ?? 0),
        backgroundColor: [
          'rgba(0, 255, 163, 0.7)',
          'rgba(59, 130, 246, 0.7)',
          'rgba(147, 51, 234, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(244, 63, 94, 0.7)',
        ][ci % 5],
        borderColor: ['#00FFA3', '#3B82F6', '#9333EA', '#FB923C', '#F43F5E'][ci % 5],
        borderWidth: 2,
        borderRadius: 8,
      }))
      return { labels: rowLabels, datasets }
    }
    return null
  }, [chartData, cType])

  const barData = contingencyBarData || {
    labels: barLabels,
    datasets: [{
      label: varName || 'Valores',
      data: barValues,
      backgroundColor: barValues.map((_, i) => `rgba(0, 255, 163, ${0.2 + (i % 6) * 0.1})`),
      borderColor: '#00FFA3',
      borderWidth: 2,
      borderRadius: 8,
      borderSkipped: false,
    }]
  }

  const lineLabels = histogramBins ? histogramBins.labels : safeLabels
  const lineValues = histogramBins ? histogramBins.counts : safeValues
  const lineData = {
    labels: lineLabels,
    datasets: [{
      label: varName || 'Valores',
      data: lineValues,
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

  const scatterChartData = scatterData ? {
    datasets: [
      {
        label: 'Dados',
        data: scatterData.points,
        backgroundColor: 'rgba(0, 255, 163, 0.6)',
        borderColor: '#00FFA3',
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
      },
      scatterData.regLine ? {
        label: 'Linha de Regressão',
        data: scatterData.regLine,
        type: 'line',
        borderColor: 'rgba(59, 130, 246, 0.8)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      } : null
    ].filter(Boolean)
  } : null

  const contingencyDoughnutData = useMemo(() => {
    if (cType === 'contingency_table' && chartData.table) {
      const tbl = chartData.table
      const totalCounts = tbl.map(r => r.total)
      const rowLabels = tbl.map(r => r.row_label)
      return {
        labels: rowLabels,
        datasets: [{
          data: totalCounts,
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
    }
    return null
  }, [chartData, cType])

  const doughnutData = contingencyDoughnutData || {
    labels: safeLabels.length > 0 ? safeLabels : barLabels,
    datasets: [{
      data: safeLabels.length > 0 ? safeValues : barValues,
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

  const chartTitleText = useMemo(() => {
    if (cType === 'scatter') return `${varName} — Dispersão`
    if (cType === 'histogram') return `${varName} — Distribuição`
    if (cType === 'contingency_table') return `${varName} — Tabela de Contingência`
    return `${varName} — Contagem (N) por Grupo`
  }, [cType, varName])

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: contingencyBarData ? true : false },
      title: {
        display: true,
        text: chartTitleText,
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
    scales: selectedType === 'doughnut' ? {} : selectedType === 'scatter' ? {
      x: {
        type: 'linear',
        position: 'bottom',
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 12 } },
        title: { display: true, text: chartData.var_name || 'X', color: '#94a3b8' }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 12 } },
        title: { display: true, text: 'Y', color: '#94a3b8' }
      }
    } : {
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
              {availableTypes.map(type => (
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
              {selectedType === 'scatter' && scatterChartData && <Scatter ref={chartRef} options={commonOptions} data={scatterChartData} />}
              {selectedType === 'doughnut' && <Doughnut ref={chartRef} options={commonOptions} data={doughnutData} />}
            </div>

            {regression && (
              <div className="mt-4 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                <p className="text-[10px] text-slate-300 font-mono">
                  <span className="text-primary font-bold">Regressão Linear:</span> y = {regression.slope}x + {regression.intercept} | R² = {regression.r_squared} | Erro padrão = {regression.std_err}
                </p>
              </div>
            )}
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
