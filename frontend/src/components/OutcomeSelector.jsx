import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
const TYPE_FILTERS = ['Todos', 'Numérico', 'Binário', 'Categórico', 'Derivado']

const typeBadgeStyle = (type, isDerived) => {
  if (isDerived) return 'bg-teal-500/15 text-teal-300 border-teal-500/30'
  if (type === 'Numérico') return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  if (type === 'Binário') return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return 'bg-stone-500/10 text-stone-400 border-stone-500/20'
}

const typeIcon = (type, isDerived) => {
  if (isDerived) return 'calculate'
  if (type === 'Numérico') return 'bar_chart'
  if (type === 'Binário') return 'toggle_on'
  return 'category'
}

/** Derivadas recomendadas sempre ficam no topo */
const sortColumns = (cols) => {
  return [...cols].sort((a, b) => {
    if (a.suggested && !b.suggested) return -1
    if (!a.suggested && b.suggested) return 1
    if (a.isDerived && !b.isDerived) return -1
    if (!a.isDerived && b.isDerived) return 1
    if (a.type === 'Numérico' && b.type !== 'Numérico') return -1
    if (a.type !== 'Numérico' && b.type === 'Numérico') return 1
    return 0
  })
}

// ──────────────────────────────────────────────────────────
// Componente Principal
// ──────────────────────────────────────────────────────────
export default function OutcomeSelector({ columns, onConfirm, onCancel }) {
  const suggested = columns.find(c => c.suggested)?.name
  const [selected, setSelected] = useState(suggested || null)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const searchRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [])

  const hasDerived = useMemo(() => columns.some(c => c.isDerived), [columns])
  const derivedSuggested = useMemo(() => columns.find(c => c.isDerived && c.suggested), [columns])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const result = columns.filter(col => {
      const matchSearch = !q || col.name.toLowerCase().includes(q) ||
        col.sample?.some(s => String(s).toLowerCase().includes(q))
      const colType = col.isDerived ? 'Derivado' : col.type
      const matchFilter = activeFilter === 'Todos' || colType === activeFilter
      return matchSearch && matchFilter
    })
    return sortColumns(result)
  }, [columns, query, activeFilter])

  const counts = useMemo(() => {
    const c = { Todos: columns.length, Numérico: 0, Binário: 0, Categórico: 0, Derivado: 0 }
    columns.forEach(col => {
      const t = col.isDerived ? 'Derivado' : col.type
      if (c[t] !== undefined) c[t]++
    })
    return c
  }, [columns])

  const handleConfirm = () => {
    if (selected) onConfirm(selected)
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: 'var(--surface, #111110)',
            border: '0.5px solid var(--border-subtle, #292524)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}
        >

          {/* ── Header ── */}
          <div className="p-5 pb-4" style={{ borderBottom: '0.5px solid var(--border-subtle, #292524)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(94,234,212,0.1)', border: '1px solid rgba(94,234,212,0.2)' }}
              >
                <span className="material-symbols-rounded text-xl" style={{ color: 'var(--color-primary, #5eead4)' }}>target</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold leading-tight" style={{ color: 'var(--text-main, #e7e5e4)' }}>
                  Qual a variavel desfecho?
                </h2>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted, #a8a29e)' }}>
                  Selecione a variavel principal que sera o foco da analise estatistica
                </p>
              </div>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="shrink-0 mt-0.5 transition-colors"
                  style={{ color: 'var(--text-muted, #a8a29e)' }}
                >
                  <span className="material-symbols-rounded text-lg">close</span>
                </button>
              )}
            </div>

            {/* Banner de recomendação para derivada clínica */}
            {derivedSuggested && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-start gap-3 px-3.5 py-3 rounded-xl mb-4 cursor-pointer"
                style={{
                  background: 'rgba(94,234,212,0.06)',
                  border: '1px solid rgba(94,234,212,0.2)',
                }}
                onClick={() => setSelected(derivedSuggested.name)}
              >
                <span className="material-symbols-rounded mt-0.5" style={{ fontSize: '18px', color: 'var(--color-primary, #5eead4)' }}>
                  auto_awesome
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--color-primary, #5eead4)' }}>
                    {derivedSuggested.name}
                  </div>
                  <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted, #a8a29e)' }}>
                    Variavel derivada recomendada como desfecho principal.
                    {derivedSuggested.derivedType === 'best_eye' && ' Combina OD e OE usando o melhor olho (menor LogMAR = melhor visao).'}
                    {derivedSuggested.derivedType === 'snellen_to_logmar' && ' Conversao para escala LogMAR — padrao ouro para analise estatistica.'}
                  </p>
                </div>
                <span
                  className="text-[9px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap self-center border"
                  style={selected === derivedSuggested.name
                    ? { background: 'rgba(94,234,212,0.15)', color: 'var(--color-primary, #5eead4)', borderColor: 'rgba(94,234,212,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted, #a8a29e)', borderColor: 'var(--border-subtle, #292524)' }
                  }
                >
                  {selected === derivedSuggested.name ? '✓ Selecionado' : 'Usar esta'}
                </span>
              </motion.div>
            )}

            {/* Sugestão simples (não derivada) */}
            {suggested && !derivedSuggested && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 cursor-pointer"
                style={{ background: 'rgba(94,234,212,0.06)', border: '1px dashed rgba(94,234,212,0.25)' }}
                onClick={() => setSelected(suggested)}
              >
                <span className="material-symbols-rounded text-sm" style={{ color: 'var(--color-primary, #5eead4)' }}>auto_awesome</span>
                <span className="text-[11px] flex-1" style={{ color: 'var(--text-muted, #a8a29e)' }}>
                  Sugestao automatica:&nbsp;
                  <strong style={{ color: 'var(--color-primary, #5eead4)' }}>{suggested}</strong>
                </span>
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                  style={selected === suggested
                    ? { background: 'rgba(94,234,212,0.15)', color: 'var(--color-primary, #5eead4)', borderColor: 'rgba(94,234,212,0.3)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted, #a8a29e)', borderColor: 'var(--border-subtle, #292524)' }
                  }
                >
                  {selected === suggested ? '✓ Selecionado' : 'Usar esta'}
                </span>
              </motion.div>
            )}

            {/* Barra de busca */}
            <div className="relative">
              <span
                className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ fontSize: '17px', color: 'var(--text-muted, #a8a29e)', opacity: 0.5 }}
              >
                search
              </span>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar variavel..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle, #292524)',
                  color: 'var(--text-main, #e7e5e4)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(94,234,212,0.4)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-subtle, #292524)'}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-muted, #a8a29e)' }}
                >
                  <span className="material-symbols-rounded text-sm">close</span>
                </button>
              )}
            </div>

            {/* Filtros de tipo */}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {TYPE_FILTERS.map(f => (
                counts[f] > 0 || f === 'Todos' ? (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all"
                    style={activeFilter === f
                      ? { background: 'rgba(94,234,212,0.12)', color: 'var(--color-primary, #5eead4)', borderColor: 'rgba(94,234,212,0.3)' }
                      : { background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted, #a8a29e)', borderColor: 'var(--border-subtle, #292524)' }
                    }
                  >
                    {f === 'Derivado' ? '⚡ Derivado' : f}
                    <span className="ml-1 opacity-60">{counts[f]}</span>
                  </button>
                ) : null
              ))}
            </div>
          </div>

          {/* ── Grid de colunas ── */}
          <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <span className="material-symbols-rounded text-4xl" style={{ color: 'rgba(255,255,255,0.1)' }}>search_off</span>
                <p className="text-sm" style={{ color: 'var(--text-muted, #a8a29e)' }}>
                  Nenhuma variavel encontrada para "<span style={{ color: 'var(--text-main, #e7e5e4)' }}>{query}</span>"
                </p>
                <button
                  onClick={() => { setQuery(''); setActiveFilter('Todos') }}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--color-primary, #5eead4)' }}
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <>
                {/* Seção de derivadas */}
                {hasDerived && activeFilter === 'Todos' && !query && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="material-symbols-rounded" style={{ fontSize: '13px', color: 'var(--color-primary, #5eead4)', opacity: 0.7 }}>science</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary, #5eead4)', opacity: 0.6 }}>
                        Variaveis derivadas recomendadas
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(94,234,212,0.1)' }} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <AnimatePresence mode="popLayout">
                        {filtered.filter(c => c.isDerived).map((col) => (
                          <ColumnCard
                            key={col.name}
                            col={col}
                            isSelected={selected === col.name}
                            onSelect={setSelected}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Separador */}
                {hasDerived && activeFilter === 'Todos' && !query && filtered.some(c => !c.isDerived) && (
                  <div className="flex items-center gap-2 mb-2 mt-4 px-1">
                    <span className="material-symbols-rounded" style={{ fontSize: '13px', color: 'var(--text-muted, #a8a29e)', opacity: 0.4 }}>database</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted, #a8a29e)', opacity: 0.4 }}>
                      Colunas do dataset
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-subtle, #292524)' }} />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <AnimatePresence mode="popLayout">
                    {filtered
                      .filter(c => (hasDerived && activeFilter === 'Todos' && !query) ? !c.isDerived : true)
                      .map((col) => (
                        <ColumnCard
                          key={col.name}
                          col={col}
                          isSelected={selected === col.name}
                          onSelect={setSelected}
                        />
                      ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div
            className="flex items-center justify-between gap-3 p-4"
            style={{ borderTop: '0.5px solid var(--border-subtle, #292524)', background: 'rgba(0,0,0,0.15)' }}
          >
            <div className="text-[11px] min-w-0" style={{ color: 'var(--text-muted, #a8a29e)' }}>
              {selected
                ? <><span className="font-medium" style={{ color: 'var(--text-main, #e7e5e4)' }}>{selected}</span> selecionada</>
                : <span>Selecione uma variavel para continuar</span>
              }
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ color: 'var(--text-muted, #a8a29e)', border: '0.5px solid var(--border-subtle, #292524)' }}
                >
                  Cancelar
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirm}
                disabled={!selected}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  selected
                    ? 'hover:opacity-90 active:scale-[0.98]'
                    : 'cursor-not-allowed opacity-35'
                }`}
                style={selected ? {
                  background: 'var(--color-primary, #0d9488)',
                  color: 'var(--color-accent, #134e4a)',
                  boxShadow: '0 0 20px rgba(94,234,212,0.15)',
                } : {
                  background: 'rgba(94,234,212,0.08)',
                  color: 'var(--text-muted, #a8a29e)',
                }}
              >
                <span className="material-symbols-rounded text-base">check_circle</span>
                Confirmar Desfecho
              </motion.button>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}


// ──────────────────────────────────────────────────────────
// Card de coluna
// ──────────────────────────────────────────────────────────
function ColumnCard({ col, isSelected, onSelect }) {
  const isSuggested = col.suggested
  const isDerived = col.isDerived

  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(col.name)}
      className="text-left p-3.5 rounded-xl border transition-all relative group"
      style={{
        borderColor: isSelected
          ? 'rgba(94,234,212,0.4)'
          : isSuggested || isDerived
            ? 'rgba(94,234,212,0.15)'
            : 'var(--border-subtle, #292524)',
        background: isSelected
          ? 'rgba(94,234,212,0.08)'
          : isSuggested
            ? 'rgba(94,234,212,0.04)'
            : isDerived
              ? 'rgba(94,234,212,0.02)'
              : 'rgba(255,255,255,0.02)',
        boxShadow: isSelected ? '0 0 20px rgba(94,234,212,0.08) inset' : 'none',
      }}
    >
      {/* Linha 1: badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="material-symbols-rounded text-sm"
          style={{ fontSize: '14px', color: isDerived || isSelected ? 'var(--color-primary, #5eead4)' : 'var(--text-muted, #a8a29e)' }}>
          {typeIcon(col.type, isDerived)}
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${typeBadgeStyle(col.type, isDerived)}`}>
          {isDerived ? 'Derivado' : col.type}
        </span>
        {isSuggested && !isSelected && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
            style={{ background: 'rgba(94,234,212,0.1)', color: 'var(--color-primary, #5eead4)', borderColor: 'rgba(94,234,212,0.25)' }}>
            ★ Recomendado
          </span>
        )}
        {isSelected && (
          <span className="ml-auto">
            <span className="material-symbols-rounded" style={{ fontSize: '16px', color: 'var(--color-primary, #5eead4)' }}>check_circle</span>
          </span>
        )}
      </div>

      {/* Nome da variável */}
      <p className="text-sm font-semibold mb-1.5 break-words leading-snug"
        style={{ color: isSelected || isSuggested || isDerived ? 'var(--color-primary, #5eead4)' : 'var(--text-main, #e7e5e4)' }}>
        {col.name}
      </p>

      {/* Amostra */}
      {col.sample?.length > 0 && (
        <p className="text-[10px] font-mono leading-relaxed truncate"
          style={{ color: 'var(--text-muted, #a8a29e)', opacity: 0.6, background: 'rgba(0,0,0,0.15)', borderRadius: '6px', padding: '3px 7px' }}>
          {col.sample.slice(0, 3).join(' · ')}
          {col.unique_count > 3 && (
            <span style={{ opacity: 0.5 }}> +{col.unique_count - 3}</span>
          )}
        </p>
      )}
    </motion.button>
  )
}
