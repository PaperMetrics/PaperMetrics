import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSciStat } from '../SciStatContext'
import { useAuth } from '../AuthContext'
import BioSummaryTable from '../components/BioSummaryTable'
import AnalysisReviewPlan from '../components/AnalysisReviewPlan'
import ChartGeneratorModal from '../components/ChartGeneratorModal'
import StatTooltip from '../components/StatTooltip'
import OutcomeSelector from '../components/OutcomeSelector'
import ColumnDomainReview from '../components/ColumnDomainReview'

const TEST_EXPLANATIONS = {
  'Teste Qui-Quadrado (χ²)': {
    title: 'Teste Qui-Quadrado (χ²)',
    what: 'Compara frequências observadas com frequências esperadas para verificar se duas variáveis categóricas estão associadas.',
    when: 'Use quando tiver duas variáveis categóricas (ex: sexo vs diagnóstico) e quiser saber se existe relação entre elas.',
    example: 'Verificar se há associação entre fumar (sim/não) e doença pulmonar (sim/não).',
    assumption: 'Esperas ≥ 5 em cada célula da tabela. Se não inúmer, use Fisher.'
  },
  'Teste Exato de Fisher': {
    title: 'Teste Exato de Fisher',
    what: 'Versão do Qui-Quadrado para amostras pequenas ou tabelas desbalanceadas.',
    when: 'Use quando o Qui-Quadrado não funciona (células com esperados < 5), especialmente em tabelas 2x2.',
    example: 'Comparar sucesso de tratamento entre 2 grupos muito desbalanceados (ex: 3 vs 15 pacientes).',
    assumption: 'Não requer distribuição normal. Ideal para N total < 20.'
  },
  'Teste t de Student (pareado)': {
    title: 'Teste t Pareado',
    what: 'Compara duas médias de grupos pareados (mesmos indivíduos medidos duas vezes).',
    when: 'Use antes/depois de um tratamento no mesmo grupo de pacientes.',
    example: 'Comparar pressão arterial antes e depois de um medicamento nos mesmos pacientes.',
    assumption: 'Diferenças devem ter distribuição normal (ou N > 30).'
  },
  'Teste t de Student (independente)': {
    title: 'Teste t Independente',
    what: 'Compara médias de dois grupos independentes (diferentes indivíduos).',
    when: 'Use para comparar médias entre dois grupos diferentes de sujeitos.',
    example: 'Comparar nota média de alunos que estudaram 2h vs 4h por dia.',
    assumption: 'Dados normais em cada grupo e variâncias homogêneas.'
  },
  'ANOVA One-Way': {
    title: 'ANOVA One-Way',
    what: 'Compara médias de 3 ou mais grupos independentes.',
    when: 'Use quando quiser comparar mais de dois grupos ao mesmo tempo.',
    example: 'Comparar eficácia de 3 tipos de medicamento para pressão.',
    assumption: 'Normalidade e homogeneidade de variâncias. Se não cumprir, use Kruskal-Wallis.'
  },
  'ANOVA Two-Way': {
    title: 'ANOVA Two-Way',
    what: 'Compara médias considerando duas variáveis independentes simultaneamente.',
    when: 'Use quando tiver dois fatores influenciando o resultado (ex: tratamento + sexo).',
    example: 'Verificar se efeito de medicamento varia entre homens e mulheres.',
    assumption: 'Normalidade, homogeneidade e independência das observações.'
  },
  'ANOVA com Medidas Repetidas': {
    title: 'ANOVA Medidas Repetidas',
    what: 'Compara médias quando os mesmos indivíduos são medidos em múltiplas condições.',
    when: 'Use no mesmo sujeito em diferentes momentos ou condições.',
    example: 'Medir glicemia em jejum, 1h e 2h após refeição nos mesmos pacientes.',
    assumption: 'Normalidade e esfericidade (variâncias das diferenças iguais).'
  },
  'Teste de Tukey (Post-hoc)': {
    title: 'Teste de Tukey',
    what: 'Teste post-hoc para comparar pares de grupos após ANOVA significativa.',
    when: 'Use depois de ANOVA significativa para saber exatamente quais grupos diferem.',
    example: 'Após encontrar diferença entre 4 medicamentos, descobrir qual par específico.',
    assumption: 'Aplicado após ANOVA significativa.'
  },
  'Teste de Bonferroni': {
    title: 'Teste de Bonferroni',
    what: 'Correção para comparações múltiplas, reduzindo o risco de falso positivo.',
    when: 'Use quando fizer muitas comparações simultâneas.',
    example: 'Comparar 6 tratamentos entre si (15 comparações).',
    assumption: 'Conservative mas válido para qualquer tipo de dado.'
  },
  'Teste de Kruskal-Wallis': {
    title: 'Teste de Kruskal-Wallis',
    what: 'Versão não-paramétrica da ANOVA — compara distribuições de 3+ grupos.',
    when: 'Use quando dados não forem normais ou tiverem outliers.',
    example: 'Comparar tempo de recuperação entre 3 tratamentos com dados muito variados.',
    assumption: 'Variâncias semelhantes. Não requer normalidade.'
  },
  'Teste de Mann-Whitney U': {
    title: 'Teste de Mann-Whitney U',
    what: 'Versão não-paramétrica do teste t — compara distribuições de 2 grupos.',
    when: 'Use quando dados não forem normais ou forem ordinais.',
    example: 'Comparar satisfação (ruim/bom/ótimo) entre dois hospitais.',
    assumption: 'Não requer normalidade. Compara medianas/ordens.'
  },
  'Teste de Wilcoxon': {
    title: 'Teste de Wilcoxon',
    what: 'Versão não-paramétrica do teste t pareado.',
    when: 'Use para dados pareados que não seguem distribuição normal.',
    example: 'Comparar dor antes/depois (escala 0-10) sem assumir normalidade.',
    assumption: 'Dados pareados, distribuição não-normal.'
  },
  'Teste de Friedman': {
    title: 'Teste de Friedman',
    what: 'ANOVA não-paramétrica para medidas repetidas.',
    when: 'Use quando os mesmos sujeitos forem medidos múltiplas vezes com dados não-normais.',
    example: 'Avaliar preferência por 4 marcas em múltiplas visitas.',
    assumption: 'Não requer normalidade. Dados ordinais também servem.'
  },
  'Teste de Spearman': {
    title: 'Correlação de Spearman',
    what: 'Mede correlação baseada em ranks (não requer normalidade).',
    when: 'Use para dados não-normais, ordinais ou com outliers.',
    example: 'Correlacionar idade com nível de dor (escala ordinal).',
    assumption: 'Não requer normalidade. Sensível a outliers.'
  },
  'Correlação de Pearson': {
    title: 'Correlação de Pearson',
    what: 'Mede força e direção da relação linear entre duas variáveis contínuas.',
    when: 'Use para variáveis contínuas com distribuição normal.',
    example: 'Correlacionar altura com peso em adultos.',
    assumption: 'Ambas variáveis contínuas e normalmente distribuídas.'
  },
  'Regressão Linear Simples': {
    title: 'Regressão Linear Simples',
    what: 'Modelo para prever uma variável contínua baseado em uma previsora.',
    when: 'Use para prever um valor baseado em uma variável.',
    example: 'Prever pressão arterial baseado na idade.',
    assumption: 'Linearidade, normalidade dos resíduos, homocedasticidade.'
  },
  'Regressão Linear Múltipla': {
    title: 'Regressão Linear Múltipla',
    what: 'Modelo para prever uma variável contínua baseado em múltiplas previsoras.',
    when: 'Use quando múltiplos fatores influenciam o resultado.',
    example: 'Prever pressão considerando idade, peso e exercício.',
    assumption: 'Mesmas da regressão simples, mais ausência de multicolinearidade.'
  },
  'Regressão Logística': {
    title: 'Regressão Logística',
    what: 'Modelo para prever variável dependente binária (sim/não).',
    when: 'Use para prever probabilidade de um evento binário.',
    example: 'Prever se paciente terá complicações após cirurgia.',
    assumption: 'Variável dependente binária, amostra suficiente, sem multicolinearidade.'
  },
  'Teste de Shapiro-Wilk': {
    title: 'Teste de Shapiro-Wilk',
    what: 'Teste para verificar se os dados seguem distribuição normal.',
    when: 'Use antes de testes paramétricos para verificar pressupostos.',
    example: 'Verificar se notas de alunos seguem distribuição normal.',
    assumption: 'Ideal para N < 50. Para N maior, use Kolmogorov-Smirnov.'
  },
  'Teste de Kolmogorov-Smirnov': {
    title: 'Teste de Kolmogorov-Smirnov',
    what: 'Teste de normalidade para amostras maiores.',
    when: 'Use para N > 50 para verificar distribuição normal.',
    example: 'Verificar normalidade em grande estudo clínico.',
    assumption: 'Não paramétrico, mas sensível a grandes amostras.'
  },
  'Teste de Levene': {
    title: 'Teste de Levene',
    what: 'Teste para verificar se as variâncias são iguais entre grupos.',
    when: 'Use antes de ANOVA ou teste t para verificar homogeneidade.',
    example: 'Verificar se variância de idade é igual em 3 grupos.',
    assumption: 'Robusto a não-normalidade.'
  },
  'Análise de Sobrevivência (Kaplan-Meier)': {
    title: 'Kaplan-Meier',
    what: 'Estima a probabilidade de sobrevivência em diferentes momentos do tempo.',
    when: 'Use quando tiver dados de tempo-até-evento com censuras.',
    example: 'Estimar probabilidade de sobreviver 5 anos após diagnóstico de cáncer.',
    assumption: 'Censuras independentes do tempo de sobrevivência.'
  },
  'Modelo de Cox (Riscos Proporcionais)': {
    title: 'Modelo de Cox',
    what: 'Regressão para dados de sobrevivência, estimando efeito de covariáveis.',
    when: 'Use para entender quais fatores influenciam o tempo até evento.',
    example: 'Verificar se tratamento afeta tempo de sobrevida controlando por idade.',
    assumption: 'Riscos proporcionais (constantes ao longo do tempo).'
  },
  'Teste Log-Rank': {
    title: 'Teste Log-Rank',
    what: 'Compara curvas de sobrevivência entre dois ou mais grupos.',
    when: 'Use para testar se há diferença significativa entre grupos.',
    example: 'Comparar sobrevivência entre grupo tratado e placebo.',
    assumption: 'Censuras similares entre grupos.'
  },
  'Metanálise (Efeito Fixo)': {
    title: 'Metanálise Efeito Fixo',
    what: 'Combina múltiplos estudos assumindo que todos estimam o mesmo efeito.',
    when: 'Use quando os estudos forem muito similares (baixa heterogeneidade).',
    example: 'Combinar resultados de 10 ensaios clínicos do mesmo medicamento.',
    assumption: 'Baixa heterogeneidade entre estudos (I² < 50%).'
  },
  'Metanálise (Efeito Aleatório)': {
    title: 'Metanálise Efeito Aleatório',
    what: 'Combina estudos considerando que cada um tem seu próprio efeito.',
    when: 'Use quando houver heterogeneidade significativa entre estudos.',
    example: 'Combinar estudos com diferentes populações ou intervenções.',
    assumption: 'Heterogeneidade alta (I² > 50%). Mais conservador.'
  },
  'Funnel Plot / Viés de Publicação': {
    title: 'Funnel Plot',
    what: 'Gráfico para detectar viés de publicação em metanálises.',
    when: 'Use para verificar se estudos pequenos com resultados negativos estão faltando.',
    example: 'Verificar se estudos com N pequeno e resultado negativo foram publicados.',
    assumption: 'Simetria indica ausência de viés.'
  },
  'Cálculo de Poder Amostral': {
    title: 'Poder Amostral',
    what: 'Calcula o número de sujeitos necessários para detectar um efeito.',
    when: 'Use no planejamento do estudo para garantir que será possível detectar diferença.',
    example: 'Calcular quantos pacientes precisa para detectar efeito de 0.5 com 80% poder.',
    assumption: 'Baseado no efeito esperado, nível de significância e poder.'
  },
  'Teste de McNemar': {
    title: 'Teste de McNemar',
    what: 'Compara proporções em dados pareados com variável dicotômica.',
    when: 'Use para dados pareados onde ambos os resultados são binários.',
    example: 'Comparar cura antes/depois em 50 pacientes pareados.',
    assumption: 'Pareamento, variável dicotômica.'
  },
  'Teste de Cochran Q': {
    title: 'Teste de Cochran Q',
    what: 'Extensão do McNemar para 3+ condições pareadas.',
    when: 'Use para comparar múltiplas condições nos mesmos sujeitos.',
    example: 'Comparar eficácia de 3 tratamentos nos mesmos 100 pacientes.',
    assumption: 'Variável dicotômica, mesmo tamanho de amostra.'
  }
}

