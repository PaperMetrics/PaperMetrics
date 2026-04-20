# PLAN.md — Sistema de Domínios Inteligentes para Paper Metrics

## Contexto do Problema

O Paper Metrics é uma plataforma de análise estatística para pesquisadores acadêmicos
(FastAPI + React + Pingouin). O problema identificado:

Quando o usuário sobe um CSV com colunas como `OD` e `OE` (acuidade visual no formato
`20/20`, `20/30`, etc.), o sistema as trata como texto categórico simples — sem entender
que são frações de acuidade visual que deveriam ser convertidas para **LogMAR** (padrão
ouro clínico: `LogMAR = log10(denominador/numerador)`).

Esse problema se repete em qualquer domínio especializado: escalas de Likert em
psicologia, resistência de materiais em engenharia, escores em educação, etc. A IA
generalista (GPT-4o-mini) não tem profundidade suficiente nesses domínios sem um guia
especialista.

---

## Solução Arquitetural: Sistema de Dicionários de Domínio

Separar em duas camadas:

- **Camada 1 (Conhecimento Especialista):** Arquivo `domain_dictionaries.json` com
  domínios que o mantenedor conhece profundamente (saúde/clínico). Aqui a conversão
  correta (ex: LogMAR) é hardcoded com base em literatura científica.

- **Camada 2 (Aprendizado por Usuário):** Quando o GPT detecta um domínio desconhecido,
  o sistema pergunta ao usuário como interpretar aquela coluna. A resposta é salva como
  novo dicionário para futuros usuários.

O GPT **nunca decide sozinho** — ele sempre consulta o dicionário primeiro. Se o
dicionário tem a resposta, ela é aplicada. Se não tem, o GPT tenta inferir com aviso
explícito de confiança baixa, e o humano é o checkpoint final.

---

## Fluxo Completo

```
CSV enviado pelo usuário
        ↓
validate_and_clean_data()  [já existe]
        ↓
domain_resolver.py → consulta domain_dictionaries.json
  ┌─ Domínio conhecido? → aplica regra especialista (ex: LogMAR)
  └─ Domínio desconhecido?
          ↓
        GPT analisa colunas + amostras de valores
          ↓
        Retorna JSON com inferência + nível de confiança
          ↓
        Frontend exibe modal de confirmação ao usuário
          ↓
        Usuário confirma / corrige / ensina
          ↓
        Sistema salva como novo dicionário (user_domains.json)
        ↓
analyze_protocol() recebe colunas já transformadas corretamente
        ↓
execute_protocol() roda os testes estatísticos
```

---

## Tarefas de Implementação

---

### TAREFA 1 — Criar `domain_dictionaries.json`

**Arquivo:** `backend/domain_dictionaries.json`  
**Duração estimada:** 10 min  
**Descrição:** Base de conhecimento especialista. Começa com oftalmologia e estrutura
extensível para outros domínios.

**Estrutura do arquivo:**

```json
{
  "version": "1.0",
  "domains": {
    "visual_acuity_snellen": {
      "display_name": "Acuidade Visual (Snellen)",
      "description": "Fração de acuidade visual no formato 20/X",
      "detection": {
        "pattern": "^20\\/\\d+$",
        "sample_match_threshold": 0.8
      },
      "gold_standard": "LogMAR",
      "rationale": "LogMAR é o padrão ouro para análise estatística de acuidade visual (WHO, 2003). Escalas Snellen não são lineares e não devem ser usadas diretamente em testes paramétricos.",
      "reference": "Holladay JT. Visual acuity measurements. J Cataract Refract Surg. 2004",
      "transformations": {
        "logmar": {
          "label": "LogMAR (padrão ouro — recomendado)",
          "formula": "log10(denominator / numerator)",
          "examples": {"20/20": 0.0, "20/40": 0.301, "20/200": 1.0},
          "suitable_for": ["t-test", "ANOVA", "correlação", "regressão"]
        },
        "decimal": {
          "label": "Decimal (numerador/denominador)",
          "formula": "numerator / denominator",
          "examples": {"20/20": 1.0, "20/40": 0.5, "20/200": 0.1},
          "suitable_for": ["correlação", "regressão"],
          "warning": "Escala não-linear. LogMAR é preferível para comparações entre grupos."
        },
        "clinical_category": {
          "label": "Categoria Clínica",
          "mapping": {
            "20/20": "Normal",
            "20/25": "Normal",
            "20/30": "Limítrofe",
            "20/40": "Reduzida",
            "20/50": "Reduzida",
            "20/60": "Baixa Visão",
            "20/80": "Baixa Visão",
            "20/100": "Baixa Visão",
            "20/200": "Baixa Visão Grave"
          },
          "suitable_for": ["qui-quadrado", "Fisher", "Mann-Whitney"]
        }
      },
      "default_transformation": "logmar"
    }
  }
}
```

