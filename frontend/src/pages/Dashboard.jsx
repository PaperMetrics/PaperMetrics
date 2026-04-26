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
    what: 'Verifica se existe associação entre duas variáveis categóricas. Ele compara as frequências que você observou nos dados com as frequências que seriam esperadas se não houvesse nenhuma relação entre as variáveis.',
    when: 'Quando você tem duas variáveis em categorias (ex: grupo de tratamento vs desfecho) e quer saber se elas estão relacionadas. Exige que cada célula da tabela tenha pelo menos 5 observações esperadas.',
    example: 'Investigar se existe associação entre tabagismo (sim/não) e desenvolvimento de DPOC (sim/não) em uma coorte de 200 pacientes.',
    assumption: 'Frequências esperadas >= 5 em todas as células. Observações independentes. Se alguma célula tiver esperado < 5, use o Teste Exato de Fisher.'
  },
  'Teste Exato de Fisher': {
    title: 'Teste Exato de Fisher',
    what: 'Calcula a probabilidade exata de observar a distribuição dos dados em uma tabela de contingência. É a alternativa ao Qui-Quadrado quando a amostra é pequena ou as células têm contagens baixas.',
    when: 'Quando o Qui-Quadrado não é confiável: amostras pequenas (N < 20), tabelas 2x2 com células com valores esperados < 5, ou grupos muito desbalanceados.',
    example: 'Comparar taxa de eventos adversos graves entre droga experimental (n=8) e placebo (n=12) em um estudo piloto de fase I.',
    assumption: 'Não exige tamanho mínimo de amostra. Funciona para qualquer tabela de contingência, mas é computacionalmente ideal para tabelas 2x2.'
  },
  'Teste t de Student (pareado)': {
    title: 'Teste t Pareado',
    what: 'Compara as médias de duas medições feitas nos mesmos indivíduos. Calcula a diferença para cada par e testa se a média dessas diferenças é significativamente diferente de zero.',
    when: 'Quando você mede a mesma variável nos mesmos pacientes em dois momentos diferentes (antes/depois) ou em duas condições pareadas.',
    example: 'Avaliar se um anti-hipertensivo reduz a pressão arterial sistólica comparando as medidas pré e pós-tratamento nos mesmos 40 pacientes.',
    assumption: 'As diferenças entre os pares devem ter distribuição aproximadamente normal. Para N > 30, o teste é robusto mesmo com desvios da normalidade.'
  },
  'Teste t de Student (independente)': {
    title: 'Teste t Independente',
    what: 'Compara as médias de dois grupos formados por indivíduos diferentes. Avalia se a diferença observada entre os grupos é grande o suficiente para não ser explicada apenas pelo acaso.',
    when: 'Quando você quer comparar uma variável contínua entre dois grupos independentes (ex: tratamento vs controle com pacientes diferentes em cada grupo).',
    example: 'Comparar o nível médio de hemoglobina glicada (HbA1c) entre pacientes diabéticos tratados com metformina vs glibenclamida.',
    assumption: 'Dados com distribuição normal em cada grupo. Variâncias semelhantes entre os grupos (se diferentes, use a correção de Welch, aplicada automaticamente).'
  },
  'ANOVA One-Way': {
    title: 'ANOVA One-Way',
    what: 'Extensão do teste t para 3 ou mais grupos. Testa se pelo menos um grupo tem média significativamente diferente dos demais. Se o resultado for significativo, use um teste post-hoc (Tukey ou Bonferroni) para identificar quais pares diferem.',
    when: 'Quando você quer comparar médias de 3+ grupos independentes ao mesmo tempo. Usar múltiplos testes t inflaria o erro tipo I.',
    example: 'Comparar a eficácia de 3 protocolos de fisioterapia (A, B, C) medindo a amplitude de movimento do joelho após 8 semanas.',
    assumption: 'Normalidade em cada grupo. Variâncias homogêneas (teste de Levene). Se violados, considere Kruskal-Wallis.'
  },
  'ANOVA Two-Way': {
    title: 'ANOVA Two-Way',
    what: 'Analisa o efeito de dois fatores simultaneamente sobre uma variável contínua. Além dos efeitos principais de cada fator, detecta se existe interação entre eles (o efeito de um fator depende do nível do outro).',
    when: 'Quando você tem dois fatores categóricos (ex: tipo de tratamento e sexo) e quer saber se ambos influenciam o desfecho e se interagem entre si.',
    example: 'Investigar se o efeito de um analgésico (droga A vs B) sobre a escala de dor varia conforme o sexo do paciente (interação tratamento x sexo).',
    assumption: 'Normalidade, homogeneidade de variâncias e independência das observações. Amostras equilibradas entre os grupos melhoram a robustez.'
  },
  'ANOVA com Medidas Repetidas': {
    title: 'ANOVA Medidas Repetidas',
    what: 'Compara médias quando os mesmos indivíduos são avaliados em 3 ou mais condições ou momentos diferentes. Controla a variabilidade individual, aumentando o poder estatístico.',
    when: 'Quando os mesmos pacientes são medidos repetidamente ao longo do tempo ou sob diferentes condições experimentais.',
    example: 'Acompanhar a glicemia de jejum de 30 pacientes diabéticos em 4 visitas trimestrais para avaliar a evolução ao longo de 1 ano de tratamento.',
    assumption: 'Normalidade das medidas. Esfericidade (variâncias das diferenças entre pares de condições devem ser iguais). Se esfericidade é violada, aplica-se correção de Greenhouse-Geisser automaticamente.'
  },
  'Teste de Tukey (Post-hoc)': {
    title: 'Teste de Tukey (HSD)',
    what: 'Após uma ANOVA significativa, compara todas as combinações possíveis de pares de grupos para identificar exatamente onde estão as diferenças. Controla o erro tipo I global.',
    when: 'Sempre após uma ANOVA significativa, quando você precisa saber quais grupos específicos diferem entre si. É o post-hoc mais usado quando os tamanhos dos grupos são iguais ou similares.',
    example: 'A ANOVA mostrou diferença entre 4 doses de um fármaco. O Tukey revela que apenas a dose alta difere significativamente do placebo (p=0.003) e da dose baixa (p=0.01).',
    assumption: 'Aplicado somente após ANOVA significativa. Pressupõe variâncias homogêneas e tamanhos de grupo similares. Para grupos desiguais, considere Games-Howell.'
  },
  'Teste de Bonferroni': {
    title: 'Correção de Bonferroni',
    what: 'Ajusta o nível de significância dividindo-o pelo número de comparações realizadas. É a abordagem mais conservadora para evitar falsos positivos em comparações múltiplas.',
    when: 'Quando você realiza muitas comparações simultâneas e quer garantir que o risco global de falso positivo não ultrapasse 5%. Útil quando o número de comparações é pequeno.',
    example: 'Ao comparar 4 grupos dois a dois (6 comparações), o nível de significância ajustado passa de 0.05 para 0.05/6 = 0.0083 por comparação.',
    assumption: 'Pode ser aplicado a qualquer tipo de teste. Porém, com muitas comparações torna-se excessivamente conservador, aumentando o risco de falso negativo.'
  },
  'Teste de Kruskal-Wallis': {
    title: 'Teste de Kruskal-Wallis',
    what: 'Alternativa não-paramétrica à ANOVA One-Way. Em vez de comparar médias, compara as distribuições (ranks) de 3 ou mais grupos. Não exige que os dados sigam distribuição normal.',
    when: 'Quando os dados são ordinais, têm distribuição não-normal, apresentam outliers importantes, ou os tamanhos dos grupos são muito diferentes.',
    example: 'Comparar escores de qualidade de vida (escala ordinal 0-100) entre pacientes tratados com 3 esquemas quimioterápicos diferentes.',
    assumption: 'Observações independentes. As distribuições dos grupos devem ter formato semelhante (mesmo que não sejam normais). Se significativo, use Dunn como post-hoc.'
  },
  'Teste de Mann-Whitney U': {
    title: 'Teste de Mann-Whitney U',
    what: 'Alternativa não-paramétrica ao teste t independente. Compara as distribuições de dois grupos independentes usando ranks em vez de médias. Robusto a outliers e dados não-normais.',
    when: 'Quando os dados não seguem distribuição normal, são ordinais (escalas de Likert, escores), ou quando os grupos têm tamanhos muito diferentes.',
    example: 'Comparar escores de dor (EVA 0-10) entre dois grupos de pacientes pós-cirúrgicos que receberam analgésicos diferentes.',
    assumption: 'Observações independentes entre os grupos. As distribuições devem ter formato semelhante. Não exige normalidade nem variâncias iguais.'
  },
  'Teste de Wilcoxon': {
    title: 'Teste de Wilcoxon (Postos Sinalizados)',
    what: 'Alternativa não-paramétrica ao teste t pareado. Compara duas medições nos mesmos indivíduos usando os ranks das diferenças, sem exigir normalidade.',
    when: 'Quando você tem dados pareados (antes/depois) que não seguem distribuição normal ou são medidos em escala ordinal.',
    example: 'Avaliar se um programa de reabilitação melhora o escore funcional (escala ordinal) de pacientes com AVC, comparando medidas pré e pós-intervenção.',
    assumption: 'Os dados devem ser pareados. As diferenças devem ser simétricas em relação à mediana. Não exige normalidade.'
  },
  'Teste de Friedman': {
    title: 'Teste de Friedman',
    what: 'Alternativa não-paramétrica à ANOVA de medidas repetidas. Compara 3 ou mais condições medidas nos mesmos indivíduos usando ranks. Ideal para dados ordinais ou não-normais.',
    when: 'Quando os mesmos sujeitos são avaliados em 3+ condições ou momentos, e os dados não cumprem pressupostos paramétricos.',
    example: 'Avaliar a intensidade de náusea (escala 0-10) em pacientes oncológicos em 4 ciclos diferentes de quimioterapia.',
    assumption: 'Dados pareados/repetidos. Os dados podem ser ordinais. Não exige normalidade. Se significativo, use Nemenyi ou Dunn como post-hoc.'
  },
  'Teste de Spearman': {
    title: 'Correlação de Spearman (rho)',
    what: 'Mede a força e direção da associação monotônica entre duas variáveis usando ranks. Detecta relações não-lineares, desde que sejam consistentemente crescentes ou decrescentes.',
    when: 'Quando pelo menos uma variável é ordinal, os dados não são normais, há outliers, ou a relação entre as variáveis não é estritamente linear.',
    example: 'Investigar se existe correlação entre o nível de escolaridade (ordinal: fundamental, médio, superior) e a adesão ao tratamento (escala 0-100).',
    assumption: 'Relação monotônica entre as variáveis. Não exige normalidade. Mais robusto a outliers que Pearson.'
  },
  'Correlação de Pearson': {
    title: 'Correlação de Pearson (r)',
    what: 'Mede a força e a direção da relação linear entre duas variáveis contínuas. O coeficiente r varia de -1 (correlação negativa perfeita) a +1 (positiva perfeita). Zero indica ausência de relação linear.',
    when: 'Quando ambas as variáveis são contínuas, normalmente distribuídas, e você espera uma relação linear entre elas.',
    example: 'Investigar a correlação entre IMC e pressão arterial sistólica em 150 adultos saudáveis.',
    assumption: 'Ambas variáveis contínuas e normais. Relação linear. Sensível a outliers (considere Spearman se houver pontos extremos).'
  },
  'Regressão Linear Simples': {
    title: 'Regressão Linear Simples',
    what: 'Cria um modelo matemático que descreve como uma variável (preditora) influencia outra (desfecho). Gera uma equação da reta que permite prever valores e quantificar o efeito.',
    when: 'Quando você quer prever uma variável contínua com base em uma única variável preditora, e a relação entre elas é aproximadamente linear.',
    example: 'Modelar como a idade do paciente prediz o tempo de internação após cirurgia cardíaca. A cada 10 anos de idade, o tempo aumenta em X dias.',
    assumption: 'Linearidade da relação. Resíduos com distribuição normal e variância constante (homocedasticidade). Independência das observações.'
  },
  'Regressão Linear Múltipla': {
    title: 'Regressão Linear Múltipla',
    what: 'Extensão da regressão simples que modela o efeito simultâneo de múltiplas variáveis preditoras sobre um desfecho contínuo. Permite isolar o efeito de cada preditor controlando pelos demais.',
    when: 'Quando múltiplos fatores podem influenciar o desfecho e você quer entender a contribuição independente de cada um.',
    example: 'Prever a pressão arterial sistólica a partir de idade, IMC, consumo de sódio e nível de atividade física, estimando o efeito isolado de cada fator.',
    assumption: 'Mesmos da regressão simples, mais ausência de multicolinearidade (preditores não devem ser altamente correlacionados entre si). Verificar VIF < 5.'
  },
  'Regressão Logística': {
    title: 'Regressão Logística',
    what: 'Modelo para prever a probabilidade de um desfecho binário (sim/não, vivo/óbito). Calcula odds ratios que quantificam quanto cada fator aumenta ou diminui a chance do evento.',
    when: 'Quando o desfecho é dicotômico (duas categorias) e você quer identificar fatores de risco ou proteção.',
    example: 'Identificar fatores associados à readmissão hospitalar em 30 dias (sim/não) considerando idade, comorbidades e tempo de internação.',
    assumption: 'Desfecho binário. Observações independentes. Amostra suficiente (pelo menos 10-20 eventos por variável preditora). Ausência de multicolinearidade.'
  },
  'Teste de Shapiro-Wilk': {
    title: 'Teste de Shapiro-Wilk',
    what: 'Verifica se os dados seguem distribuição normal, um pressuposto de muitos testes paramétricos. É o teste de normalidade mais potente para amostras pequenas a moderadas.',
    when: 'Antes de aplicar testes paramétricos (teste t, ANOVA) para verificar se o pressuposto de normalidade é atendido. Especialmente importante para N < 50.',
    example: 'Antes de usar ANOVA para comparar 3 grupos, testar se os dados de cada grupo seguem distribuição normal. Se p > 0.05, a normalidade é aceita.',
    assumption: 'Mais confiável para N < 50. Para amostras maiores, considere Kolmogorov-Smirnov ou métodos gráficos (Q-Q plot).'
  },
  'Teste de Kolmogorov-Smirnov': {
    title: 'Teste de Kolmogorov-Smirnov',
    what: 'Compara a distribuição dos dados com uma distribuição teórica (geralmente a normal). Mede a maior distância entre a distribuição acumulada dos dados e a teórica.',
    when: 'Para verificar normalidade em amostras grandes (N > 50), onde o Shapiro-Wilk perde poder. Também pode comparar dois conjuntos de dados entre si.',
    example: 'Verificar se os valores de creatinina sérica de 500 pacientes seguem distribuição normal antes de calcular intervalos de referência.',
    assumption: 'Tende a ser conservador (dificilmente rejeita normalidade em amostras pequenas). Para N < 50, prefira Shapiro-Wilk.'
  },
  'Teste de Levene': {
    title: 'Teste de Levene',
    what: 'Verifica se os grupos têm variâncias iguais (homocedasticidade), um pressuposto da ANOVA e do teste t. É mais robusto que o teste de Bartlett quando os dados não são perfeitamente normais.',
    when: 'Antes de aplicar ANOVA ou teste t para verificar homogeneidade de variâncias. Se violado, use a correção de Welch.',
    example: 'Antes de comparar glicemia entre 3 grupos, verificar se a variabilidade dos dados é semelhante em todos os grupos (p > 0.05 aceita igualdade).',
    assumption: 'Robusto a desvios da normalidade. Se p < 0.05, as variâncias são desiguais e você deve usar alternativas (Welch ANOVA, Games-Howell).'
  },
  'Análise de Sobrevivência (Kaplan-Meier)': {
    title: 'Kaplan-Meier',
    what: 'Estima a probabilidade de sobrevivência (ou de permanecer livre de evento) ao longo do tempo. Gera curvas de sobrevivência que mostram como a proporção de "sobreviventes" diminui com o tempo, considerando dados censurados.',
    when: 'Quando você tem dados de tempo-até-evento (tempo até óbito, recidiva, alta) e alguns pacientes não apresentaram o evento até o fim do acompanhamento (censura).',
    example: 'Estimar a sobrevida em 5 anos de pacientes com câncer de mama estágio II, representando graficamente a probabilidade de sobrevivência ao longo dos meses.',
    assumption: 'Censuras independentes do prognóstico. Os pacientes censurados devem ter o mesmo risco futuro que os que permanecem em observação.'
  },
  'Modelo de Cox (Riscos Proporcionais)': {
    title: 'Modelo de Cox',
    what: 'Regressão para dados de sobrevivência que estima como covariáveis (idade, tratamento, estágio) afetam o risco de um evento ocorrer ao longo do tempo. Produz hazard ratios que quantificam o efeito de cada fator.',
    when: 'Quando você quer identificar quais fatores influenciam o tempo até o evento, controlando por múltiplas covariáveis simultaneamente.',
    example: 'Avaliar se o tipo de tratamento (cirurgia vs quimioterapia) afeta a sobrevida de pacientes com câncer, controlando por idade, estágio e comorbidades.',
    assumption: 'Riscos proporcionais: o efeito de cada covariável deve ser constante ao longo do tempo. Verificar graficamente ou pelo teste de Schoenfeld.'
  },
  'Teste Log-Rank': {
    title: 'Teste Log-Rank',
    what: 'Compara as curvas de sobrevivência de dois ou mais grupos para determinar se há diferença estatisticamente significativa na sobrevivência entre eles.',
    when: 'Quando você quer comparar a sobrevida entre grupos (ex: tratamento A vs B) sem ajustar por covariáveis. É o "teste t" da análise de sobrevivência.',
    example: 'Comparar a sobrevida livre de progressão entre pacientes que receberam imunoterapia vs quimioterapia convencional em um ensaio clínico randomizado.',
    assumption: 'Riscos proporcionais entre os grupos. Censuras independentes e similares entre os grupos. Se os riscos não forem proporcionais, considere testes alternativos.'
  },
  'Metanálise (Efeito Fixo)': {
    title: 'Metanálise de Efeito Fixo',
    what: 'Combina os resultados de múltiplos estudos assumindo que todos estimam o mesmo efeito verdadeiro. As diferenças entre estudos são atribuídas apenas ao acaso amostral.',
    when: 'Quando os estudos incluídos são muito homogêneos: mesma população, mesma intervenção, mesmos desfechos. Verificar heterogeneidade com I² < 50%.',
    example: 'Combinar 8 ensaios clínicos randomizados que testaram a mesma dose de estatina na mesma população para estimar o efeito médio na redução do LDL.',
    assumption: 'Heterogeneidade baixa (I² < 50%, p do teste Q > 0.10). Se houver heterogeneidade significativa, use efeito aleatório.'
  },
  'Metanálise (Efeito Aleatório)': {
    title: 'Metanálise de Efeito Aleatório',
    what: 'Combina estudos considerando que cada um pode estimar um efeito ligeiramente diferente devido a variações reais na população, intervenção ou contexto. Produz intervalos de confiança mais amplos e conservadores.',
    when: 'Quando os estudos apresentam heterogeneidade significativa (I² > 50%) ou quando as populações, doses ou protocolos diferem entre estudos.',
    example: 'Combinar 15 estudos sobre exercício e depressão realizados em diferentes países, com protocolos variados de intensidade e duração.',
    assumption: 'Aceita heterogeneidade entre estudos. O modelo DerSimonian-Laird é o mais usado. Com poucos estudos (< 5), os intervalos podem ser imprecisos.'
  },
  'Funnel Plot / Viés de Publicação': {
    title: 'Funnel Plot',
    what: 'Gráfico em forma de funil que mapeia o tamanho do efeito vs o tamanho da amostra de cada estudo. Um funil simétrico sugere ausência de viés; assimetria indica que estudos com resultados negativos podem estar faltando.',
    when: 'Em toda metanálise, para investigar se os resultados podem estar inflados por viés de publicação (tendência de publicar apenas resultados positivos).',
    example: 'Ao revisar 20 estudos sobre um novo fármaco, o funnel plot revela assimetria: faltam estudos pequenos com resultados negativos, sugerindo viés de publicação.',
    assumption: 'Necessita de pelo menos 10 estudos para interpretação confiável. A assimetria pode ter outras causas além de viés (heterogeneidade real, diferenças metodológicas).'
  },
  'Cálculo de Poder Amostral': {
    title: 'Poder Amostral',
    what: 'Determina quantos participantes você precisa incluir no estudo para ter uma probabilidade aceitável (geralmente 80%) de detectar um efeito real, caso ele exista. Evita estudos subdimensionados que desperdiçam recursos.',
    when: 'Na fase de planejamento do estudo, antes de coletar dados. É obrigatório em protocolos de ensaios clínicos e altamente recomendado em qualquer pesquisa quantitativa.',
    example: 'Para detectar uma diferença de 5 mmHg na pressão arterial entre dois grupos (DP=10), com poder de 80% e alfa de 0.05, são necessários 64 pacientes por grupo.',
    assumption: 'Requer estimativas do tamanho de efeito esperado (de estudos piloto ou literatura), do nível de significância (alfa) e do poder desejado (1-beta).'
  },
  'Teste de McNemar': {
    title: 'Teste de McNemar',
    what: 'Compara proporções em dados pareados quando o desfecho é binário. Foca especificamente nos casos discordantes (onde o resultado mudou entre as duas medições) para testar se a mudança é significativa.',
    when: 'Quando os mesmos indivíduos são avaliados em dois momentos ou condições e o resultado é sim/não, positivo/negativo.',
    example: 'Avaliar se a taxa de positividade de um exame diagnóstico muda após treinamento dos operadores: comparar resultados pré e pós-treinamento nos mesmos 100 pacientes.',
    assumption: 'Dados pareados. Desfecho dicotômico. Amostra suficiente de pares discordantes (pelo menos 10).'
  },
  'Teste de Cochran Q': {
    title: 'Teste de Cochran Q',
    what: 'Extensão do teste de McNemar para 3 ou mais condições pareadas com desfecho binário. Testa se a proporção de "sucessos" difere entre as condições.',
    when: 'Quando os mesmos indivíduos são avaliados em 3+ momentos ou condições e o desfecho é dicotômico (sim/não).',
    example: 'Comparar a taxa de resposta clínica (respondedor sim/não) dos mesmos 80 pacientes tratados sequencialmente com 3 protocolos diferentes.',
    assumption: 'Dados pareados com desfecho dicotômico. Mesmo grupo de sujeitos em todas as condições. Se significativo, use McNemar pareado como post-hoc com correção de Bonferroni.'
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
    id: 'parametric', title: 'Paramétrico', icon: 'bar_chart', color: 'primary',
    desc: 'Para dados com distribuição normal — a base dos ensaios clínicos',
    tests: [
      { label: 'Teste t Independente', key: 'Teste t de Student (independente)' },
      { label: 'Teste t Pareado', key: 'Teste t de Student (pareado)' },
      { label: 'ANOVA One-Way', key: 'ANOVA One-Way' },
      { label: 'ANOVA Two-Way', key: 'ANOVA Two-Way' },
      { label: 'ANOVA Medidas Repetidas', key: 'ANOVA com Medidas Repetidas' },
    ]
  },
  {
    id: 'nonparametric', title: 'Não-Paramétrico', icon: 'swap_vert', color: 'primary',
    desc: 'Quando os dados não seguem distribuição normal — dados clínicos reais',
    tests: [
      { label: 'Kruskal-Wallis', key: 'Teste de Kruskal-Wallis' },
      { label: 'Mann-Whitney U', key: 'Teste de Mann-Whitney U' },
      { label: 'Wilcoxon', key: 'Teste de Wilcoxon' },
      { label: 'Friedman', key: 'Teste de Friedman' },
    ]
  },
  {
    id: 'categorical', title: 'Categórico', icon: 'category', color: 'primary',
    desc: 'Para variáveis como sexo, grupo de tratamento, desfecho binário',
    tests: [
      { label: 'Qui-Quadrado (χ²)', key: 'Teste Qui-Quadrado (χ²)' },
      { label: 'Teste Exato de Fisher', key: 'Teste Exato de Fisher' },
      { label: 'McNemar', key: 'Teste de McNemar' },
      { label: 'Cochran Q', key: 'Teste de Cochran Q' },
    ]
  },
  {
    id: 'correlation', title: 'Correlação', icon: 'scatter_plot', color: 'primary',
    desc: 'Mede a força e direção da relação entre duas variáveis',
    tests: [
      { label: 'Pearson (r)', key: 'Correlação de Pearson' },
      { label: 'Spearman (ρ)', key: 'Teste de Spearman' },
    ]
  },
  {
    id: 'regression', title: 'Regressão', icon: 'trending_up', color: 'primary',
    desc: 'Modelos preditivos com effect size, CI e poder estatístico automáticos',
    tests: [
      { label: 'Linear Simples', key: 'Regressão Linear Simples' },
      { label: 'Linear Múltipla', key: 'Regressão Linear Múltipla' },
      { label: 'Logística', key: 'Regressão Logística' },
    ]
  },
  {
    id: 'survival', title: 'Sobrevivência', icon: 'timeline', color: 'primary',
    desc: 'Análise de tempo-até-evento — padrão ouro em oncologia e cardiologia',
    tests: [
      { label: 'Kaplan-Meier', key: 'Análise de Sobrevivência (Kaplan-Meier)' },
      { label: 'Modelo de Cox', key: 'Modelo de Cox (Riscos Proporcionais)' },
      { label: 'Teste Log-Rank', key: 'Teste Log-Rank' },
    ]
  },
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
    return { label: 'Normalidade', bg: 'bg-stone-500/15', text: 'text-text-muted', border: 'border-stone-500/30' }
  }
  return { label: 'Teste', bg: 'bg-stone-700/40', text: 'text-text-muted', border: 'border-stone-600/30' }
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
  const [expandedCategory, setExpandedCategory] = useState(null)
  const fileInputRef = useRef(null)
  const premiumRef = useRef(null)
  // Passo 0.5 — revisão de domínios especializados (entre get-columns e OutcomeSelector)
  const [showDomainReview, setShowDomainReview] = useState(false)
  const [domainResolutions, setDomainResolutions] = useState([])
  const [bilateralWarnings, setBilateralWarnings] = useState([])
  const [confirmedTransformations, setConfirmedTransformations] = useState([])
  const [pendingColumnSamples, setPendingColumnSamples] = useState([])
  const [derivedCandidates, setDerivedCandidates] = useState([])

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
    if (es?.hedges_g != null) esText = `, g = ${es.hedges_g}`
    else if (es?.cohens_d != null)  esText = `, d = ${es.cohens_d}`
    else if (es?.rank_biserial_r != null) esText = `, r = ${es.rank_biserial_r}`
    else if (es?.partial_eta_squared != null) esText = `, η²p = ${es.partial_eta_squared}`
    else if (es?.epsilon_squared != null) esText = `, ε² = ${es.epsilon_squared}`
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
    const headers = { 'Authorization': `Bearer ${session?.token}` }
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

    const headers = { 'Authorization': `Bearer ${session?.token}` }
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
      // Guardar candidatos de variáveis derivadas vindos do backend
      if (colData.derived_candidates?.length) {
        setDerivedCandidates(colData.derived_candidates)
      } else {
        setDerivedCandidates([])
      }

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
          const detectedDomains = (resolveData.resolutions || []).filter(r => r.needs_attention || r.domain)
          const hasSpecialDomains = (
            detectedDomains.length > 0 ||
            (resolveData.bilateral_warnings || []).length > 0 ||
            (colData.derived_candidates || []).length > 0
          )
          if (hasSpecialDomains) {
            setDomainResolutions(resolveData.resolutions || [])
            setBilateralWarnings(resolveData.bilateral_warnings || [])
            setLoading(false)
            setShowDomainReview(true)
            return
          }
        }
      } catch (resolveErr) {
        console.warn('[DomainReview] resolve falhou, prosseguindo sem revisao:', resolveErr)
      }
      // ─────────────────────────────────────────────────────────────

      // Sem domínios especiais → ir direto ao OutcomeSelector
      // Ainda assim, garantir que variáveis derivadas (ex: Acuidade visual LogMAR) apareçam
      if (colData.derived_candidates?.length) {
        setColumnOptions(prev => addDerivedCandidatesToColumns(prev, colData.derived_candidates))
      }
      setShowOutcomeSelector(true)
    } catch (err) {
      alert(`Erro no upload: ${err.message}`);
    }
    setLoading(false)
  }

  // ============================================================
  // PASSO 0.5 → PASSO 0: Usuário confirmou domínios → OutcomeSelector
  // ============================================================
  
  // ── Helper: injeta derived_candidates na lista de colunas ──────────────
  const addDerivedCandidatesToColumns = useCallback((cols, candidates) => {
    if (!candidates || candidates.length === 0) return cols
    const existingNames = new Set(cols.map(c => c.name))
    const toAdd = candidates.filter(cand => !existingNames.has(cand.derived_name))
    if (toAdd.length === 0) return cols
    // Limpar 'suggested' das colunas atuais para dar destaque à derivada preferida
    const cleaned = cols.map(c => ({ ...c, suggested: false }))
    for (const cand of toAdd) {
      const isPreferred = cand.derived_name.toLowerCase().includes('acuidade visual') &&
                         cand.derived_name.toLowerCase().includes('logmar')
      cleaned.push({
        name: cand.derived_name,
        type: 'Numérico',
        unique_count: 0,
        sample: [cand.description || 'Variável derivada'],
        suggested: isPreferred,
        isDerived: true,
        derivedType: cand.type,
      })
    }
    return cleaned
  }, [])

  // Atualiza columnOptions com base nas transformações confirmadas
  const applyDomainTransformations = useCallback((originalColumns, transformations) => {
    const transformedCols = originalColumns.map(col => ({ ...col }))

    // Aplicar transformações de domínio se houver
    if (transformations && transformations.length > 0) {
      const tfMap = {}
      for (const tf of transformations) {
        tfMap[tf.column] = tf
      }

      for (const col of transformedCols) {
        const tf = tfMap[col.name]
        if (tf && tf.transformation && tf.transformation !== "none") {
          const domainInfo = tf.domain || tfMap[col.name]?.domain
          let newName = col.name
          let newType = col.type
          let isSuggested = col.suggested

          const tfUpper = tf.transformation.toUpperCase()

          if (domainInfo === "visual_acuity_snellen") {
            if (tf.transformation === "logmar") {
              newName = `${col.name} (LogMAR)`
              newType = "Numérico"
              isSuggested = true
            } else if (tf.transformation === "decimal") {
              newName = `${col.name} (Decimal)`
              newType = "Numérico"
              isSuggested = true
            }
          } else if (domainInfo === "intraocular_pressure" || domainInfo === "iop") {
            if (tf.transformation === "mmhg") {
              newName = `${col.name} (mmHg)`
              newType = "Numérico"
            }
          } else {
            newName = `${col.name} (${tfUpper})`
            newType = "Numérico"
          }

          col.name = newName
          col.type = newType
          col.suggested = isSuggested

          if (col.sample && col.sample.length > 0) {
            col.sample = [`${tfUpper} calculado`, ...col.sample.slice(0, 2)]
          }
        }
      }
    }

    // SEMPRE adicionar colunas derivadas — independente de haver transformações
    return addDerivedCandidatesToColumns(transformedCols, derivedCandidates)
  }, [derivedCandidates, addDerivedCandidatesToColumns])

  const handleDomainReviewConfirm = useCallback(async (choices, passedDerivedCandidates) => {
    console.log('[DEBUG] handleDomainReviewConfirm choices:', choices)
    console.log('[DEBUG] columnOptions antes:', columnOptions.map(c => c.name))
    setConfirmedTransformations(choices)

    // se o CDR passou candidatos derivados, sincronizar o state
    if (passedDerivedCandidates && passedDerivedCandidates.length > 0) {
      setDerivedCandidates(passedDerivedCandidates)
    }
    
    const updatedColumns = applyDomainTransformations(columnOptions, choices)
    console.log('[DEBUG] columnOptions depois:', updatedColumns.map(c => c.name))
    setColumnOptions(updatedColumns)
    
    setShowDomainReview(false)
    setShowOutcomeSelector(true)
  }, [columnOptions, applyDomainTransformations])

  const handleDomainReviewSkip = useCallback(() => {
    // Mesmo pulando a revisão, garantir que variáveis derivadas apareçam no OutcomeSelector
    if (derivedCandidates && derivedCandidates.length > 0) {
      setColumnOptions(prev => addDerivedCandidatesToColumns(prev, derivedCandidates))
    }
    setShowDomainReview(false)
    setShowOutcomeSelector(true)
  }, [derivedCandidates, addDerivedCandidatesToColumns])

  const handleTeachDomain = useCallback(async (payload) => {
    const headers = { 'Authorization': `Bearer ${session?.token}`, 'Content-Type': 'application/json' }
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

    const headers = { 'Authorization': `Bearer ${session?.token}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL
    setLoading(true)

    const formData = new FormData()
    formData.append('file', pendingFile)
    formData.append('outcome_col', outcomeCol)
    
    if (confirmedTransformations && confirmedTransformations.length > 0) {
      formData.append('domain_transformations', JSON.stringify(confirmedTransformations))
    }

    try {
      const protocolRes = await fetch(`${API_URL}/api/data/analyze-protocol`, {
        method: 'POST',
        headers,
        body: formData
      })
      if (!protocolRes.ok) {
        const errData = await protocolRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Erro no servidor: ${protocolRes.status}`);
      }

      const protocolData = await protocolRes.json()
      if (protocolData.protocol) {
        // ── Construir lista de opções de desfecho robusta ──────────────
        // 1. Todas as colunas atuais (incluindo derivadas adicionadas pelo ColumnDomainReview)
        const allVars = columnOptions.map(c => c.name)

        // 2. Incluir colunas derivadas de transformações confirmadas que podem não estar em columnOptions
        if (confirmedTransformations && confirmedTransformations.length > 0) {
          for (const tf of confirmedTransformations) {
            if (!tf.column || !tf.transformation || tf.transformation === 'none') continue
            const tfType = tf.transformation
            let derivedName = null
            if (tfType === 'logmar') derivedName = `${tf.column} (LogMAR)`
            else if (tfType === 'decimal') derivedName = `${tf.column} (Decimal)`
            else if (tfType === 'mmhg') derivedName = `${tf.column} (mmHg)`
            if (derivedName && !allVars.includes(derivedName)) allVars.push(derivedName)
          }
          // Adicionar coluna bilateral derivada se tiver pares OD/OE confirmados
          const hasAcuidade = allVars.some(v => v.toLowerCase().includes('acuidade visual'))
          if (!hasAcuidade) {
            const BILATERAL_RIGHT = ['od', 're', 'olho_direito', 'avod']
            const BILATERAL_LEFT  = ['oe', 'le', 'olho_esquerdo', 'avoe']
            const colsL = allVars.map(v => v.toLowerCase())
            const hasOD = colsL.some(c => BILATERAL_RIGHT.some(p => c === p || c.startsWith(p + ' ') || c.startsWith(p + '_')))
            const hasOE = colsL.some(c => BILATERAL_LEFT.some(p  => c === p || c.startsWith(p + ' ') || c.startsWith(p + '_')))
            if (hasOD && hasOE) allVars.push('Acuidade visual (LogMAR)')
          }
        }

        // 3. INCLUIR DERIVADAS de derived_candidates (FIX B: garante aparicao no Review)
        for (const cand of (derivedCandidates || [])) {
          if (cand.derived_name && !allVars.includes(cand.derived_name)) {
            allVars.push(cand.derived_name)
          }
        }

        // 4. Garantir que o outcome sugerido pelo backend esteja na lista
        if (protocolData.outcome && !allVars.includes(protocolData.outcome)) {
          allVars.push(protocolData.outcome)
        }
        // 5. Remover duplicatas mantendo ordem
        const uniqueVars = [...new Set(allVars)]

        setOutcomeOptions(uniqueVars)
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
      console.error("Erro no analyze-protocol:", err);
      alert(`Erro na análise: ${err.message}`);
    } finally {
      setLoading(false)
    }
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
    const headers = { 'Authorization': `Bearer ${session?.token}` }
    const API_URL = import.meta.env.VITE_API_BASE_URL

    try {
      const formData = fileData.formData
      const selectedItems = analysisProtocol.items.filter(item => item.is_selected !== false);
      formData.set('protocol', JSON.stringify(selectedItems))
      if (analysisProtocol?.outcome) {
        formData.set('outcome', analysisProtocol.outcome)
        formData.set('group_by', analysisProtocol.outcome)
      }
      // Garantir que transformações clínicas (Snellen→LogMAR, etc.) sejam aplicadas em todos os endpoints
      if (confirmedTransformations && confirmedTransformations.length > 0) {
        formData.set('domain_transformations', JSON.stringify(confirmedTransformations))
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
      const esVal = es.hedges_g != null ? `g=${es.hedges_g}` : es.cohens_d != null ? `d=${es.cohens_d}` : es.rank_biserial_r != null ? `r=${es.rank_biserial_r}` : es.partial_eta_squared != null ? `η²p=${es.partial_eta_squared}` : es.epsilon_squared != null ? `ε²=${es.epsilon_squared}` : es.eta_squared != null ? `η²=${es.eta_squared}` : es.r_squared != null ? `R²=${es.r_squared}` : es.cramers_v != null ? `V=${es.cramers_v}` : '—'
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
            const esVal = es.hedges_g != null ? `g=${es.hedges_g}` : es.cohens_d != null ? `d=${es.cohens_d}` : es.rank_biserial_r != null ? `r=${es.rank_biserial_r}` : es.partial_eta_squared != null ? `η²p=${es.partial_eta_squared}` : es.epsilon_squared != null ? `ε²=${es.epsilon_squared}` : es.eta_squared != null ? `η²=${es.eta_squared}` : es.r_squared != null ? `R²=${es.r_squared}` : es.cramers_v != null ? `V=${es.cramers_v}` : '—'
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
        derivedCandidates={derivedCandidates}
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


      <header className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-main">Painel de Análise</h1>
        <p className="text-sm text-text-muted font-medium">Envie seus dados e receba análises estatísticas completas com interpretação automática.</p>
      </header>
      
      {/* Resumo de Ensaios Clínicos */}
      {!showReview && results.length === 0 && trials.length > 0 && (
        <motion.section 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {trials.slice(0,3).map((t, i) => (
             <div key={i} className="glass-card p-6 rounded-xl border border-border-subtle relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-symbols-rounded text-6xl">clinical_notes</span>
                </div>
                <p className="text-[9px] font-semibold tracking-wide text-primary mb-2">Fase {t.phase} • {t.status}</p>
                <h4 className="text-sm font-bold text-text-main mb-4 line-clamp-2 leading-tight">{t.title}</h4>
                <div className="flex items-end justify-between mt-auto">
                    <div>
                        <p className="text-[10px] font-bold text-text-muted">Recrutamento</p>
                        <p className="text-lg font-semibold text-text-main">{t.n_actual} <span className="text-[10px] text-text-muted">/ {t.n_target}</span></p>
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
              className={`glass-card rounded-xl p-8 sm:p-20 border-2 transition-all flex flex-col items-center text-center relative overflow-hidden ${isDragging ? 'border-primary bg-primary/5' : 'border-primary/10'}`}
            >
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 relative">
                    <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
                    <span className="material-symbols-rounded text-primary text-3xl">analytics</span>
                  </motion.div>
                  <p className="text-text-main font-medium">A Máquina está analisando o seu protocolo...</p>
                  <motion.div className="flex gap-1 mt-4">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-2 h-2 bg-primary rounded-full" animate={{ y: [0, -8, 0], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }} />
                    ))}
                  </motion.div>
                </div>
            ) : !fileData ? (
              <>
                <motion.h3
                  className="text-xl sm:text-2xl font-semibold text-text-main tracking-tight mb-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  Bem-vindo ao Paper Metrics
                </motion.h3>
                <motion.p
                  className="text-text-muted font-medium text-sm mb-8 px-4 max-w-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  Comece fazendo upload dos seus dados ou experimente com um dataset de exemplo.
                </motion.p>

                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {/* Upload card */}
                  <motion.button
                    onClick={() => fileInputRef.current.click()}
                    className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:border-primary/30 transition-all text-left group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <span className="material-symbols-rounded text-2xl">cloud_upload</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-main">Fazer upload</p>
                      <p className="text-[11px] text-text-muted mt-1">CSV ou Excel, ate 50MB</p>
                    </div>
                  </motion.button>

                  {/* Sample data card */}
                  <motion.button
                    onClick={async () => {
                      try {
                        setLoading(true)
                        const API_URL = import.meta.env.VITE_API_BASE_URL
                        const headers = { 'Authorization': `Bearer ${session?.token}` }
                        const res = await fetch(`${API_URL}/api/data/sample`, { headers })
                        if (!res.ok) throw new Error('Erro ao carregar dados de exemplo')
                        const data = await res.json()
                        const blob = new Blob([data.csv_data], { type: 'text/csv' })
                        const file = new File([blob], data.filename, { type: 'text/csv' })
                        const dt = new DataTransfer()
                        dt.items.add(file)
                        fileInputRef.current.files = dt.files
                        handleFileUpload({ target: { files: dt.files } })
                      } catch (err) {
                        alert('Erro ao carregar dados de exemplo: ' + err.message)
                        setLoading(false)
                      }
                    }}
                    className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-surface border border-border-subtle hover:border-primary/20 hover:bg-primary/5 transition-all text-left group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-surface border border-border-subtle flex items-center justify-center text-text-muted group-hover:text-primary group-hover:border-primary/20 transition-all">
                      <span className="material-symbols-rounded text-2xl">science</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-main">Dados de exemplo</p>
                      <p className="text-[11px] text-text-muted mt-1">Dataset clinico com 50 pacientes</p>
                    </div>
                  </motion.button>
                </motion.div>

                <motion.div
                  className="flex gap-3 mt-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-semibold tracking-wide text-primary/70 border border-primary/10">CSV</span>
                  <span className="px-3 py-1.5 bg-primary/5 rounded-full text-[9px] font-semibold tracking-wide text-primary/70 border border-primary/10">XLSX</span>
                  <span className="px-3 py-1.5 bg-surface rounded-full text-[9px] font-semibold tracking-wide text-text-muted border border-border-subtle">Arrastar e soltar</span>
                </motion.div>
              </>
            ) : (
              <div className="w-full text-left">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <span className="material-symbols-rounded text-3xl">dataset</span>
                  </div>
                  <button onClick={() => setFileData(null)} className="text-text-muted hover:text-text-muted">
                    <span className="material-symbols-rounded text-xl">close</span>
                  </button>
                </div>
                <h4 className="text-lg font-semibold text-text-main truncate">{fileData.filename}</h4>
                <p className="text-primary text-[10px] font-semibold tracking-wide mt-1 opacity-70">Arquivo Ativo</p>
                
                <AnimatePresence>
                  {descriptiveData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 pt-6 border-t border-border-subtle">
                      <h5 className="text-[10px] font-semibold tracking-wide text-primary mb-4 flex items-center gap-2">
                        <span className="material-symbols-rounded text-sm">analytics</span>
                        Análise Descritiva Completa
                      </h5>
                      {descriptiveData.descriptive_stats ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border-subtle">
                                  <th className="text-left py-3 px-2 font-semibold text-text-muted text-[9px] tracking-wide">Variável</th>
                                  <th className="text-center py-3 px-2 font-semibold text-text-muted text-[9px] tracking-wide">n</th>
                                  <th className="text-right py-3 px-2 font-semibold text-text-muted text-[9px] tracking-wide">Média ± DP</th>
                                  <th className="text-right py-3 px-2 font-semibold text-primary text-[9px] tracking-wide">Mediana (IQR)</th>
                                  <th className="text-right py-3 px-2 font-semibold text-text-muted text-[9px] tracking-wide">Min – Max</th>
                                  <th className="text-right py-3 px-2 font-semibold text-text-muted text-[9px] tracking-wide">Assimetria</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {Object.entries(descriptiveData.descriptive_stats).map(([col, s]) => (
                                  <tr key={col} className="hover:bg-primary/5 transition-colors group">
                                    <td className="py-3 px-2 font-bold text-text-main group-hover:text-primary text-xs truncate max-w-[150px]">{col}</td>
                                    <td className="py-3 px-2 text-center font-mono text-text-muted">{s.n}</td>
                                    <td className="py-3 px-2 text-right font-mono text-text-muted">{s.mean} ± {s.std}</td>
                                    <td className="py-3 px-2 text-right font-mono font-bold text-primary">{s.median_iqr}</td>
                                    <td className="py-3 px-2 text-right font-mono text-text-muted">{s.min} – {s.max}</td>
                                    <td className="py-3 px-2 text-right font-mono">
                                      <span className={`${Math.abs(s.skewness) > 1 ? 'text-amber-400' : 'text-text-muted'}`}>
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
                            <span className="px-2 py-1 bg-surface rounded-lg text-[8px] font-bold text-text-muted border border-border-subtle">|Assimetria| &gt; 1 = Não-normal</span>
                            <span className="px-2 py-1 bg-surface rounded-lg text-[8px] font-bold text-text-muted border border-border-subtle">Padrão: Mediana (IQR) para não-normais</span>
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-[9px] font-bold text-text-muted tracking-wide">Mediana</p>
                            <p className="text-lg font-semibold text-text-main mt-1">{descriptiveData.median?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-surface rounded-2xl border border-border-subtle">
                            <p className="text-[9px] font-bold text-text-muted tracking-wide">IQR</p>
                            <p className="text-lg font-semibold text-text-main mt-1">{descriptiveData.iqr?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-surface rounded-2xl border border-border-subtle">
                            <p className="text-[9px] font-bold text-text-muted tracking-wide">Média ± DP</p>
                            <p className="text-lg font-semibold text-text-main mt-1">{descriptiveData.mean?.toFixed(2)} ± {descriptiveData.std?.toFixed(2)}</p>
                          </div>
                          <div className="p-4 bg-surface rounded-2xl border border-border-subtle">
                            <p className="text-[9px] font-bold text-text-muted tracking-wide">Mín – Máx</p>
                            <p className="text-lg font-semibold text-text-main mt-1">{descriptiveData.min?.toFixed(2)} – {descriptiveData.max?.toFixed(2)}</p>
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
                  <h3 className="text-[10px] font-semibold tracking-wide text-text-muted">Histórico Recente</h3>
                  <Link to="/archive" className="text-[10px] font-bold text-primary hover:underline">Ver tudo</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.slice(0, 4).map((h, i) => (
                    <div key={i} className="glass-card p-4 rounded-xl flex items-center gap-4 hover:bg-surface transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><span className="material-symbols-rounded text-xl">history</span></div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-text-main truncate">{h.filename}</p>
                        <p className="text-[9px] text-text-muted truncate">Proc: {h.outcome || 'Indefinido'}</p>
                      </div>
                      <span className="text-[9px] font-mono text-text-muted">{new Date(h.created_at).toLocaleDateString()}</span>
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
              <div className="p-4 sm:p-6 border-b border-border-subtle bg-surface">
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
                    <h3 className="text-[11px] font-semibold tracking-wide text-text-muted">Relatório Consolidado</h3>
                    <p className="text-[10px] text-text-muted mt-1">Variáveis descritivas primeiro, seguidas por testes inferenciais</p>
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-500/10 hover:bg-stone-500/20 text-text-muted border border-stone-500/20 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                      title="Exportar relatório para impressão / PDF"
                    >
                      <span className="material-symbols-rounded text-sm">print</span>
                      PDF
                    </button>
                    <button
                      onClick={handleNewAnalysis}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-white/10 text-text-muted hover:text-text-main border border-white/10 rounded-full text-[9px] font-semibold tracking-wide transition-all"
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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border-subtle">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                      <span className="text-[9px] font-semibold tracking-wide text-text-muted">{results.length} TESTES</span>
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-white/10 text-text-muted hover:text-text-main border border-white/10 rounded-full text-[9px] font-semibold tracking-wide transition-all"
                    >
                      <span className="material-symbols-rounded text-sm">{Object.values(expandedGroups).every(Boolean) ? 'unfold_less' : 'unfold_more'}</span>
                      {Object.values(expandedGroups).every(Boolean) ? 'Recolher' : 'Expandir'}
                    </button>
                  </div>
                </div>
              </div>

              {sortedResults.length === 0 ? (
                <div className="p-12 text-center">
                  <span className="material-symbols-rounded text-4xl text-text-muted">inbox</span>
                  <p className="text-sm text-text-muted mt-3">Nenhum resultado nesta categoria.</p>
                </div>
              ) : (
                <div className="p-3 sm:p-5 space-y-4">
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
                      if (es.hedges_g != null) return { symbol: 'g', value: es.hedges_g }
                      if (es.cohens_d != null) return { symbol: 'd', value: es.cohens_d }
                      if (es.rank_biserial_r != null) return { symbol: 'r', value: es.rank_biserial_r }
                      if (es.partial_eta_squared != null) return { symbol: 'η²p', value: es.partial_eta_squared }
                      if (es.epsilon_squared != null) return { symbol: 'ε²', value: es.epsilon_squared }
                      if (es.eta_squared != null) return { symbol: 'η²', value: es.eta_squared }
                      if (es.r_squared != null) return { symbol: 'R²', value: es.r_squared }
                      if (es.cramers_v != null) return { symbol: 'V', value: es.cramers_v }
                      return null
                    }

                    const effectColor = (interp) => {
                      if (!interp) return 'text-text-muted'
                      if (['Grande', 'Forte', 'Muito forte'].includes(interp)) return 'text-primary'
                      if (['Médio', 'Moderado'].includes(interp)) return 'text-amber-400'
                      return 'text-text-muted'
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
                              <button onClick={() => setChartModal({ open: true, data: r.chart_data, varName: varName(r.testLabel) })} className="w-8 h-8 rounded-lg bg-surface hover:bg-primary/10 flex items-center justify-center text-text-muted hover:text-primary transition-all">
                                <span className="material-symbols-rounded text-sm">bar_chart</span>
                              </button>
                            )}
                            <button onClick={() => copyApa(r)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${apaCopied === r.testLabel ? 'bg-primary/15 text-primary' : 'bg-surface text-text-muted hover:text-text-main'}`}>
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
                                <button onClick={() => setChartModal({ open: true, data: r.chart_data, varName: varName(r.testLabel) })} className="w-8 h-8 rounded-lg bg-surface hover:bg-primary/10 flex items-center justify-center text-text-muted hover:text-primary transition-all">
                                  <span className="material-symbols-rounded text-sm">bar_chart</span>
                                </button>
                              )}
                              <button onClick={() => copyApa(r)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${apaCopied === r.testLabel ? 'bg-primary/15 text-primary' : 'bg-surface text-text-muted hover:text-text-main'}`}>
                                <span className="material-symbols-rounded text-sm">{apaCopied === r.testLabel ? 'check' : 'content_copy'}</span>
                              </button>
                              <button onClick={() => setDetailModal(r)} className="w-8 h-8 rounded-lg bg-surface hover:bg-white/10 flex items-center justify-center text-text-muted hover:text-text-main transition-all">
                                <span className="material-symbols-rounded text-sm">info</span>
                              </button>
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-4 flex-wrap">
                            {!naForPval && r?.p_value != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-text-muted">p</span>
                                <span className={`text-lg font-semibold font-mono tracking-tight ${isSig ? 'text-primary' : 'text-text-muted'}`}>
                                  {r.p_value < 0.001 ? '<.001' : r.p_value.toFixed(3)}
                                </span>
                                <span className={`text-xs font-semibold ${isSig ? 'text-primary' : 'text-text-muted'}`}>{significance(r.p_value)}</span>
                              </div>
                            )}
                            {r?.statistic != null && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface">
                                <span className="text-[10px] text-text-muted">Stat</span>
                                <span className="text-xs font-mono font-semibold text-text-main">{typeof r.statistic === 'number' ? r.statistic.toFixed(3) : r.statistic}</span>
                              </div>
                            )}
                            {es && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface">
                                <span className="text-[10px] text-text-muted">{es.symbol}</span>
                                <span className="text-xs font-mono font-semibold text-text-main">{es.value}</span>
                                {r.effect_size?.interpretation && (
                                  <span className={`text-[9px] font-semibold ${effectColor(r.effect_size.interpretation)}`}>{r.effect_size.interpretation}</span>
                                )}
                              </div>
                            )}
                            {r?.effect_size?.achieved_power != null && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface">
                                <span className="text-[10px] text-text-muted">Poder</span>
                                <span className={`text-xs font-mono font-semibold ${r.effect_size.achieved_power >= 0.8 ? 'text-primary' : 'text-text-muted'}`}>{(r.effect_size.achieved_power * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>

                          {/* Group stats */}
                          {r?.group_stats && r.group_stats.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border-subtle">
                              {r.group_stats.map(g => (
                                <div key={g.group} className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-md border border-border-subtle">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0"></span>
                                  <span className="text-[10px] font-semibold text-text-muted">{g.group}</span>
                                  <span className="text-[10px] font-mono text-text-main">N={g.n}</span>
                                  {g.mean != null && <span className="text-[10px] font-mono text-text-muted">M={g.mean}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Interpretation */}
                          {r?.interpretation && (
                            <p className="text-[11px] text-text-muted leading-relaxed mt-3 pt-3 border-t border-border-subtle">
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
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-surface text-text-muted group-hover:text-text-main'}`}>
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
                            <motion.span className="material-symbols-rounded text-text-muted text-lg" animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>expand_more</motion.span>
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
                <h2 className="text-2xl font-semibold text-text-main italic">Insights <span className="text-primary">Premium</span></h2>
                <p className="text-text-muted text-[10px] font-bold tracking-wide">Análise de Redes e Detecção de Padrões Multivariados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Relatório Científico IA */}
              {premiumAnalysis.scientific_report && (
                <div className="lg:col-span-12 p-1 rounded-xl bg-surface border border-white/10 mb-4">
                  <div className="glass-card rounded-[2.9rem] p-10 h-full relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <span className="material-symbols-rounded text-8xl text-primary">history_edu</span>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-rounded text-primary">smart_toy</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text-main italic">Relatório Científico <span className="text-primary">IA</span></h3>
                        <p className="text-[9px] font-semibold tracking-wide text-text-muted">Discussão acadêmica automática (Gemini 2.0 Flash)</p>
                      </div>
                    </div>

                    <div className="prose prose-invert max-w-none">
                      <div className="bg-white/[0.03] p-8 rounded-xl border border-border-subtle shadow-inner">
                        <div className="text-text-main leading-relaxed space-y-4 whitespace-pre-wrap font-medium">
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
                        className="px-6 py-3 rounded-2xl bg-surface border border-white/10 hover:bg-white/10 text-[10px] font-semibold tracking-wide text-text-muted hover:text-text-main transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-rounded text-sm">content_copy</span>
                        {apaCopied === 'Relatório IA' ? 'Copiado!' : 'Copiar Discussão'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Super-Resumo Card */}
              <div className="lg:col-span-12 p-1 rounded-xl bg-surface overflow-hidden">
                <div className="glass-card rounded-[2.9rem] p-10 h-full">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="material-symbols-rounded text-primary text-xl">auto_awesome</span>
                    <h3 className="text-sm font-semibold tracking-wide text-text-main">Super-Resumo de Evidência</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <p className="text-sm leading-relaxed text-text-main italic">
                        "{premiumAnalysis.summary?.interpretation || 'Aguardando processamento interpretativo...'}"
                      </p>
                      <div className="flex flex-wrap gap-4">
                        <div className="px-4 py-2 bg-surface rounded-2xl border border-border-subtle">
                          <p className="text-[9px] font-bold text-text-muted">Total de Evidências</p>
                          <p className="text-xl font-semibold text-text-main">{premiumAnalysis.results?.length || 0}</p>
                        </div>
                        <div className="px-4 py-2 bg-primary/10 rounded-2xl border border-primary/20">
                          <p className="text-[9px] font-bold text-primary">Sig. Alta</p>
                          <p className="text-xl font-semibold text-text-main">
                            {premiumAnalysis.results?.filter(r => r.p_value < 0.01).length || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-6 border border-border-subtle">
                      <h4 className="text-[10px] font-semibold tracking-wide text-text-muted mb-4">Métricas de Confiabilidade</h4>
                      <div className="space-y-4">
                        {premiumAnalysis.summary?.evidence_strength && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className="text-text-muted">Força da Evidência</span>
                              <span className="text-primary">{Math.round(premiumAnalysis.summary.evidence_strength * 100)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${premiumAnalysis.summary.evidence_strength * 100}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                                className="h-full bg-primary"
                              />
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-text-muted leading-relaxed">
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
                    className="glass-card rounded-xl p-8 h-full border border-border-subtle hover:border-primary/30 transition-all flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <span className="material-symbols-rounded text-2xl">insights</span>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-semibold stat-p-value ${r.p_value < 0.05 ? 'stat-p-significant' : 'text-text-muted'}`}>
                          p = {r.p_value < 0.001 ? '<.001' : r.p_value.toFixed(4)}
                        </p>
                        <p className="text-[9px] font-semibold tracking-wide text-text-muted mt-1">{r.label}</p>
                      </div>
                    </div>
                    
                    <h4 className="text-text-main font-semibold text-lg mb-4">{r.insight_label || 'Análise de Componente'}</h4>
                    <p className="text-xs text-text-muted leading-relaxed mb-6 flex-1">
                      {r.interpretation}
                    </p>

                    <div className="pt-6 border-t border-border-subtle flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-surface rounded-full border border-border-subtle">
                          <span className="text-[9px] font-bold text-text-muted">Stat: </span>
                          <span className="text-[9px] font-semibold text-text-main font-mono">{r.statistic.toFixed(2)}</span>
                        </div>
                        <div className="px-3 py-1 bg-primary/5 rounded-full border border-primary/20">
                          <span className="text-[9px] font-bold text-primary">Ef: </span>
                          <span className="text-[9px] font-semibold text-text-main font-mono">{r.effect_size.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-text-muted group-hover:text-primary transition-colors">
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
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-20 bg-black/50 backdrop-blur-sm overflow-y-auto"
            onClick={() => setTestExplanationModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md my-auto"
            >
              {(() => {
                const exp = getExplanation(testExplanationModal)
                if (!exp) return null
                return (
                  <div className="relative overflow-hidden rounded-2xl bg-background border border-border-subtle shadow-xl">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/40"></div>

                    <div className="p-6 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <span className="material-symbols-rounded text-primary text-xl">science</span>
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-text-main">{exp.title}</h3>
                          <p className="text-[10px] text-text-muted font-medium">Guia do Teste Estatístico</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6 space-y-3">
                      <div className="p-4 rounded-xl bg-surface border border-border-subtle">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-rounded text-primary text-sm">lightbulb</span>
                          <h4 className="text-[10px] font-bold text-primary tracking-wider uppercase">O que é?</h4>
                        </div>
                        <p className="text-xs text-text-main leading-relaxed">{exp.what}</p>
                      </div>

                      <div className="p-4 rounded-xl bg-surface border border-border-subtle">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-rounded text-primary text-sm">check_circle</span>
                          <h4 className="text-[10px] font-bold text-primary tracking-wider uppercase">Quando usar</h4>
                        </div>
                        <p className="text-xs text-text-main leading-relaxed">{exp.when}</p>
                      </div>

                      <div className="p-4 rounded-xl bg-surface border border-border-subtle">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-rounded text-primary text-sm">school</span>
                          <h4 className="text-[10px] font-bold text-primary tracking-wider uppercase">Exemplo prático</h4>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed italic">{exp.example}</p>
                      </div>

                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="material-symbols-rounded text-primary text-sm">info</span>
                          <h4 className="text-[10px] font-bold text-primary tracking-wider uppercase">Pressupostos</h4>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">{exp.assumption}</p>
                      </div>
                    </div>

                    <div className="px-6 pb-6">
                      <button
                        onClick={() => setTestExplanationModal(null)}
                        className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                      >
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
              <div className="p-6 border-b border-border-subtle flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-main">{detailModal.testLabel}</h3>
                <button onClick={() => setDetailModal(null)} className="text-text-muted hover:text-text-main transition-colors">
                  <span className="material-symbols-rounded">close</span>
                </button>
              </div>
              <div className="p-6 space-y-6">
                {detailModal.interpretation && (
                  <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <p className="text-[10px] font-semibold tracking-wider text-primary mb-2 flex items-center gap-2">
                      <span className="material-symbols-rounded text-sm">auto_awesome</span> Interpretação
                    </p>
                    <p className="text-xs leading-relaxed text-text-main">{detailModal.interpretation}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-1">Estatística</p>
                    <p className="text-lg font-semibold text-text-main font-mono">{detailModal.statistic != null ? detailModal.statistic : '—'}</p>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-1"><StatTooltip term="p-valor">P-valor</StatTooltip></p>
                    <p className={`text-lg font-semibold font-mono ${detailModal.p_value != null && detailModal.p_value < 0.05 ? 'text-primary' : 'text-text-muted'}`}>
                      {detailModal.p_value != null ? (detailModal.p_value < 0.001 ? '<0.001' : detailModal.p_value.toFixed(4)) : '—'}
                    </p>
                  </div>
                </div>

                {detailModal.effect_size && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-2"><StatTooltip term="effect_size">Tamanho do Efeito</StatTooltip></p>
                    <div className="space-y-1">
                      {detailModal.effect_size.hedges_g != null && (
                        <p className="text-xs text-text-main"><StatTooltip term="hedges_g">g de Hedges</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.hedges_g}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.cohens_d != null && !detailModal.effect_size.hedges_g && (
                        <p className="text-xs text-text-main"><StatTooltip term="cohens_d">d de Cohen</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.cohens_d}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.rank_biserial_r != null && (
                        <p className="text-xs text-text-main"><StatTooltip term="rank_biserial_r">r rank-biserial</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.rank_biserial_r}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.cles != null && (
                        <p className="text-xs text-text-muted"><StatTooltip term="cles">CLES</StatTooltip>: <span className="font-bold">{detailModal.effect_size.cles}</span> ({detailModal.effect_size.cles_interpretation})</p>
                      )}
                      {detailModal.effect_size.partial_eta_squared != null && (
                        <p className="text-xs text-text-main"><StatTooltip term="partial_eta_squared">η² parcial</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.partial_eta_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.epsilon_squared != null && !detailModal.effect_size.eta_squared && (
                        <p className="text-xs text-text-main"><StatTooltip term="epsilon_squared">ε²</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.epsilon_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.eta_squared != null && !detailModal.effect_size.partial_eta_squared && !detailModal.effect_size.epsilon_squared && (
                        <p className="text-xs text-text-main"><StatTooltip term="eta_squared">Eta²</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.eta_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.r_squared != null && (
                        <p className="text-xs text-text-main"><StatTooltip term="r_squared">R²</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.r_squared}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.cramers_v != null && (
                        <p className="text-xs text-text-main"><StatTooltip term="cramers_v">V de Cramer</StatTooltip>: <span className="font-bold text-text-main">{detailModal.effect_size.cramers_v}</span> ({detailModal.effect_size.interpretation})</p>
                      )}
                      {detailModal.effect_size.achieved_power != null && (
                        <p className={`text-xs font-bold ${detailModal.effect_size.achieved_power >= 0.8 ? 'text-teal-300' : 'text-text-muted'}`}>
                          <StatTooltip term="power">Poder estatístico</StatTooltip>: {(detailModal.effect_size.achieved_power * 100).toFixed(0)}%
                          {detailModal.effect_size.achieved_power < 0.8 && ' ⚠ Abaixo do ideal (80%)'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {detailModal.ci && (
                  <div className="p-3 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-1"><StatTooltip term="ic95">Intervalo de Confiança 95%</StatTooltip></p>
                    <p className="text-xs text-text-main font-mono">[{detailModal.ci.ci_lower}, {detailModal.ci.ci_upper}] (SE={detailModal.ci.se})</p>
                  </div>
                )}

                {detailModal.odds_ratio && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-2"><StatTooltip term="odds_ratio">Odds Ratio & Risk Ratio</StatTooltip></p>
                    <div className="space-y-1">
                      <p className="text-xs text-text-main">OR: <span className="font-bold text-text-main">{detailModal.odds_ratio.odds_ratio}</span> (IC95%: {detailModal.odds_ratio.or_ci_95})</p>
                      {detailModal.odds_ratio.risk_ratio != null && (
                        <p className="text-xs text-text-main">RR: <span className="font-bold text-text-main">{detailModal.odds_ratio.risk_ratio}</span> (IC95%: {detailModal.odds_ratio.rr_ci_95})</p>
                      )}
                      <p className="text-xs text-primary font-bold">{detailModal.odds_ratio.interpretation}</p>
                    </div>
                  </div>
                )}

                {detailModal.logistic_regression && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-3">Regressão Logística</p>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-text-muted font-bold">Acurácia</p>
                        <p className="text-lg font-semibold text-primary">{detailModal.logistic_regression.accuracy}%</p>
                      </div>
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-text-muted font-bold">Pseudo-R²</p>
                        <p className="text-lg font-semibold text-text-main">{detailModal.logistic_regression.pseudo_r2}</p>
                      </div>
                      <div className="p-2 bg-primary/5 rounded-lg text-center">
                        <p className="text-[9px] text-text-muted font-bold">N</p>
                        <p className="text-lg font-semibold text-text-main">{detailModal.logistic_regression.n_observations}</p>
                      </div>
                    </div>
                    {detailModal.logistic_regression.predictors && detailModal.logistic_regression.predictors.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-text-muted mb-2">Preditores</p>
                        <div className="space-y-1">
                          {detailModal.logistic_regression.predictors.map((p, pi) => (
                            <div key={pi} className={`flex items-center justify-between text-xs p-2 rounded-lg ${p.significant ? 'bg-primary/10 border border-primary/20' : 'bg-white/3'}`}>
                              <span className="text-text-main font-medium">{p.predictor}</span>
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-text-muted">OR={p.odds_ratio}</span>
                                <span className="font-mono text-text-muted">p={p.p_value < 0.001 ? '<0.001' : p.p_value.toFixed(4)}</span>
                                <span className={`text-[10px] font-semibold ${p.significant ? 'text-primary' : 'text-text-muted'}`}>{p.significant ? '✦ SIG' : 'ns'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {detailModal.contingency_table && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-3">Tabela de Contingência</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-text-muted border-b border-border-subtle">
                            <th className="text-left pb-2 font-semibold"></th>
                            {detailModal.contingency_table[0] && Object.keys(detailModal.contingency_table[0]).filter(k => k !== 'row_label' && k !== 'total' && k !== 'total_pct').map(k => (
                              <th key={k} className="text-right pb-2 font-semibold">{k}</th>
                            ))}
                            <th className="text-right pb-2 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailModal.contingency_table.map((row, ri) => (
                            <tr key={ri} className="border-b border-border-subtle">
                              <td className="py-2 font-bold text-text-main">{row.row_label}</td>
                              {Object.entries(row).filter(([k]) => k !== 'row_label' && k !== 'total' && k !== 'total_pct').map(([k, v]) => (
                                <td key={k} className="py-2 text-right font-mono text-text-main">{v.count} ({v.pct})</td>
                              ))}
                              <td className="py-2 text-right font-mono text-text-main">{row.total} ({row.total_pct})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detailModal.post_hoc && detailModal.post_hoc.comparisons && detailModal.post_hoc.comparisons.length > 0 && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-2"><StatTooltip term="post_hoc">Testes Post-Hoc ({detailModal.post_hoc.method})</StatTooltip></p>
                    <p className="text-[9px] text-text-muted mb-2">{detailModal.post_hoc.n_comparisons} comparações</p>
                    <div className="space-y-1">
                      {detailModal.post_hoc.comparisons.map((c, ci) => {
                        const pVal = c.p_value_holm ?? c.p_value_bonferroni ?? c.p_value
                        const esVal = c.hedges_g != null ? `g=${c.hedges_g}` : c.cohens_d != null ? `d=${c.cohens_d}` : c.rank_biserial_r != null ? `r=${c.rank_biserial_r}` : null
                        return (
                        <div key={ci} className={`flex items-center justify-between text-xs p-2 rounded-lg ${c.significant ? 'bg-primary/10 border border-primary/20' : 'bg-white/3'}`}>
                          <span className="text-text-main font-medium">{c.comparison}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-text-muted">p={pVal != null ? (pVal < 0.001 ? '<0.001' : pVal.toFixed(4)) : '—'}</span>
                            {esVal && <span className="text-[9px] text-text-muted">{esVal}</span>}
                            <span className={`text-[10px] font-semibold ${c.significant ? 'text-primary' : 'text-text-muted'}`}>{c.significant ? '✦ SIG' : 'ns'}</span>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {detailModal.assumptions && detailModal.assumptions.length > 0 && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-2">Verificação de Pressupostos</p>
                    <div className="space-y-2">
                      {detailModal.assumptions.map((a, ai) => (
                        <div key={ai} className={`p-3 rounded-lg border ${a.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                          <p className={`text-xs font-bold mb-1 ${a.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                            {a.severity === 'warning' ? '⚠ Atenção' : 'ℹ Informação'}
                          </p>
                          <p className="text-[11px] text-text-main">{a.message}</p>
                          {a.recommendation && <p className="text-[10px] text-primary mt-1 font-bold">→ Sugestão: {a.recommendation}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailModal.group_stats && detailModal.group_stats.length > 0 && (
                  <div className="p-4 bg-surface rounded-xl border border-border-subtle">
                    <p className="text-[9px] font-bold text-text-muted mb-3">Estatísticas por Grupo</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-text-muted border-b border-border-subtle">
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
                            <tr key={gi} className="border-b border-border-subtle">
                              <td className="py-2 font-bold text-text-main">{g.group}</td>
                              <td className="py-2 text-right text-text-muted">{g.n} {g.pct_of_total && <span className="text-text-muted">({g.pct_of_total})</span>}</td>
                              <td className="py-2 text-right font-mono text-text-main">{g.median}</td>
                              <td className="py-2 text-right font-mono text-text-main">{g.mean} ± {g.std}</td>
                              <td className="py-2 text-right font-mono text-text-muted">{g.iqr}</td>
                              <td className="py-2 text-right font-mono text-text-muted">{g.ci_95 ? `[${g.ci_95.ci_lower}, ${g.ci_95.ci_upper}]` : '—'}</td>
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
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-violet-500/5">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-rounded text-violet-400 text-xl">help_center</span>
                  <div>
                    <h3 className="text-sm font-semibold text-text-main">Como Interpretar os Resultados</h3>
                    <p className="text-[10px] text-text-muted">Guia rápido para pesquisadores sem formação estatística</p>
                  </div>
                </div>
                <button onClick={() => setHowToModal(false)} className="text-text-muted hover:text-text-main transition-colors">
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
                    icon: 'electric_bolt', color: 'text-text-muted', bg: 'bg-stone-500/10 border-stone-500/20',
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
                    <p className="text-xs text-text-main leading-relaxed mb-2">{item.body}</p>
                    <p className="text-[9px] font-mono text-text-muted bg-black/20 px-2 py-1 rounded-lg">{item.tip}</p>
                  </div>
                ))}
                <div className="p-4 bg-white/3 rounded-xl border border-border-subtle text-center">
                  <p className="text-[10px] text-text-muted">Dúvidas? Clique em <strong className="text-primary">Detalhes</strong> em qualquer resultado para ver a interpretação completa, pressupostos verificados e estatísticas avançadas.</p>
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
                <h2 className="text-xl font-semibold text-text-main flex items-center gap-3">
                  <span className="material-symbols-rounded text-primary">insights</span>
                  Suas Métricas
                </h2>
                <p className="text-text-muted text-xs mt-1 font-medium">Atividade da sua conta na plataforma</p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Análises Realizadas', value: history.length || 0, icon: 'analytics', color: 'primary', sub: history.length === 1 ? '1 arquivo processado' : `${history.length} arquivos processados` },
                { label: 'Ensaios Clínicos', value: trials.length || 0, icon: 'biotech', color: 'accent', sub: 'cadastrados na plataforma' },
                { label: 'Testes Disponíveis', value: Object.keys(TEST_EXPLANATIONS).length, icon: 'model_training', color: 'primary', sub: 'métodos estatísticos' },
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
                  <p className="text-2xl font-semibold text-text-main">{stat.value}</p>
                  <p className="text-[9px] font-bold text-text-muted tracking-wide mt-1">{stat.label}</p>
                  <p className="text-[9px] text-text-muted mt-0.5">{stat.sub}</p>
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
              <h2 className="text-xl font-semibold text-text-main flex items-center gap-3">
                <span className="material-symbols-rounded text-primary">model_training</span>
                Capacidades Analíticas
              </h2>
              <p className="text-text-muted text-xs mt-1 font-medium">Faça upload de um arquivo para o sistema detectar e executar automaticamente os testes mais adequados</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ANALYSIS_CATEGORIES.map((cat, ci) => {
                const isExpanded = expandedCategory === cat.id
                return (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: ci * 0.07 }}
                    layout
                    className={`glass-card rounded-2xl border transition-all cursor-pointer ${
                      isExpanded ? 'border-primary/30 col-span-1 md:col-span-2 lg:col-span-3' : 'border-border-subtle hover:border-primary/20'
                    }`}
                  >
                    <div
                      className="p-5 group"
                      onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                            <span className="material-symbols-rounded text-sm">{cat.icon}</span>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-text-main group-hover:text-primary transition-colors">{cat.title}</p>
                            <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">{cat.desc}</p>
                          </div>
                        </div>
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="material-symbols-rounded text-sm text-text-muted"
                        >
                          expand_more
                        </motion.span>
                      </div>
                      {!isExpanded && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {cat.tests.map(t => (
                            <span key={t.key} className="text-[9px] px-2 py-0.5 bg-surface border border-border-subtle rounded-full text-text-muted font-medium">{t.label}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {cat.tests.map((t, ti) => (
                              <motion.button
                                key={t.key}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: ti * 0.05 }}
                                onClick={(e) => { e.stopPropagation(); setTestExplanationModal(t.key) }}
                                className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border-subtle hover:border-primary/30 hover:bg-primary/5 transition-all text-left group/test"
                              >
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover/test:bg-primary/20 transition-colors">
                                  <span className="material-symbols-rounded text-primary text-xs">science</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-text-main group-hover/test:text-primary transition-colors truncate">{t.label}</p>
                                  <p className="text-[9px] text-text-muted mt-0.5">Clique para ver o guia</p>
                                </div>
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </motion.section>

        </>
      )}
    </div>
  )
}
