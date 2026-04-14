# 🗂️ Plano de Implementação — Aba Histórico (SciStat)

> **Status geral:** 🟡 Em andamento — Fase 5 concluída, Fase 6 a iniciar  
> **Última sessão:** 2026-04-14  
> **Contexto:** Reformulação completa da aba Histórico para suportar "Projetos de Pesquisa" como entidades completas, com anexos (PDF/CSV), galeria de gráficos automática, performance otimizada e UX rica.

---

## 📐 Decisões de Arquitetura (não alterar sem revisão)

| Decisão | Escolha |
|---|---|
| Modelo de dados | Projeto como entidade completa (agrupa análises, artigos, CSVs, gráficos) |
| Gráficos | Salvos automaticamente ao serem gerados no Dashboard (`ChartGeneratorModal.jsx`) |
| Storage de arquivos | Híbrido: metadados no banco SQLite/Neon, arquivos físicos em `/backend/uploads/` com volume Docker |
| Visualização de PDF | `react-pdf` (biblioteca) inline no frontend |
| Visualização de CSV | Tabela paginada com estatísticas rápidas (min/max/média) |
| Cache frontend | `SWR` ou estado local com invalidação manual |
| Upload | Multipart form-data com progress bar, chunked para arquivos grandes |

---

## 🔧 Fases de Implementação

### ✅ FASE 1 — Backend: Schema de Projetos e Endpoints de Upload
**Estimativa:** 1 sessão | **Status:** 🟢 Concluído (2026-04-13)

**O que foi implementado:**
- ✅ Novas tabelas SQLModel: `ResearchProject`, `ProjectAttachment`, `ProjectChart`, `ProjectAnalysisLink`
- ✅ Diretórios de upload: `/uploads/attachments/`, `/uploads/charts/`, `/uploads/thumbs/`
- ✅ Função `create_thumbnail()` com Pillow
- ✅ Endpoints: CRUD completo de projetos, upload/download/delete de anexos, save/serve/delete de gráficos, link/unlink de análises
- ✅ Endpoint `GET /api/history` adicionado (ausente no código original)
- ✅ `requirements.txt` atualizado com Pillow e aiofiles
- ✅ `docker-compose.yml` com volume persistente `uploads_data`
- ✅ `FileResponse` + streaming seguro de arquivos

**Objetivo:** Criar a base de dados e os endpoints REST para projetos de pesquisa e seus anexos.

**Tarefas:**

#### 1.1 — Novas tabelas no banco (`main.py` ou migration)
```sql
-- Tabela de projetos de pesquisa
CREATE TABLE IF NOT EXISTS research_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  institution TEXT,
  doi TEXT,
  status TEXT DEFAULT 'em_andamento',  -- 'em_andamento' | 'concluido' | 'publicado'
  notes TEXT,
  tags TEXT,  -- JSON array como string: '["cardiologia","RCT"]'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabela de anexos (PDF, CSV)
CREATE TABLE IF NOT EXISTS project_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'pdf' | 'csv' | 'xlsx'
  file_size INTEGER,
  file_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

-- Tabela de gráficos salvos
CREATE TABLE IF NOT EXISTS project_charts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  label TEXT,
  chart_type TEXT,
  image_path TEXT NOT NULL,      -- caminho do PNG full
  thumb_path TEXT,               -- caminho do thumbnail (300px)
  analysis_id INTEGER,           -- FK para history (opcional)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES research_projects(id) ON DELETE CASCADE
);

-- Tabela de vínculo projeto <-> análise histórica
CREATE TABLE IF NOT EXISTS project_analyses (
  project_id INTEGER NOT NULL,
  history_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, history_id)
);
```

#### 1.2 — Endpoints no `main.py`
- `GET    /api/projects`              — listar projetos do usuário (paginado)
- `POST   /api/projects`             — criar novo projeto
- `GET    /api/projects/{id}`        — detalhes de um projeto
- `PUT    /api/projects/{id}`        — editar metadados
- `DELETE /api/projects/{id}`        — deletar projeto (cascade)
- `POST   /api/projects/{id}/attachments`  — upload de PDF/CSV (multipart)
- `GET    /api/projects/{id}/attachments`  — listar anexos
- `DELETE /api/projects/{id}/attachments/{attach_id}` — deletar anexo
- `GET    /api/attachments/{attach_id}/file` — servir arquivo (stream)
- `GET    /api/projects/{id}/charts` — listar gráficos
- `DELETE /api/projects/{id}/charts/{chart_id}` — deletar gráfico
- `POST   /api/projects/{id}/analyses` — vincular análise histórica ao projeto