**Verificação:** JSON válido, carregado sem erro em Python com `json.load()`.

---

### TAREFA 2 — Criar `domain_resolver.py`

**Arquivo:** `backend/domain_resolver.py`  
**Duração estimada:** 15 min  
**Descrição:** Módulo central que orquestra a detecção de domínio. Consulta o dicionário
primeiro; só chama a IA se não encontrar.

**Interface pública (funções a implementar):**

```python
def resolve_column(column_name: str, sample_values: list, dictionaries: dict) -> dict:
    """
    Tenta identificar o domínio de uma coluna.
    
    Retorna:
    {
        "column": "OD",
        "domain": "visual_acuity_snellen",       # None se desconhecido
        "source": "dictionary" | "ai" | "unknown",
        "confidence": "high" | "medium" | "low",
        "suggested_transformation": "logmar",
        "transformation_options": [...],
        "rationale": "LogMAR é o padrão ouro...",
        "warning": None | "string com aviso"
    }
    """

def resolve_all_columns(df: pd.DataFrame, dictionaries: dict) -> list[dict]:
    """Aplica resolve_column para todas as colunas do DataFrame."""

def apply_transformation(series: pd.Series, domain: str, transformation: str, dictionaries: dict) -> pd.Series:
    """Aplica a transformação escolhida a uma coluna."""
```

**Lógica de detecção por dicionário:**
1. Para cada coluna, pegar amostra de até 10 valores não-nulos
2. Para cada domínio no dicionário, testar o `pattern` (regex) nos valores da amostra
3. Se ≥ 80% dos valores baterem o padrão → domínio identificado com `confidence: high`
4. Se 50-79% baterem → `confidence: medium`, sugerir com aviso
5. Se < 50% → passar para camada de IA

**Verificação:**
```python
# Teste unitário mínimo:
sample = ["20/20", "20/30", "20/40", "20/60"]
result = resolve_column("OD", sample, load_dictionaries())
assert result["domain"] == "visual_acuity_snellen"
assert result["suggested_transformation"] == "logmar"
assert result["source"] == "dictionary"
```

---

### TAREFA 3 — Criar `ai_domain_inferrer.py`

**Arquivo:** `backend/ai_domain_inferrer.py`  
**Duração estimada:** 15 min  
**Descrição:** Camada de fallback que chama GPT-4o-mini quando o dicionário não reconhece
o domínio. Retorna inferência estruturada com nível de confiança explícito.

**Prompt a usar na chamada OpenAI:**

```
Você é um especialista em análise de dados científicos.
Analise a coluna abaixo e responda APENAS com JSON válido, sem texto extra.

Coluna: "{column_name}"
Valores de amostra: {sample_values}

Responda no formato:
{
  "domain_description": "descrição em português do que essa coluna provavelmente representa",
  "data_type": "contínua | categórica | ordinal | binária | temporal | outro",
  "needs_transformation": true | false,
  "suggested_transformation": "descrição da transformação sugerida ou null",
  "confidence": "high | medium | low",
  "reasoning": "explicação curta do raciocínio",
  "warning": "aviso importante se houver, ou null"
}

IMPORTANTE: Se não tiver certeza, use confidence: "low" e seja honesto no warning.
Nunca invente transformações sem base.
```

