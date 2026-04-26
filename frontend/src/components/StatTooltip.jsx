import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const EDGE = 8

export default function StatTooltip({ term, children }) {
  const [show, setShow] = useState(false)
  const triggerRef = useRef(null)
  const [pos, setPos] = useState(null)

  const definitions = {
    'p-valor': 'O p-valor mede a probabilidade de obter resultados tão extremos quanto os observados, assumindo que não há efeito real (hipótese nula). p < 0.05 indica que o resultado é estatisticamente significativo — ou seja, improvável de ocorrer por acaso.',
    'p_value': 'O p-valor mede a probabilidade de obter resultados tão extremos quanto os observados, assumindo que não há efeito real (hipótese nula). p < 0.05 indica que o resultado é estatisticamente significativo.',
    'ic95': 'O Intervalo de Confiança 95% indica a faixa de valores onde o verdadeiro parâmetro populacional provavelmente está. Se o IC95% não inclui zero (ou 1 para OR), o resultado é significativo.',
    'ci': 'O Intervalo de Confiança 95% indica a faixa de valores onde o verdadeiro parâmetro populacional provavelmente está.',
    'iqr': 'O Intervalo Interquartil (IQR = Q3 - Q1) mede a dispersão dos 50% centrais dos dados. É mais robusto que o desvio padrão pois não é afetado por valores extremos.',
    'mediana': 'A mediana é o valor central dos dados quando ordenados. É mais robusta que a média em distribuições assimétricas ou com outliers.',
    'effect_size': 'O tamanho do efeito mede a magnitude prática da diferença ou associação, independente do tamanho da amostra. Diferente do p-valor, indica se o efeito é relevante na prática.',
    "cohens_d": "O d de Cohen mede a diferença padronizada entre duas médias. Interpretação: 0.2 = pequeno, 0.5 = médio, 0.8 = grande. Indica quantos desvios padrão separam os grupos.",
    "hedges_g": "O g de Hedges é o d de Cohen corrigido para amostras pequenas (n < 20). Usa os mesmos limiares de interpretação: 0.2 = pequeno, 0.5 = médio, 0.8 = grande.",
    'eta_squared': 'O Eta² (η²) mede a proporção de variância explicada pelo agrupamento. Interpretação: 0.01 = pequeno, 0.06 = médio, 0.14 = grande.',
    'partial_eta_squared': 'O Eta² parcial (η²p) mede a proporção de variância explicada pelo fator, controlando outros fatores. Interpretação: 0.01 = pequeno, 0.06 = médio, 0.14 = grande.',
    'epsilon_squared': 'O Epsilon² (ε²) é o tamanho de efeito baseado na estatística H do Kruskal-Wallis. Interpretação similar ao Eta²: 0.01 = pequeno, 0.06 = médio, 0.14 = grande.',
    'rank_biserial_r': 'O r rank-biserial mede o tamanho do efeito para testes de Mann-Whitney e Wilcoxon. Interpretação: 0.1 = pequeno, 0.3 = médio, 0.5 = grande.',
    'cles': 'O CLES (Common Language Effect Size) indica a probabilidade de um valor aleatório de um grupo ser maior que um do outro. 0.5 = sem efeito, >0.56 = pequeno, >0.64 = médio, >0.71 = grande.',
    'r_squared': 'O R² indica a proporção da variância de uma variável que é explicada pela outra. Varia de 0 a 1. Ex: R²=0.49 significa que 49% da variação é explicada.',
    'cramers_v': "O V de Cramer mede a força de associação entre variáveis categóricas. Varia de 0 a 1. Interpretação: 0.1 = fraco, 0.3 = moderado, 0.5 = forte.",
    'odds_ratio': 'O Odds Ratio (OR) compara as chances de um evento ocorrer entre dois grupos. OR > 1 = fator de risco, OR < 1 = fator protetor, OR = 1 = sem associação.',
    'risk_ratio': 'O Risk Ratio (RR) compara o risco de um evento entre dois grupos. RR > 1 = maior risco no grupo 1, RR < 1 = menor risco.',
    'wilson_ci': 'O Intervalo de Confiança de Wilson é mais preciso que o método normal para proporções, especialmente com amostras pequenas ou proporções próximas de 0 ou 1.',
    'shapiro': 'O teste de Shapiro-Wilk verifica se os dados seguem distribuição normal. p > 0.05 sugere normalidade. Se p < 0.05, os dados não são normais e testes não-paramétricos são preferíveis.',
    'levene': "O teste de Levene verifica se as variâncias são iguais entre grupos (homocedasticidade). p < 0.05 indica variâncias desiguais, violando um pressuposto de testes paramétricos como ANOVA e t-test.",
    'post_hoc': 'Testes post-hoc são comparações múltiplas realizadas após um teste omnibus significativo (como ANOVA). Tukey HSD e Games-Howell controlam o erro tipo I mais eficientemente que Bonferroni.',
    'bonferroni': 'A correção de Bonferroni divide o nível de significância (α=0.05) pelo número de comparações. O método de Holm (1979) é mais poderoso e é preferido.',
    'tukey': 'O teste de Tukey HSD (Honestly Significant Difference) é o post-hoc padrão para ANOVA quando as variâncias são iguais. Controla o FWER.',
    'games_howell': 'O teste de Games-Howell é o post-hoc para ANOVA quando as variâncias são desiguais. Não assume homocedasticidade.',
    'dunn': 'O teste de Dunn é o post-hoc padrão após Kruskal-Wallis. Usa ranks consistentes com o teste omnibus.',
    'welch_t': "O teste t de Welch não assume variâncias iguais entre os grupos. É mais robusto que o teste t padrão quando há heterocedasticidade.",
    'welch_anova': "A ANOVA de Welch não assume variâncias iguais entre os grupos. Preferível quando o teste de Levene é significativo.",
    'friedman': 'O teste de Friedman é a alternativa não-paramétrica da RM-ANOVA. Compara 3+ medições repetidas sem assumir normalidade.',
    'rm_anova': 'A ANOVA de medidas repetidas compara 3+ medições do mesmo grupo ao longo do tempo. Usa correção de Greenhouse-Geisser para violações de esfericidade.',
    'mcnemar': 'O teste de McNemar compara proporções pareadas (antes/depois) para desfechos binários. É o equivalente pareado do qui-quadrado.',
    'point_biserial': 'A correlação point-biserial mede a associação entre uma variável binária natural e uma contínua. Equivale ao r de Pearson.',
    'power': 'O poder estatístico é a probabilidade de detectar um efeito real quando ele existe. Poder ≥ 80% é considerado adequado. Poder < 80% indica risco de erro tipo II (não detectar um efeito que existe).',
    'anova': 'A ANOVA (Análise de Variância) compara as médias de 3 ou mais grupos simultaneamente. É uma extensão do teste t para múltiplos grupos. Requer normalidade e homogeneidade de variâncias.',
    'kruskal': 'O teste de Kruskal-Wallis é a alternativa não-paramétrica da ANOVA. Compara as medianas de 3 ou mais grupos sem assumir distribuição normal.',
    'ttest': 'O teste t compara as médias de dois grupos. O teste t independente compara grupos diferentes; o pareado compara o mesmo grupo em dois momentos.',
    'mann_whitney': 'O teste U de Mann-Whitney é a alternativa não-paramétrica do teste t independente. Compara as distribuições de dois grupos independentes.',
    'wilcoxon': 'O teste de Wilcoxon é a alternativa não-paramétrica do teste t pareado. Compara duas medições do mesmo grupo.',
    'spearman': "A correlação de Spearman mede a relação monotônica entre duas variáveis usando ranks. Não assume normalidade nem linearidade. Varia de -1 (negativa perfeita) a +1 (positiva perfeita).",
    'pearson': 'A correlação de Pearson mede a relação linear entre duas variáveis contínuas. Varia de -1 a +1. Requer normalidade e linearidade.',
    'chi2': 'O teste Qui-Quadrado (χ²) verifica se existe associação entre duas variáveis categóricas. Compara frequências observadas com frequências esperadas sob independência.',
    'outlier': 'Valores atípicos (outliers) são observações que se desviam significativamente do padrão geral. Podem distorcer médias, desvios padrão e resultados de testes paramétricos.',
  }

  const definition = definitions[term] || definitions[term.toLowerCase()] || children

  if (!definition) return children || null

  function calc() {
    const el = triggerRef.current
    if (!el) return null

    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Estimate tooltip height based on definition length
    const charsPerLine = 55
    const lines = Math.ceil(definition.length / charsPerLine)
    const th = Math.min(40 + lines * 16, 350)
    const tw = 300

    let left = r.left + r.width / 2 - tw / 2
    left = Math.max(EDGE, Math.min(left, vw - tw - EDGE))

    const spaceAbove = r.top - GAP
    const spaceBelow = vh - r.bottom - GAP

    let top
    if (spaceAbove >= th || spaceAbove > spaceBelow) {
      top = r.top - GAP - th
    } else {
      top = r.bottom + GAP
    }
    top = Math.max(EDGE, Math.min(top, vh - th - EDGE))

    return { top, left }
  }

  useEffect(() => {
    if (!show) return
    setPos(calc())
    const handler = () => setPos(calc())
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [show])

  const handleEnter = () => { setPos(calc()); setShow(true) }
  const handleLeave = () => { setShow(false); setPos(null) }

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center gap-1 cursor-help border-b border-dashed border-stone-600 hover:border-primary transition-colors"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        tabIndex={0}
      >
        {children}
        <span className="material-symbols-rounded text-[10px] text-stone-600 hover:text-primary transition-colors">help_outline</span>
      </span>

      {show && pos && createPortal(
        <div
          className="fixed z-[99999] w-[300px] p-4 bg-stone-900/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] text-[11px] leading-relaxed text-stone-200 pointer-events-none"
          style={{
            top: `${pos.top}px`,
            left: `${pos.left}px`,
          }}
        >
          <p className="font-bold text-primary text-[10px] tracking-wider mb-1">{term}</p>
          <p>{definition}</p>
        </div>,
        document.body
      )}
    </>
  )
}