#### 1.3 — Configuração do diretório de uploads
```python
# No topo do main.py
from pathlib import Path
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "attachments").mkdir(exist_ok=True)
(UPLOAD_DIR / "charts").mkdir(exist_ok=True)
(UPLOAD_DIR / "thumbs").mkdir(exist_ok=True)
```

#### 1.4 — Geração de thumbnails no backend
```python
# Instalar: pip install Pillow
from PIL import Image
def create_thumbnail(source_path: str, thumb_path: str, size=(300, 225)):
    img = Image.open(source_path)
    img.thumbnail(size)
    img.save(thumb_path)
```

#### 1.5 — Volume Docker
```yaml
# docker-compose.yml — adicionar volume
volumes:
  - ./backend/uploads:/app/uploads
```

**Verificação da fase:**
- [ ] `GET /api/projects` retorna lista vazia (200 OK)
- [ ] `POST /api/projects` cria projeto e retorna ID
- [ ] Upload de PDF retorna URL de acesso ao arquivo
- [ ] Thumbnail de imagem é gerado corretamente

---

### ✅ FASE 2 — Backend: Auto-save de Gráficos
**Estimativa:** 0,5 sessão | **Status:** 🟢 Concluído (2026-04-14)
**Depende de:** Fase 1

**Objetivo:** Interceptar a geração de gráficos no Dashboard e salvá-los automaticamente no projeto ativo.

**Tarefas:**

#### 2.1 — Endpoint de save de chart
- `POST /api/projects/{id}/charts` — recebe imagem base64 ou multipart + metadados (label, chart_type, analysis_id)
- Salva PNG em `/uploads/charts/`
- Gera thumbnail em `/uploads/thumbs/`
- Salva registro em `project_charts`

#### 2.2 — Frontend: Detectar projeto ativo
- Adicionar `activeProjectId` no `SciStatContext.jsx`
- No `ChartGeneratorModal.jsx`, após gerar gráfico: se `activeProjectId` existir, chamar `POST /api/projects/{id}/charts` com imagem em base64

#### 2.3 — Seletor de projeto ativo no Header/Dashboard
- Dropdown simples no header para selecionar o "projeto ativo"
- Estado persiste em `localStorage` entre sessões

**Verificação da fase:**
- [x] Gerar gráfico no Dashboard e verificar arquivo PNG criado em `/uploads/charts/`
- [x] Thumbnail gerado em `/uploads/thumbs/`
- [x] Registro visível em `GET /api/projects/{id}/charts`

---

### ✅ FASE 3 — Frontend: Cards de Projeto (substituir tabela)
**Estimativa:** 1 sessão | **Status:** 🟢 Concluído (2026-04-14)
**Depende de:** Fase 1

**Objetivo:** Redesenhar completamente o `Archive.jsx` com cards expandíveis, filtros, busca e UI premium.

**Tarefas:**

#### 3.1 — Layout geral
- Substituir tabela flat por grid de cards
- Cada card: título do projeto, autor, status (badge colorido), data, contador de anexos/gráficos/análises
- Botão de expandir card → revela painel interno com abas

#### 3.2 — Abas internas de cada card
```
[ 📋 Detalhes ] [ 📎 Anexos ] [ 📈 Gráficos ] [ 🔬 Análises ]
```

#### 3.3 — Aba Detalhes
- Formulário editável: título, autor, instituição, DOI, status, notas, tags
- Botão "Salvar alterações"
- Botão "Exportar projeto (.zip)"
- Botão "Deletar projeto" (com confirmação)

#### 3.4 — Filtros e ordenação
- Filtro por status: chips clicáveis (Todos / Em andamento / Concluído / Publicado)
- Filtro por tag
- Ordenação: Data (desc/asc), Nome (A-Z), Nº de análises
- Busca por título, autor, instituição

#### 3.5 — Modal de criação de novo projeto
- Botão "Novo Projeto" no topo da página
- Formulário: título, autor, instituição, DOI, status, notas

#### 3.6 — Cards de estatística no topo (atualizar)
- Total de projetos
- Publicados
- Gráficos salvos (total)
- Arquivos anexados (total)