**Verificação:** Chamada retorna JSON parseável. Se falhar (timeout, erro), retornar
`{"source": "unknown", "confidence": "low"}` sem quebrar o fluxo.

---

### TAREFA 4 — Criar endpoint `/api/data/resolve-columns`

**Arquivo:** `backend/main.py` (adicionar endpoint)  
**Duração estimada:** 10 min  
**Descrição:** Endpoint que o frontend chama após upload do CSV, antes de mostrar a tela
de seleção de desfecho.

**Request:**
```json
{
  "columns": [
    {"name": "OD", "samples": ["20/20", "20/30", "20/40", "20/20", "20/60"]},
    {"name": "Idade", "samples": [6, 7, 8, 6, 9]},
    {"name": "Genero", "samples": ["M", "F", "M", "F", "M"]}
  ]
}
```

**Response:**
```json
{
  "resolutions": [
    {
      "column": "OD",
      "domain": "visual_acuity_snellen",
      "source": "dictionary",
      "confidence": "high",
      "suggested_transformation": "logmar",
      "transformation_options": [
        {"key": "logmar", "label": "LogMAR (padrão ouro — recomendado)"},
        {"key": "decimal", "label": "Decimal"},
        {"key": "clinical_category", "label": "Categoria Clínica"},
        {"key": "none", "label": "Manter como texto"}
      ],
      "rationale": "LogMAR é o padrão ouro para análise estatística de acuidade visual (WHO, 2003).",
      "warning": null
    },
    {
      "column": "Idade",
      "domain": null,
      "source": "dictionary",
      "confidence": "high",
      "suggested_transformation": "none",
      "transformation_options": [],
      "rationale": "Variável numérica contínua. Nenhuma transformação necessária.",
      "warning": null
    }
  ]
}
```

**Verificação:** Testar com o arquivo `dados_videre_consolidado.csv`. A coluna `OD` deve
retornar `domain: visual_acuity_snellen` e `suggested_transformation: logmar`.

---

### TAREFA 5 — Criar componente `ColumnDomainReview.jsx`

**Arquivo:** `frontend/src/components/ColumnDomainReview.jsx`  
**Duração estimada:** 20 min  
**Descrição:** Modal/tela intermediária exibida após upload e antes da seleção de
desfecho. Mostra ao usuário as colunas que precisam de atenção e pede confirmação.

**Seguir as diretrizes da skill de frontend-design:**
- Design clínico/científico: refinado, preciso, confiável — não genérico
- Fonte display distinta (ex: DM Serif Display ou Playfair Display) para títulos
- Paleta sóbria com accent color forte para indicar confiança alta/média/baixa
- Animação de entrada suave (staggered reveal por coluna)
- Evitar Inter, Roboto, purple gradients genéricos

**Comportamento:**
- Mostrar apenas colunas que precisam de ação (domínio identificado ou IA com baixa
  confiança)
- Para cada coluna: mostrar nome, amostras de valores, domínio detectado, rationale,
  dropdown de opções de transformação
- Badge de confiança colorido: verde (high/dicionário), amarelo (medium/IA), vermelho
  (low/desconhecido)
- Botão "Confirmar e Continuar" — só habilitado após usuário revisar todas as colunas
  marcadas
- Colunas sem necessidade de transformação não aparecem (não poluir o fluxo)

**Props:**
```jsx
<ColumnDomainReview
  resolutions={resolutions}         // array do endpoint
  onConfirm={(decisions) => {}}     // decisions: [{column, transformation}]
  onSkip={() => {}}                 // pular e usar inferência automática
/>
```

**Verificação:** Renderiza sem erros com os dados do `dados_videre_consolidado.csv`.
A coluna `OD` aparece com badge verde, opção LogMAR pré-selecionada, e rationale visível.

---

### TAREFA 6 — Integrar ao fluxo do Dashboard

**Arquivo:** `frontend/src/pages/Dashboard.jsx`  
**Duração estimada:** 15 min  
**Descrição:** Inserir o `ColumnDomainReview` no fluxo existente de upload, entre o
upload do CSV e a exibição da tela de seleção de desfecho/protocolo.

