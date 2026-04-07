import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const VariableDrawer = ({ groupName, items, onOptionChange, onToggleSelection, isOpen, onToggleGroup, relevance }) => {
  return (
    <div className={`mb-4 rounded-3xl border transition-all duration-500 overflow-hidden ${isOpen ? 'bg-white/[0.03] border-primary/30 shadow-[0_20px_50px_-20px_rgba(0,255,163,0.15)]' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}>
      <button 
        onClick={onToggleGroup}
        className="w-full text-left px-8 py-6 flex items-center justify-between group"
      >
        <div className="flex items-center gap-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 ${isOpen ? 'bg-primary text-background border-primary' : 'bg-white/5 text-slate-400 border-white/10 group-hover:border-primary/40'}`}>
            <span className="material-symbols-rounded text-2xl font-black">
              {relevance > 80 ? 'star' : relevance > 60 ? 'trending_up' : 'analytics'}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className={`text-lg font-black transition-colors ${isOpen ? 'text-primary' : 'text-white'}`}>{groupName}</h3>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                <div className="w-1 h-1 rounded-full bg-primary/60"></div>
                <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase">{items.length} TESTES</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Relevância Estatística</div>
              <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${relevance}%` }}
                  className="h-full bg-primary shadow-[0_0_10px_rgba(0,255,163,0.5)]"
                />
              </div>
            </div>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${isOpen ? 'rotate-180 bg-primary/10 border-primary/20 text-primary' : 'bg-white/5 border-white/10 text-slate-600'}`}>
          <span className="material-symbols-rounded">expand_more</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-8 space-y-6">
              {items.map((item, idx) => (
                <div key={item.id} className="flex flex-col lg:flex-row gap-6 p-6 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.02] transition-all group/item relative">
                  <div className="flex items-start gap-4 flex-1">
                    <button 
                      onClick={() => onToggleSelection(item.originalIdx)}
                      className={`mt-1 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${item.is_selected ? 'bg-primary border-primary text-background' : 'bg-transparent border-white/10 hover:border-primary/40'}`}
                    >
                      {item.is_selected && <span className="material-symbols-rounded text-base font-black">check</span>}
                    </button>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-black text-white">{item.name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-black text-slate-500 border border-white/5 uppercase tracking-tighter">{item.type}</span>
                      </div>
                      <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-black/20 p-3 rounded-xl border border-white/5">
                        <span className="material-symbols-rounded text-xs text-primary/60 mt-0.5">info</span>
                        <p>{item.rationale}</p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-64 space-y-3">
                    <div className="relative">
                      <select 
                        disabled={!item.is_selected}
                        value={item.recommended_test}
                        onChange={(e) => onOptionChange(item.originalIdx, e.target.value)}
                        className={`appearance-none w-full bg-slate-950 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest py-3 px-4 pr-10 rounded-xl focus:outline-none transition-all cursor-pointer ${!item.is_selected ? 'opacity-30 pointer-events-none' : 'hover:border-primary/40 focus:border-primary'}`}
                      >
                        {item.test_options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity ${!item.is_selected ? 'opacity-10' : 'text-primary'}`}>
                        <span className="material-symbols-rounded text-lg">stat_minus_1</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const AnalysisReviewPlan = ({ protocol, onOptionChange, onConfirm, outcome, onOutcomeChange, outcomeOptions, onToggleSelection }) => {
  const [expandedGroup, setExpandedGroup] = useState(null);

  const groupedProtocol = useMemo(() => {
    if (!protocol) return [];
    
    const groups = {};
    protocol.forEach((item, idx) => {
      const groupKey = item.variable_group || 'Outros';
      if (!groups[groupKey]) {
        groups[groupKey] = {
          name: groupKey,
          items: [],
          maxRelevance: 0
        };
      }
      groups[groupKey].items.push({ ...item, originalIdx: idx });
      groups[groupKey].maxRelevance = Math.max(groups[groupKey].maxRelevance, item.relevance || 0);
    });

    return Object.values(groups).sort((a, b) => b.maxRelevance - a.maxRelevance);
  }, [protocol]);

  if (!protocol || protocol.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-[3.5rem] p-12 max-w-6xl mx-auto border border-white/5 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none"></div>
      
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-16 gap-10 relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-1 rounded-full bg-primary/30"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Intelligent Protocol</span>
          </div>
          <h2 className="text-5xl font-black text-white mb-6 leading-[1.1] tracking-tight">
            Review do Plano <br/> de Análise
          </h2>
          <div className="flex flex-wrap items-center gap-6 text-slate-400 text-[11px] font-black tracking-widest uppercase">
             <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                <span><strong className="text-white">{protocol.length}</strong> Variáveis</span>
             </div>
             <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <span className="text-slate-500">Desfecho:</span>
                {outcomeOptions && outcomeOptions.length > 1 ? (
                  <select
                    value={outcome}
                    onChange={(e) => onOutcomeChange(e.target.value)}
                    className="appearance-none bg-transparent text-primary focus:outline-none cursor-pointer pr-4 font-black"
                  >
                    {outcomeOptions.map(opt => (
                      <option key={opt} value={opt} className="bg-slate-900 text-white">{opt}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-primary">{outcome}</span>
                )}
             </div>
          </div>
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.05, boxShadow: '0 20px 70px rgba(0, 255, 163, 0.3)' }}
          whileTap={{ scale: 0.95 }}
          onClick={onConfirm}
          className="bg-primary text-background font-black text-xs uppercase tracking-[0.3em] px-14 py-7 rounded-[2rem] shadow-[0_25px_50px_-15px_rgba(0,255,163,0.3)] transition-all flex items-center gap-5 group"
        >
          Iniciar Análise Full
          <span className="material-symbols-rounded text-xl group-hover:rotate-12 transition-transform">rocket_launch</span>
        </motion.button>
      </div>

      <div className="space-y-6">
        {groupedProtocol.map((group) => (
          <VariableDrawer 
            key={group.name}
            groupName={group.name}
            items={group.items}
            relevance={group.maxRelevance}
            isOpen={expandedGroup === group.name}
            onToggleGroup={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
            onOptionChange={onOptionChange}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>
      
      <div className="mt-20 p-10 rounded-[3rem] bg-gradient-to-br from-slate-950 to-slate-900 border border-white/10 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-12 opacity-[0.03]">
            <span className="material-symbols-rounded text-9xl">science</span>
         </div>
         <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-8">
            <div className="w-16 h-16 rounded-[2rem] bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
               <span className="material-symbols-rounded text-2xl">tips_and_updates</span>
            </div>
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-white mb-3">Diretriz de Rigor Científico</h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-4xl">
                O SciStat prioriza automaticamente variáveis com maior <strong className="text-slate-300">completitude de dados</strong> e poder discriminatório. 
                Ao desmarcar um teste, ele será excluído do processamento final para garantir que apenas perguntas clinicamente relevantes sejam respondidas, protegendo a análise de ruídos estatísticos.
              </p>
            </div>
         </div>
      </div>
    </motion.div>
  )
}

export default AnalysisReviewPlan