**Verificação da fase:**
- [x] Cards renderizam corretamente com dados da API
- [x] Filtros funcionam corretamente
- [x] Card expande/colapsa com animação suave
- [x] Criar novo projeto via modal e ver card aparecer

---

### ✅ FASE 4 — Frontend: Visualização de Anexos (PDF + CSV)
**Estimativa:** 1 sessão | **Status:** 🟢 Concluído (2026-04-14)
**Depende de:** Fase 3

**Objetivo:** Implementar upload e visualização inline de PDF e CSV dentro de cada projeto.

**Tarefas:**

#### 4.1 — Instalar dependências
```bash
cd frontend
npm install react-pdf @react-pdf-viewer/core papaparse
```

#### 4.2 — Componente `AttachmentUploader.jsx`
- Drag & drop zone
- Aceita `.pdf`, `.csv`, `.xlsx`
- Progress bar de upload
- Lista de arquivos já uploadados

#### 4.3 — Componente `PDFViewer.jsx`
- Usa `react-pdf` para renderizar PDF inline
- Navegação de páginas (anterior/próxima)
- Zoom in/out
- Botão de download

#### 4.4 — Componente `CSVPreview.jsx`
- Usa `papaparse` para parsear CSV
- Tabela com paginação (50 linhas por página)
- Linha de resumo estatístico: mín/máx/média por coluna numérica
- Indicador de total de linhas e colunas

#### 4.5 — Modal de visualização de arquivo
- Clique em anexo → modal em fullscreen com o viewer apropriado
- Header do modal: nome do arquivo, tamanho, data de upload, botão download

**Verificação da fase:**
- [x] Upload de PDF e visualização página a página
- [x] Upload de CSV e visualização em tabela paginada
- [x] Estatísticas de CSV exibidas corretamente
- [x] Download funcional

---

### ✅ FASE 5 — Frontend: Galeria de Gráficos
**Estimativa:** 0,5 sessão | **Status:** 🟢 Concluído (2026-04-14)
**Depende de:** Fases 2 e 3

**Objetivo:** Exibir galeria visual dos gráficos salvos automaticamente, com lightbox e download.

**Tarefas:**

#### 5.1 — Componente `ChartGallery.jsx`
- Grid de thumbnails (3-4 colunas, responsivo)
- Cada thumbnail: imagem, label, data, botão delete (ícone lixeira)
- Hover: overlay com "Ver em tela cheia" + "Download"

#### 5.2 — Lightbox (`ChartLightbox.jsx`)
- Exibe gráfico em tamanho completo
- Navegação ← → entre gráficos do projeto
- Label e data exibidos
- Botão download PNG
- Fechar com ESC ou clique fora

#### 5.3 — Estado vazio
- Quando não há gráficos: mensagem animada "Nenhum gráfico salvo ainda. Gere análises no Dashboard para que apareçam aqui automaticamente."

**Verificação da fase:**
- [x] Thumbnails carregam corretamente
- [x] Lightbox abre e navega entre gráficos
- [x] Download de gráfico funciona
- [x] Deletar gráfico remove da galeria

---

### ✅ FASE 6 — Performance e Otimizações
**Estimativa:** 0,5 sessão | **Status:** 🟢 Concluído (2026-04-13)  
**Depende de:** Fases 3, 4, 5

**Objetivo:** Aplicar todas as otimizações de performance para garantir fluidez mesmo com muitos projetos.

**Tarefas:**

#### 6.1 — Lazy loading de conteúdo dos cards
- Conteúdo das abas (anexos, gráficos) só é buscado da API quando o card é expandido
- Componente `<Suspense>` + loading skeleton por aba

#### 6.2 — Paginação no backend
- `GET /api/projects?page=1&limit=10` — 10 projetos por página
- Frontend: controles de paginação no rodapé (anterior/próxima)
- Indicador "Exibindo X-Y de N projetos"

#### 6.3 — Cache com SWR ou React Query
```bash
npm install swr
```
- Cache de `GET /api/projects` com revalidação automática
- Cache de tags, gráficos e análises por projeto

#### 6.4 — Chunked upload para arquivos grandes
- Detectar arquivos > 5MB
- Dividir em chunks de 1MB e enviar sequencialmente
- Progress bar por chunk