**Fluxo atual:**
```
Upload CSV → [analyze-protocol] → Seleção de Desfecho
```

**Fluxo novo:**
```
Upload CSV → [resolve-columns] → ColumnDomainReview → [analyze-protocol com colunas transformadas] → Seleção de Desfecho
```

**Mudanças necessárias:**
1. Após upload bem-sucedido, chamar `/api/data/resolve-columns` com as colunas do CSV
2. Se `resolutions` tiver pelo menos 1 coluna precisando de atenção → abrir
   `ColumnDomainReview`
3. Ao confirmar, salvar as decisões no estado e passá-las para `analyze-protocol`
4. Se nenhuma coluna precisar de atenção → pular direto para o fluxo atual

**Verificação:** Upload do `dados_videre_consolidado.csv` abre o modal com a coluna `OD`
para revisão. Após confirmar LogMAR, o protocolo é gerado com a coluna `OD` transformada
corretamente.

---

### TAREFA 7 — Criar `user_domains.json` e endpoint de aprendizado

**Arquivos:** `backend/user_domains.json` + endpoint `POST /api/domains/teach`  
**Duração estimada:** 10 min  
**Descrição:** Persistir domínios novos ensinados pelo usuário para reutilização futura.

**Estrutura do `user_domains.json`:**
```json
{
  "version": "1.0",
  "domains": {}
}
```
Mesma estrutura do `domain_dictionaries.json` — o `domain_resolver.py` carrega ambos e
faz merge, com o dicionário oficial tendo prioridade.

**Endpoint:**
```
POST /api/domains/teach
Body: {
  "column_name": "BCVA",
  "sample_values": ["0.0", "0.1", "0.3"],
  "domain_description": "LogMAR direto",
  "transformation": "none",
  "user_note": "coluna já está em LogMAR"
}
```

**Verificação:** Após ensinar, um novo upload com a mesma coluna reconhece o domínio
salvo sem chamar a IA.

---

### TAREFA 8 — Criar GPT Assistant com Biblioteca de Referências (RAG via OpenAI)

**Arquivos:** `backend/library_assistant.py` + adição em `backend/.env`  
**Duração estimada:** 20 min  
**Descrição:** Criar um GPT Assistant dedicado na OpenAI com os PDFs dos livros de
referência anexados. Esse Assistant substitui o GPT-4o-mini genérico na Tarefa 3
(`ai_domain_inferrer.py`) quando o dicionário não reconhece o domínio. Ele responde
com embasamento científico real, citando o livro e a seção relevante.

**IMPORTANTE — Setup manual pelo programador (feito uma única vez):**

```
1. Acessar: https://platform.openai.com/assistants
2. Clicar em "Create assistant"
3. Configurar:
   - Name: "PaperMetrics Domain Expert"
   - Model: gpt-4o-mini
   - Tools: marcar "File Search" (ativa RAG automático)
4. Na seção "Files", fazer upload dos PDFs dos livros de referência:

   ESTATÍSTICA GERAL (base obrigatória):
   • Biostatistics for the Biological and Health Sciences — Triola & Triola
   • Statistics in Medicine — Petrie & Sabin
   • Practical Statistics for Medical Research — Altman

   SAÚDE/CLÍNICO:
   • Clinical Epidemiology — Sackett et al.

   PSICOLOGIA (escalas de Likert, psicometria):
   • Psychometric Theory — Nunnally & Bernstein

   ENGENHARIA:
   • Engineering Statistics — Montgomery et al.

   EDUCAÇÃO:
   • Statistical Methods for Education and Psychology — Glass & Hopkins

5. Aguardar indexação (barra de progresso na interface)
6. Copiar o ASSISTANT_ID gerado (formato: asst_xxxxxxxxxxxxxxxx)
7. Adicionar ao backend/.env:
   OPENAI_ASSISTANT_ID=asst_xxxxxxxxxxxxxxxx
```

