# SciStat AI — Plataforma de Análise Estatística para Pesquisa Clínica

> Motor estatístico de alta precisão para artigos científicos, TCCs e projetos acadêmicos em saúde.  
> Desenvolvido com FastAPI + React (Vite) + **Pingouin** (estatística clínica especializada).

---

## ✨ Visão Geral

O **SciStat AI** automatiza a análise estatística para pesquisadores que não têm formação em estatística. Faça upload de um dataset (CSV ou Excel), e o sistema:

1. Detecta os tipos de variáveis automaticamente
2. Sugere o(s) teste(s) estatístico(s) mais adequados
3. Executa os testes com interpretação em português
4. Gera relatórios exportáveis (CSV, Excel, PDF)

---

## 🖥️ Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Backend | FastAPI (Python) | ≥ 0.110 |
| Motor Estatístico | **Pingouin** | ≥ 0.5.4 |
| Fallback Estatístico | SciPy + Statsmodels | Qualquer |
| Banco de Dados | SQLite (dev) / Neon PostgreSQL (prod) | — |
| Autenticação | Neon Auth (Better Auth) | — |
| IA | OpenAI GPT-4o-mini | — |
| Frontend | React 18 + Vite | ≥ 5 |
| Visualização | Chart.js + Framer Motion | — |
| Exportação | SheetJS (xlsx) | ≥ 0.18 |
| Sobrevivência | Lifelines | ≥ 0.27 |

---

## 🚀 Instalação e Configuração

### Pré-requisitos

- Python 3.10+
- Node.js 18+
- npm ou yarn

### 1. Clonar o repositório

```bash
git clone https://github.com/Kaitoegm/Semassento.git
cd Semassento
```

### 2. Configurar o Backend

```bash
cd backend

# Criar ambiente virtual
python -m venv venv

# Ativar (Windows)
venv\Scripts\activate

# Ativar (Linux/macOS)
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt
```

#### Dependências críticas (requirements.txt)

```
fastapi
uvicorn
pydantic
pandas
openpyxl
scipy
numpy
pingouin          # Motor estatístico principal
statsmodels       # Poder estatístico + regressão logística
lifelines         # Kaplan-Meier + Log-Rank
sqlmodel          # ORM
openai              # IA GPT-4o-mini
python-multipart
psycopg2-binary
PyJWT
requests
beautifulsoup4
pingouin
```

> **⚠️ Importante:** O Pingouin depende do `pandas`, `scipy` e `numpy`. Verifique que todas foram instaladas com `pip list | findstr pingouin`.

### 3. Configurar variáveis de ambiente

Crie (ou edite) o arquivo `backend/.env`:

```env
OPENAI_API_KEY=sk-proj-sua_chave_openai
DATABASE_URL=postgresql://usuario:senha@host/banco  # Deixe em branco para SQLite local
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
VITE_NEON_AUTH_URL=https://seu-projeto.neonauth...  # Opcional
```

### 4. Configurar o Frontend

```bash
cd frontend
npm install
```

Crie o arquivo `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8001
VITE_NEON_AUTH_URL=https://seu-projeto.neonauth...
```

### 5. Iniciar os servidores

**Opção A — Script automático (Windows):**
```bash
iniciar.bat
```

**Opção B — Manual:**
```bash
# Terminal 1 (backend)
cd backend
uvicorn main:app --host 127.0.0.1 --port 8001 --reload

# Terminal 2 (frontend)
cd frontend
npm run dev
```

Abra: `http://localhost:5173`

---

## 📊 Testes Estatísticos Disponíveis

### Paramétricos
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Teste t Independente | Comparar 2 grupos independentes, dados normais | Pingouin |
| Teste t Pareado | Comparar antes/depois no mesmo grupo | Pingouin |
| ANOVA One-Way | Comparar 3+ grupos independentes, dados normais | Pingouin |

### Não-Paramétricos
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Mann-Whitney U | Comparar 2 grupos, dados não-normais | Pingouin |
| Wilcoxon Signed-Rank | Comparar antes/depois, dados não-normais | Pingouin |
| Kruskal-Wallis | Comparar 3+ grupos, dados não-normais | Pingouin |

### Categórico / Associação
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Qui-Quadrado (χ²) | Associação entre 2 variáveis categóricas | Pingouin |
| Teste Exato de Fisher | Associação em tabelas 2×2 com N pequeno | SciPy |

### Correlação
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Correlação de Pearson | Relação linear entre 2 variáveis contínuas normais | Pingouin |
| Correlação de Spearman | Relação monotônica, dados não-normais ou ordinais | Pingouin |

### Regressão
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Regressão Linear | Predizer variável contínua | Pingouin |
| Regressão Logística | Predizer outcome binário (sim/não) | Statsmodels |

### Normalidade
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Shapiro-Wilk | Testar normalidade (n < 50 ideal) | Pingouin |

