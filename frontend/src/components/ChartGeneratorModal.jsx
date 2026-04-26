import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'
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
  const n = xVals?.length
  if (!n || n < 2) return null
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
  const { activeProjectId } = useSciStat()
  const { session } = useAuth()

  const safeLabels = chartData?.labels ?? []
  const safeValues = chartData?.values ?? []
  const cType = chartData?.type ?? 'bar'
  const regression = chartData?.regression

  const [prevVar, setPrevVar] = useState(varName)
  if (varName !== prevVar) {
    setPrevVar(varName)
    const type = chartData?.type
    if (type === 'scatter') {
      setSelectedType('scatter')
    } else if (type === 'histogram' || type === 'contingency_table') {
      setSelectedType('bar')
    }
  }

  useEffect(() => {
    if (!isOpen || !activeProjectId || !chartRef.current) return
    
    const timer = setTimeout(async () => {
      try {
        const dataUrl = chartRef.current.toBase64Image()
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], 'chart.png', { type: 'image/png' })
        const formData = new FormData()
        formData.append('image', file)
        formData.append('label', varName)
        formData.append('chart_type', selectedType)
        
        await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/projects/${activeProjectId}/charts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.token}`
          },
          body: formData
        })
      } catch (err) {
        console.error("Auto-save chart error", err)
      }
    }, 1200)

    return () => clearTimeout(timer)
  }, [isOpen, activeProjectId, selectedType, varName, session])

  const histogramBins = useMemo(() => {
    const values = chartData?.values
    if (!values) return null
    return buildHistogramBins(values)
  }, [chartData?.values])

  const scatterData = useMemo(() => {
    const x = chartData?.x
    const y = chartData?.y
    if (cType !== 'scatter' || !x || !y) return null
    const points = x.map((xVal, i) => ({ x: xVal, y: y[i] }))
    const regLine = chartData?.regression
      ? [{ x: x[0], y: chartData.regression.intercept + chartData.regression.slope * x[0] },
         { x: x[x.length - 1], y: chartData.regression.intercept + chartData.regression.slope * x[x.length - 1] }]
      : computeRegressionLine(x, y)
    return { points, regLine }
  }, [chartData, cType])

  const availableTypes = useMemo(() => {
    if (cType === 'histogram' || cType === 'contingency_table') {
      return CHART_TYPES.filter(t => t.value === 'bar' || t.value === 'doughnut')
    }
    if (cType === 'scatter') {
      return CHART_TYPES.filter(t => t.value === 'scatter' || t.value === 'bar')
    }
    return CHART_TYPES
  }, [cType])

  const contingencyBarData = useMemo(() => {
    const table = chartData?.table
    if (cType !== 'contingency_table' || !table) return null
    const cats = Object.keys(table[0] || {}).filter(k => k !== 'row_label' && k !== 'total' && k !== 'total_pct')
    const rowLabels = table.map(r => r.row_label)
    const datasets = cats.map((cat, ci) => ({
      label: cat,
      data: table.map(r => r[cat]?.count ?? 0),
      backgroundColor: [
        'rgba(94, 234, 212, 0.7)',
        'rgba(59, 130, 246, 0.7)',
        'rgba(147, 51, 234, 0.7)',
        'rgba(251, 146, 60, 0.7)',
        'rgba(244, 63, 94, 0.7)',
      ][ci % 5],
      borderColor: ['#5eead4', '#3B82F6', '#9333EA', '#FB923C', '#F43F5E'][ci % 5],
      borderWidth: 1,
      borderRadius: 4,
    }))
    return { labels: rowLabels, datasets }
  }, [chartData, cType])

  const contingencyDoughnutData = useMemo(() => {
    const table = chartData?.table
    if (cType !== 'contingency_table' || !table) return null
    const totalCounts = table.map(r => r.total)
    const rowLabels = table.map(r => r.row_label)
    return {
      labels: rowLabels,
      datasets: [{
        data: totalCounts,
        backgroundColor: [
          'rgba(94, 234, 212, 0.8)',
          'rgba(59, 130, 246, 0.7)',
          'rgba(147, 51, 234, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(244, 63, 94, 0.7)',
          'rgba(34, 211, 238, 0.7)',
        ],
        borderColor: [
          '#5eead4', '#3B82F6', '#9333EA', '#FB923C', '#F43F5E', '#22D3EE'
        ],
        borderWidth: 1,
        hoverOffset: 12
      }]
    }
  }, [chartData, cType])

  const chartTitleText = useMemo(() => {
    if (cType === 'scatter') return `${varName} — Dispersão`
    if (cType === 'histogram') return `${varName} — Distribuição`
    if (cType === 'contingency_table') return `${varName} — Tabela de Contingência`
    return `${varName} — Contagem (N) por Grupo`
  }, [cType, varName])

  // ────── Labels dos eixos derivados dos dados do backend ──────
  const xAxisLabel = useMemo(() => {
    if (cType === 'scatter') {
      const parts = (chartData?.var_name || '').split(' vs ')
      return parts[0]?.trim() || 'Variável X'
    }
    if (cType === 'histogram') return chartData?.var_name || varName || 'Valor'
    if (cType === 'contingency_table') return chartData?.predictor || varName || 'Categoria'
    return varName || 'Categoria'
  }, [cType, chartData, varName])

  const yAxisLabel = useMemo(() => {
    if (cType === 'scatter') {
      const parts = (chartData?.var_name || '').split(' vs ')
      return parts[1]?.trim() || 'Variável Y'
    }
    if (cType === 'contingency_table') return chartData?.outcome || 'Desfecho'
    return 'Frequência (N)'
  }, [cType, chartData])

  const axisLabelStyleModal = {
    color: '#78716c',
    font: { size: 12, family: 'Inter', weight: '500' }
  }

  if (!isOpen || !chartData) return null

  const barLabels = histogramBins ? histogramBins.labels : safeLabels
  const barValues = histogramBins ? histogramBins.counts : safeValues

  const barData = contingencyBarData || {
    labels: barLabels,
    datasets: [{
      label: varName || 'Valores',
      data: barValues,
      backgroundColor: barValues.map((_, i) => `rgba(94, 234, 212, ${0.2 + (i % 6) * 0.1})`),
      borderColor: '#5eead4',
      borderWidth: 1,
      borderRadius: 4,
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
      borderColor: '#5eead4',
      backgroundColor: 'rgba(94, 234, 212, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 6,
      pointBackgroundColor: '#5eead4',
      pointBorderColor: '#5eead4',
      pointHoverRadius: 9,
      borderWidth: 3,
    }]
  }

  const scatterChartData = scatterData ? {
    datasets: [
      {
        label: 'Dados',
        data: scatterData.points,
        backgroundColor: 'rgba(94, 234, 212, 0.6)',
        borderColor: '#5eead4',
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

  const doughnutData = contingencyDoughnutData || {
    labels: safeLabels.length > 0 ? safeLabels : barLabels,
    datasets: [{
      data: safeLabels.length > 0 ? safeValues : barValues,
      backgroundColor: [
        'rgba(94, 234, 212, 0.8)',
        'rgba(59, 130, 246, 0.7)',
        'rgba(147, 51, 234, 0.7)',
        'rgba(251, 146, 60, 0.7)',
        'rgba(244, 63, 94, 0.7)',
        'rgba(34, 211, 238, 0.7)',
      ],
      borderColor: [
        '#5eead4', '#3B82F6', '#9333EA', '#FB923C', '#F43F5E', '#22D3EE'
      ],
      borderWidth: 1,
      hoverOffset: 12
    }]
  }

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: contingencyBarData ? true : false },
      title: {
        display: true,
        text: chartTitleText,
        color: 'rgba(255, 255, 255, 0.8)',
        font: { size: 15, family: 'Inter', weight: '600' }
      },
      tooltip: {
        backgroundColor: '#1c1c1a',
        titleColor: '#5eead4',
        bodyColor: '#e7e5e4',
        borderColor: 'rgba(94, 234, 212, 0.2)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        bodyFont: { size: 12 },
        titleFont: { size: 13, weight: '600' }
      }
    },
    scales: selectedType === 'doughnut' ? {} : {
      x: {
        type: selectedType === 'scatter' ? 'linear' : 'category',
        position: 'bottom',
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#78716c', font: { size: 12 } },
        title: { display: true, text: xAxisLabel, ...axisLabelStyleModal }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#78716c', font: { size: 12 } },
        title: { display: true, text: yAxisLabel, ...axisLabelStyleModal }
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

  const handleExportABNT = () => {
    const S = 3
    const W = 900 * S
    const H = 650 * S
    const FONT = 'Arial'

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H

    // Tamanhos de fonte em pixels reais no canvas
    const F_TITLE = 18 * S
    const F_TICK = 14 * S
    const F_AXIS = 14 * S
    const F_LEGEND = 13 * S
    const F_SOURCE = 11 * S

    // Paleta acadêmica sóbria: cinza único para histograma, multi para contingência/doughnut
    const SINGLE_COLOR = '#4a4a4a'
    const MULTI_COLORS = ['#4a4a4a', '#888888', '#b0b0b0', '#333333', '#666666', '#999999']

    const isHistogram = cType === 'histogram'
    const isContingency = cType === 'contingency_table'

    const solidify = (datasets) => datasets.map((ds, ci) => {
      const useSingle = isHistogram && !isContingency
      return {
        ...ds,
        backgroundColor: useSingle
          ? SINGLE_COLOR
          : Array.isArray(ds.backgroundColor)
            ? MULTI_COLORS.slice(0, ds.backgroundColor.length)
            : MULTI_COLORS[ci % MULTI_COLORS.length],
        borderColor: useSingle
          ? '#222222'
          : Array.isArray(ds.borderColor)
            ? MULTI_COLORS.slice(0, ds.borderColor.length).map(() => '#222222')
            : '#222222',
        borderWidth: 1,
        borderRadius: 0,
        pointBackgroundColor: SINGLE_COLOR,
        pointBorderColor: '#222222',
        fill: false,
      }
    })

    const abntScales = selectedType === 'doughnut' ? {} : {
      x: {
        grid: { color: '#dddddd', lineWidth: 1 },
        ticks: { color: '#111111', font: { size: F_TICK, family: FONT }, maxRotation: 45, minRotation: 0 },
        border: { color: '#111111', width: 2 },
        title: selectedType === 'scatter'
          ? { display: true, text: chartData.var_name || 'X', color: '#111111', font: { size: F_AXIS, family: FONT, weight: 'bold' } }
          : undefined,
      },
      y: {
        grid: { color: '#dddddd', lineWidth: 1 },
        ticks: { color: '#111111', font: { size: F_TICK, family: FONT } },
        border: { color: '#111111', width: 2 },
        title: { display: true, text: 'Frequência', color: '#111111', font: { size: F_AXIS, family: FONT, weight: 'bold' } },
      },
    }

    let abntData
    if (selectedType === 'scatter' && scatterChartData) {
      abntData = { datasets: solidify(scatterChartData.datasets) }
    } else if (selectedType === 'doughnut') {
      abntData = { ...doughnutData, datasets: solidify(doughnutData.datasets) }
    } else if (selectedType === 'line') {
      abntData = { ...lineData, datasets: solidify(lineData.datasets) }
    } else {
      abntData = { ...barData, datasets: solidify(barData.datasets) }
    }

    const abntOptions = {
      responsive: false,
      animation: false,
      layout: { padding: { top: 20 * S, bottom: 40 * S, left: 15 * S, right: 15 * S } },
      plugins: {
        legend: {
          display: isContingency,
          labels: { color: '#111111', font: { size: F_LEGEND, family: FONT }, boxWidth: 14 * S, padding: 12 * S }
        },
        title: {
          display: true,
          text: chartTitleText,
          color: '#111111',
          font: { size: F_TITLE, family: FONT, weight: 'bold' },
          padding: { top: 5 * S, bottom: 15 * S }
        },
        tooltip: { enabled: false },
      },
      scales: abntScales,
    }

    const abntBgPlugin = {
      id: 'abnt-white-bg',
      beforeDraw: (chart) => {
        const ctx = chart.canvas.getContext('2d')
        ctx.save()
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, chart.width, chart.height)
        ctx.restore()
      },
      afterDraw: (chart) => {
        const ctx = chart.canvas.getContext('2d')
        ctx.save()
        ctx.font = `${F_SOURCE}px ${FONT}`
        ctx.fillStyle = '#555555'
        ctx.textAlign = 'center'
        ctx.fillText(`Fonte: Paper Metrics (${new Date().getFullYear()})`, chart.width / 2, chart.height - 10 * S)
        ctx.restore()
      }
    }

    const tempChart = new ChartJS(canvas, {
      type: selectedType === 'scatter' ? 'scatter' : selectedType === 'doughnut' ? 'doughnut' : selectedType === 'line' ? 'line' : 'bar',
      data: abntData,
      options: abntOptions,
      plugins: [abntBgPlugin],
    })

    requestAnimationFrame(() => {
      const url = canvas.toDataURL('image/png', 1.0)
      const link = document.createElement('a')
      link.download = `grafico_abnt_${varName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`
      link.href = url
      link.click()
      tempChart.destroy()
    })
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
          className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10"
        >
          <div className="flex items-center justify-between p-4 sm:p-8 border-b border-white/5">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-3">
                <span className="material-symbols-rounded text-primary">bar_chart</span>
                Gerar Gráfico
              </h3>
              <p className="text-stone-500 text-xs mt-1 font-medium">{varName}</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-all">
              <span className="material-symbols-rounded text-xl">close</span>
            </button>
          </div>

          <div className="p-6">
            <div className="flex gap-3 mb-6">
              {availableTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    selectedType === type.value
                      ? 'bg-primary/15 text-primary border-2 border-primary/40'
                      : 'bg-white/5 text-stone-500 border border-white/10 hover:border-white/20 hover:text-stone-300'
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
                <p className="text-[10px] text-stone-300 font-mono">
                  <span className="text-primary font-bold">Regressão Linear:</span> y = {regression.slope}x + {regression.intercept} | R² = {regression.r_squared} | Erro padrão = {regression.std_err}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 p-6 pt-0">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary py-3.5 rounded-xl font-semibold text-[11px] tracking-wide hover:bg-primary/20 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-rounded text-sm">download</span>
              PNG
            </button>
            <button
              onClick={handleExportABNT}
              title="Exporta em fundo branco, alta resolução (300 DPI), conforme padrão ABNT NBR 12266"
              className="flex-1 flex items-center justify-center gap-2 bg-stone-800 border border-stone-600/40 text-stone-200 py-3.5 rounded-xl font-semibold text-[11px] tracking-wide hover:bg-stone-700 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-rounded text-sm">article</span>
              Exportar ABNT
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3.5 rounded-xl border border-white/10 text-xs font-medium text-stone-500 hover:bg-white/5 hover:text-stone-300 transition-all"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}