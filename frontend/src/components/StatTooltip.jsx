import { useState } from 'react'

export default function StatTooltip({ term, children }) {
  const [show, setShow] = useState(false)
  
  const definitions = {
    'p-valor': 'O p-valor mede a probabilidade de obter resultados tão extremos quanto os observados, assumindo que não há efeito real (hipótese nula). p < 0.05 indica que o resultado é estatisticamente significativo — ou seja, improvável de ocorrer por acaso.',
    'p_value': 'O p-valor mede a probabilidade de obter resultados tão extremos quanto os observados, assumindo que não há efeito real (hipótese nula). p < 0.05 indica que o resultado é estatisticamente significativo.',
    'ic95': 'O Intervalo de Confiança 95% indica a faixa de valores onde o verdadeiro parâmetro populacional provavelmente está. Se o IC95% não inclui zero (ou 1 para OR), o resultado é significativo.',
    'ci': 'O Intervalo de Confiança 95% indica a faixa de valores onde o verdadeiro parâmetro populacional provavelmente está.',
    'iqr': 'O Intervalo Interquartil (IQR = Q3 - Q1) mede a dispersão dos 50% centrais dos dados. É mais robusto que o desvio padrão pois não é afetado por valores extremos.',
    'mediana': 'A mediana é o valor central dos dados quando ordenados. É mais robusta que a média em distribuições assimétricas ou com outliers.',
    'effect_size': 'O tamanho do efeito mede a magnitude prática da diferença ou associação, independente do tamanho da amostra. Diferente do p-valor, indica se o efeito é relevante na prática.',
    "cohens_d": "O d de Cohen mede a diferença padronizada entre duas médias. Interpretação: 0.2 = pequeno, 0.5 = médio, 0.8 = grande. Indica quantos desvios padrão separam os grupos.",
    'eta_squared': 'O Eta² (η²) mede a proporção de variância explicada pelo agrupamento. Interpretação: 0.01 = pequeno, 0.06 = médio, 0.14 = grande.',
    'r_squared': 'O R² indica a proporção da variância de uma variável que é explicada pela outra. Varia de 0 a 1. Ex: R²=0.49 significa que 49% da variação é explicada.',
    'cramers_v': "O V de Cramer mede a força de associação entre variáveis categóricas. Varia de 0 a 1. Interpretação: 0.1 = fraco, 0.3 = moderado, 0.5 = forte.",
    'odds_ratio': 'O Odds Ratio (OR) compara as chances de um evento ocorrer entre dois grupos. OR > 1 = fator de risco, OR < 1 = fator protetor, OR = 1 = sem associação.',
    'risk_ratio': 'O Risk Ratio (RR) compara o risco de um evento entre dois grupos. RR > 1 = maior risco no grupo 1, RR < 1 = menor risco.',
    'wilson_ci': 'O Intervalo de Confiança de Wilson é mais preciso que o método normal para proporções, especialmente com amostras pequenas ou proporções próximas de 0 ou 1.',
    'shapiro': 'O teste de Shapiro-Wilk verifica se os dados seguem distribuição normal. p > 0.05 sugere normalidade. Se p < 0.05, os dados não são normais e testes não-paramétricos são preferíveis.',
    'levene': "O teste de Levene verifica se as variâncias são iguais entre grupos (homocedasticidade). p < 0.05 indica variâncias desiguais, violando um pressuposto de testes paramétricos como ANOVA e t-test.",
    'post_hoc': 'Testes post-hoc são comparações múltiplas realizadas após um teste omnibus significativo (como ANOVA). A correção de Bonferroni ajusta o p-valor para controlar o erro tipo I em múltiplas comparações.',
    'bonferroni': 'A correção de Bonferroni divide o nível de significância (α=0.05) pelo número de comparações, reduzindo o risco de falsos positivos em testes múltiplos.',
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
  
  return (
    <span
      className="relative inline-flex items-center gap-1 cursor-help border-b border-dashed border-slate-600 hover:border-primary transition-colors"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
    >
      {children}
      <span className="material-symbols-rounded text-[10px] text-slate-600 hover:text-primary transition-colors">help_outline</span>
      
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 text-[11px] leading-relaxed text-slate-300 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-slate-900/95 border-r border-b border-white/10 rotate-45"></div>
          <p className="font-bold text-primary text-[10px] uppercase tracking-wider mb-1">{term}</p>
          <p>{definition}</p>
        </div>
      )}
    </span>
  )
}