**Por que PDFs completos funcionam aqui:**
A OpenAI faz o chunking e indexação automaticamente. Na hora da consulta, ela busca
apenas os 3-5 trechos mais relevantes (~1500 tokens) — não manda o livro inteiro.
Custo real por consulta: ~$0.001-0.01, independente do tamanho dos PDFs.

**Arquivo a criar — `backend/library_assistant.py`:**

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
ASSISTANT_ID = os.getenv("OPENAI_ASSISTANT_ID")

SYSTEM_PROMPT = """
Você é um especialista em análise de dados científicos com acesso a literatura
estatística especializada. Quando analisar uma coluna de dados, SEMPRE:

1. Consulte os documentos anexados antes de responder
2. Baseie sua resposta em referências concretas dos livros
3. Cite o livro e capítulo quando possível
4. Se não encontrar nos documentos, declare explicitamente e use confidence: "low"
5. Nunca invente transformações sem respaldo na literatura

Responda APENAS com JSON válido, sem texto extra.
"""

def infer_domain_with_library(column_name: str, sample_values: list) -> dict:
    """
    Chama o GPT Assistant com File Search para inferir o domínio de uma coluna,
    consultando os PDFs da biblioteca como base de conhecimento.

    Retorna dict com domain_description, data_type, needs_transformation,
    suggested_transformation, confidence, reasoning, warning, reference.
    """
    if not ASSISTANT_ID:
        # Fallback para GPT genérico se Assistant não configurado
        return _fallback_generic_gpt(column_name, sample_values)

    user_message = f"""
Analise a coluna abaixo e responda APENAS com JSON válido, sem texto extra.

Coluna: "{column_name}"
Valores de amostra: {sample_values}

Consulte os documentos anexados e responda no formato:
{{
  "domain_description": "descrição em português do que essa coluna representa",
  "data_type": "contínua | categórica | ordinal | binária | temporal | outro",
  "needs_transformation": true | false,
  "suggested_transformation": "descrição da transformação sugerida ou null",
  "confidence": "high | medium | low",
  "reasoning": "explicação do raciocínio baseada na literatura",
  "warning": "aviso importante se houver, ou null",
  "reference": "livro e capítulo consultado, ou null se não encontrado"
}}

IMPORTANTE: Se não encontrar respaldo nos documentos, use confidence: "low"
e indique no warning que a inferência não tem respaldo bibliográfico.
"""

    try:
        thread = client.beta.threads.create()
        client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=user_message
        )
        run = client.beta.threads.runs.create_and_poll(
            thread_id=thread.id,
            assistant_id=ASSISTANT_ID,
            additional_instructions=SYSTEM_PROMPT
        )
        if run.status == "completed":
            messages = client.beta.threads.messages.list(thread_id=thread.id)
            raw = messages.data[0].content[0].text.value
            # Limpar possíveis markdown fences
            clean = raw.replace("```json", "").replace("```", "").strip()
            import json
            result = json.loads(clean)
            result["source"] = "ai_library"
            return result
        else:
            return _error_response(f"Run status: {run.status}")
    except Exception as e:
        return _error_response(str(e))


def _error_response(reason: str) -> dict:
    return {
        "source": "unknown",
        "confidence": "low",
        "warning": f"Falha ao consultar biblioteca: {reason}. Revisão manual recomendada.",
        "needs_transformation": False,
        "suggested_transformation": None,
        "reference": None
    }


def _fallback_generic_gpt(column_name: str, sample_values: list) -> dict:
    """Fallback para GPT-4o-mini genérico se ASSISTANT_ID não estiver configurado."""
    # Reutiliza lógica do ai_domain_inferrer.py original
    from ai_domain_inferrer import infer_domain_generic
    result = infer_domain_generic(column_name, sample_values)
    result["warning"] = (result.get("warning") or "") + \
        " [AVISO: Biblioteca de referências não configurada. Configure OPENAI_ASSISTANT_ID no .env.]"
    return result
```

**Atualizar `ai_domain_inferrer.py` (Tarefa 3) para usar library_assistant:**

```python
# Em ai_domain_inferrer.py, substituir chamada direta ao GPT por:
from library_assistant import infer_domain_with_library