#### 6.5 — Modo compacto vs. detalhado
- Toggle no canto superior direito: `[ ☰ Compacto ] [ ⊞ Detalhado ]`
- Compacto: 1 linha por projeto (como tabela) — melhor para muitos projetos
- Detalhado: cards expandidos — melhor para navegação profunda

**Verificação da fase:**
- [x] Página carrega em < 1s com 50 projetos
- [x] Paginação funciona corretamente
- [x] Upload de 10MB com progress bar
- [x] Toggle compacto/detalhado funciona

---

### ✅ FASE 7 — UX Avançado: Timeline e Export ZIP
**Estimativa:** 0,5 sessão | **Status:** 🔴 Não iniciado  
**Depende de:** Fase 6

**Objetivo:** Funcionalidades de nível profissional: timeline visual e exportação completa.

**Tarefas:**

#### 7.1 — Timeline visual (opcional, mas impactante)
- View alternativa: linha do tempo vertical dos projetos
- Cada projeto como evento na linha do tempo com status colorido
- Toggle entre "Cards" e "Timeline" no header da página

#### 7.2 — Exportar projeto como .zip
```bash
pip install python-zipfile36  # ou zipfile nativo do Python
```
- Endpoint `GET /api/projects/{id}/export`
- Gera `.zip` contendo:
  - `artigo.pdf` (se houver)
  - `dados.csv` (se houver)
  - `graficos/` (todos os PNGs)
  - `relatorio.json` (metadados + resultados das análises)
- Retorna arquivo para download

#### 7.3 — Aba de Análises vinculadas
- Dentro de cada card, aba "🔬 Análises": lista das análises do histórico vinculadas ao projeto
- Botão "Vincular análise existente" → modal com seletor das análises do histórico atual
- Exibe: nome do arquivo, desfecho, data, nº de testes

**Verificação da fase:**
- [ ] Export ZIP baixa corretamente com todos os arquivos
- [ ] `relatorio.json` contém metadados corretos
- [ ] Vincular análise histórica a um projeto funciona
- [ ] Timeline visual renderiza corretamente

---

## 📦 Dependências Novas (resumo)

### Backend (pip)
```
Pillow          # thumbnails de imagem
python-multipart # upload multipart (provavelmente já presente)
aiofiles        # I/O assíncrono de arquivos
```

### Frontend (npm)
```
react-pdf                # visualizar PDF inline
papaparse                # parsear CSV no frontend
swr                      # cache e revalidação de dados
```

---

## 🗂️ Arquivos a Modificar/Criar

| Arquivo | Ação | Fase |
|---|---|---|
| `backend/main.py` | Modificar — adicionar tabelas e endpoints | 1 |
| `docker-compose.yml` | Modificar — adicionar volume uploads | 1 |
| `backend/requirements.txt` | Modificar — adicionar Pillow, aiofiles | 1 |
| `frontend/src/SciStatContext.jsx` | Modificar — adicionar activeProjectId | 2 |
| `frontend/src/components/ChartGeneratorModal.jsx` | Modificar — auto-save de gráfico | 2 |
| `frontend/src/components/Header.jsx` | Modificar — dropdown projeto ativo | 2 |
| `frontend/src/pages/Archive.jsx` | Reescrever completamente | 3 |
| `frontend/src/components/AttachmentUploader.jsx` | Criar | 4 |
| `frontend/src/components/PDFViewer.jsx` | Criar | 4 |
| `frontend/src/components/CSVPreview.jsx` | Criar | 4 |
| `frontend/src/components/ChartGallery.jsx` | Criar | 5 |
| `frontend/src/components/ChartLightbox.jsx` | Criar | 5 |

---

## 📋 Como retomar entre sessões

1. Abrir este arquivo (`.planning/historico_implementation.md`)
2. Verificar qual fase está em andamento (🟡) ou próxima (🔴)
3. Colar no chat: **"Continuar implementação do Histórico — estamos na Fase X"**
4. O agente irá ler este arquivo e continuar do ponto exato

**Legenda de status:**
- 🔴 Não iniciado
- 🟡 Em andamento
- 🟢 Concluído
- ⚠️ Bloqueado (indicar motivo)

---

## 🧪 Ordem de execução recomendada

```
Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6 → Fase 7
  (base)   (charts)  (UI)    (anexos)  (galeria) (perf)   (extra)
```

> Fases 1-3 são o MVP funcional. Fases 4-7 completam a visão ideal.