### Sobrevivência
| Teste | Quando usar | Engine |
|-------|-------------|--------|
| Kaplan-Meier | Estimativa de sobrevivência ao longo do tempo | Lifelines |
| Log-Rank | Comparar curvas de sobrevivência entre 2 grupos | Lifelines |

---

## 📤 Formatos de Exportação

| Formato | Conteúdo | Como acessar |
|---------|---------|--------------|
| **CSV** | Tabela simples com todos os resultados | Botão "CSV" na barra do relatório |
| **Excel (.xlsx)** | Planilha com 2 abas: Resultados + Metadados | Botão "Excel" na barra do relatório |
| **PDF** | Relatório formatado para impressão/submissão | Botão "PDF" → Ctrl+P → Salvar como PDF |
| **JSON** | Dados brutos completos para integração | Botão "JSON" na barra do relatório |
| **APA** | Citação no formato APA-7 por resultado | Botão de aspas em cada linha |

---

## 🔬 Como Funciona o Motor Estatístico

```
Upload (.csv / .xlsx)
       ↓
validate_and_clean_data()
  • Detecta células vazias
  • Detecta duplicatas
  • Detecta outliers (z > 4)
       ↓
analyze_protocol()
  • Classifica cada variável (contínua, categórica, binária)
  • Detecta nº de grupos únicos
  • Sugere teste automaticamente
  • Explica o motivo em PT-BR
       ↓
execute_protocol()
  • Shapiro-Wilk para pressuposto de normalidade
  • Executa o teste sugerido via Pingouin
  • Calcula Effect Size (d de Cohen, Eta², R², Cramér's V)
  • Calcula IC95% e Poder Estatístico
  • Gera interpretação automática em PT-BR
  • Post-hoc Bonferroni automático (quando N grupos ≥ 3)
```

---

## 🏗️ Estrutura do Projeto

```
Análise estatística/
├── backend/
│   ├── main.py          # API FastAPI + motor estatístico completo
│   ├── requirements.txt # Dependências Python
│   ├── .env             # Variáveis de ambiente (NÃO versionar)
│   └── biostat.db       # Banco SQLite local (dev)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── Dashboard.jsx   # Dashboard principal
│   │   ├── components/
│   │   │   ├── ChartGeneratorModal.jsx   # Gráficos interativos
│   │   │   ├── BioSummaryTable.jsx       # Tabela descritiva agrupada
│   │   │   ├── AnalysisReviewPlan.jsx    # Revisão do protocolo
│   │   │   ├── StatTooltip.jsx           # Tooltips de termos técnicos
│   │   │   └── ...
│   │   └── ...
│   ├── .env             # Variáveis de ambiente do frontend
│   └── package.json
├── docker-compose.yml   # Orquestração Docker
├── iniciar.bat          # Script de inicialização (Windows)
└── README.md            # Este arquivo
```

---

## 🗝️ Endpoints Principais da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/health` | Status da API |
| `POST` | `/api/data/analyze-protocol` | Detecta variáveis e sugere protocolo |
| `POST` | `/api/data/execute-protocol` | Executa os testes do protocolo |
| `POST` | `/api/data/upload` | Estatísticas descritivas |
| `POST` | `/api/data/summary-grouped` | Resumo comparativo por grupo |
| `POST` | `/api/ai/chat` | Chat com IA (OpenAI GPT-4o-mini) |
| `GET/POST` | `/api/trials` | Gestão de ensaios clínicos |
| `GET` | `/api/history` | Histórico de análises |

---

## 🆘 Solução de Problemas

### "pingouin not found"
```bash
pip install pingouin
# ou forçar versão
pip install pingouin==0.5.4
```

### "Failed to fetch" no upload
Verifique se o backend está rodando em `127.0.0.1:8001` (não `localhost`) e se `VITE_API_BASE_URL` no `.env` do frontend aponta para o mesmo endereço.

### Resultados NaN ou "Dados insuficientes"
O Pingouin exige um mínimo de dados por grupo. Verifique se cada grupo tem **pelo menos 3 observações** para testes de normalidade e **pelo menos 5** para testes comparativos.

### Excel corrompido / não abre
O SheetJS (xlsx) requer pelo menos 1 resultado para gerar o arquivo. Certifique-se de que os testes foram executados antes de clicar em "Excel".

---

## 📖 Referências

- [Pingouin — Statistical Package for Python](https://pingouin-stats.org/)
- [SciPy Stats Reference](https://docs.scipy.org/doc/scipy/reference/stats.html)
- [Lifelines — Survival Analysis](https://lifelines.readthedocs.io/)
- [SheetJS — Excel in JavaScript](https://sheetjs.com/)

---

*SciStat AI — Motor Estatístico Consolidado | v3.0 — Pingouin Edition*