def infer_domain(column_name: str, sample_values: list) -> dict:
    return infer_domain_with_library(column_name, sample_values)
```

**Atualizar `backend/.env` com nova variável:**
```env
OPENAI_ASSISTANT_ID=asst_xxxxxxxxxxxxxxxx   # Preencher após setup manual
```

**Verificação:**
1. Com `OPENAI_ASSISTANT_ID` configurado: coluna desconhecida (ex: `escala_likert` com
   valores `[1, 2, 3, 4, 5]`) retorna `reference` não-nulo apontando para Nunnally &
   Bernstein ou livro equivalente
2. Com `OPENAI_ASSISTANT_ID` vazio: sistema cai no fallback genérico sem quebrar
3. Resposta sempre tem `confidence` explícito e `warning` quando sem respaldo

---

## Ordem de Execução

```
TAREFA 1 → TAREFA 2 → TAREFA 3 → TAREFA 4 → TAREFA 5 → TAREFA 6 → TAREFA 7 → TAREFA 8
```

**Nota:** A Tarefa 8 pode ser feita em paralelo com as Tarefas 5-7, pois o setup
manual da OpenAI (upload de PDFs) não depende do código. Enquanto o Claude Code
implementa o frontend, você pode estar fazendo o upload dos livros no painel da OpenAI.

Cada tarefa é independente e testável antes de prosseguir.

---

## Critérios de Sucesso

- [ ] Upload de `dados_videre_consolidado.csv` → coluna `OD` detectada como
      `visual_acuity_snellen` via dicionário (não via IA)
- [ ] Transformação padrão sugerida é **LogMAR** com rationale da WHO 2003
- [ ] Usuário pode escolher entre LogMAR, Decimal, Categoria Clínica ou manter texto
- [ ] Colunas numéricas simples (Idade, Uso_telas_h) passam sem interrupção
- [ ] Coluna desconhecida → Assistant consulta biblioteca e retorna `reference` não-nulo
- [ ] Coluna desconhecida sem respaldo nos livros → `confidence: low` + warning explícito
- [ ] Usuário pode "ensinar" novo domínio que é salvo para próximos uploads
- [ ] Sistema funciona mesmo sem `OPENAI_ASSISTANT_ID` (fallback gracioso)
- [ ] Nenhuma regressão nos testes estatísticos existentes

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---|---|
| `backend/domain_dictionaries.json` | CRIAR |
| `backend/user_domains.json` | CRIAR |
| `backend/domain_resolver.py` | CRIAR |
| `backend/ai_domain_inferrer.py` | CRIAR |
| `backend/library_assistant.py` | CRIAR |
| `backend/main.py` | MODIFICAR (adicionar 2 endpoints) |
| `backend/.env` | MODIFICAR (adicionar OPENAI_ASSISTANT_ID) |
| `frontend/src/components/ColumnDomainReview.jsx` | CRIAR |
| `frontend/src/pages/Dashboard.jsx` | MODIFICAR |

---

## Notas para o Claude Code

- O projeto usa FastAPI no backend. Seguir o padrão de endpoints já existentes em
  `main.py` para os novos endpoints.
- O frontend usa React 18 + Vite + Chart.js + Framer Motion. O componente
  `ColumnDomainReview.jsx` deve usar Framer Motion para animações e seguir o design
  system existente.
- `domain_resolver.py` deve ser importado em `main.py` como módulo — não inline.
- Não quebrar nenhuma rota existente. As tarefas são aditivas, não destrutivas.
- Para o componente frontend, seguir as diretrizes de design da skill frontend-design:
  design científico/clínico refinado, fonte display distinta, paleta sóbria, animações
  de entrada staggered, badges de confiança coloridos, sem Inter/Roboto/purple gradients.
- A Tarefa 8 depende de setup manual no painel da OpenAI — o código deve funcionar
  com fallback gracioso quando `OPENAI_ASSISTANT_ID` não estiver no `.env`.
- Começar pela TAREFA 1 e só avançar após verificação de cada tarefa.