function getExplanation(testName) {
  if (TEST_EXPLANATIONS[testName]) return TEST_EXPLANATIONS[testName]
  const key = Object.keys(TEST_EXPLANATIONS).find(k => 
    testName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(testName.toLowerCase().replace('teste de ', '').replace('teste ', ''))
  )
  return key ? TEST_EXPLANATIONS[key] : null
}

// Capability cards shown on the empty state instead of mock charts
const ANALYSIS_CATEGORIES = [
  {
    id: 'parametric', title: 'Paramétrico', icon: 'compare', color: 'primary',
    desc: 'Para dados com distribuição normal — a base dos ensaios clínicos',
    tests: ['Teste t Independente', 'Teste t Pareado', 'ANOVA One-Way', 'ANOVA Two-Way', 'ANOVA Medidas Repetidas']
  },
  {
    id: 'nonparametric', title: 'Não-Paramétrico', icon: 'leaderboard', color: 'accent',
    desc: 'Quando os dados não seguem distribuição normal — dados clínicos reais',
    tests: ['Kruskal-Wallis', 'Mann-Whitney U', 'Wilcoxon', 'Friedman']
  },
  {
    id: 'categorical', title: 'Categórico', icon: 'grid_4x4', color: 'primary',
    desc: 'Para variáveis como sexo, grupo de tratamento, desfecho binário',
    tests: ['Qui-Quadrado (χ²)', 'Teste Exato de Fisher', 'McNemar', 'Cochran Q']
  },
  {
    id: 'correlation', title: 'Correlação', icon: 'scatter_plot', color: 'accent',
    desc: 'Mede a força e direção da relação entre duas variáveis',
    tests: ['Pearson (r)', 'Spearman (ρ)', 'Tau de Kendall']
  },
  {
    id: 'regression', title: 'Regressão', icon: 'trending_up', color: 'primary',
    desc: 'Modelos preditivos com effect size, CI e poder estatístico automáticos',
    tests: ['Linear Simples', 'Linear Múltipla', 'Logística Binária']
  },
  {
    id: 'survival', title: 'Sobrevivência', icon: 'monitoring', color: 'accent',
    desc: 'Análise de tempo-até-evento — padrão ouro em oncologia e cardiologia',
    tests: ['Kaplan-Meier', 'Modelo de Cox', 'Teste Log-Rank']
  },
]



const STATISTICAL_TESTS = [
  { name: 'Teste Qui-Quadrado (χ²)', icon: 'grid_4x4', desc: 'Associação entre variáveis categóricas', category: 'Categórico' },
  { name: 'Teste Exato de Fisher', icon: 'precision_manufacturing', desc: 'Associação em tabelas 2x2 com amostras pequenas', category: 'Categórico' },
  { name: 'Teste t de Student (pareado)', icon: 'compare_arrows', desc: 'Comparação de médias em grupos pareados', category: 'Paramétrico' },
  { name: 'Teste t de Student (independente)', icon: 'compare', desc: 'Comparação de médias entre grupos independentes', category: 'Paramétrico' },
  { name: 'ANOVA One-Way', icon: 'stacked_bar_chart', desc: 'Comparação de médias entre 3+ grupos', category: 'Paramétrico' },
  { name: 'ANOVA Two-Way', icon: 'grid_on', desc: 'Análise fatorial com duas variáveis independentes', category: 'Paramétrico' },
  { name: 'ANOVA com Medidas Repetidas', icon: 'repeat', desc: 'Mesmos sujeitos em múltiplas condições', category: 'Paramétrico' },
  { name: 'Teste de Tukey (Post-hoc)', icon: 'tune', desc: 'Comparações múltiplas pós-ANOVA', category: 'Post-hoc' },
  { name: 'Teste de Bonferroni', icon: 'shield', desc: 'Correção para comparações múltiplas', category: 'Post-hoc' },
  { name: 'Teste de Kruskal-Wallis', icon: 'leaderboard', desc: 'Alternativa não-paramétrica à ANOVA', category: 'Não-Paramétrico' },
  { name: 'Teste de Mann-Whitney U', icon: 'swap_horiz', desc: 'Comparação não-paramétrica entre 2 grupos', category: 'Não-Paramétrico' },
  { name: 'Teste de Wilcoxon', icon: 'swap_vertical_circle', desc: 'Versão não-paramétrica do t-test pareado', category: 'Não-Paramétrico' },
  { name: 'Teste de Friedman', icon: 'view_list', desc: 'ANOVA não-paramétrica com medidas repetidas', category: 'Não-Paramétrico' },
  { name: 'Teste de Spearman', icon: 'trending_up', desc: 'Correlação não-paramétrica', category: 'Correlação' },
  { name: 'Correlação de Pearson', icon: 'scatter_plot', desc: 'Correlação linear entre variáveis contínuas', category: 'Correlação' },
  { name: 'Regressão Linear Simples', icon: 'show_chart', desc: 'Modelo preditivo com uma variável independente', category: 'Regressão' },
  { name: 'Regressão Linear Múltipla', icon: 'stacked_line_chart', desc: 'Modelo preditivo com múltiplas variáveis', category: 'Regressão' },
  { name: 'Regressão Logística', icon: 'functions', desc: 'Predição de variável dependente binária', category: 'Regressão' },
  { name: 'Teste de Shapiro-Wilk', icon: 'water_drop', desc: 'Verificação de normalidade dos dados', category: 'Normalidade' },
  { name: 'Teste de Kolmogorov-Smirnov', icon: 'waves', desc: 'Aderência à distribuição teórica', category: 'Normalidade' },
  { name: 'Teste de Levene', icon: 'balance', desc: 'Homogeneidade de variâncias', category: 'Normalidade' },
  { name: 'Análise de Sobrevivência (Kaplan-Meier)', icon: 'monitoring', desc: 'Estimativa de sobrevivência ao longo do tempo', category: 'Sobrevivência' },
  { name: 'Modelo de Cox (Riscos Proporcionais)', icon: 'speed', desc: 'Regressão para dados de sobrevivência', category: 'Sobrevivência' },
  { name: 'Teste Log-Rank', icon: 'equalizer', desc: 'Comparação de curvas de sobrevivência', category: 'Sobrevivência' },
  { name: 'Metanálise (Efeito Fixo)', icon: 'hub', desc: 'Combinação de estudos com efeito fixo', category: 'Metanálise' },
  { name: 'Metanálise (Efeito Aleatório)', icon: 'shuffle', desc: 'Combinação de estudos com efeito aleatório', category: 'Metanálise' },
  { name: 'Funnel Plot / Viés de Publicação', icon: 'filter_alt', desc: 'Detecção de viés de publicação', category: 'Metanálise' },
  { name: 'Cálculo de Poder Amostral', icon: 'bolt', desc: 'Determinação do tamanho amostral necessário', category: 'Poder' },
  { name: 'Teste de McNemar', icon: 'toggle_on', desc: 'Comparação de proporções pareadas', category: 'Categórico' },
  { name: 'Teste de Cochran Q', icon: 'checklist', desc: 'Extensão do McNemar para 3+ grupos', category: 'Categórico' },
]

// Helper: resolve the test-type category and return color tokens
function getTestTypeBadge(testLabel) {
  const label = (testLabel || '').toLowerCase()
  if (label.includes('descritiva') || label.includes('desfecho') || label.includes('perfil')) {
    return { label: 'Descritiva', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' }
  }
  if (label.includes('pearson') || label.includes('spearman') || label.includes('correlação') || label.includes('correlacao')) {
    return { label: 'Correlação', bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' }
  }
  if (label.includes('regressão') || label.includes('regressao') || label.includes('logística') || label.includes('logistica')) {
    return { label: 'Regressão', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' }
  }
  if (label.includes('anova') || label.includes('kruskal') || label.includes('mann-whitney') || label.includes('t independente') || label.includes('qui-quadrado') || label.includes('fisher')) {
    return { label: 'Comparação', bg: 'bg-teal-400/15', text: 'text-teal-300', border: 'border-teal-400/30' }
  }
  if (label.includes('pareado') || label.includes('wilcoxon')) {
    return { label: 'Pareado', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' }
  }
  if (label.includes('shapiro') || label.includes('levene') || label.includes('normalidade')) {
    return { label: 'Normalidade', bg: 'bg-stone-500/15', text: 'text-stone-400', border: 'border-stone-500/30' }
  }
  return { label: 'Teste', bg: 'bg-stone-700/40', text: 'text-stone-400', border: 'border-stone-600/30' }
}

// Helper: determine if p-value is N/A for a given test type
function isPvalNA(testLabel) {
  const label = (testLabel || '').toLowerCase()
  return label.includes('descritiva') && !label.includes('desfecho') && !label.includes('perfil')
}

export default function Dashboard() {
  const { session, isAuthenticated } = useAuth()
  const { history, trials, loading: dataLoading } = useSciStat()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [selectedTests, setSelectedTests] = useState({})
  const [validationReport, setValidationReport] = useState(null)

  function significance(p) {
    if (p == null) return ''
    if (p < 0.001) return '***'
    if (p < 0.01) return '**'
    if (p < 0.05) return '*'
    return 'ns'
  }
  const [fileData, setFileData] = useState(null)
  const [descriptiveData, setDescriptiveData] = useState(null)
  const [groupedSummary, setGroupedSummary] = useState(null)
  const [analysisProtocol, setAnalysisProtocol] = useState(null)
  const [showReview, setShowReview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [outcomeOptions, setOutcomeOptions] = useState([])
  const [chartModal, setChartModal] = useState({ open: false, data: null, varName: '' })
  const [detailModal, setDetailModal] = useState(null)
  const [activeReportTab, setActiveReportTab] = useState('all')
  const [expandedGroups, setExpandedGroups] = useState({})
  const [howToModal, setHowToModal] = useState(false)
  const [apaCopied, setApaCopied] = useState(null)  // stores testLabel of last copied
  const [premiumAnalysis, setPremiumAnalysis] = useState(null)
  const [premiumLoading, setPremiumLoading] = useState(false)
  // Passo 0 — seleção de outcome antes da análise
  const [columnOptions, setColumnOptions] = useState([])
  const [showOutcomeSelector, setShowOutcomeSelector] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [testExplanationModal, setTestExplanationModal] = useState(null)
  const fileInputRef = useRef(null)
  const premiumRef = useRef(null)
  // Passo 0.5 — revisão de domínios especializados (entre get-columns e OutcomeSelector)
  const [showDomainReview, setShowDomainReview] = useState(false)
  const [domainResolutions, setDomainResolutions] = useState([])
  const [bilateralWarnings, setBilateralWarnings] = useState([])
  const [confirmedTransformations, setConfirmedTransformations] = useState([])
  const [pendingColumnSamples, setPendingColumnSamples] = useState([])

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && testExplanationModal) {
        setTestExplanationModal(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [testExplanationModal])

  useEffect(() => {
    if (premiumAnalysis && premiumRef.current) {
      setTimeout(() => {
        premiumRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [premiumAnalysis])

  /** Gera uma citação em formato APA-7 para um resultado estatístico */
  const generateApaText = (r) => {
    if (!r) return ''
    const p = r.p_value != null ? (r.p_value < 0.001 ? 'p < .001' : `p = ${r.p_value.toFixed(3)}`) : ''
    const n = r.group_stats?.reduce((acc, g) => acc + (g.n || 0), 0) || r.n || ''
    const es = r.effect_size
    let esText = ''
    if (es?.cohens_d != null)  esText = `, d = ${es.cohens_d}`
    else if (es?.eta_squared != null) esText = `, η² = ${es.eta_squared}`
    else if (es?.r_squared != null)   esText = `, R² = ${es.r_squared}`
    else if (es?.cramers_v != null)   esText = `, V = ${es.cramers_v}`
    const stat = r.statistic != null ? `, estatística = ${typeof r.statistic === 'number' ? r.statistic.toFixed(3) : r.statistic}` : ''
    const nText = n ? ` (N = ${n})` : ''
    return `${r.testLabel}${nText}: ${stat}, ${p}${esText}.`
  }

  const copyApa = (r) => {
    const text = generateApaText(r)
    navigator.clipboard.writeText(text).then(() => {
      setApaCopied(r.testLabel)
      setTimeout(() => setApaCopied(null), 2500)
    })
  }

  const handleNewAnalysis = () => {
    setResults([])
    setFileData(null)
    setDescriptiveData(null)
    setGroupedSummary(null)
    setAnalysisProtocol(null)
    setShowReview(false)
    setValidationReport(null)
    setActiveReportTab('all')
    setPremiumAnalysis(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const runPremiumAnalysis = async () => {
    if (!fileData) return
    setPremiumLoading(true)
    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = new FormData()
      formData.append('file', fileData.formData.get('file'))
      // The backend expects target_col: use numeric columns from results or outcome
      const numericCol = results.find(r => r.p_value != null)?.testLabel?.split(' (')[0] || analysisProtocol?.outcome || ''
      const targetCol = analysisProtocol?.outcome || numericCol
      formData.append('target_col', targetCol)
      if (analysisProtocol?.outcome) {
        formData.append('group_col', analysisProtocol.outcome)
      }

      const res = await fetch(`${API_URL}/api/stats/premium-analysis`, {
        method: 'POST',
        headers,
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        // Normalize response: backend returns {descriptive, tests, chart}
        // Build a compatible structure for our display
        const normalizedResults = (data.tests || []).map((t, i) => ({
          label: t.test_name || `Análise ${i + 1}`,
          insight_label: t.test_name || `Análise ${i + 1}`,
          p_value: t.p_value ?? null,
          statistic: t.stat_value ?? null,
          effect_size: t.effect_size ?? 0,
          interpretation: t.interpretation || 'N/A',
        }))
        setPremiumAnalysis({
          results: normalizedResults,
          descriptive: data.descriptive || null,
          chart_b64: data.chart || null,
          scientific_report: data.scientific_report || null,
          summary: {
            interpretation: data.descriptive
              ? `Análise descritiva: Média ${data.descriptive.mean?.toFixed(2)}, Mediana ${data.descriptive.median?.toFixed(2)}, DP ${data.descriptive.std?.toFixed(2)}`
              : 'Análise premium concluída.',
            evidence_strength: normalizedResults.filter(r => r.p_value != null && r.p_value < 0.05).length / Math.max(normalizedResults.length, 1)
          }
        })
      } else {
        let errMsg = 'Erro desconhecido'
        try { const errData = await res.json(); errMsg = errData.detail || errData.error || errMsg } catch {}
        alert(`Erro na análise premium: ${errMsg}`)
      }
    } catch (err) {
      alert(`Falha na análise premium: ${err.message}`)
    }
    setPremiumLoading(false)
  }

  const toggleTest = (id) => setSelectedTests(prev => ({ ...prev, [id]: !prev[id] }))

  // ============================================================
  // PASSO 0: Ao selecionar arquivo -> chama /get-columns primeiro
  // Em seguida, resolve domínios especializados (Passo 0.5)
  // ============================================================
  const handleFileUpload = async (e) => {
    let file;
    if (e.target && e.target.files) {
      file = e.target.files[0];
    } else if (e.dataTransfer && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    }
    if (!file) return

    setResults([])
    setDescriptiveData(null)
    setGroupedSummary(null)
    setAnalysisProtocol(null)
    setShowReview(false)
    setLoading(true)
    setIsDragging(false)
    setDomainResolutions([])
    setBilateralWarnings([])
    setConfirmedTransformations([])

    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const colFormData = new FormData()
      colFormData.append('file', file)
      const colRes = await fetch(`${API_URL}/api/data/get-columns`, {
        method: 'POST',
        headers,
        body: colFormData
      })
      if (!colRes.ok) throw new Error(`Erro ao ler colunas: ${colRes.status}`)
      const colData = await colRes.json()
      setColumnOptions(colData.columns || [])
      setPendingFile(file)

      // ── Passo 0.5: Resolução de domínios especializados ──────────
      const columnSamples = (colData.columns || []).map(col => ({
        name: col.name || col,
        samples: (col.sample_values || col.samples || []).map(String)
      }))
      setPendingColumnSamples(columnSamples)

      try {
        const resolveRes = await fetch(`${API_URL}/api/data/resolve-columns`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: columnSamples })
        })
        if (resolveRes.ok) {
          const resolveData = await resolveRes.json()
          const hasSpecialDomains = (
            (resolveData.resolutions || []).length > 0 ||
            (resolveData.bilateral_warnings || []).length > 0
          )
          if (hasSpecialDomains) {
            setDomainResolutions(resolveData.resolutions || [])
            setBilateralWarnings(resolveData.bilateral_warnings || [])
            setLoading(false)
            setShowDomainReview(true)
            return // aguardar confirmação do usuário no modal
          }
        }
      } catch (resolveErr) {
        console.warn('[DomainReview] resolve falhou, prosseguindo sem revisão:', resolveErr)
      }
      // ─────────────────────────────────────────────────────────────

      // Sem domínios especiais → ir direto ao OutcomeSelector
      setShowOutcomeSelector(true)
    } catch (err) {
      alert(`Erro no upload: ${err.message}`);
    }
    setLoading(false)
  }

  // ============================================================
  // PASSO 0.5 → PASSO 0: Usuário confirmou domínios → OutcomeSelector
  // ============================================================
  const handleDomainReviewConfirm = useCallback(async (choices) => {
    setConfirmedTransformations(choices)
    setShowDomainReview(false)
    setShowOutcomeSelector(true)
  }, [])

  const handleDomainReviewSkip = useCallback(() => {
    setShowDomainReview(false)
    setShowOutcomeSelector(true)
  }, [])

  const handleTeachDomain = useCallback(async (payload) => {
    const headers = { 'Authorization': `Bearer ${session?.sessionToken}`, 'Content-Type': 'application/json' }
    const API_URL = import.meta.env.VITE_API_BASE_URL
    try {
      await fetch(`${API_URL}/api/domains/teach`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
    } catch (e) {
      console.warn('[TeachDomain] falhou:', e)
    }
  }, [session])

  // ============================================================
  // PASSO 0 -> ANÁLISE: chamado após o usuário confirmar o outcome
  // ============================================================
  const handleOutcomeConfirmed = async (outcomeCol) => {
    setShowOutcomeSelector(false)
    if (!pendingFile) return

    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL
    setLoading(true)

    const formData = new FormData()
    formData.append('file', pendingFile)
    formData.append('outcome_col', outcomeCol)

    try {
      const protocolRes = await fetch(`${API_URL}/api/data/analyze-protocol`, {
        method: 'POST',
        headers,
        body: formData
      })
      if (!protocolRes.ok) throw new Error(`Erro no servidor: ${protocolRes.status}`);

      const protocolData = await protocolRes.json()
      if (protocolData.protocol) {
        const allVars = protocolData.protocol.map(v => v.name)
        setOutcomeOptions(allVars)
        setAnalysisProtocol({
          items: protocolData.protocol,
          outcome: protocolData.outcome,
          meta: protocolData.meta || null
        })
        setShowReview(true)
      }

      const pendingFormData = new FormData()
      pendingFormData.append('file', pendingFile)
      setFileData({ filename: pendingFile.name, formData: pendingFormData })

    } catch (err) {
      alert(`Erro no upload: ${err.message}`);
    }
    setLoading(false)
  }

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); }
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); }
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }

  const handleProtocolOptionChange = (idx, newTest) => {
    setAnalysisProtocol(prev => {
      const items = [...prev.items]
      items[idx] = { ...items[idx], recommended_test: newTest }
      return { ...prev, items }
    })
  }

  const toggleProtocolSelection = (idx) => {
    setAnalysisProtocol(prev => {
      const items = [...prev.items]
      items[idx] = { ...items[idx], is_selected: !items[idx].is_selected }
      return { ...prev, items }
    })
  }

  const handleOutcomeChange = (newOutcome) => {
    setAnalysisProtocol(prev => ({ ...prev, outcome: newOutcome }))
  }

  const confirmProtocolAndRun = async () => {
    setLoading(true)
    const headers = { 'Authorization': `Bearer ${session?.sessionToken}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = fileData.formData
      const selectedItems = analysisProtocol.items.filter(item => item.is_selected !== false);
      formData.set('protocol', JSON.stringify(selectedItems))
      if (analysisProtocol?.outcome) {
        formData.set('outcome', analysisProtocol.outcome)
        formData.set('group_by', analysisProtocol.outcome)
      }

      const descRes = await fetch(`${API_URL}/api/data/upload`, { method: 'POST', body: formData, headers })
      if (descRes.ok) setDescriptiveData(await descRes.json());

      const groupRes = await fetch(`${API_URL}/api/data/summary-grouped`, { method: 'POST', body: formData, headers })
      if (groupRes.ok) setGroupedSummary(await groupRes.json());

      const execRes = await fetch(`${API_URL}/api/data/execute-protocol`, { method: 'POST', body: formData, headers })
      if (execRes.ok) {
        const resultsData = await execRes.json()
        setResults(resultsData.results || [])
        setValidationReport(resultsData.validation || null)
        setShowReview(false)
      }
    } catch (err) {
      alert(`Falha: ${err.message}`);
    }
    setLoading(false)
  }

  const sortedResults = useMemo(() => {
    if (!results.length) return []
    const simpleDescriptive = []
    const descriptive = []
    const correlations = []
    const groupComparisons = []
    const paired = []
    const regressions = []
    const other = []
    results.forEach(r => {
      const label = (r.testLabel || '').toLowerCase()
      if (label.includes('descritiva') || label.includes('desfecho')) {
        if (label.includes('perfil') || label.includes('outcome') || label.includes('desfecho')) {
          descriptive.push(r)
        } else {
          simpleDescriptive.push(r)
        }
      } else if (label.includes('correlação') || label.includes('pearson') || label.includes('spearman')) {
        correlations.push(r)
      } else if (label.includes('pareado') || label.includes('wilcoxon')) {
        paired.push(r)
      } else if (label.includes('t independente') || label.includes('mann-whitney') || label.includes('anova') || label.includes('kruskal') || label.includes('qui-quadrado') || label.includes('fisher') || label.includes('exato')) {
        groupComparisons.push(r)
      } else if (label.includes('regressão') || label.includes('regressao') || label.includes('logística') || label.includes('logistica')) {
        regressions.push(r)
      } else {
        other.push(r)
      }
    })
    const all = [...simpleDescriptive, ...descriptive, ...paired, ...correlations, ...groupComparisons, ...regressions, ...other]
    if (activeReportTab === 'all') return all
    if (activeReportTab === 'descriptive') return [...simpleDescriptive, ...descriptive]
    if (activeReportTab === 'correlations') return correlations
    if (activeReportTab === 'comparisons') return groupComparisons
    if (activeReportTab === 'paired') return paired
    if (activeReportTab === 'regressions') return regressions
    return all
  }, [results, activeReportTab])

  const exportResultsCSV = () => {
    if (!sortedResults.length) return
    const headers = ['Variável / Teste', 'Engine', 'Estatística', 'Valor P', 'Significância', 'Tamanho do Efeito', 'Interpretação do Efeito', 'Poder', 'IC95% Inferior', 'IC95% Superior', 'Interpretação IA']
    const rows = sortedResults.map(r => {
      const es = r.effect_size || {}
      const ci = r.ci || {}
      const esVal = es.cohens_d != null ? `d=${es.cohens_d}` : es.eta_squared != null ? `η²=${es.eta_squared}` : es.r_squared != null ? `R²=${es.r_squared}` : es.cramers_v != null ? `V=${es.cramers_v}` : '—'
      return [
        r.testLabel || '',
        r.engine || '—',
        r.statistic != null ? r.statistic : '—',
        r.p_value != null ? r.p_value : '—',
        significance(r.p_value),
        esVal,
        es.interpretation || '—',
        es.achieved_power != null ? `${(es.achieved_power * 100).toFixed(0)}%` : '—',
        ci.ci_lower != null ? ci.ci_lower : '—',
        ci.ci_upper != null ? ci.ci_upper : '—',
        r.interpretation || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_papermetrics_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportResultsJSON = () => {
    if (!sortedResults.length) return
    const payload = {
      exported_at: new Date().toISOString(),
      engine: 'Paper Metrics — Pingouin',
      n_tests: sortedResults.length,
      results: sortedResults
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_papermetrics_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportResultsExcel = () => {
    if (!sortedResults.length) return
    // Geração de TSV (Tab-Separated) — abre no Excel e LibreOffice sem dependências externas
    const headers = [
      'Variável / Teste', 'Engine', 'Estatística', 'Valor P', 'Significância',
      'Tamanho do Efeito', 'Interpretação do Efeito', 'Poder (%)',
      'IC95% Inferior', 'IC95% Superior', 'Interpretação (PT-BR)'
    ]
    const rows = sortedResults.map(r => {
      const es = r.effect_size || {}
      const ci = r.ci || {}
      const esVal = es.cohens_d != null ? `d=${es.cohens_d}`
                  : es.eta_squared != null ? `η²=${es.eta_squared}`
                  : es.r_squared != null ? `R²=${es.r_squared}`
                  : es.cramers_v != null ? `V=${es.cramers_v}` : '—'
      return [
        r.testLabel || '',
        r.engine || '—',
        r.statistic != null ? r.statistic : '—',
        r.p_value != null ? r.p_value : '—',
        significance(r.p_value),
        esVal,
        es.interpretation || '—',
        es.achieved_power != null ? `${(es.achieved_power * 100).toFixed(0)}%` : '—',
        ci.ci_lower != null ? ci.ci_lower : '—',
        ci.ci_upper != null ? ci.ci_upper : '—',
        r.interpretation || '—',
      ].map(v => String(v).replace(/\t/g, ' '))
    })
    const metaSeparator = '\t'.repeat(headers.length - 1)
    const metaLines = [
      ``,
      `--- Metadados${metaSeparator}`,
      `Exportado em\t${new Date().toLocaleString('pt-BR')}${metaSeparator}`,
      `Engine\tPaper Metrics — Pingouin${metaSeparator}`,
      `Total de testes\t${sortedResults.length}${metaSeparator}`,
      `Arquivo analisado\t${fileData?.filename || '—'}${metaSeparator}`,
    ]
    const tsvContent = [
      headers.join('\t'),
      ...rows.map(r => r.join('\t')),
      ...metaLines
    ].join('\n')
    // BOM UTF-8 garante que o Excel abre com acentos corretamente
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio_papermetrics_${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportResultsPDF = () => {
    if (!sortedResults.length) return
    // Criar stylesheet temporária para impressão
    const styleId = 'pm-print-style'
    let style = document.getElementById(styleId)
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #pm-print-report { display: block !important; }
      }
      #pm-print-report { display: none; }
    `
    // Criar conteúdo do relatório
    let existing = document.getElementById('pm-print-report')
    if (existing) existing.remove()
    const printDiv = document.createElement('div')
    printDiv.id = 'pm-print-report'
    const date = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })
    printDiv.innerHTML = `
      <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #111; margin: 0; padding: 0; }
        .print-header { padding: 32px 40px 16px; border-bottom: 3px solid #00d4aa; }
        .print-header h1 { font-size: 24px; font-weight: 900; color: #0f1623; margin: 0 0 4px; }
        .print-header p { font-size: 11px; color: #666; margin: 0; }
        .print-meta { padding: 16px 40px; background: #f8fffe; border-bottom: 1px solid #e0f7f4; font-size: 11px; color: #444; display: flex; gap: 32px; }
        .print-meta span { font-weight: 700; color: #00b894; }
        table { width: 100%; border-collapse: collapse; margin: 24px 40px; width: calc(100% - 80px); font-size: 10px; }
        th { background: #0f1623; color: #00d4aa; padding: 8px 10px; text-align: left; font-weight: 800; text-transform:; letter-spacing: 0.05em; font-size: 9px; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
        tr:nth-child(even) td { background: #f8f9fa; }
        .pval-sig { color: #00b894; font-weight: 700; }
        .pval-ns { color: #666; }
        .interp { font-size: 9px; color: #555; font-style: italic; margin-top: 2px; }
        .print-footer { padding: 16px 40px; border-top: 1px solid #eee; font-size: 9px; color: #aaa; text-align: center; }
      </style>
      <div class="print-header">
        <h1>Paper Metrics — Relatório Estatístico</h1>
        <p>Gerado em ${date} | Arquivo: ${fileData?.filename || 'N/A'} | Engine: Pingouin (Python)</p>
      </div>
      <div class="print-meta">
        <div>Total de testes: <span>${sortedResults.length}</span></div>
        <div>Significativos (p&lt;0.05): <span>${sortedResults.filter(r => r.p_value != null && r.p_value < 0.05).length}</span></div>
        <div>Engine: <span>Pingouin + SciPy Fallback</span></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:28%">Variável / Teste</th>
          <th style="width:14%">Estatística</th>
          <th style="width:10%">Valor P</th>
          <th style="width:8%">Sig.</th>
          <th style="width:14%">Tam. Efeito</th>
          <th style="width:26%">Interpretação</th>
        </tr></thead>
        <tbody>
          ${sortedResults.map(r => {
            const es = r.effect_size || {}
            const esVal = es.cohens_d != null ? `d=${es.cohens_d}` : es.eta_squared != null ? `η²=${es.eta_squared}` : es.r_squared != null ? `R²=${es.r_squared}` : es.cramers_v != null ? `V=${es.cramers_v}` : '—'
            const isSig = r.p_value != null && r.p_value < 0.05
            const pStr = r.p_value != null ? (r.p_value < 0.001 ? '<0.001' : r.p_value.toFixed(4)) : '—'
            return `<tr>
              <td><strong>${r.testLabel || '—'}</strong><br><span style="font-size:8px;color:#888">${r.engine || ''}</span></td>
              <td style="font-family:monospace">${r.statistic != null ? r.statistic : '—'}</td>
              <td class="${isSig ? 'pval-sig' : 'pval-ns'}" style="font-family:monospace">${pStr}</td>
              <td style="font-weight:800;color:${isSig ? '#00b894' : '#aaa'}">${significance(r.p_value)}</td>
              <td style="font-family:monospace">${esVal}<br><span style="font-size:8px;color:#888">${es.interpretation || ''}</span></td>
              <td><span class="interp">${r.interpretation || '—'}</span></td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <div class="print-footer">Paper Metrics — Plataforma de Análise Estatística para Pesquisa Clínica | Relatório gerado automaticamente</div>
    `
    document.body.appendChild(printDiv)
    window.print()
    // Limpeza após impressão
    setTimeout(() => {
      printDiv.remove()
      style.textContent = ''
    }, 1000)
  }

  return (
    <div className="space-y-12 pb-20">
      {/* Passo 0.5 — Revisão de Domínios Especializados */}
      <ColumnDomainReview
        isOpen={showDomainReview}
        resolutions={domainResolutions}
        bilateralWarnings={bilateralWarnings}
        onConfirm={handleDomainReviewConfirm}
        onSkip={handleDomainReviewSkip}
        onTeachDomain={handleTeachDomain}
      />

      {/* Passo 0 — Seleção de Desfecho */}
      {showOutcomeSelector && (
        <OutcomeSelector
          columns={columnOptions}
          onConfirm={handleOutcomeConfirmed}
          onCancel={() => { setShowOutcomeSelector(false); setPendingFile(null) }}
        />
      )}

      <AnimatePresence>
        {showReview && (
          <section className="mb-12">
              <AnalysisReviewPlan 
                protocol={analysisProtocol?.items || []} 
                meta={analysisProtocol?.meta || null}
                outcome={analysisProtocol?.outcome || 'Resultado'} 
                outcomeOptions={outcomeOptions}
                onOptionChange={handleProtocolOptionChange}
                onToggleSelection={toggleProtocolSelection}
                onOutcomeChange={handleOutcomeChange}
                onConfirm={confirmProtocolAndRun}
              />
          </section>
        )}
      </AnimatePresence>


      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white">Paper <span className="text-primary">Metrics</span></h1>
            <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary/30 mt-2">Cloud Sync</span>
          </div>
          <p className="text-stone-500 font-medium mt-2 max-w-md">Consultoria Estatística Inteligente e Inferência Clínica.</p>
        </motion.div>
      </header>
      
      {/* Resumo de Ensaios Clínicos */}
      {!showReview && results.length === 0 && trials.length > 0 && (
        <motion.section 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {trials.slice(0,3).map((t, i) => (
             <div key={i} className="glass-card p-6 rounded-xl border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-symbols-rounded text-6xl">clinical_notes</span>
                </div>
                <p className="text-[9px] font-semibold tracking-wide text-primary mb-2">Fase {t.phase} • {t.status}</p>
                <h4 className="text-sm font-bold text-white mb-4 line-clamp-2 leading-tight">{t.title}</h4>
                <div className="flex items-end justify-between mt-auto">
                    <div>
                        <p className="text-[10px] font-bold text-stone-500">Recrutamento</p>
                        <p className="text-lg font-semibold text-white">{t.n_actual} <span className="text-[10px] text-stone-600">/ {t.n_target}</span></p>
                    </div>
                    <div className="w-12 h-12 rounded-full border-2 border-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                        {Math.round((t.n_actual / t.n_target)*100)}%
                    </div>
                </div>
             </div>
          ))}
        </motion.section>
      )}

      {!showReview && results.length === 0 && (
        <section className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-12 flex flex-col gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, scale: isDragging ? 1.02 : 1 }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`glass-card rounded-xl p-20 border-2 transition-all flex flex-col items-center text-center relative overflow-hidden ${isDragging ? 'border-primary bg-primary/5' : 'border-primary/10'}`}
            >
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 relative">
                    <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
                    <span className="material-symbols-rounded text-primary text-3xl">analytics</span>
                  </motion.div>
                  <p className="text-stone-300 font-medium">A Máquina está analisando o seu protocolo...</p>
                  <motion.div className="flex gap-1 mt-4">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 bg-primary rounded-full" animate={{ y: [0, -8, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }} />
                    ))}
                  </motion.div>
                </div>
            ) : !fileData ? (
              <>
                <div className="relative mb-6">
                  <motion.div 
                    className="absolute inset-0 bg-primary/10 rounded-full blur-xl"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                  />
                  <motion.div 
                    onClick={() => fileInputRef.current.click()} 
                    className="cursor-pointer w-28 h-28 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl flex items-center justify-center text-primary relative border border-primary/20"
                    whileHover={{ scale: 1.1, rotate: 3 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <motion.span 
                      className="material-symbols-rounded text-6xl"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    >
                      cloud_upload
                    </motion.span>
                    <motion.div 
                      className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <span className="material-symbols-rounded text-background text-sm">add</span>
                    </motion.div>
                  </motion.div>
                </div>
                <motion.h3 
                  className="text-2xl font-semibold text-white tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Envie seu arquivo
                </motion.h3>
                <motion.p 
                  className="text-stone-500 font-medium text-sm mt-3 px-4 max-w-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Arraste seus datasets (.csv, .xlsx) ou clique para upload.
                </motion.p>
                <motion.div 
                  className="flex gap-3 mt-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-semibold tracking-wide text-primary/70 border border-primary/10">CSV</span>
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-semibold tracking-wide text-primary/70 border border-primary/10">XLSX</span>
                  <span className="px-3 py-1.5 bg-white/5 rounded-full text-[9px] font-semibold tracking-wide text-stone-500 border border-white/5">Máx 50MB</span>
                </motion.div>
                <motion.button 
                  onClick={() => fileInputRef.current.click()} 
                  className="mt-8 w-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 hover:from-primary/20 hover:via-primary/10 hover:to-primary/20 py-5 rounded-2xl font-semibold text-xs tracking-wide text-primary border border-primary/30 transition-all relative overflow-hidden group"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                  <span className="relative z-10">Selecionar Arquivo</span>
                </motion.button>
              </>
            ) : (
              <div className="w-full text-left">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <span className="material-symbols-rounded text-3xl">dataset</span>
                  </div>
                  <button onClick={() => setFileData(null)} className="text-stone-500 hover:text-stone-400">
                    <span className="material-symbols-rounded text-xl">close</span>
                  </button>
                </div>
                <h4 className="text-lg font-semibold text-white truncate">{fileData.filename}</h4>
                <p className="text-primary text-[10px] font-semibold tracking-wide mt-1 opacity-70">Arquivo Ativo</p>
                
                <AnimatePresence>
                  {descriptiveData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 pt-6 border-t border-white/5">
                      <h5 className="text-[10px] font-semibold tracking-wide text-primary mb-4 flex items-center gap-2">
                        <span className="material-symbols-rounded text-sm">analytics</span>
                        Análise Descritiva Completa
                      </h5>
                      {descriptiveData.descriptive_stats ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/5">
                                  <th className="text-left py-3 px-2 font-semibold text-stone-500 text-[9px] tracking-wide">Variável</th>
                                  <th className="text-center py-3 px-2 font-semibold text-stone-500 text-[9px] tracking-wide">n</th>
                                  <th className="text-right py-3 px-2 font-semibold text-stone-500 text-[9px] tracking-wide">Média ± DP</th>
                                  <th className="text-right py-3 px-2 font-semibold text-primary text-[9px] tracking-wide">Mediana (IQR)</th>
                                  <th className="text-right py-3 px-2 font-semibold text-stone-500 text-[9px] tracking-wide">Min – Max</th>
                                  <th className="text-right py-3 px-2 font-semibold text-stone-500 text-[9px] tracking-wide">Assimetria</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {Object.entries(descriptiveData.descriptive_stats).map(([col, s]) => (
                                  <tr key={col} className="hover:bg-primary/5 transition-colors group">
                                    <td className="py-3 px-2 font-bold text-white group-hover:text-primary text-xs truncate max-w-[150px]">{col}</td>
                                    <td className="py-3 px-2 text-center font-mono text-stone-400">{s.n}</td>
                                    <td className="py-3 px-2 text-right font-mono text-stone-400">{s.mean} ± {s.std}</td>
                                    <td className="py-3 px-2 text-right font-mono font-bold text-primary">{s.median_iqr}</td>
                                    <td className="py-3 px-2 text-right font-mono text-stone-500">{s.min} – {s.max}</td>
                                    <td className="py-3 px-2 text-right font-mono">
                                      <span className={`${Math.abs(s.skewness) > 1 ? 'text-amber-400' : 'text-stone-500'}`}>
                                        {s.skewness}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-4 flex gap-3 flex-wrap">
                            <span className="px-2 py-1 bg-primary/5 rounded-lg text-[8px] font-bold text-primary/70 border border-primary/10">IQR = Q3 - Q1</span>
                            <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-stone-500 border border-white/5">|Assimetria| &gt; 1 = Não-normal</span>
                            <span className="px-2 py-1 bg-white/5 rounded-lg text-[8px] font-bold text-stone-500 border border-white/5">Padrão: Mediana (IQR) para não-normais</span>
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-[9px] font-bold text-stone-500 tracking-wide">Mediana</p>
                            <p className="text-lg font-semibold text-white mt-1">{descriptiveData.median?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-stone-500 tracking-wide">IQR</p>
                            <p className="text-lg font-semibold text-white mt-1">{descriptiveData.iqr?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-stone-500 tracking-wide">Média ± DP</p>
                            <p className="text-lg font-semibold text-white mt-1">{descriptiveData.mean?.toFixed(2)} ± {descriptiveData.std?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[9px] font-bold text-stone-500 tracking-wide">Mín – Máx</p>
                            <p className="text-lg font-semibold text-white mt-1">{descriptiveData.min?.toFixed(2)} – {descriptiveData.max?.toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            </motion.div>

            {!fileData && history.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 space-y-4">
                <div className="flex justify-between items-center px-4">
                  <h3 className="text-[10px] font-semibold tracking-wide text-stone-500">Histórico Recente</h3>
                  <Link to="/archive" className="text-[10px] font-bold text-primary hover:underline">Ver tudo</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.slice(0, 4).map((h, i) => (
                    <div key={i} className="glass-card p-4 rounded-xl flex items-center gap-4 hover:bg-white/5 transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><span className="material-symbols-rounded text-xl">history</span></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-white truncate">{h.filename}</p>
                        <p className="text-[9px] text-stone-500 truncate">Proc: {h.outcome || 'Indefinido'}</p>
                      </div>
                      <span className="text-[9px] font-mono text-stone-600">{new Date(h.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </section>
      )}

      <AnimatePresence>
        {groupedSummary && (
          <section className="mt-12">
            <BioSummaryTable data={groupedSummary?.results || []} outcomeName={groupedSummary?.outcome || ''} />
          </section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-12 glass-card rounded-xl overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-white/2">
                {validationReport && (validationReport.missing_cells > 0 || validationReport.duplicates > 0 || (validationReport.warnings && validationReport.warnings.length > 0)) && (
                  <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                    <span className="material-symbols-rounded text-amber-400 text-sm mt-0.5 shrink-0">warning</span>
                    <div className="text-[10px] leading-relaxed text-amber-300">
                      {validationReport.missing_cells > 0 && <span className="mr-3">⚠ {validationReport.missing_cells} células vazias detectadas</span>}
                      {validationReport.duplicates > 0 && <span className="mr-3">⚠ {validationReport.duplicates} linhas duplicadas</span>}
                      {validationReport.warnings?.map((w, wi) => <span key={wi} className="block">{w}</span>)}
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-[11px] font-semibold tracking-wide text-stone-500">Relatório Consolidado</h3>
                    <p className="text-[10px] text-stone-600 mt-1">Variáveis descritivas primeiro, seguidas por testes inferenciais</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">{results.length} testes executados</span>
                    <button
                      onClick={() => setHowToModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Como interpretar os resultados?"
                    >
                      <span className="material-symbols-rounded text-sm">help</span>
                      Como Usar?
                    </button>
                    <button
                      onClick={exportResultsCSV}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-400/10 hover:bg-teal-400/20 text-teal-300 border border-teal-400/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Exportar tabela completa em CSV"
                    >
                      <span className="material-symbols-rounded text-sm">download</span>
                      CSV
                    </button>
                    <button
                      onClick={exportResultsJSON}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Exportar dados completos em JSON"
                    >
                      <span className="material-symbols-rounded text-sm">data_object</span>
                      JSON
                    </button>
                    <button
                      onClick={exportResultsExcel}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Exportar planilha Excel (.xlsx)"
                    >
                      <span className="material-symbols-rounded text-sm">table_chart</span>
                      Excel
                    </button>
                    <button
                      onClick={exportResultsPDF}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-500/10 hover:bg-stone-500/20 text-stone-400 border border-stone-500/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Exportar relatório para impressão / PDF"
                    >
                      <span className="material-symbols-rounded text-sm">print</span>
                      PDF
                    </button>
                    <button
                      onClick={handleNewAnalysis}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Iniciar nova análise"
                    >
                      <span className="material-symbols-rounded text-sm">add_circle</span>
                      Nova Análise
                    </button>

                    <button
                      onClick={runPremiumAnalysis}
                      disabled={premiumLoading}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-semibold tracking-wide transition-all ${
                        premiumAnalysis 
                          ? 'bg-primary/20 text-primary border border-primary/40' 
                          : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20'
                      }`}
                      title="Executar análise estatística avançada com detecção de padrões"
                    >
                      {premiumLoading ? (
                        <motion.span 
                          animate={{ rotate: 360 }} 
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="material-symbols-rounded text-sm"
                        >
                          progress_activity
                        </motion.span>
                      ) : (
                        <span className="material-symbols-rounded text-sm">auto_awesome</span>
                      )}
                      {premiumAnalysis ? 'Análise Premium Concluída' : 'Análise Premium'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                      <span className="text-[9px] font-semibold tracking-wide text-stone-500">{results.length} TESTES</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const allExpanded = Object.values(expandedGroups).every(Boolean)
                        const newState = {}
                        Object.keys(expandedGroups).forEach(k => { newState[k] = !allExpanded })
                        setExpandedGroups(newState)
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                    >
                      <span className="material-symbols-rounded text-sm">{Object.values(expandedGroups).every(Boolean) ? 'unfold_less' : 'unfold_more'}</span>
                      {Object.values(expandedGroups).every(Boolean) ? 'Recolher' : 'Expandir'}
                    </button>
                  </div>
                </div>
              </div>

              {sortedResults.length === 0 ? (
                <div className="p-12 text-center">
                  <span className="material-symbols-rounded text-4xl text-stone-600">inbox</span>
                  <p className="text-sm text-stone-500 mt-3">Nenhum resultado nesta categoria.</p>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  {(() => {
                    const groups = [
                      { key: 'simpleDescriptive', label: 'Análises Descritivas', icon: 'monitoring', items: [] },
                      { key: 'descriptive', label: 'Perfil do Desfecho', icon: 'target', items: [] },
                      { key: 'paired', label: 'Testes Pareados', icon: 'compare_arrows', items: [] },
                      { key: 'correlations', label: 'Correlações', icon: 'scatter_plot', items: [] },
                      { key: 'groupComparisons', label: 'Comparações entre Grupos', icon: 'group_work', items: [] },
                      { key: 'regressions', label: 'Regressões', icon: 'model_training', items: [] },
                      { key: 'other', label: 'Outros Testes', icon: 'analytics', items: [] },
                    ]

                    results.forEach(r => {
                      const label = (r.testLabel || '').toLowerCase()
                      if (label.includes('descritiva') || label.includes('desfecho')) {
                        if (label.includes('perfil') || label.includes('outcome') || label.includes('desfecho')) {
                          groups[1].items.push(r)
                        } else {
                          groups[0].items.push(r)
                        }
                      } else if (label.includes('correlação') || label.includes('pearson') || label.includes('spearman')) {
                        groups[3].items.push(r)
                      } else if (label.includes('pareado') || label.includes('wilcoxon')) {
                        groups[2].items.push(r)
                      } else if (label.includes('t independente') || label.includes('mann-whitney') || label.includes('anova') || label.includes('kruskal') || label.includes('qui-quadrado') || label.includes('fisher') || label.includes('exato')) {
                        groups[4].items.push(r)
                      } else if (label.includes('regressão') || label.includes('regressao') || label.includes('logística') || label.includes('logistica')) {
                        groups[5].items.push(r)
                      } else {
                        groups[6].items.push(r)
                      }
                    })

                    const toggleGroup = (key) => {
                      setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))
                    }

                    /* ── Helper: extract variable name from testLabel ── */
                    const varName = (label) => {
                      const match = label?.match(/^(.+?)\s*\(/)
                      return match ? match[1].trim() : label || '—'
                    }

                    /* ── Helper: format effect size into a single string ── */
                    const fmtEffect = (es) => {
                      if (!es) return null
                      if (es.cohens_d != null) return { symbol: 'd', value: es.cohens_d }
                      if (es.eta_squared != null) return { symbol: 'η²', value: es.eta_squared }
                      if (es.r_squared != null) return { symbol: 'R²', value: es.r_squared }
                      if (es.cramers_v != null) return { symbol: 'V', value: es.cramers_v }
                      return null
                    }

                    const effectColor = (interp) => {
                      if (!interp) return 'text-stone-500'
                      if (['Grande', 'Forte', 'Muito forte'].includes(interp)) return 'text-primary'
                      if (['Médio', 'Moderado'].includes(interp)) return 'text-amber-400'
                      return 'text-stone-500'
                    }

                    /* ── Render: Descriptive card ── */
                    const DescriptiveCard = ({ r }) => (
                      <div className="p-4 rounded-lg border border-border-subtle bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-main group-hover:text-primary transition-colors truncate">{varName(r.testLabel)}</p>
                            <div className="flex items-baseline gap-3 mt-2">
                              <span className="text-2xl font-semibold text-text-main font-mono tracking-tight">{r?.median_iqr?.split(' ')[0] || '—'}</span>
                              {r?.median_iqr && (
                                <span className="text-xs text-text-muted font-mono">IQR {r.median_iqr.match(/\((.+)\)/)?.[1] || ''}</span>
                              )}
                            </div>
                            {r?.ci && (
                              <p className="text-[10px] text-text-muted font-mono mt-1">IC95% [{r.ci.ci_lower}, {r.ci.ci_upper}]</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {r?.chart_data && (
                              <button onClick={() => setChartModal({ open: true, data: r.chart_data, varName: varName(r.testLabel) })} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-primary/10 flex items-center justify-center text-stone-500 hover:text-primary transition-all">
                                <span className="material-symbols-rounded text-sm">bar_chart</span>
                              </button>
                            )}
                            <button onClick={() => copyApa(r)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${apaCopied === r.testLabel ? 'bg-primary/15 text-primary' : 'bg-white/5 text-stone-500 hover:text-text-main'}`}>
                              <span className="material-symbols-rounded text-sm">{apaCopied === r.testLabel ? 'check' : 'content_copy'}</span>
                            </button>
                          </div>
                        </div>
                        {r?.interpretation && (
                          <p className="text-[11px] text-text-muted leading-relaxed mt-3 pt-3 border-t border-border-subtle">
                            {r.interpretation}
                          </p>
                        )}
                      </div>
                    )

                    /* ── Render: Inferential card (correlations, comparisons, paired, regressions) ── */
                    const InferentialCard = ({ r }) => {
                      const naForPval = isPvalNA(r?.testLabel)
                      const es = fmtEffect(r?.effect_size)
                      const isSig = r?.p_value != null && r.p_value < 0.05

                      return (
                        <div className={`p-4 rounded-lg border transition-all group ${isSig ? 'border-primary/20 bg-primary/[0.03]' : 'border-border-subtle bg-white/[0.02]'} hover:bg-white/[0.04]`}>
                          {/* Top: Name + Actions */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text-main group-hover:text-primary transition-colors truncate">{varName(r.testLabel)}</p>
                              {r?.engine && <span className="text-[9px] text-text-muted font-mono">{r.engine}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {r?.chart_data && (
                                <button onClick={() => setChartModal({ open: true, data: r.chart_data, varName: varName(r.testLabel) })} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-primary/10 flex items-center justify-center text-stone-500 hover:text-primary transition-all">
                                  <span className="material-symbols-rounded text-sm">bar_chart</span>
                                </button>
                              )}
                              <button onClick={() => copyApa(r)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${apaCopied === r.testLabel ? 'bg-primary/15 text-primary' : 'bg-white/5 text-stone-500 hover:text-text-main'}`}>
                                <span className="material-symbols-rounded text-sm">{apaCopied === r.testLabel ? 'check' : 'content_copy'}</span>
                              </button>
                              <button onClick={() => setDetailModal(r)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-500 hover:text-text-main transition-all">
                                <span className="material-symbols-rounded text-sm">info</span>
                              </button>
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-4 flex-wrap">
                            {!naForPval && r?.p_value != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-text-muted">p</span>
                                <span className={`text-lg font-semibold font-mono tracking-tight ${isSig ? 'text-primary' : 'text-stone-500'}`}>
                                  {r.p_value < 0.001 ? '<.001' : r.p_value.toFixed(3)}
                                </span>
                                <span className={`text-xs font-semibold ${isSig ? 'text-primary' : 'text-stone-600'}`}>{significance(r.p_value)}</span>
                              </div>
                            )}
                            {r?.statistic != null && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
                                <span className="text-[10px] text-text-muted">Stat</span>
                                <span className="text-xs font-mono font-semibold text-text-main">{typeof r.statistic === 'number' ? r.statistic.toFixed(3) : r.statistic}</span>
                              </div>
                            )}
                            {es && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
                                <span className="text-[10px] text-text-muted">{es.symbol}</span>
                                <span className="text-xs font-mono font-semibold text-text-main">{es.value}</span>
                                {r.effect_size?.interpretation && (
                                  <span className={`text-[9px] font-semibold ${effectColor(r.effect_size.interpretation)}`}>{r.effect_size.interpretation}</span>
                                )}
                              </div>
                            )}
                            {r?.effect_size?.achieved_power != null && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5">
                                <span className="text-[10px] text-text-muted">Poder</span>
                                <span className={`text-xs font-mono font-semibold ${r.effect_size.achieved_power >= 0.8 ? 'text-primary' : 'text-stone-400'}`}>{(r.effect_size.achieved_power * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>

                          {/* Group stats */}
                          {r?.group_stats && r.group_stats.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                              {r.group_stats.map(g => (
                                <div key={g.group} className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-md border border-white/5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                  <span className="text-[10px] font-semibold text-text-muted">{g.group}</span>
                                  <span className="text-[10px] font-mono text-text-main">N={g.n}</span>
                                  {g.mean != null && <span className="text-[10px] font-mono text-stone-500">M={g.mean}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Interpretation */}
                          {r?.interpretation && (
                            <p className="text-[11px] text-text-muted leading-relaxed mt-3 pt-3 border-t border-white/5">
                              {r.interpretation}
                            </p>
                          )}

                          {/* Assumptions */}
                          {r?.assumptions && r.assumptions.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {r.assumptions.map((a, ai) => (
                                <div key={ai} className={`flex items-start gap-1.5 text-[10px] px-2.5 py-1.5 rounded-md ${a.severity === 'warning' ? 'bg-amber-500/5 text-amber-400' : 'bg-blue-500/5 text-blue-400'}`}>
                                  <span className="material-symbols-rounded text-xs mt-px">{a.severity === 'warning' ? 'warning' : 'info'}</span>
                                  <span>{a.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return groups.filter(g => g.items.length > 0).map((group) => {
                      const isExpanded = expandedGroups[group.key]
                      const significantCount = group.items.filter(r => r.p_value != null && r.p_value < 0.05).length
                      const isDescGroup = group.key === 'simpleDescriptive' || group.key === 'descriptive'

                      return (
                        <div key={group.key} className={`rounded-xl border overflow-hidden transition-all ${isExpanded ? 'border-border-subtle bg-white/[0.01]' : 'border-border-subtle/50 hover:border-border-subtle'}`}>
                          <button onClick={() => toggleGroup(group.key)} className="w-full text-left px-5 py-4 flex items-center justify-between group">
                            <div className="flex items-center gap-4">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-white/5 text-stone-500 group-hover:text-stone-300'}`}>
                                <span className="material-symbols-rounded text-lg">{group.icon}</span>
                              </div>
                              <div>
                                <h3 className={`text-sm font-semibold transition-colors ${isExpanded ? 'text-text-main' : 'text-text-main'}`}>{group.label}</h3>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-[10px] text-text-muted">{group.items.length} {group.items.length === 1 ? 'teste' : 'testes'}</span>
                                  {significantCount > 0 && (
                                    <span className="text-[10px] text-primary font-medium">{significantCount} significativo{significantCount > 1 ? 's' : ''}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <motion.span className="material-symbols-rounded text-stone-500 text-lg" animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>expand_more</motion.span>
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                              >
                                <div className={`px-5 pb-5 ${isDescGroup ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5' : 'space-y-2.5'}`}>
                                  {group.items.map((r, i) => (
                                    isDescGroup
                                      ? <DescriptiveCard key={i} r={r} />
                                      : <InferentialCard key={i} r={r} />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {premiumAnalysis && (
          <motion.section 
            ref={premiumRef}
            initial={{ opacity: 0, y: 50 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="mt-12 space-y-8 reveal-premium pb-20"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <span className="material-symbols-rounded text-primary">analytics</span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white italic">Insights <span className="text-primary">Premium</span></h2>
                <p className="text-stone-500 text-[10px] font-bold tracking-wide">Análise de Redes e Detecção de Padrões Multivariados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Relatório Científico IA */}
              {premiumAnalysis.scientific_report && (
                <div className="lg:col-span-12 p-1 rounded-xl bg-white/5 border border-white/10 mb-4">
                  <div className="glass-card rounded-[2.9rem] p-10 h-full relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <span className="material-symbols-rounded text-8xl text-primary">history_edu</span>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-rounded text-primary">smart_toy</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white italic">Relatório Científico <span className="text-primary">IA</span></h3>
                        <p className="text-[9px] font-semibold tracking-wide text-stone-500">Discussão acadêmica automática (Gemini 2.0 Flash)</p>
                      </div>
                    </div>

                    <div className="prose prose-invert max-w-none">
                      <div className="bg-white/[0.03] p-8 rounded-xl border border-white/5 shadow-inner">
                        <div className="text-stone-300 leading-relaxed space-y-4 whitespace-pre-wrap font-medium">
                          {premiumAnalysis.scientific_report}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-8 flex justify-end">
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(premiumAnalysis.scientific_report)
                          setApaCopied('Relatório IA')
                          setTimeout(() => setApaCopied(null), 2000)
                        }}
                        className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-semibold tracking-wide text-stone-400 hover:text-white transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-rounded text-sm">content_copy</span>
                        {apaCopied === 'Relatório IA' ? 'Copiado!' : 'Copiar Discussão'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Super-Resumo Card */}
              <div className="lg:col-span-12 p-1 rounded-xl bg-white/5 overflow-hidden">
                <div className="glass-card rounded-[2.9rem] p-10 h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="material-symbols-rounded text-primary text-xl">auto_awesome</span>
                    <h3 className="text-sm font-semibold tracking-wide text-white">Super-Resumo de Evidência</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <p className="text-sm leading-relaxed text-stone-300 italic">
                        "{premiumAnalysis.summary?.interpretation || 'Aguardando processamento interpretativo...'}"
                      </p>
                      <div className="flex flex-wrap gap-4">
                        <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                          <p className="text-[9px] font-bold text-stone-500">Total de Evidências</p>
                          <p className="text-xl font-semibold text-white">{premiumAnalysis.results?.length || 0}</p>
                        </div>
                        <div className="px-4 py-2 bg-primary/10 rounded-2xl border border-primary/20">
                          <p className="text-[9px] font-bold text-primary">Sig. Alta</p>
                          <p className="text-xl font-semibold text-white">
                            {premiumAnalysis.results?.filter(r => r.p_value < 0.01).length || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-6 border border-white/5">
                      <h4 className="text-[10px] font-semibold tracking-wide text-stone-400 mb-4">Métricas de Confiabilidade</h4>
                      <div className="space-y-4">
                        {premiumAnalysis.summary?.evidence_strength && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className="text-stone-500">Força da Evidência</span>
                              <span className="text-primary">{Math.round(premiumAnalysis.summary.evidence_strength * 100)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${premiumAnalysis.summary.evidence_strength * 100}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                                className="h-full bg-primary"
                              />
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-stone-500 leading-relaxed">
                          A força da evidência é calculada com base na consistência dos p-valores e na magnitude dos tamanhos de efeito em todo o dataset.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Individual Premium Insights */}
              {premiumAnalysis.results?.map((r, idx) => (
                <div key={idx} className="lg:col-span-6 group">
                  <motion.div 
                    whileHover={{ y: -8 }}
                    className="glass-card rounded-xl p-8 h-full border border-white/5 hover:border-primary/30 transition-all flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <span className="material-symbols-rounded text-2xl">insights</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-semibold stat-p-value ${r.p_value < 0.05 ? 'stat-p-significant' : 'text-stone-600'}`}>
                          p = {r.p_value < 0.001 ? '<.001' : r.p_value.toFixed(4)}
                        </p>
                        <p className="text-[9px] font-semibold tracking-wide text-stone-500 mt-1">{r.label}</p>
                      </div>
                    </div>
                    
                    <h4 className="text-white font-semibold text-lg mb-4">{r.insight_label || 'Análise de Componente'}</h4>
                    <p className="text-xs text-stone-400 leading-relaxed mb-6 flex-1">
                      {r.interpretation}
                    </p>

                    <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5">
                          <span className="text-[9px] font-bold text-stone-500">Stat: </span>
                          <span className="text-[9px] font-semibold text-white font-mono">{r.statistic.toFixed(2)}</span>
                        </div>
                        <div className="px-3 py-1 bg-primary/5 rounded-full border border-primary/20">
                          <span className="text-[9px] font-bold text-primary">Ef: </span>
                          <span className="text-[9px] font-semibold text-white font-mono">{r.effect_size.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-stone-500 group-hover:text-primary transition-colors">
                        <span className="material-symbols-rounded text-sm">trending_up</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <ChartGeneratorModal
        isOpen={chartModal.open}
        onClose={() => setChartModal({ open: false, data: null, varName: '' })}
        chartData={chartModal.data}
        varName={chartModal.varName}
      />

      <AnimatePresence>
        {testExplanationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg"
            onClick={() => setTestExplanationModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md"
            >
              {(() => {
                const exp = getExplanation(testExplanationModal)
                if (!exp) return null
                return (
                  <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 shadow-2xl shadow-black/50">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-teal-500 to-cyan-500"></div>
                    
                    <div className="p-6 pb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400/20 to-teal-500/20 border border-teal-400/20 flex items-center justify-center">
                          <span className="material-symbols-rounded text-teal-300 text-2xl">science</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{exp.title}</h3>
                          <p className="text-xs text-stone-500 font-medium">Guia do Teste Estatístico</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6 space-y-4">
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <span className="material-symbols-rounded text-blue-400 text-xs">lightbulb</span>
                          </span>
                          <h4 className="text-xs font-bold text-blue-400 tracking-wider">O que é?</h4>
                        </div>
                        <p className="text-sm text-stone-300 leading-relaxed">{exp.what}</p>
                      </div>

                      <div className="p-4 rounded-2xl bg-teal-400/5 border border-teal-400/10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-lg bg-teal-400/20 flex items-center justify-center">
                            <span className="material-symbols-rounded text-teal-300 text-xs">check_circle</span>
                          </span>
                          <h4 className="text-xs font-bold text-teal-300 tracking-wider">Quando usar</h4>
                        </div>
                        <p className="text-sm text-stone-300 leading-relaxed">{exp.when}</p>
                      </div>

                      <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <span className="material-symbols-rounded text-purple-400 text-xs">help</span>
                          </span>
                          <h4 className="text-xs font-bold text-purple-400 tracking-wider">Exemplo</h4>
                        </div>
                        <p className="text-sm text-stone-300 leading-relaxed">{exp.example}</p>
                      </div>

                      <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <span className="material-symbols-rounded text-amber-400 text-xs">info</span>
                          </span>
                          <h4 className="text-xs font-bold text-amber-400 tracking-wider">Pressupostos</h4>
                        </div>
                        <p className="text-sm text-stone-400 leading-relaxed">{exp.assumption}</p>
                      </div>
                    </div>

                    <div className="px-6 pb-6">
                      <button
                        onClick={() => setTestExplanationModal(null)}
                        className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-rounded text-lg">close</span>
                        Entendi!
                      </button>
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDetailModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{detailModal.testLabel}</h3>
                <button onClick={() => setDetailModal(null)} className="text-stone-500 hover:text-white transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {detailModal.interpretation && (
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <p className="text-[10px] font-semibold tracking-wider text-primary mb-2 flex items-center gap-2">
                      <span className="material-symbols-rounded text-sm">auto_awesome</span> Interpretação
                    </p>
                    <p className="text-xs leading-relaxed text-stone-300">{detailModal.interpretation}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-1">Estatística</p>
                    <p className="text-lg font-semibold text-white font-mono">{detailModal.statistic != null ? detailModal.statistic : '—'}</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-1"><StatTooltip term="p-valor">P-valor</StatTooltip></p>
                    <p className={`text-lg font-semibold font-mono ${detailModal.p_value != null && detailModal.p_value < 0.05 ? 'text-primary' : 'text-stone-400'}`}>
                      {detailModal.p_value != null ? (detailModal.p_value < 0.001 ? '<0.001' : detailModal.p_value.toFixed(4)) : '—'}
                    </p>
                  </div>
                </div>

                {detailModal.effect_size && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-2"><StatTooltip term="effect_size">Tamanho do Efeito</StatTooltip></p>
                    <div className="space-y-1">
                      {detailModal.effect_size.cohens_d != null && (
                        <p className="text-xs text-stone-300"><StatTooltip term="cohens_d">d de Cohen</StatTooltip>: <span className="font-bold text-white">{detailModal.effect_size.cohens_d}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.eta_squared != null && (
                        <p className="text-xs text-stone-300"><StatTooltip term="eta_squared">Eta²</StatTooltip>: <span className="font-bold text-white">{detailModal.effect_size.eta_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.r_squared != null && (
                        <p className="text-xs text-stone-300"><StatTooltip term="r_squared">R²</StatTooltip>: <span className="font-bold text-white">{detailModal.effect_size.r_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.cramers_v != null && (
                        <p className="text-xs text-stone-300"><StatTooltip term="cramers_v">V de Cramer</StatTooltip>: <span className="font-bold text-white">{detailModal.effect_size.cramers_v}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.achieved_power != null && (
                        <p className={`text-xs font-bold ${detailModal.effect_size.achieved_power >= 0.8 ? 'text-teal-300' : 'text-stone-400'}`}>
                          <StatTooltip term="power">Poder estatístico</StatTooltip>: {(detailModal.effect_size.achieved_power * 100).toFixed(0)}%
                          {detailModal.effect_size.achieved_power < 0.8 && ' ⚠ Abaixo do ideal (80%)'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {detailModal.ci && (
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-1"><StatTooltip term="ic95">Intervalo de Confiança 95%</StatTooltip></p>
                    <p className="text-xs text-stone-300 font-mono">[{detailModal.ci.ci_lower}, {detailModal.ci.ci_upper}] (SE={detailModal.ci.se})</p>
                  </div>
                )}

                {detailModal.odds_ratio && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-2"><StatTooltip term="odds_ratio">Odds Ratio & Risk Ratio</StatTooltip></p>
                    <div className="space-y-1">
                      <p className="text-xs text-stone-300">OR: <span className="font-bold text-white">{detailModal.odds_ratio.odds_ratio}</span> (IC95%: {detailModal.odds_ratio.or_ci_95})</p>
                      {detailModal.odds_ratio.risk_ratio != null && (
                        <p className="text-xs text-stone-300">RR: <span className="font-bold text-white">{detailModal.odds_ratio.risk_ratio}</span> (IC95%: {detailModal.odds_ratio.rr_ci_95})</p>
                      )}
                      <p className="text-xs text-primary font-bold">{detailModal.odds_ratio.interpretation}</p>
                    </div>
                  </div>
                )}

                {detailModal.logistic_regression && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-3">Regressão Logística</p>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-stone-500 font-bold">Acurácia</p>
                        <p className="text-lg font-semibold text-primary">{detailModal.logistic_regression.accuracy}%</p>
                      </div>
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-stone-500 font-bold">Pseudo-R²</p>
                        <p className="text-lg font-semibold text-white">{detailModal.logistic_regression.pseudo_r2}</p>
                      </div>
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-stone-500 font-bold">N</p>
                        <p className="text-lg font-semibold text-white">{detailModal.logistic_regression.n_observations}</p>
                      </div>
                    </div>
                    {detailModal.logistic_regression.predictors && detailModal.logistic_regression.predictors.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-stone-500 mb-2">Preditores</p>
                        <div className="space-y-1">
                          {detailModal.logistic_regression.predictors.map((p, pi) => (
                            <div key={pi} className={`flex items-center justify-between text-xs p-2 rounded-lg ${p.significant ? 'bg-primary/10 border border-primary/20' : 'bg-white/3'}`}>
                              <span className="text-stone-300 font-medium">{p.predictor}</span>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-stone-400">OR={p.odds_ratio}</span>
                                <span className="font-mono text-stone-400">p={p.p_value < 0.001 ? '<0.001' : p.p_value.toFixed(4)}</span>
                                <span className={`text-[10px] font-semibold ${p.significant ? 'text-primary' : 'text-stone-600'}`}>{p.significant ? '✦ SIG' : 'ns'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {detailModal.contingency_table && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-3">Tabela de Contingência</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-stone-500 border-b border-white/5">
                            <th className="text-left pb-2 font-semibold"></th>
                            {detailModal.contingency_table[0] && Object.keys(detailModal.contingency_table[0]).filter(k => k !== 'row_label' && k !== 'total' && k !== 'total_pct').map(k => (
                              <th key={k} className="text-right pb-2 font-semibold">{k}</th>
                            ))}
                            <th className="text-right pb-2 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailModal.contingency_table.map((row, ri) => (
                            <tr key={ri} className="border-b border-white/5">
                              <td className="py-2 font-bold text-white">{row.row_label}</td>
                              {Object.entries(row).filter(([k]) => k !== 'row_label' && k !== 'total' && k !== 'total_pct').map(([k, v]) => (
                                <td key={k} className="py-2 text-right font-mono text-stone-300">{v.count} ({v.pct})</td>
                              ))}
                              <td className="py-2 text-right font-mono text-white">{row.total} ({row.total_pct})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detailModal.post_hoc && detailModal.post_hoc.comparisons && detailModal.post_hoc.comparisons.length > 0 && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-2"><StatTooltip term="post_hoc">Testes Post-Hoc ({detailModal.post_hoc.method})</StatTooltip></p>
                    <p className="text-[9px] text-stone-500 mb-2">α ajustado = {detailModal.post_hoc.alpha_adjustado} ({detailModal.post_hoc.n_comparisons} comparações)</p>
                    <div className="space-y-1">
                      {detailModal.post_hoc.comparisons.map((c, ci) => (
                        <div key={ci} className={`flex items-center justify-between text-xs p-2 rounded-lg ${c.significant ? 'bg-primary/10 border border-primary/20' : 'bg-white/3'}`}>
                          <span className="text-stone-300 font-medium">{c.comparison}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-stone-400">p={c.p_value_bonferroni < 0.001 ? '<0.001' : c.p_value_bonferroni.toFixed(4)}</span>
                            {c.cohens_d != null && <span className="text-[9px] text-stone-500">d={c.cohens_d}</span>}
                            <span className={`text-[10px] font-semibold ${c.significant ? 'text-primary' : 'text-stone-600'}`}>{c.significant ? '✦ SIG' : 'ns'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailModal.assumptions && detailModal.assumptions.length > 0 && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-2">Verificação de Pressupostos</p>
                    <div className="space-y-2">
                      {detailModal.assumptions.map((a, ai) => (
                        <div key={ai} className={`p-3 rounded-lg border ${a.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                          <p className={`text-xs font-bold mb-1 ${a.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                            {a.severity === 'warning' ? '⚠ Atenção' : 'ℹ Informação'}
                          </p>
                          <p className="text-[11px] text-stone-300">{a.message}</p>
                          {a.recommendation && <p className="text-[10px] text-primary mt-1 font-bold">→ Sugestão: {a.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailModal.group_stats && detailModal.group_stats.length > 0 && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[9px] font-bold text-stone-500 mb-3">Estatísticas por Grupo</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-stone-500 border-b border-white/5">
                            <th className="text-left pb-2 font-semibold">Grupo</th>
                            <th className="text-right pb-2 font-semibold">N</th>
                            <th className="text-right pb-2 font-semibold"><StatTooltip term="mediana">Mediana</StatTooltip></th>
                            <th className="text-right pb-2 font-semibold">Média ± DP</th>
                            <th className="text-right pb-2 font-semibold"><StatTooltip term="iqr">IQR</StatTooltip></th>
                            <th className="text-right pb-2 font-semibold"><StatTooltip term="ic95">IC95%</StatTooltip></th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailModal.group_stats.map((g, gi) => (
                            <tr key={gi} className="border-b border-white/5">
                              <td className="py-2 font-bold text-white">{g.group}</td>
                              <td className="py-2 text-right text-stone-400">{g.n} {g.pct_of_total && <span className="text-stone-600">({g.pct_of_total})</span>}</td>
                              <td className="py-2 text-right font-mono text-white">{g.median}</td>
                              <td className="py-2 text-right font-mono text-stone-300">{g.mean} ± {g.std}</td>
                              <td className="py-2 text-right font-mono text-stone-400">{g.iqr}</td>
                              <td className="py-2 text-right font-mono text-stone-400">{g.ci_95 ? `[${g.ci_95.ci_lower}, ${g.ci_95.ci_upper}]` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Como Usar? ─────────────────────────────────────── */}
      <AnimatePresence>
        {howToModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setHowToModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-violet-500/20"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-violet-500/5">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-rounded text-violet-400 text-xl">help_center</span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Como Interpretar os Resultados</h3>
                    <p className="text-[10px] text-stone-500">Guia rápido para pesquisadores sem formação estatística</p>
                  </div>
                </div>
                <button onClick={() => setHowToModal(false)} className="text-stone-500 hover:text-white transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              <div className="p-6 space-y-5">
                {[
                  {
                    icon: 'crisis_alert', color: 'text-primary', bg: 'bg-primary/10 border-primary/20',
                    title: 'P-valor (Valor P)',
                    body: 'O p-valor indicada a probabilidade de obter esses resultados por acaso. Valores abaixo de 0,05 (5%) são considerados "estatisticamente significativos" — significa que a diferença ou relação encontrada dificilmente é por acaso.',
                    tip: '✦ = p < 0,05 (sig.) | ✦✦ = p < 0,01 | ✦✦✦ = p < 0,001 | ns = não significativo'
                  },
                  {
                    icon: 'straighten', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',
                    title: 'Tamanho do Efeito',
                    body: 'Mesmo um resultado significativo pode ter pouca importância prática. O tamanho do efeito mede a magnitude real da diferença ou correlação. Sempre analise junto com o p-valor.',
                    tip: 'd de Cohen: Pequeno ≥ 0.2 | Médio ≥ 0.5 | Grande ≥ 0.8  |  R²: Fraco ≥ 0.09 | Moderado ≥ 0.36 | Forte ≥ 0.64'
                  },
                  {
                    icon: 'target', color: 'text-teal-300', bg: 'bg-teal-400/10 border-teal-400/20',
                    title: 'Intervalo de Confiança 95% (IC95%)',
                    body: 'O IC95% mostra o intervalo onde o valor verdadeiro provavelmente está (95% de confiança). Se o IC inclui o 0 (para diferenças) ou o 1 (para OR), o resultado não é significativo.',
                    tip: 'IC95% que não inclui o 0 → suporta a significância do resultado'
                  },
                  {
                    icon: 'electric_bolt', color: 'text-stone-400', bg: 'bg-stone-500/10 border-stone-500/20',
                    title: 'Poder Estatístico',
                    body: 'O poder mede a capacidade do estudo de detectar um efeito real se ele existir. Estudos com poder < 80% têm alto risco de falsos negativos (não detectar diferenças que existem).',
                    tip: 'Poder ≥ 80% (verde) = adequado | Poder < 80% (vermelho) = amostra insuficiente'
                  },
                  {
                    icon: 'format_quote', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20',
                    title: 'Botão APA (citação automática)',
                    body: 'Cada resultado tem um botão com aspas (＂) na última coluna. Clique para copiar a citação formatada em APA-7, pronta para colar no seu TCC, artigo ou relatório.',
                    tip: 'Exemplo: Teste t pareado (N = 45): estatística = 2.341, p = .024, d = 0.58.'
                  },
                  {
                    icon: 'auto_awesome', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20',
                    title: 'Interpretação Automática',
                    body: 'Cada resultado vem com uma interpretação em português simples, gerada automaticamente. Ela aparece diretamente na tabela, abaixo do nome do teste. Clique em "Detalhes" para a versão completa.',
                    tip: 'As interpretações são baseadas nos valores estatísticos reais calculados pelo motor Pingouin.'
                  },
                ].map((item, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border ${item.bg}`}>
                    <p className={`text-[10px] font-semibold tracking-wider ${item.color} mb-2 flex items-center gap-2`}>
                      <span className="material-symbols-rounded text-sm">{item.icon}</span>
                      {item.title}
                    </p>
                    <p className="text-xs text-stone-300 leading-relaxed mb-2">{item.body}</p>
                    <p className="text-[9px] font-mono text-stone-500 bg-black/20 px-2 py-1 rounded-lg">{item.tip}</p>
                  </div>
                ))}
                <div className="p-4 bg-white/3 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-stone-500">Dúvidas? Clique em <strong className="text-primary">Detalhes</strong> em qualquer resultado para ver a interpretação completa, pressupostos verificados e estatísticas avançadas.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showReview && results.length === 0 && !fileData && (
        <>
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                  <span className="material-symbols-rounded text-primary">insights</span>
                  Suas Métricas
                </h2>
                <p className="text-stone-500 text-xs mt-1 font-medium">Atividade da sua conta na plataforma</p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Análises Realizadas', value: history.length || 0, icon: 'analytics', color: 'primary', sub: history.length === 1 ? '1 arquivo processado' : `${history.length} arquivos processados` },
                { label: 'Ensaios Clínicos', value: trials.length || 0, icon: 'biotech', color: 'accent', sub: 'cadastrados na plataforma' },
                { label: 'Testes Disponíveis', value: STATISTICAL_TESTS.length, icon: 'model_training', color: 'primary', sub: 'métodos estatísticos' },
                { label: 'Engine', value: 'Pingouin', icon: 'memory', color: 'accent', sub: 'scipy fallback integrado' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-card rounded-xl p-5 stat-card group hover:border-primary/20 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color === 'primary' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'} group-hover:scale-110 transition-transform`}>
                      <span className="material-symbols-rounded text-lg">{stat.icon}</span>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="text-[9px] font-bold text-stone-500 tracking-wide mt-1">{stat.label}</p>
                  <p className="text-[9px] text-stone-600 mt-0.5">{stat.sub}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-2"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                <span className="material-symbols-rounded text-primary">model_training</span>
                Capacidades Analíticas
              </h2>
              <p className="text-stone-500 text-xs mt-1 font-medium">Faça upload de um arquivo para o sistema detectar e executar automaticamente os testes mais adequados</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ANALYSIS_CATEGORIES.map((cat, ci) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: ci * 0.07 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setTestExplanationModal(cat.tests[0])}
                  className="glass-card rounded-2xl p-5 border border-white/5 hover:border-primary/20 transition-all group cursor-pointer"
                >
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white/5 group-hover:bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                    <span className="material-symbols-rounded text-[10px] text-primary">info</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      cat.color === 'primary' ? 'bg-primary/10 text-primary group-hover:bg-primary/20' : 'bg-accent/10 text-accent group-hover:bg-accent/20'
                    } transition-colors`}>
                      <span className="material-symbols-rounded text-sm">{cat.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white group-hover:text-primary transition-colors">{cat.title}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 leading-relaxed mb-3">{cat.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.tests.map(t => (
                      <span key={t} className="text-[9px] px-2 py-0.5 bg-white/5 border border-white/5 rounded-full text-stone-400 font-medium">{t}</span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                  <span className="material-symbols-rounded text-primary">model_training</span>
                  Análises Estatísticas Disponíveis
                </h2>
                <p className="text-stone-500 text-xs mt-1 font-medium">Todas as opções de testes e modelos estatísticos suportados pela plataforma</p>
              </div>
            </div>

            {['Paramétrico', 'Não-Paramétrico', 'Categórico', 'Correlação', 'Regressão', 'Normalidade', 'Sobrevivência', 'Metanálise', 'Post-hoc', 'Poder'].map((category) => (
              <div key={category} className="mb-6">
                <h3 className="text-[10px] font-semibold tracking-wide text-primary mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full"></span>
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {STATISTICAL_TESTS.filter(t => t.category === category).map((test, i) => (
                    <motion.div
                      key={test.name}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2, scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setTestExplanationModal(test.name)}
                      className="glass-card rounded-2xl p-4 cursor-pointer group hover:border-primary/20 transition-all analysis-grid-item relative"
                    >
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/5 group-hover:bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <span className="material-symbols-rounded text-[10px] text-primary">info</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center text-primary/70 group-hover:text-primary group-hover:bg-primary/10 transition-all shrink-0">
                          <span className="material-symbols-rounded text-sm">{test.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">{test.name}</p>
                          <p className="text-[10px] text-stone-500 mt-0.5 leading-relaxed line-clamp-2">{test.desc}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.section>
        </>
      )}
    </div>
  )
}
