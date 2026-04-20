import os
import json
import jwt
import requests
import io
import re
import time
import uuid
import hashlib
from datetime import datetime
import numpy as np
import pandas as pd
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from scipy import stats
from scipy.stats import fisher_exact
from dotenv import load_dotenv
from openai import OpenAI
from sqlmodel import SQLModel, Field, create_engine, Session, select
from statsmodels.stats.power import TTestIndPower
from statsmodels.api import Logit, add_constant
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test
from bs4 import BeautifulSoup
from stats_engine import engine as premium_engine
from meta_pipeline import run_pipeline

# ============================================================
# Configuração de Diretórios de Upload (Fase 1 — Histórico)
# ============================================================
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "attachments").mkdir(exist_ok=True)
(UPLOAD_DIR / "charts").mkdir(exist_ok=True)
(UPLOAD_DIR / "thumbs").mkdir(exist_ok=True)

def create_thumbnail(source_path: str, thumb_path: str, size: tuple = (400, 300)):
    """Gera thumbnail de uma imagem usando Pillow."""
    try:
        from PIL import Image
        img = Image.open(source_path)
        img.thumbnail(size, Image.LANCZOS)
        img.save(thumb_path, optimize=True, quality=85)
    except Exception as e:
        print(f"WARN: Thumbnail generation failed: {e}")

try:
    import pingouin as pg
    PINGOUIN_AVAILABLE = True
except ImportError:
    PINGOUIN_AVAILABLE = False

# Carregar variáveis de ambiente
load_dotenv()

# Configurar OpenAI GPT
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_KEY and OPENAI_KEY != "your_api_key_here":
    openai_client = OpenAI(api_key=OPENAI_KEY)
else:
    openai_client = None

import time

def ask_gpt(prompt: str, max_retries: int = 2) -> str:
    """Chama OpenAI GPT com retry automático em caso de rate limit."""
    if not openai_client:
        raise HTTPException(status_code=503, detail="Serviço de IA não configurado.")

    for attempt in range(max_retries + 1):
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )
            return response.choices[0].message.content
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "rate" in err_str.lower() or "quota" in err_str.lower():
                if attempt < max_retries:
                    wait = 5 * (attempt + 1)
                    print(f"GPT: Rate limit. Tentativa {attempt+1}/{max_retries+1}. Esperando {wait}s...")
                    time.sleep(wait)
                    continue
                raise HTTPException(status_code=429, detail="Limite de uso da API OpenAI excedido. Aguarde alguns minutos.")
            raise HTTPException(status_code=500, detail=f"Erro na IA: {err_str[:200]}")

LOCAL_FALLBACK = {
    "t-test": "O Teste T é usado para comparar médias entre grupos. Use Teste T para amostras independentes quando comparar 2 grupos diferentes, e Teste T pareado quando medir o mesmo grupo antes/depois de uma intervenção. Requisitos: dados normalmente distribuídos, variância homogênea (para versão não pareada).",
    "anova": "A ANOVA (Análise de Variância) compara médias de 3 ou mais grupos. Se o p-valor for significativo (<0.05), use testes post-hoc (Tukey, Bonferroni) para identificar quais grupos diferem.",
    "mann-whitney": "O teste de Mann-Whitney U é a versão não-paramétrica do Teste T independente. Use quando os dados não seguem distribuição normal ou quando tem variáveis ordinais.",
    "qui-quadrado": "O Qui-Quadrado (χ²) testa associação entre duas variáveis categóricas. Use quando tem dados em tabelas de contingência (frequências). Requisito: esperados ≥5 em cada célula.",
    "spearman": "A Correlação de Spearman mede a relação monotônica entre duas variáveis. Use quando os dados não são normalmente distribuídos ou são ordinais. Varia de -1 a +1.",
    "kaplan-meier": "Kaplan-Meier estima a probabilidade de sobrevivência ao longo do tempo. Use para dados de sobrevida com censura. O Log-Rank testa diferença entre curvas de 2 grupos.",
    "regressao": "Regressão Linear modela a relação entre uma variável dependente (contínua) e uma ou mais variáveis independentes. R² indica a proporção de variância explicada.",
    "p-valor": "O p-valor é a probabilidade de observar os resultados obtidos (ou mais extremos) se a hipótese nula for verdadeira. p < 0.05 geralmente indica significância estatística. Não confunda com importância clínica.",
    "tamanho amostral": "O cálculo de tamanho amostral depende do poder desejado (geralmente 80%), nível de significância (geralmente 5%), e tamanho do efeito esperado. Para comparação de 2 médias, use o Teste T de potência.",
    "ic": "O Intervalo de Confiança (IC) de 95% significa que, se repetíssemos o estudo 100 vezes, ~95 intervalos conteriam o verdadeiro parâmetro populacional. Quanto mais estreito, mais preciso.",
    "efeito": "Tamanho do efeito mede a magnitude prática da diferença. Cohen's d: pequeno (~0.2), médio (~0.5), grande (~0.8). Um resultado pode ser estatisticamente significante mas ter efeito pequeno.",
    "normalidade": "Para testar normalidade use: Shapiro-Wilk (amostras pequenas, n<50), Kolmogorov-Smirnov (amostras maiores), ou QQ-plot (inspeção visual). Se não-normal, use testes não-paramétricos.",
}

def get_local_response(message: str) -> str:
    """Busca resposta local para perguntas comuns de bioestatística."""
    msg = message.lower()
    best_match = None
    best_score = 0

    for key, answer in LOCAL_FALLBACK.items():
        if key in msg:
            score = len(key)
            if score > best_score:
                best_score = score
                best_match = answer

    if best_match:
        return best_match

    if any(w in msg for w in ["qual teste", "qual usar", "que teste", "como analisar"]):
        return ("Para escolher o teste estatístico correto, preciso saber:\n\n"
                "1. Tipo da variável dependente (contínua ou categórica)\n"
                "2. Número de grupos (1, 2, ou 3+)\n"
                "3. Se os dados seguem distribuição normal\n"
                "4. Se as amostras são independentes ou pareadas\n\n"
                "Descreva seu cenário e posso sugerir o teste ideal.")

    if any(w in msg for w in ["ajuda", "help", "o que você faz", "como usar"]):
        return ("Sou o Paper Metrics, especializado em bioestatística. Posso ajudar com:\n\n"
                "• Escolha do teste estatístico adequado\n"
                "• Interpretação de resultados (p-valor, IC, efeito)\n"
                "• Cálculo de tamanho amostral\n"
                "• Orientação sobre desenhos de estudo\n"
                "• Análise de dados de ensaios clínicos\n\n"
                "Faça sua pergunta!")

    return None

# Configurar Banco de Dados
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///biostat.db"

NEON_AUTH_URL = os.getenv("VITE_NEON_AUTH_URL") # Reusing the one from frontend if available or set in .env
if not NEON_AUTH_URL:
    NEON_AUTH_URL = "https://ep-summer-queen-ac9q4qes.neonauth.sa-east-1.aws.neon.tech/neondb/auth"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)

# Modelos de Dados
class AnalysisHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    filename: str
    outcome: str
    protocol: str  # JSON Stringified
    results: str   # JSON Stringified
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClinicalTrial(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    status: str = "Planejamento" # Planejamento, Recrutamento, Analise, Finalizado
    phase: str = "I" # I, II, III, IV
    n_target: int = 100
    n_actual: int = 0
    start_date: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    message: str
    type: str = "info" # info, success, warning
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ============================================================
# Modelos de Projetos de Pesquisa (Fase 1 — Histórico)
# ============================================================

class ResearchProject(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    author: Optional[str] = None
    institution: Optional[str] = None
    doi: Optional[str] = None
    status: str = Field(default="em_andamento")  # em_andamento | concluido | publicado
    notes: Optional[str] = None
    tags: Optional[str] = Field(default="[]")  # JSON array como string
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectAttachment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    filename: str          # nome gerado internamente (UUID)
    original_name: str     # nome original do arquivo
    file_type: str         # pdf | csv | xlsx
    file_size: Optional[int] = None
    file_path: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectChart(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    label: Optional[str] = None
    chart_type: Optional[str] = None
    image_path: str
    thumb_path: Optional[str] = None
    analysis_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectAnalysisLink(SQLModel, table=True):
    project_id: int = Field(primary_key=True)
    history_id: int = Field(primary_key=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

auth_scheme = HTTPBearer()

async def get_current_user(token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    """Valida o JWT da Neon Auth e extrai o ID do usuário."""
    try:
        creds = token.credentials

        # Verificar se o token parece ser um JWT válido (3 segmentos separados por ponto)
        segments = creds.split('.')
        if len(segments) != 3:
            # Token não é JWT - pode ser session token opaco do Neon Auth
            # Para desenvolvimento, usar user_id fixo
            # Em produção, seria necessário validar o token via API da Neon
            print(f"AUTH WARN: Token não é JWT. Usando user_id fixo para desenvolvimento.")
            return "dev_user"

        # 1. Buscar as chaves públicas da Neon Auth (Cachear em produção)
        jwks_url = f"{NEON_AUTH_URL}/.well-known/jwks.json"
        jwks = requests.get(jwks_url).json()

        # 2. Extrair o header do token para encontrar a chave correta (kid)
        unverified_header = jwt.get_unverified_header(creds)
        kid = unverified_header.get("kid")

        # 3. Encontrar a chave pública correspondente
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == kid:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "n": key["n"],
                    "e": key["e"]
                }
                break

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Chave pública não encontrada.")

        # 4. Decodificar e validar o token
        # Nota: O Better Auth/Neon Auth usa o 'sub' como ID do usuário
        payload = jwt.decode(
            creds,
            rsa_key,
            algorithms=["RS256"],
            audience=None, # Neon Auth tokens podem não ter audience fixa por padrão
            options={"verify_aud": False}
        )

        return payload.get("sub") # user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado.")
    except jwt.InvalidTokenError as e:
        print(f"AUTH WARN: JWT inválido: {e}. Usando fallback.")
        return token.credentials[:64] if token.credentials else "anonymous"
    except Exception as e:
        print(f"AUTH ERR: {str(e)}")
        # Fallback gracioso em vez de bloquear
        return token.credentials[:64] if token.credentials else "anonymous"

app = FastAPI(title="Paper Metrics API", version="2.12.0")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "2.12.0"}

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB

# ============================================================
# Utilitários de Telemetria e Blindagem (The Blackbox)
# ============================================================

TELEMETRY_DIR = "telemetry"
if not os.path.exists(TELEMETRY_DIR): os.makedirs(TELEMETRY_DIR)

def record_telemetry(filename: str, contents: bytes, protocol: str = None, outcome: str = None):
    """Grava o estado exato para perícia técnica posterior."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join(TELEMETRY_DIR, f"{timestamp}_{filename}")
    with open(file_path, "wb") as f: f.write(contents)
    if protocol:
        meta_path = file_path + ".meta.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump({"protocol": protocol, "outcome": outcome}, f, indent=4)
    print(f"BLACKBOX: Pedido registrado em {file_path}")

def robust_read_csv(contents: bytes) -> pd.DataFrame:
    """Tenta ler de forma versátil, forçando separadores e ignorando aspas se necessário."""
    encodings = ['utf-8', 'latin-1', 'cp1252', 'utf-16']
    for enc in encodings:
        try:
            try:
                text = contents.decode(enc)
            except:
                continue
                
            lines = text.splitlines()
            if not lines: continue
            
            # Detectar separador por contagem na primeira linha
            n_commas = lines[0].count(',')
            n_semis = lines[0].count(';')
            chosen_sep = ',' if n_commas >= n_semis else ';'
            
            # Tentar leitura padrão
            df = pd.read_csv(io.StringIO(text), sep=chosen_sep, engine='python', on_bad_lines='skip', quotechar='"')
            
            # Se leu apenas 1 coluna, as aspas estão MATA-SEPARADORES. Fallback: Ignorar aspas.
            if len(df.columns) <= 1:
                print(f"DEBUG: Falha de colunas com aspas. Tentando sem quotechar (sep={chosen_sep})")
                df = pd.read_csv(io.StringIO(text), sep=chosen_sep, engine='python', on_bad_lines='skip', quotechar=None)
            
            if len(df) > 1 and len(df.columns) > 1:
                print(f"DEBUG: Success reading {len(df)} rows and {len(df.columns)} columns.")
                return df
                
        except Exception as e:
            print(f"Read error with {enc}: {e}")
            continue
    
    # Fallback final
    return pd.read_csv(io.BytesIO(contents), sep=';', on_bad_lines='skip')

def map_clinical_to_numeric(series: pd.Series) -> pd.Series:
    """Mapeia categorias (accent-insensitive) e extrai números (ex: '2 dias' -> 2)."""
    mapping = {
        'sim': 1, 'nao': 0, 'não': 0, 'yes': 1, 'no': 0,
        'nunca': 0, 'raramente': 1, 'as vezes': 2, 'às vezes': 2, 'frequentemente': 3, 'sempre': 4,
        'nao bebi': 0, 'nao utilizei': 0, 'nao usei': 0, 'nao uso': 0, 'não bebi': 0, 'não utilizei': 0, 'não usei': 0,
        'concordo totalmente': 4, 'concordo': 3, 'neutro': 2, 'discordo': 1, 'discordo totalmente': 0
    }
    # Limpeza profunda
    s_clean = series.astype(str).str.lower().str.strip()
    
    # 1. Mapeamento direto
    mapped = s_clean.map(mapping)
    
    # 2. Extração numérica (Regex)
    mask_null = mapped.isna() & ~s_clean.isin(['nan', 'none', ''])
    if mask_null.any():
        extracted = s_clean[mask_null].str.extract(r'(\d+)')[0]
        mapped.update(pd.to_numeric(extracted, errors='coerce'))
        
    # Se conseguimos mapear pelo menos 20%
    if len(series.dropna()) > 0 and (mapped.dropna().count() / len(series.dropna())) >= 0.2:
        return mapped
    return series

def robust_read_excel(contents):
    """Lê Excel de forma resiliente, lidando com cabeçalhos vazios ou títulos no topo."""
    try:
        # Tenta leitura padrão
        df = pd.read_excel(io.BytesIO(contents))
        # Se as colunas são 'Unnamed' e há poucas colunas, tenta pular a primeira linha (título)
        unnamed = [c for c in df.columns if str(c).startswith('Unnamed')]
        if len(unnamed) > (len(df.columns) / 2) and df.shape[0] > 0:
            print("DEBUG: Detectado cabeçalho vazio/título. Pulando 1 linha...")
            df = pd.read_excel(io.BytesIO(contents), skiprows=1)
        return df
    except Exception as e:
        print(f"ERR: robust_read_excel -> {e}")
        return pd.read_excel(io.BytesIO(contents))

def is_summary_table(df):
    """Detecta se o arquivo é um resumo consolidado (Tabela de Frequência) em vez de dados brutos."""
    keywords = {'n', 'frequência', 'frequencia', 'variável', 'variavel', 'total', 'quantidade', 'count', 'perc', '%'}
    cols_lower = [str(c).lower().strip() for c in df.columns]
    matches = [c for c in cols_lower if any(k in c for k in keywords)]
    
    print(f"DEBUG: Summary Check -> Matches: {matches}, Shape: {df.shape}")
    
    # Se houver colunas 'N' ou 'Variável' e o banco for pequeno lateralmente, é um resumo
    if (len(matches) >= 1 and df.shape[1] <= 3) or (df.shape[1] <= 2 and df.shape[0] < 50):
        return True
    return False

def sanitize_df(df: pd.DataFrame) -> pd.DataFrame:
    """Higieniza o DataFrame: remove formatos brasileiros (120,5) e limpar categorias."""
    # Limpar headers de newlines e aspas
    df.columns = [str(c).strip().replace('"', '').replace("'", "").replace('\n', ' ').replace('\r', ' ') for c in df.columns]
    print(f"DEBUG: Dataframe Shape -> {df.shape}")
    
    for col in df.columns:
        if df[col].dtype == 'object':
            # Limpeza básica de espaços e aspas residuais
            df[col] = df[col].astype(str).str.strip().replace('nan', np.nan).replace('', np.nan).replace('None', np.nan)
            
            # 1. Detectar formato brasileiro (1.200,50 ou 120,5)
            sample = df[col].dropna().head(50).astype(str)
            if any(re.search(r'\d+,\d+', s) for s in sample):
                df[col] = df[col].str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
            
            # 2. Tentar conversão numérica direta (Float)
            try_num = pd.to_numeric(df[col], errors='coerce')
            if try_num.notna().sum() > len(df) * 0.3:
                df[col] = try_num
            else:
                # 3. Tentar mapeamento de categorias (Sim/Não)
                df[col] = map_clinical_to_numeric(df[col])
                
    return df

def find_best_column_match(target: str, columns: list) -> str:
    """Fuzzy matching para encontrar colunas (lida com truncamentos de CSV)."""
    if not target or not columns: return None
    import difflib
    
    # Normalização básica
    target_clean = str(target).strip().lower().replace('"', '').replace("'", "").replace('\n', ' ').replace('\r', ' ')
    cols_clean = [str(c).strip().lower().replace('"', '').replace("'", "").replace('\n', ' ').replace('\r', ' ') for c in columns]
    
    # Match exato
    if target_clean in cols_clean:
        return columns[cols_clean.index(target_clean)]
    
    # Match por prefixo (o mais comum em truncamentos)
    for i, c in enumerate(cols_clean):
        if target_clean.startswith(c) or c.startswith(target_clean):
            return columns[i]
            
    # Match difuso
    matches = difflib.get_close_matches(target_clean, cols_clean, n=1, cutoff=0.5)
    if matches:
        return columns[cols_clean.index(matches[0])]
    return None

def bin_numeric_groups(series, max_bins=5):
    """Bin a numeric series into meaningful groups (max 5)."""
    s = pd.to_numeric(series, errors='coerce').dropna()
    if len(s) == 0:
        return series, None
    
    unique_count = len(s.unique())
    if unique_count <= max_bins:
        return series, None
    
    try:
        actual_bins = min(max_bins, unique_count)
        bin_edges = np.linspace(s.min(), s.max(), actual_bins + 1)
        
        labels_list = []
        for i in range(actual_bins):
            low = bin_edges[i]
            high = bin_edges[i + 1]
            if i == 0:
                labels_list.append(f"≤{high:.0f}")
            elif i == actual_bins - 1:
                labels_list.append(f">{low:.0f}")
            else:
                labels_list.append(f"{low:.0f}-{high:.0f}")
        
        binned = pd.cut(s, bins=bin_edges, labels=labels_list, include_lowest=True, duplicates='drop')
        
        result = pd.Series(index=series.index, dtype='object')
        result[series.isna()] = np.nan
        result[series.notna()] = binned.values.astype(str)
        
        return result, True
    except Exception as e:
        print(f"DEBUG: Binning failed for {series.name}: {e}")
        return series, None

def json_safe_df(df: pd.DataFrame) -> pd.DataFrame:
    return df.replace([np.nan, np.inf, -np.inf], None)

def sanitize_chart_value(val):
    """Converte valor para float seguro, substituindo NaN/Infinity por None."""
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None

def clean_dict_values(d: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(d, dict):
        new_dict = {}
        for k, v in d.items():
            if isinstance(v, dict):
                new_dict[k] = clean_dict_values(v)
            elif isinstance(v, (np.bool_, np.bool)):
                new_dict[k] = bool(v)
            elif isinstance(v, (np.integer,)):
                new_dict[k] = int(v)
            elif isinstance(v, (np.floating,)):
                val = float(v)
                new_dict[k] = None if (np.isnan(val) or np.isinf(val)) else val
            elif isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                new_dict[k] = None
            elif isinstance(v, np.ndarray):
                new_dict[k] = clean_dict_values(v.tolist())
            elif isinstance(v, list):
                cleaned = []
                for x in v:
                    if isinstance(x, dict):
                        cleaned.append(clean_dict_values(x))
                    elif isinstance(x, (np.bool_, np.bool)):
                        cleaned.append(bool(x))
                    elif isinstance(x, (np.integer,)):
                        cleaned.append(int(x))
                    elif isinstance(x, (np.floating,)):
                        val = float(x)
                        cleaned.append(None if (np.isnan(val) or np.isinf(val)) else val)
                    elif isinstance(x, float) and (np.isnan(x) or np.isinf(x)):
                        cleaned.append(None)
                    elif isinstance(x, np.ndarray):
                        cleaned.append(x.tolist())
                    else:
                        cleaned.append(x)
                new_dict[k] = cleaned
            else:
                new_dict[k] = v
        return new_dict
    return d

# Inicializar
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# ============================================================
# Endpoints de Dados e Análise (Precision & Telemetry)
# ============================================================

@app.post("/api/data/upload")
async def upload_file_v6(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    contents = await file.read()
    record_telemetry(file.filename, contents)
    try:
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = robust_read_excel(contents)
        df = sanitize_df(df)
        
        if is_summary_table(df):
            msg = "Esta parece uma Planilha de Resumo/Frequências. Para realizar análises estatísticas, o Paper Metrics precisa da Planilha de Microdados (onde cada linha é um paciente e cada coluna é uma variável)."
            raise HTTPException(status_code=400, detail=msg)

        summary = json_safe_df(df.describe()).to_dict()
        preview = json_safe_df(df.head(10)).to_dict(orient='records')
        
        descriptive = {}
        for col in df.columns:
            col_data = pd.to_numeric(df[col], errors='coerce')
            non_null = col_data.dropna()
            n_missing = int(df[col].isna().sum())
            total_rows = len(df)
            
            if len(non_null) > 0:
                descriptive[col] = {
                    "n": int(len(non_null)),
                    "n_missing": n_missing,
                    "pct_missing": round(n_missing / total_rows * 100, 1) if total_rows > 0 else 0,
                    "pct_valid": round((total_rows - n_missing) / total_rows * 100, 1) if total_rows > 0 else 0,
                    "mean": round(float(np.mean(non_null)), 4),
                    "median": round(float(np.median(non_null)), 4),
                    "std": round(float(np.std(non_null, ddof=1)), 4),
                    "min": round(float(np.min(non_null)), 4),
                    "q1": round(float(np.percentile(non_null, 25)), 4),
                    "q3": round(float(np.percentile(non_null, 75)), 4),
                    "max": round(float(np.max(non_null)), 4),
                    "iqr": round(float(np.percentile(non_null, 75) - np.percentile(non_null, 25)), 4),
                    "skewness": round(float(pd.Series(non_null).skew()), 4),
                    "kurtosis": round(float(pd.Series(non_null).kurtosis()), 4),
                    "median_iqr": f"{np.median(non_null):.2f} ({np.percentile(non_null, 25):.2f} - {np.percentile(non_null, 75):.2f})"
                }
            else:
                # Categorical column
                value_counts = df[col].value_counts()
                cat_stats = {}
                for g, count in value_counts.items():
                    pct = round(count / len(df[col].dropna()) * 100, 1) if len(df[col].dropna()) > 0 else 0
                    wilson = wilson_ci_proportion(int(count), int(len(df[col].dropna())))
                    cat_stats[str(g)] = {
                        "n": int(count),
                        "pct": f"{pct}%",
                        "wilson_ci": wilson
                    }
                descriptive[col] = {
                    "type": "categorical",
                    "n": int(len(df[col].dropna())),
                    "n_missing": n_missing,
                    "pct_missing": round(n_missing / total_rows * 100, 1) if total_rows > 0 else 0,
                    "pct_valid": round((total_rows - n_missing) / total_rows * 100, 1) if total_rows > 0 else 0,
                    "categories": cat_stats,
                    "n_categories": len(value_counts)
                }
        
        missing_summary = compute_missing_data_summary(df)
        
        return clean_dict_values({
            "filename": file.filename, 
            "rows": len(df), 
            "columns": df.columns.tolist(), 
            "summary": summary, 
            "data_preview": preview,
            "descriptive_stats": descriptive,
            "missing_data": missing_summary
        })
    except HTTPException: raise
    except Exception as e:
        print(f"ERR: API Upload -> {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/data/get-columns")
async def get_columns_endpoint(file: UploadFile = File(...)):
    """Retorna as colunas do arquivo com tipo, amostra e sugestão de outcome — sem execução estatística."""
    contents = await file.read()
    try:
        if file.filename.endswith('.csv'):
            df = robust_read_csv(contents)
        else:
            df = robust_read_excel(contents)
        df = sanitize_df(df)

        # Heurísticas para sugerir o outcome
        outcome_keywords = [
            'desfecho', 'outcome', 'resultado', 'diagnose', 'diagnostico',
            'morte', 'obito', 'alta', 'cura', 'resposta', 'target',
            'sobrevida', 'prognostico', 'recidiva', 'progrssao'
        ]
        suggested_col = df.columns[-1]  # fallback: última coluna
        for col in reversed(df.columns.tolist()):
            if any(kw in col.lower() for kw in outcome_keywords):
                suggested_col = col
                break

        columns = []
        for col in df.columns:
            col_series = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce')
            unique_count = len(df[col].dropna().unique())
            is_numeric_col = not col_series.isna().all() and unique_count >= 5
            dtype_label = "Numérico" if is_numeric_col else ("Binário" if unique_count == 2 else "Categórico")
            sample_vals = df[col].dropna().head(6).astype(str).tolist()
            columns.append({
                "name": col,
                "type": dtype_label,
                "unique_count": unique_count,
                "sample": sample_vals[:3],
                "sample_values": sample_vals,  # alias para resolve-columns endpoint
                "suggested": col == suggested_col
            })

        return {"columns": columns, "suggested_outcome": suggested_col}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler colunas: {str(e)}")

@app.post("/api/data/analyze-protocol")
async def analyze_protocol_v7(file: UploadFile = File(...), outcome_col: str = Form(None)):
    contents = await file.read()
    try:
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = robust_read_excel(contents)
        df = sanitize_df(df)
        
        print(f"DEBUG: analyze_protocol_v7 -> File: {file.filename}, Shape: {df.shape}")
        
        if is_summary_table(df):
            msg = "Esta Planilha parece conter APENAS O RESUMO (Tabela de Frequência). O Paper Metrics precisa dos MICRODADOS BRUTOS (onde cada linha é um paciente) para realizar correlações e testes estatísticos."
            print(f"REJECTED: Summary table detected -> {file.filename}")
            raise HTTPException(status_code=400, detail=msg)
        
        ignore_patterns = r'\b(id|nº|número|numero|nome|prontuario|data|sexo|registro|index|paciente|unidade|setor|atendimento|cpf|rg|matricula|codigo|código|chave|key|matrícula)\b'
        
        def is_meaningful_variable(col_name: str) -> bool:
            """Retorna False para colunas que são apenas identificadores ou não têm valor estatístico."""
            return not bool(re.search(ignore_patterns, col_name.lower()))
        
        # ============================================================
        # PASSO 1: Classificação detalhada de cada variável
        # ============================================================
        var_info = {}
        for col in df.columns:
            col_series = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce')
            unique_count = len(df[col].dropna().unique())
            non_null = col_series.dropna()
            is_numeric = not col_series.isna().all() and unique_count >= 5
            
            # Detectar ordinal (poucos valores numéricos sequenciais, ex: 1-5 Likert)
            is_ordinal = False
            if not is_numeric and unique_count <= 7 and unique_count >= 3:
                numeric_vals = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce').dropna()
                if len(numeric_vals) > 0:
                    sorted_unique = sorted(numeric_vals.unique())
                    diffs = np.diff(sorted_unique)
                    if len(diffs) > 0 and np.all(np.isclose(diffs, diffs[0], atol=0.5)):
                        is_ordinal = True
            
            # Detectar binária
            is_binary = not is_numeric and unique_count == 2
            
            # Teste de normalidade (Shapiro-Wilk) para variáveis numéricas
            normality = None
            if is_numeric and len(non_null) >= 3 and len(non_null) <= 5000:
                try:
                    _, shapiro_p = stats.shapiro(non_null.values)
                    normality = "normal" if shapiro_p > 0.05 else "nao-normal"
                except:
                    normality = "unknown"
            
            var_info[col] = {
                "is_numeric": is_numeric,
                "is_ordinal": is_ordinal,
                "is_binary": is_binary,
                "unique_count": unique_count,
                "n": int(len(non_null)) if is_numeric else int(len(df[col].dropna())),
                "normality": normality,
                "dtype": str(df[col].dtype)
            }
        
        # ============================================================
        # PASSO 2: Identificar pares de variáveis relacionadas
        # ============================================================
        # Detectar pares "antes/depois", "pre/post", "baseline/followup"
        paired_keywords = {
            'antes': ['depois', 'apos', 'pós', 'pos', 'final'],
            'pre': ['pos', 'pós', 'post', 'follow'],
            'baseline': ['follow', 'final', 'end'],
            'inicio': ['fim', 'final', 'termino'],
            'entrada': ['saida', 'alta'],
            'controle': ['tratamento', 'intervenção', 'intervencao'],
        }
        
        detected_pairs = []
        cols_list = list(df.columns)
        used_in_pair = set()
        
        for i, col_a in enumerate(cols_list):
            for col_b in cols_list[i+1:]:
                a_lower = col_a.lower().strip()
                b_lower = col_b.lower().strip()
                
                for keyword, partners in paired_keywords.items():
                    a_match = keyword in a_lower
                    b_match = any(p in b_lower for p in partners)
                    a_match_rev = keyword in b_lower
                    b_match_rev = any(p in a_lower for p in partners)
                    
                    if (a_match and b_match) or (a_match_rev and b_match_rev):
                        if not is_meaningful_variable(col_a) or not is_meaningful_variable(col_b):
                            break
                        info_a = var_info.get(col_a, {})
                        info_b = var_info.get(col_b, {})
                        if info_a.get('is_numeric') and info_b.get('is_numeric'):
                            detected_pairs.append({
                                "col_a": col_a,
                                "col_b": col_b,
                                "test": "Teste T Pareado",
                                "test_options": ["Teste T Pareado", "Wilcoxon Pareado", "Excluir"],
                                "rationale": f"Variáveis pareadas detectadas ('{col_a}' vs '{col_b}'). Mesmo sujeito medido em dois momentos.",
                                "type": "Pareado (antes/depois)"
                            })
                            used_in_pair.add(col_a)
                            used_in_pair.add(col_b)
                            break
                if col_a in used_in_pair:
                    break
        
        # ============================================================
        # PASSO 3: Identificar correlações entre variáveis numéricas
        # ============================================================
        numeric_cols = [c for c in df.columns if var_info.get(c, {}).get('is_numeric') and c not in used_in_pair and is_meaningful_variable(c)]
        
        correlation_pairs = []
        for i, col_a in enumerate(numeric_cols):
            for col_b in numeric_cols[i+1:]:
                if col_b in used_in_pair:
                    continue
                a_name = col_a.lower()
                b_name = col_b.lower()
                
                # Detectar correlações semanticamente óbvias
                corr_keywords = {
                    ('hora', 'nota'): {'test': 'Correlação de Pearson', 'rationale': 'Relação esperada entre tempo de estudo e desempenho.'},
                    ('peso', 'peso'): {'test': 'Teste T Pareado', 'rationale': 'Comparação de peso antes e depois (pareado).'},
                    ('idade', 'tempo'): {'test': 'Correlação de Spearman', 'rationale': 'Relação entre idade e tempo de recuperação.'},
                    ('idade', 'nota'): {'test': 'Correlação de Pearson', 'rationale': 'Relação entre idade e desempenho.'},
                    ('satisf', 'nota'): {'test': 'Correlação de Spearman', 'rationale': 'Relação entre satisfação (ordinal) e nota.'},
                    ('satisf', 'peso'): {'test': 'Correlação de Spearman', 'rationale': 'Relação entre satisfação e peso.'},
                }
                
                matched_keyword = None
                for (kw_a, kw_b), info in corr_keywords.items():
                    if (kw_a in a_name and kw_b in b_name) or (kw_a in b_name and kw_b in a_name):
                        matched_keyword = (info, kw_a, kw_b)
                        break
                
                if matched_keyword:
                    info, kw_a, kw_b = matched_keyword
                    test = info['test']
                    if var_info[col_a].get('is_ordinal') or var_info[col_b].get('is_ordinal'):
                        test = 'Correlação de Spearman'
                    if var_info[col_a].get('normality') == 'nao-normal' or var_info[col_b].get('normality') == 'nao-normal':
                        test = 'Correlação de Spearman'
                    
                    correlation_pairs.append({
                        "col_a": col_a,
                        "col_b": col_b,
                        "test": test,
                        "test_options": [test, "Correlação de Spearman", "Regressão Linear", "Excluir"],
                        "rationale": info['rationale'],
                        "type": "Correlação"
                    })
                else:
                    # Abordagem genérica: sugerir correlação para TODOS os pares numéricos não usados
                    is_either_ordinal = var_info[col_a].get('is_ordinal') or var_info[col_b].get('is_ordinal')
                    is_either_nonnormal = var_info[col_a].get('normality') == 'nao-normal' or var_info[col_b].get('normality') == 'nao-normal'
                    
                    if is_either_ordinal or is_either_nonnormal:
                        default_test = 'Correlação de Spearman'
                        rationale = f'Correlação não-paramétrica entre "{col_a}" e "{col_b}" (dados ordinais ou não-normais).'
                    else:
                        default_test = 'Correlação de Pearson'
                        rationale = f'Correlação linear entre "{col_a}" e "{col_b}".'
                    
                    correlation_pairs.append({
                        "col_a": col_a,
                        "col_b": col_b,
                        "test": default_test,
                        "test_options": [default_test, "Correlação de Spearman", "Regressão Linear", "Excluir"],
                        "rationale": rationale,
                        "type": "Correlação"
                    })
        
        # ============================================================
        # PASSO 4: Identificar comparações de grupos (categórica vs numérica)
        # ============================================================
        categorical_cols = [c for c in df.columns if not var_info.get(c, {}).get('is_numeric') and is_meaningful_variable(c) and var_info.get(c, {}).get('unique_count', 0) <= 10]
        
        group_comparisons = []
        for cat_col in categorical_cols:
            cat_unique = var_info[cat_col]['unique_count']
            for num_col in numeric_cols:
                if num_col in used_in_pair:
                    continue
                
                # Verificar se já não está em uma correlação
                already_in_corr = any(cp['col_a'] == num_col or cp['col_b'] == num_col for cp in correlation_pairs)
                
                normality_status = var_info[num_col].get('normality', 'unknown')
                
                if cat_unique == 2:
                    if normality_status == 'normal':
                        rec_test = 'Teste T Independente'
                        opt_tests = ['Teste T Independente', 'Mann-Whitney U', 'Excluir']
                    else:
                        rec_test = 'Mann-Whitney U'
                        opt_tests = ['Mann-Whitney U', 'Teste T Independente', 'Excluir']
                elif cat_unique >= 3:
                    if normality_status == 'normal':
                        rec_test = 'ANOVA One-Way'
                        opt_tests = ['ANOVA One-Way', 'Kruskal-Wallis H', 'Excluir']
                    else:
                        rec_test = 'Kruskal-Wallis H'
                        opt_tests = ['Kruskal-Wallis H', 'ANOVA One-Way', 'Excluir']
                else:
                    continue
                
                group_comparisons.append({
                    "predictor": cat_col,
                    "outcome": num_col,
                    "test": rec_test,
                    "test_options": opt_tests,
                    "rationale": f"Comparação de '{num_col}' entre {cat_unique} grupos de '{cat_col}'. Normalidade: {normality_status}.",
                    "type": "Comparação de Grupos"
                })
        
        # ============================================================
        # PASSO 5: Montar protocolo final com Smart Selection
        # ============================================================
        # Determinar outcome sugerido ANTES de qualquer loop (Passos 5 e 6 dependem disso)
        candidate_cols = [c for c in df.columns if is_meaningful_variable(c)]
        # Usa o outcome confirmado pelo usuário; fallback para auto-detecção apenas se não informado
        if outcome_col and outcome_col in df.columns:
            outcome_suggested = outcome_col
        else:
            outcome_suggested = candidate_cols[-1] if candidate_cols else df.columns[-1]
        outcome_series = pd.to_numeric(df[outcome_suggested].astype(str).str.replace(',', '.'), errors='coerce')
        is_outcome_numeric = not outcome_series.isna().all() and len(outcome_series.dropna().unique()) >= 5

        variables = []
        var_id = 0
        total_rows = len(df)

        def calculate_relevance(col_name, info, involves_outcome=False):
            """Calcula score de relevância (0-100). Bônus para desfecho e penalidade para missing data."""
            if not info: return 50
            # 1. Completude (máx 60)
            completion = (info['n'] / total_rows) * 60
            # 2. Diversidade (máx 20)
            diversity = min(info['unique_count'] / 10, 1.0) * 20
            # 3. Bônus clínicos (máx 20)
            clinical_bonus = 0
            name_lower = col_name.lower()
            if any(w in name_lower for w in ['idade', 'age', 'sex', 'gender', 'outcome', 'desfecho', 'morte', 'alta', 'intern', 'weight', 'peso', 'imc', 'bmi']):
                clinical_bonus = 20
            # 4. Bônus de desfecho
            outcome_bonus = 25 if involves_outcome else 0
            
            # 5. Penalidade por dados faltantes (>25% missing)
            missing_penalty = 0
            pct_missing = (total_rows - info['n']) / total_rows * 100
            if pct_missing > 25:
                missing_penalty = (pct_missing - 25) * 0.8 # Penalidade agressiva para variáveis vazias
                
            score = completion + diversity + clinical_bonus + outcome_bonus - missing_penalty
            return max(0, min(score, 100))


        # 5a. Pares pareados (sempre selecionados — alto valor analítico)
        for pair in detected_pairs:
            inv_out = (pair['col_a'] == outcome_suggested or pair['col_b'] == outcome_suggested)
            rel = max(calculate_relevance(pair['col_a'], var_info.get(pair['col_a']), inv_out),
                      calculate_relevance(pair['col_b'], var_info.get(pair['col_b']), inv_out))
            rationale = pair['rationale']
            if inv_out: rationale = "⭐ [DESFECHO] " + rationale
            
            variables.append({
                "id": "TEMP",
                "name": f"{pair['col_a']} ↔ {pair['col_b']}",
                "variable_group": pair['col_a'],
                "type": pair['type'],
                "unique_count": 0,
                "recommended_test": pair['test'],
                "test_options": pair['test_options'],
                "rationale": rationale,
                "relevance": rel,
                "is_selected": inv_out,  # Pares pareados: selecionado só se envolve o outcome
                "pair": {"col_a": pair['col_a'], "col_b": pair['col_b']}
            })
        
        # 5b. Correlações (selecionadas se envolvem o desfecho ou alta relevância clínica)
        for pair in correlation_pairs:
            inv_out = (pair['col_a'] == outcome_suggested or pair['col_b'] == outcome_suggested)
            rel = max(calculate_relevance(pair['col_a'], var_info.get(pair['col_a']), inv_out),
                      calculate_relevance(pair['col_b'], var_info.get(pair['col_b']), inv_out))
            rationale = pair['rationale']
            if inv_out: rationale = "⭐ [DESFECHO] " + rationale

            variables.append({
                "id": "TEMP",
                "name": f"{pair['col_a']} ↔ {pair['col_b']}",
                "variable_group": pair['col_a'],
                "type": pair['type'],
                "unique_count": 0,
                "recommended_test": pair['test'],
                "test_options": pair['test_options'],
                "rationale": rationale,
                "relevance": rel,
                "is_selected": inv_out,  # Correlações: selecionado APENAS se envolve o outcome
                "pair": {"col_a": pair['col_a'], "col_b": pair['col_b']}
            })
        
        # 5c. Comparações de grupos (selecionadas se envolvem o desfecho)
        for comp in group_comparisons:
            inv_out = (comp['predictor'] == outcome_suggested or comp['outcome'] == outcome_suggested)
            rel = max(calculate_relevance(comp['predictor'], var_info.get(comp['predictor']), inv_out),
                      calculate_relevance(comp['outcome'], var_info.get(comp['outcome']), inv_out))
            rationale = comp['rationale']
            if inv_out: rationale = "⭐ [DESFECHO] " + rationale

            variables.append({
                "id": "TEMP",
                "name": f"{comp['predictor']} → {comp['outcome']}",
                "variable_group": comp['predictor'],
                "type": comp['type'],
                "unique_count": var_info[comp['predictor']]['unique_count'],
                "recommended_test": comp['test'],
                "test_options": comp['test_options'],
                "rationale": rationale,
                "relevance": rel,
                "is_selected": inv_out,  # Comparações: selecionado APENAS se envolve o outcome
                "pair": {"predictor": comp['predictor'], "outcome": comp['outcome']}
            })
        
        # 5c2. Regressão Logística (sempre selecionada — alto valor preditivo)
        binary_outcomes = [c for c in df.columns if var_info.get(c, {}).get('unique_count') == 2 and not var_info.get(c, {}).get('is_numeric') and is_meaningful_variable(c)]
        numeric_predictors = [c for c in df.columns if var_info.get(c, {}).get('is_numeric') and c not in used_in_pair and is_meaningful_variable(c)]

        for bin_out in binary_outcomes:
            if len(numeric_predictors) >= 1:
                is_out_bin = (bin_out == outcome_suggested)
                rel = calculate_relevance(bin_out, var_info.get(bin_out), is_out_bin) + 15
                rationale = f"Modelo preditivo para '{bin_out}' usando {len(numeric_predictors)} preditor(es) numérico(s)."
                if is_out_bin: rationale = "⭐ [DESFECHO] " + rationale

                variables.append({
                    "id": "TEMP",
                    "name": f"Regressão Logística → {bin_out}",
                    "variable_group": bin_out,
                    "type": "Regressão Logística",
                    "unique_count": 2,
                    "recommended_test": "Regressão Logística",
                    "test_options": ["Regressão Logística", "Qui-Quadrado (X²)", "Teste Exato de Fisher", "Excluir"],
                    "rationale": rationale,
                    "relevance": min(rel, 100),
                    "is_selected": is_out_bin,  # Regressão Logística: selecionada APENAS se o outcome é binário
                    "pair": {"predictor": bin_out, "outcome": bin_out, "logistic_predictors": numeric_predictors[:5]}
                })

        # ============================================================
        # PASSO 6: Associações Categórica × Categórica (Chi² / Fisher)
        # ============================================================
        meaningful_cats = [c for c in categorical_cols if is_meaningful_variable(c)]
        for i, col_a in enumerate(meaningful_cats):
            for col_b in meaningful_cats[i + 1:]:
                inv_out = (col_a == outcome_suggested or col_b == outcome_suggested)
                n_valid = int(len(df[[col_a, col_b]].dropna()))
                ua = var_info.get(col_a, {}).get('unique_count', 2)
                ub = var_info.get(col_b, {}).get('unique_count', 2)
                is_2x2 = (ua == 2 and ub == 2)
                # Fisher recomendado: n<15 ou tabela 2×2 com n<40
                if n_valid < 15 or (is_2x2 and n_valid < 40):
                    rec_test = "Teste Exato de Fisher"
                    opt_tests = ["Teste Exato de Fisher", "Qui-Quadrado (X²)", "Excluir"]
                    rationale = f"Associação entre '{col_a}' e '{col_b}'. Fisher recomendado (n={n_valid})."
                else:
                    rec_test = "Qui-Quadrado (X²)"
                    opt_tests = ["Qui-Quadrado (X²)", "Teste Exato de Fisher", "Excluir"]
                    rationale = f"Associação entre '{col_a}' e '{col_b}' (tabela {ua}×{ub}, n={n_valid})."
                
                if inv_out: rationale = "⭐ [DESFECHO] " + rationale

                rel = max(
                    calculate_relevance(col_a, var_info.get(col_a), inv_out),
                    calculate_relevance(col_b, var_info.get(col_b), inv_out)
                )
                variables.append({
                    "id": "TEMP",
                    "name": f"{col_a} ↔ {col_b}",
                    "variable_group": col_a,
                    "type": "Associação Categórica",
                    "unique_count": ua,
                    "recommended_test": rec_test,
                    "test_options": opt_tests,
                    "rationale": rationale,
                    "relevance": rel,
                    "is_selected": inv_out,  # Associações categóricas: selecionado APENAS se envolve o outcome
                    "pair": {"predictor": col_a, "outcome": col_b}
                })

        # 5d. Variáveis individuais descritivas (excluindo o desfecho)
        for col in df.columns:
            if not is_meaningful_variable(col): continue
            if col == outcome_suggested: continue
            vi = var_info.get(col, {})
            rel = calculate_relevance(col, vi)
            if vi.get('is_numeric'):
                variables.append({
                    "id": "TEMP",
                    "name": col,
                    "variable_group": col,
                    "type": "Descritiva (Numérica)",
                    "unique_count": vi['unique_count'],
                    "recommended_test": "Estatística Descritiva",
                    "test_options": ["Estatística Descritiva"],
                    "rationale": f"Estatísticas descritivas de '{col}'.",
                    "relevance": rel,
                    "is_selected": rel > 75,
                    "pair": {"col_a": col}
                })
            else:
                variables.append({
                    "id": "TEMP",
                    "name": col,
                    "variable_group": col,
                    "type": "Descritiva (Categórica)",
                    "unique_count": vi['unique_count'],
                    "recommended_test": "Estatística Descritiva",
                    "test_options": ["Estatística Descritiva", "Qui-Quadrado (X²)", "Teste Exato de Fisher"],
                    "rationale": f"Distribuição de frequências de '{col}'.",
                    "relevance": rel,
                    "is_selected": rel > 75,
                    "pair": {"col_a": col}
                })

        # ============================================================
        # PASSO CENTRALIZADO: Ordenação por Importância (is_selected -> relevance)
        # ============================================================
        variables.sort(key=lambda x: (x['is_selected'], x['relevance']), reverse=True)
        
        # Reatribuição de IDs após ordenação
        for idx, var in enumerate(variables):
            var["id"] = f"V{idx+1:03d}"

        # 5e. Inserir o desfecho principal no topo (sempre selecionado)
        variables.insert(0, {
            "id": "V000",
            "name": outcome_suggested,
            "variable_group": outcome_suggested,
            "type": "DESFECHO (Numérico)" if is_outcome_numeric else "DESFECHO (Categórico)",
            "unique_count": int(len(df[outcome_suggested].dropna().unique())),
            "recommended_test": "Estatística Descritiva",
            "test_options": ["Estatística Descritiva"],
            "rationale": "Análise descritiva/perfil do desfecho principal selecionado.",
            "relevance": 100,
            "is_selected": True,
            "pair": {"col_a": outcome_suggested}
        })

        # Metadata enriquecida com contadores de Smart Selection
        cat_assoc_count = sum(1 for v in variables if v.get('type') == 'Associação Categórica')
        meta = {
            "total_pairs_detected": len(detected_pairs) + len(correlation_pairs) + len(group_comparisons) + cat_assoc_count,
            "paired_tests": len(detected_pairs),
            "correlation_tests": len(correlation_pairs),
            "group_comparison_tests": len(group_comparisons),
            "categorical_association_tests": cat_assoc_count,
            "selected_count": sum(1 for v in variables if v.get('is_selected')),
            "optional_count": sum(1 for v in variables if not v.get('is_selected')),
        }

        return clean_dict_values({
            "outcome": outcome_suggested,
            "protocol": variables,
            "meta": meta
        })
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERR: Analyze Protocol v7 -> {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Erro na análise do protocolo: {str(e)}")

def compute_effect_size(test_type, **kwargs):
    """Computa tamanhos de efeito apropriados para cada teste."""
    try:
        if test_type in ("ttest_paired", "wilcoxon"):
            diff = kwargs.get("diff")
            if diff is not None and len(diff) > 1:
                std_diff = np.std(diff, ddof=1)
                if std_diff > 0:
                    cohens_d = float(np.mean(diff) / std_diff)
                    return {"cohens_d": round(cohens_d, 4), "interpretation": interpret_cohens_d(cohens_d)}
        elif test_type in ("ttest_ind", "mann_whitney"):
            g1, g2 = kwargs.get("g1"), kwargs.get("g2")
            if g1 is not None and g2 is not None:
                n1, n2 = len(g1), len(g2)
                s1, s2 = np.var(g1, ddof=1), np.var(g2, ddof=1)
                s_pooled = np.sqrt(((n1-1)*s1 + (n2-1)*s2) / (n1+n2-2)) if (n1+n2-2) > 0 else 0
                if s_pooled > 0:
                    cohens_d = float((np.mean(g1) - np.mean(g2)) / s_pooled)
                    return {"cohens_d": round(cohens_d, 4), "interpretation": interpret_cohens_d(cohens_d)}
        elif test_type in ("anova", "kruskal"):
            groups = kwargs.get("groups")
            if groups and len(groups) >= 2:
                all_vals = np.concatenate(groups)
                grand_mean = np.mean(all_vals)
                ss_between = sum(len(g) * (np.mean(g) - grand_mean)**2 for g in groups)
                ss_within = sum(sum((x - np.mean(g))**2 for x in g) for g in groups)
                ss_total = ss_between + ss_within
                if ss_total > 0:
                    eta_sq = float(ss_between / ss_total)
                    return {"eta_squared": round(eta_sq, 4), "interpretation": interpret_eta_squared(eta_sq)}
        elif test_type in ("pearson", "spearman"):
            r = kwargs.get("r")
            if r is not None:
                r2 = float(r ** 2)
                return {"r_squared": round(r2, 4), "interpretation": interpret_r_squared(r2)}
        elif test_type in ("chi2",):
            chi2_stat = kwargs.get("chi2")
            n_total = kwargs.get("n_total")
            if chi2_stat is not None and n_total and n_total > 0:
                v = float(chi2_stat / n_total)
                return {"cramers_v": round(v, 4), "interpretation": interpret_cramers_v(v)}
    except:
        pass
    return None

def interpret_cohens_d(d):
    abs_d = abs(d)
    if abs_d >= 0.8: return "Grande"
    if abs_d >= 0.5: return "Médio"
    if abs_d >= 0.2: return "Pequeno"
    return "Desprezível"

def interpret_eta_squared(eta):
    if eta >= 0.14: return "Grande"
    if eta >= 0.06: return "Médio"
    if eta >= 0.01: return "Pequeno"
    return "Desprezível"

def interpret_r_squared(r2):
    if r2 >= 0.81: return "Muito forte"
    if r2 >= 0.49: return "Forte"
    if r2 >= 0.25: return "Moderado"
    if r2 >= 0.09: return "Fraco"
    return "Muito fraco"

def interpret_cramers_v(v):
    if v >= 0.5: return "Forte"
    if v >= 0.3: return "Moderado"
    if v >= 0.1: return "Fraco"
    return "Desprezível"

def compute_ci_95(data):
    """Calcula IC 95% da média."""
    n = len(data)
    if n < 2: return None
    mean = np.mean(data)
    se = np.std(data, ddof=1) / np.sqrt(n)
    margin = 1.96 * se
    return {"mean": round(float(mean), 4), "ci_lower": round(float(mean - margin), 4), "ci_upper": round(float(mean + margin), 4), "se": round(float(se), 4)}

def wilson_ci_proportion(successes, n, confidence=0.95):
    """Intervalo de confiança de Wilson para proporções."""
    if n == 0: return {"proportion": 0, "ci_lower": 0, "ci_upper": 0, "pct": "0.0%", "ci_pct": "0.0% - 0.0%"}
    p = successes / n
    z = 1.96  # 95% CI
    denom = 1 + z**2 / n
    center = (p + z**2 / (2*n)) / denom
    spread = z * np.sqrt((p*(1-p) + z**2/(4*n)) / n) / denom
    lower = max(0, center - spread)
    upper = min(1, center + spread)
    return {
        "proportion": round(float(p), 4),
        "pct": f"{p*100:.1f}%",
        "ci_lower": round(float(lower), 4),
        "ci_upper": round(float(upper), 4),
        "ci_pct": f"{lower*100:.1f}% - {upper*100:.1f}%",
        "n": n,
        "successes": int(successes)
    }

def compute_odds_ratio(contingency_df):
    """Calcula Odds Ratio e Risk Ratio para tabela 2x2."""
    if contingency_df.shape != (2, 2):
        return None
    try:
        a = float(contingency_df.iloc[0, 0])
        b = float(contingency_df.iloc[0, 1])
        c = float(contingency_df.iloc[1, 0])
        d = float(contingency_df.iloc[1, 1])
        
        if a == 0 or b == 0 or c == 0 or d == 0:
            # Haldane correction
            a += 0.5; b += 0.5; c += 0.5; d += 0.5
        
        or_val = (a * d) / (b * c)
        log_or_se = np.sqrt(1/a + 1/b + 1/c + 1/d)
        log_or = np.log(or_val)
        or_lower = np.exp(log_or - 1.96 * log_or_se)
        or_upper = np.exp(log_or + 1.96 * log_or_se)
        
        # Risk Ratio
        risk1 = a / (a + b)
        risk2 = c / (c + d)
        if risk2 > 0:
            rr = risk1 / risk2
            log_rr_se = np.sqrt((1-a/(a+b))/(a) + (1-c/(c+d))/(c)) if a > 0 and c > 0 else None
            if log_rr_se:
                log_rr = np.log(rr)
                rr_lower = np.exp(log_rr - 1.96 * log_rr_se)
                rr_upper = np.exp(log_rr + 1.96 * log_rr_se)
            else:
                rr_lower, rr_upper = None, None
        else:
            rr, rr_lower, rr_upper = None, None, None
        
        return {
            "odds_ratio": round(float(or_val), 4),
            "or_ci_95": f"{or_lower:.2f} - {or_upper:.2f}",
            "risk_ratio": round(float(rr), 4) if rr else None,
            "rr_ci_95": f"{rr_lower:.2f} - {rr_upper:.2f}" if rr and rr_lower else None,
            "interpretation": "Fator de risco (OR>1)" if or_val > 1 else ("Fator protetor (OR<1)" if or_val < 1 else "Sem associação (OR=1)")
        }
    except:
        return None

def compute_missing_data_summary(df):
    """Resumo de dados faltantes por variável."""
    missing = []
    total = len(df)
    for col in df.columns:
        n_missing = int(df[col].isna().sum())
        pct = (n_missing / total * 100) if total > 0 else 0
        missing.append({
            "variable": col,
            "n_missing": n_missing,
            "n_valid": total - n_missing,
            "pct_missing": round(pct, 1),
            "pct_valid": round(100 - pct, 1)
        })
    return missing

def check_statistical_assumptions(test_type, **kwargs):
    """Verifica pressupostos estatísticos e retorna warnings."""
    warnings = []
    
    if test_type in ("ttest_paired", "ttest_ind"):
        diff = kwargs.get("diff") or (kwargs.get("g1") - kwargs.get("g2")) if kwargs.get("g1") is not None and kwargs.get("g2") is not None else None
        if diff is not None and len(diff) >= 3:
            try:
                _, shapiro_p = stats.shapiro(diff)
                if shapiro_p < 0.05:
                    warnings.append({
                        "type": "normality_violation",
                        "severity": "warning",
                        "message": f"Os dados não seguem distribuição normal (Shapiro-Wilk p={shapiro_p:.4f} < 0.05). Considere usar teste não-paramétrico (Wilcoxon/Mann-Whitney).",
                        "recommendation": "Wilcoxon Pareado" if test_type == "ttest_paired" else "Mann-Whitney U"
                    })
            except:
                pass
        
        # Homogeneity of variance (Levene's test) for independent t-test
        if test_type == "ttest_ind" and kwargs.get("g1") is not None and kwargs.get("g2") is not None:
            try:
                _, levene_p = stats.levene(kwargs["g1"], kwargs["g2"])
                if levene_p < 0.05:
                    warnings.append({
                        "type": "homogeneity_violation",
                        "severity": "warning",
                        "message": f"Variâncias desiguais entre grupos (Levene p={levene_p:.4f}). Considere usar Welch's t-test ou Mann-Whitney.",
                        "recommendation": "Mann-Whitney U"
                    })
            except:
                pass
        
        # Sample size check
        n = kwargs.get("n", 0)
        if n > 0 and n < 30:
            warnings.append({
                "type": "small_sample",
                "severity": "info",
                "message": f"Amostra pequena (n={n} < 30). Resultados devem ser interpretados com cautela.",
                "recommendation": None
            })
    
    elif test_type in ("anova",):
        groups = kwargs.get("groups", [])
        if groups:
            # Homogeneity of variance
            try:
                _, levene_p = stats.levene(*groups)
                if levene_p < 0.05:
                    warnings.append({
                        "type": "homogeneity_violation",
                        "severity": "warning",
                        "message": f"Variâncias heterogêneas entre grupos (Levene p={levene_p:.4f}). Considere Kruskal-Wallis.",
                        "recommendation": "Kruskal-Wallis H"
                    })
            except:
                pass
            
            # Normality per group
            for i, g in enumerate(groups):
                if len(g) >= 3:
                    try:
                        _, sw_p = stats.shapiro(g)
                        if sw_p < 0.05:
                            warnings.append({
                                "type": "normality_violation",
                                "severity": "warning",
                                "message": f"Grupo {i+1} não é normal (Shapiro-Wilk p={sw_p:.4f}). Considere Kruskal-Wallis.",
                                "recommendation": "Kruskal-Wallis H"
                            })
                    except:
                        pass
            
            # Sample size per group
            for i, g in enumerate(groups):
                if len(g) < 5:
                    warnings.append({
                        "type": "small_group",
                        "severity": "warning",
                        "message": f"Grupo {i+1} tem apenas n={len(g)} observações (< 5). Poder estatístico comprometido.",
                        "recommendation": None
                    })
    
    elif test_type in ("kruskal",):
        groups = kwargs.get("groups", [])
        if groups:
            for i, g in enumerate(groups):
                if len(g) < 5:
                    warnings.append({
                        "type": "small_group",
                        "severity": "warning",
                        "message": f"Grupo {i+1} tem apenas n={len(g)} observações.",
                        "recommendation": None
                    })
    
    elif test_type in ("chi2",):
        expected = kwargs.get("expected")
        if expected is not None:
            if np.any(expected < 5):
                warnings.append({
                    "type": "expected_frequency_low",
                    "severity": "warning",
                    "message": "Células com frequência esperada < 5 detectadas. Qui-Quadrado pode ser impreciso. Considere Teste Exato de Fisher.",
                    "recommendation": "Teste Exato de Fisher"
                })
    
    return warnings

def compute_post_hoc_anova(groups, group_names):
    """Post-hoc pairwise comparisons após ANOVA significativa."""
    results = []
    n_comparisons = len(groups) * (len(groups) - 1) // 2
    alpha_bonferroni = 0.05 / n_comparisons
    
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            g1, g2 = groups[i], groups[j]
            if len(g1) >= 2 and len(g2) >= 2:
                # Tukey-style pairwise t-test with Bonferroni
                res = stats.ttest_ind(g1, g2)
                p_corrected = min(res.pvalue * n_comparisons, 1.0)
                
                # Effect size
                n1, n2 = len(g1), len(g2)
                s1, s2 = np.var(g1, ddof=1), np.var(g2, ddof=1)
                s_pooled = np.sqrt(((n1-1)*s1 + (n2-1)*s2) / (n1+n2-2)) if (n1+n2-2) > 0 else 0
                cohens_d = float((np.mean(g1) - np.mean(g2)) / s_pooled) if s_pooled > 0 else 0
                
                results.append({
                    "comparison": f"{group_names[i]} vs {group_names[j]}",
                    "t_statistic": round(float(res.statistic), 4),
                    "p_value_raw": round(float(res.pvalue), 6),
                    "p_value_bonferroni": round(float(p_corrected), 6),
                    "significant": p_corrected < 0.05,
                    "cohens_d": round(cohens_d, 4),
                    "effect_interpretation": interpret_cohens_d(cohens_d)
                })
    
    return {"method": "Bonferroni", "alpha_adjustado": round(alpha_bonferroni, 6), "n_comparisons": n_comparisons, "comparisons": results}

def compute_post_hoc_kruskal(groups, group_names):
    """Post-hoc pairwise Mann-Whitney após Kruskal-Wallis significativo."""
    results = []
    n_comparisons = len(groups) * (len(groups) - 1) // 2
    
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            g1, g2 = groups[i], groups[j]
            if len(g1) >= 1 and len(g2) >= 1:
                res = stats.mannwhitneyu(g1, g2)
                p_corrected = min(res.pvalue * n_comparisons, 1.0)
                
                results.append({
                    "comparison": f"{group_names[i]} vs {group_names[j]}",
                    "u_statistic": round(float(res.statistic), 4),
                    "p_value_raw": round(float(res.pvalue), 6),
                    "p_value_bonferroni": round(float(p_corrected), 6),
                    "significant": p_corrected < 0.05
                })
    
    return {"method": "Bonferroni", "alpha_adjustado": round(0.05 / n_comparisons, 6), "n_comparisons": n_comparisons, "comparisons": results}

def estimate_achieved_power(test_type, **kwargs):
    """Estima poder estatístico alcançado (aproximação)."""
    try:
        if test_type in ("ttest_paired", "ttest_ind"):
            n = kwargs.get("n", 0)
            d = kwargs.get("cohens_d", 0)
            if n > 2 and d:
                # Approximation using normal distribution
                nc = abs(d) * np.sqrt(n / 2)
                power = stats.norm.cdf(nc - 1.96)
                return round(float(max(0, min(1, power))), 4)
        
        elif test_type in ("anova", "kruskal"):
            groups = kwargs.get("groups", [])
            if groups and len(groups) >= 2:
                n_total = sum(len(g) for g in groups)
                k = len(groups)
                all_vals = np.concatenate(groups)
                grand_mean = np.mean(all_vals)
                ss_between = sum(len(g) * (np.mean(g) - grand_mean)**2 for g in groups)
                ss_within = sum(sum((x - np.mean(g))**2 for x in g) for g in groups)
                ss_total = ss_between + ss_within
                f_sq = (ss_between / (k - 1)) / (ss_within / (n_total - k)) if ss_within > 0 and (n_total - k) > 0 else 0
                if f_sq > 0 and n_total > k:
                    nc = f_sq * (n_total - k)
                    power = stats.ncf.cdf(stats.f.ppf(0.95, k-1, n_total-k), k-1, n_total-k, nc)
                    return round(float(max(0, min(1, 1 - power))), 4)
        
        elif test_type in ("pearson", "spearman"):
            n = kwargs.get("n", 0)
            r = abs(kwargs.get("r", 0))
            if n > 3 and r:
                z = 0.5 * np.log((1 + r) / (1 - r))
                se = 1 / np.sqrt(n - 3)
                power = stats.norm.cdf(abs(z) * np.sqrt(n - 3) - 1.96)
                return round(float(max(0, min(1, power))), 4)
    except:
        pass
    return None

def generate_interpretation(test_type, stat, p_val, effect_size=None, post_hoc=None):
    """Gera interpretação em linguagem natural dos resultados."""
    if p_val is None:
        return None
    
    sig = p_val < 0.05
    sig_str = "estatisticamente significativo" if sig else "não estatisticamente significativo"
    
    interpretations = []
    
    if test_type in ("ttest_paired", "wilcoxon"):
        direction = "maior" if stat > 0 else "menor"
        interpretations.append(f"O teste {test_type.replace('_', ' ')} revelou uma diferença {sig_str} (p={p_val:.4f}).")
        if sig and stat:
            interpretations.append(f"O grupo A é {direction} que o grupo B.")
    
    elif test_type in ("ttest_ind", "mann_whitney"):
        interpretations.append(f"O teste revelou uma diferença {sig_str} entre os grupos (p={p_val:.4f}).")
    
    elif test_type in ("anova", "kruskal"):
        interpretations.append(f"O teste revelou diferenças {sig_str} entre os grupos (p={p_val:.4f}).")
        if sig and post_hoc:
            sig_pairs = [c["comparison"] for c in post_hoc.get("comparisons", []) if c.get("significant")]
            if sig_pairs:
                interpretations.append(f"Comparações pós-hoc: diferenças significativas entre {', '.join(sig_pairs[:3])}.")
    
    elif test_type in ("pearson", "spearman"):
        strength = "forte" if abs(stat) > 0.5 else "moderada" if abs(stat) > 0.3 else "fraca"
        direction = "positiva" if stat > 0 else "negativa"
        interpretations.append(f"Existe uma correlação {strength} e {direction} {sig_str} (r={stat:.4f}, p={p_val:.4f}).")
    
    elif test_type in ("chi2",):
        interpretations.append(f"A associação entre as variáveis é {sig_str} (χ², p={p_val:.4f}).")
    
    elif test_type in ("fisher",):
        interpretations.append(f"O Teste Exato de Fisher revelou uma associação {sig_str} entre as variáveis (p={p_val:.4f}).")
    
    elif test_type in ("logistic_regression",):
        interpretations.append(f"A Regressão Logística revelou um modelo {sig_str} (p={p_val:.4f}).")
        if stat is not None:
            interpretations.append(f"Acurácia do modelo: {stat:.1f}%.")
    
    if effect_size:
        if "cohens_d" in effect_size:
            interpretations.append(f"Tamanho do efeito: d={effect_size['cohens_d']:.2f} ({effect_size['interpretation']}).")
        elif "eta_squared" in effect_size:
            interpretations.append(f"Tamanho do efeito: η²={effect_size['eta_squared']:.4f} ({effect_size['interpretation']}).")
        elif "r_squared" in effect_size:
            interpretations.append(f"Variância explicada: R²={effect_size['r_squared']:.4f} ({effect_size['interpretation']}).")
        elif "cramers_v" in effect_size:
            interpretations.append(f"Associação: V de Cramer={effect_size['cramers_v']:.4f} ({effect_size['interpretation']}).")
    
    power = effect_size.get("achieved_power") if effect_size else None
    if power is not None:
        power_pct = power * 100
        if power < 0.8:
            interpretations.append(f"⚠ Poder estatístico alcançado: {power_pct:.0f}% (< 80%). Risco de erro tipo II (falso negativo).")
        else:
            interpretations.append(f"Poder estatístico alcançado: {power_pct:.0f}% (adequado).")
    
    return " ".join(interpretations)

# Helpers para robustez estatística
def safe_get_pval(df):
    """Extrai o p-valor de um DataFrame do Pingouin buscando nomes comuns."""
    for col in ['p-val', 'p-unc', 'P-unc', 'pval', 'p_val', 'p-corr']:
        if col in df.columns:
            return df[col].values[0]
    return None

def round_res(val, decimals=4):
    """Arredonda valor garantindo que NaN/Inf virem None (null no JSON)."""
    try:
        if val is None:
            return None
        f_val = float(val)
        if np.isnan(f_val) or np.isinf(f_val):
            return None
        return round(f_val, decimals)
    except:
        return None

def pg_ttest_ind(g1, g2):
    """Teste T independente com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(g1) >= 2 and len(g2) >= 2:
            # Caso especial: variância zero em ambos (ex: [5,5,5] vs [5,5,5])
            if np.var(g1) == 0 and np.var(g2) == 0 and np.mean(g1) == np.mean(g2):
                return {
                    "statistic": 0.0, "p_value": 1.0, "ci_lower": 0.0, "ci_upper": 0.0,
                    "cohens_d": 0.0, "engine": "pingouin", "warning": "Variância zero em ambos os grupos."
                }
            
            result = pg.ttest(g1, g2, paired=False)
            ci95 = result["CI95"].values[0] if "CI95" in result.columns else [None, None]
            
            return {
                "statistic": round_res(result["T"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "ci_lower": round_res(ci95[0]),
                "ci_upper": round_res(ci95[1]),
                "cohens_d": round_res(result["cohen_d"].values[0]) if "cohen_d" in result.columns else None,
                "bf10": round_res(result["BF10"].values[0]) if "BF10" in result.columns else None,
                "power": round_res(result["power"].values[0]) if "power" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin ttest_ind fallback: {e}")
    
    res = stats.ttest_ind(g1, g2)
    n1, n2 = len(g1), len(g2)
    s1, s2 = np.var(g1, ddof=1), np.var(g2, np.var(g2, ddof=1) if len(g2) > 1 else 0)
    s_pooled = np.sqrt(((n1-1)*s1 + (n2-1)*s2) / (n1+n2-2)) if (n1+n2-2) > 0 else 0
    cohens_d = float((np.mean(g1) - np.mean(g2)) / s_pooled) if s_pooled > 0 else 0
    return {
        "statistic": round_res(res.statistic),
        "p_value": round_res(res.pvalue),
        "ci_lower": None,
        "ci_upper": None,
        "cohens_d": round_res(cohens_d),
        "bf10": None,
        "power": None,
        "engine": "scipy"
    }

def pg_ttest_paired(a, b):
    """Teste T pareado com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(a) >= 2:
            result = pg.ttest(a, b, paired=True)
            ci95 = result["CI95"].values[0] if "CI95" in result.columns else [None, None]
            return {
                "statistic": round_res(result["T"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "ci_lower": round_res(ci95[0]),
                "ci_upper": round_res(ci95[1]),
                "cohens_d": round_res(result["cohen_d"].values[0]) if "cohen_d" in result.columns else None,
                "bf10": round_res(result["BF10"].values[0]) if "BF10" in result.columns else None,
                "power": round_res(result["power"].values[0]) if "power" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin ttest_paired fallback: {e}")
    
    res = stats.ttest_rel(a, b)
    diff = a - b
    std_diff = np.std(diff, ddof=1)
    cohens_d = float(np.mean(diff) / std_diff) if std_diff > 0 else 0
    return {
        "statistic": round(float(res.statistic), 4),
        "p_value": round(float(res.pvalue), 4),
        "ci_lower": None,
        "ci_upper": None,
        "cohens_d": round(cohens_d, 4),
        "bf10": None,
        "power": None,
        "engine": "scipy"
    }

def pg_mannwhitney(g1, g2):
    """Mann-Whitney U com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(g1) >= 1 and len(g2) >= 1:
            result = pg.mwu(g1, g2)
            return {
                "statistic": round_res(result["U_val"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "cohens_d": round_res(result["CLES"].values[0]) if "CLES" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin mwu fallback: {e}")
    
    res = stats.mannwhitneyu(g1, g2)
    return {
        "statistic": round_res(res.statistic),
        "p_value": round_res(res.pvalue),
        "cohens_d": None,
        "engine": "scipy"
    }

def pg_wilcoxon(a, b):
    """Wilcoxon pareado com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(a) >= 2:
            result = pg.wilcoxon(a, b)
            return {
                "statistic": round_res(result["W_val"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "cohens_d": round_res(result["CLES"].values[0]) if "CLES" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin wilcoxon fallback: {e}")
    
    res = stats.wilcoxon(a, b)
    diff = a - b
    std_diff = np.std(diff, ddof=1)
    cohens_d = float(np.mean(diff) / std_diff) if std_diff > 0 else 0
    return {
        "statistic": round(float(res.statistic), 4),
        "p_value": round(float(res.pvalue), 4),
        "cohens_d": round(cohens_d, 4),
        "engine": "scipy"
    }

def pg_anova(df_in, dv, between):
    """ANOVA One-Way com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(df_in) >= 3:
            result = pg.anova(data=df_in, dv=dv, between=between, detailed=True)
            return {
                "statistic": round_res(result["F"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "eta_squared": round_res(result["np2"].values[0]) if "np2" in result.columns else None,
                "power": round_res(result["power"].values[0]) if "power" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin anova fallback: {e}")
    
    groups = [group_vals for _, group_vals in df_in.groupby(between)[dv]]
    groups = [g.dropna().values for g in groups]
    groups = [g for g in groups if len(g) >= 2]
    if len(groups) >= 2:
        res = stats.f_oneway(*groups)
        all_vals = np.concatenate(groups)
        grand_mean = np.mean(all_vals)
        ss_between = sum(len(g) * (np.mean(g) - grand_mean)**2 for g in groups)
        ss_within = sum(sum((x - np.mean(g))**2 for x in g) for g in groups)
        ss_total = ss_between + ss_within
        eta_sq = float(ss_between / ss_total) if ss_total > 0 else 0
        return {
            "statistic": round(float(res.statistic), 4),
            "p_value": round(float(res.pvalue), 4),
            "eta_squared": round(eta_sq, 4),
            "power": None,
            "engine": "scipy"
        }
    return None

def pg_kruskal(df_in, dv, between):
    """Kruskal-Wallis com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(df_in) >= 3:
            result = pg.kruskal(data=df_in, dv=dv, between=between)
            # Pingouin >=0.5 retorna 'eta2'; versões antigas retornavam 'np2'
            eta2_col = "eta2" if "eta2" in result.columns else "np2" if "np2" in result.columns else None
            eta2_val = float(result[eta2_col].values[0]) if eta2_col else 0.0
            
            return {
                "statistic": round_res(result["H"].values[0]),
                "p_value": round_res(safe_get_pval(result)),
                "eta_squared": round_res(eta2_val),
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin kruskal fallback: {e}")
    
    groups = [group_vals for _, group_vals in df_in.groupby(between)[dv]]
    groups = [g.dropna().values for g in groups]
    groups = [g for g in groups if len(g) >= 1]
    if len(groups) >= 2:
        res = stats.kruskal(*groups)
        all_vals = np.concatenate(groups)
        grand_mean = np.mean(all_vals)
        ss_between = sum(len(g) * (np.mean(g) - grand_mean)**2 for g in groups)
        ss_within = sum(sum((x - np.mean(g))**2 for x in g) for g in groups)
        ss_total = ss_between + ss_within
        eta_sq = float(ss_between / ss_total) if ss_total > 0 else 0
        return {
            "statistic": round(float(res.statistic), 4),
            "p_value": round(float(res.pvalue), 4),
            "eta_squared": round(eta_sq, 4),
            "engine": "scipy"
        }
    return None

def pg_pearson(x, y):
    """Correlação de Pearson com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(x) >= 3:
            result = pg.corr(x, y, method="pearson")
            ci95 = result["CI95"].values[0] if "CI95" in result.columns else [None, None]
            r_val = float(result["r"].values[0])
            return {
                "statistic": round_res(r_val),
                "p_value": round_res(safe_get_pval(result)),
                "ci_lower": round_res(ci95[0]),
                "ci_upper": round_res(ci95[1]),
                "r_squared": round_res(r_val ** 2),
                "bf10": round_res(result["BF10"].values[0]) if "BF10" in result.columns else None,
                "power": round_res(result["power"].values[0]) if "power" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin pearson fallback: {e}")
    
    res = stats.pearsonr(x, y)
    return {
        "statistic": round_res(res.statistic),
        "p_value": round_res(res.pvalue),
        "ci_lower": None,
        "ci_upper": None,
        "r_squared": round_res(res.statistic ** 2),
        "bf10": None,
        "power": None,
        "engine": "scipy"
    }

def pg_spearman(x, y):
    """Correlação de Spearman com Pingouin (fallback: scipy)."""
    try:
        if PINGOUIN_AVAILABLE and len(x) >= 3:
            result = pg.corr(x, y, method="spearman")
            ci95 = result["CI95"].values[0] if "CI95" in result.columns else [None, None]
            rho_val = float(result["r"].values[0]) if "r" in result.columns else float(result["rho"].values[0])
            return {
                "statistic": round_res(rho_val),
                "p_value": round_res(safe_get_pval(result)),
                "ci_lower": round_res(ci95[0]),
                "ci_upper": round_res(ci95[1]),
                "r_squared": round_res(rho_val ** 2),
                "bf10": round_res(result["BF10"].values[0]) if "BF10" in result.columns else None,
                "power": round_res(result["power"].values[0]) if "power" in result.columns else None,
                "engine": "pingouin"
            }
    except Exception as e:
        print(f"Pingouin spearman fallback: {e}")
    
    res = stats.spearmanr(x, y)
    return {
        "statistic": round(float(res.correlation), 4),
        "p_value": round(float(res.pvalue), 4),
        "ci_lower": None,
        "ci_upper": None,
        "r_squared": round(float(res.correlation ** 2), 4),
        "bf10": None,
        "power": None,
        "engine": "scipy"
    }

def pg_fisher_exact(contingency):
    """Teste Exato de Fisher para tabela 2x2."""
    try:
        if contingency.shape != (2, 2):
            return None
        a, b = int(contingency.iloc[0, 0]), int(contingency.iloc[0, 1])
        c, d = int(contingency.iloc[1, 0]), int(contingency.iloc[1, 1])
        oddsratio, p_value = fisher_exact([[a, b], [c, d]])
        
        # Cramér's V como effect size — fórmula correta: sqrt(χ²/(N*(min(r,c)-1)))
        n_total = a + b + c + d
        chi2_stat, _, _, _ = stats.chi2_contingency(contingency)
        min_dim = min(contingency.shape) - 1
        cramers_v = float(np.sqrt(chi2_stat / (n_total * min_dim))) if n_total > 0 and min_dim > 0 else 0
        
        # Odds Ratio com IC95%
        if a == 0 or b == 0 or c == 0 or d == 0:
            a += 0.5; b += 0.5; c += 0.5; d += 0.5
        or_val = (a * d) / (b * c)
        log_or_se = np.sqrt(1/a + 1/b + 1/c + 1/d)
        log_or = np.log(or_val)
        or_lower = np.exp(log_or - 1.96 * log_or_se)
        or_upper = np.exp(log_or + 1.96 * log_or_se)
        
        return {
            "statistic": round(float(oddsratio), 4),
            "p_value": round(float(p_value), 4),
            "odds_ratio": round(float(or_val), 4),
            "or_ci_95": f"{or_lower:.2f} - {or_upper:.2f}",
            "cramers_v": round(cramers_v, 4),
            "interpretation": "Fator de risco (OR>1)" if or_val > 1 else ("Fator protetor (OR<1)" if or_val < 1 else "Sem associação (OR=1)"),
            "engine": "scipy"
        }
    except Exception as e:
        print(f"Fisher exact error: {e}")
        return None

def pg_logistic_regression(df_in, predictor_cols, outcome_col):
    """Regressão Logística com statsmodels."""
    try:
        df_work = df_in[predictor_cols + [outcome_col]].dropna().copy()
        if len(df_work) < 10:
            return None
        
        # Converter outcome para binário (0/1)
        unique_outcomes = sorted(df_work[outcome_col].unique())
        if len(unique_outcomes) != 2:
            return None
        outcome_map = {unique_outcomes[0]: 0, unique_outcomes[1]: 1}
        df_work[outcome_col] = df_work[outcome_col].map(outcome_map)
        
        # Converter predictores categóricos para dummy
        df_work = pd.get_dummies(df_work, columns=[c for c in predictor_cols if not pd.api.types.is_numeric_dtype(df_work[c])], drop_first=True)
        
        # Ajustar nomes das colunas após get_dummies
        actual_predictors = [c for c in df_work.columns if c != outcome_col]
        if len(actual_predictors) == 0:
            return None
        
        X = df_work[actual_predictors].astype(float)
        y = df_work[outcome_col].astype(float)
        
        # Adicionar constante
        X = add_constant(X, has_constant='add')
        
        # Ajustar modelo
        logit_model = Logit(y, X)
        result = logit_model.fit(disp=0, maxiter=200)
        
        # Acurácia
        predicted_probs = result.predict()
        predicted_classes = (predicted_probs > 0.5).astype(int)
        accuracy = float((predicted_classes == y).mean() * 100)
        
        # Coeficientes significativos
        sig_predictors = []
        for col in result.params.index:
            if col == 'const':
                continue
            p_val = float(result.pvalues[col])
            coef = float(result.params[col])
            or_val = float(np.exp(coef))
            sig_predictors.append({
                "predictor": col,
                "coefficient": round(coef, 4),
                "p_value": round(p_val, 4),
                "odds_ratio": round(or_val, 4),
                "significant": p_val < 0.05
            })
        
        # Pseudo R²
        pseudo_r2 = float(result.prsquared)
        
        # Overall p-value (Likelihood Ratio)
        overall_p = float(result.llr_pvalue)
        
        return {
            "accuracy": round(accuracy, 1),
            "pseudo_r2": round(pseudo_r2, 4),
            "overall_p_value": round(overall_p, 4),
            "n_observations": len(df_work),
            "predictors": sig_predictors,
            "significant_predictors": [p for p in sig_predictors if p["significant"]],
            "engine": "statsmodels"
        }
    except Exception as e:
        print(f"Logistic regression error: {e}")
        return None

def pg_linear_regression(x_vals, y_vals, x_name="X", y_name="Y"):
    """Regressão Linear Simples via Pingouin (com fallback para scipy)."""
    try:
        x = np.array(x_vals, dtype=float)
        y = np.array(y_vals, dtype=float)
        mask = ~np.isnan(x) & ~np.isnan(y) & np.isfinite(x) & np.isfinite(y)
        x, y = x[mask], y[mask]
        if len(x) < 3: return None

        if PINGOUIN_AVAILABLE:
            try:
                df_lr = pd.DataFrame({x_name: x, y_name: y})
                res = pg.linear_regression(df_lr[[x_name]], df_lr[y_name], add_intercept=True)
                
                slope_row = res[res['names'] == x_name]
                if slope_row.empty: 
                    slope_row = res.iloc[-1]
                else: 
                    slope_row = slope_row.iloc[0]

                slope = float(slope_row['coef'])
                p_val = round_res(safe_get_pval(res[res['names'] == x_name])) if not res[res['names'] == x_name].empty else 1.0
                
                ci_low = float(slope_row.get('CI[2.5%]', 0))
                ci_high = float(slope_row.get('CI[97.5%]', 0))
                r2 = float(res['r2'].iloc[0])
                intercept = float(res[res['names'] == 'Intercept']['coef'].iloc[0]) if not res[res['names'] == 'Intercept'].empty else 0.0

                direction = "positiva" if slope > 0 else "negativa"
                sig_text = "significativa" if (p_val is not None and p_val < 0.05) else "não significativa"
                interpretation = f"Relação {direction} e {sig_text} (R²={round_res(r2,2)})."

                return {
                    "slope": round_res(slope, 6), "intercept": round_res(intercept, 6),
                    "r_squared": round_res(r2, 4), "p_value": round_res(p_val, 4),
                    "ci_lower": round_res(ci_low, 6), "ci_upper": round_res(ci_high, 6),
                    "n": int(len(x)), "interpretation": interpretation, "engine": "pingouin"
                }
            except Exception as pg_e:
                print(f"Pingouin linear_regression error: {pg_e}")

        # Fallback Scipy
        slope, intercept, r_val, p_val, se = stats.linregress(x, y)
        return {
            "slope": round_res(slope, 6), "intercept": round_res(intercept, 6),
            "r_squared": round_res(r_val**2, 4), "p_value": round_res(p_val, 4),
            "n": int(len(x)), "engine": "scipy"
        }
    except Exception as e:
        print(f"Linear regression error: {e}")
        return None


# ============================================================
# DATA VALIDATION
# ============================================================

def validate_and_clean_data(df):
    """Valida e limpa dados antes da análise."""
    report = {
        "original_shape": list(df.shape),
        "missing_values": {},
        "outliers_removed": 0,
        "duplicate_rows": 0,
        "issues": [],
        "clean_shape": None,
    }
    
    # 1. Remover duplicatas
    n_dupes = df.duplicated().sum()
    if n_dupes > 0:
        df = df.drop_duplicates()
        report["duplicate_rows"] = int(n_dupes)
        report["issues"].append(f"{n_dupes} linhas duplicadas removidas.")
    
    # 2. Resumo de missing values
    for col in df.columns:
        n_missing = int(df[col].isna().sum())
        if n_missing > 0:
            pct = round(n_missing / len(df) * 100, 1)
            report["missing_values"][col] = {"n": n_missing, "pct": pct}
            if pct > 50:
                report["issues"].append(f"⚠ Coluna '{col}' tem {pct}% de dados faltantes. Considere removê-la.")
    
    # 3. Detectar outliers extremos (z-score > 4)
    for col in df.select_dtypes(include=[np.number]).columns:
        vals = pd.to_numeric(df[col], errors='coerce').dropna()
        if len(vals) > 10:
            z_scores = np.abs((vals - vals.mean()) / vals.std())
            extreme_outliers = (z_scores > 4).sum()
            if extreme_outliers > 0:
                report["outliers_removed"] += int(extreme_outliers)
                report["issues"].append(f"⚠ {extreme_outliers} valores extremos detectados em '{col}' (|z| > 4). Verifique se são erros de digitação.")
    
    report["clean_shape"] = list(df.shape)
    return report, df

def decide_visualization(test_type, group_stats=None, n_groups=None):
    """Decide o melhor tipo de visualização baseado no teste."""
    if test_type in ("pearson", "spearman"):
        return {"primary": "scatter", "secondary": "table"}
    elif test_type in ("ttest_paired", "wilcoxon"):
        return {"primary": "histogram", "secondary": "table"}
    elif test_type in ("anova", "kruskal", "ttest_ind", "mann_whitney"):
        if n_groups and n_groups > 5:
            return {"primary": "table", "secondary": "boxplot"}
        return {"primary": "boxplot", "secondary": "table"}
    elif test_type in ("chi2",):
        return {"primary": "table", "secondary": "bar"}
    elif test_type in ("descriptive_num",):
        return {"primary": "histogram", "secondary": "table"}
    elif test_type in ("descriptive_cat",):
        return {"primary": "bar", "secondary": "table"}
    return {"primary": "table", "secondary": None}

@app.post("/api/data/execute-protocol")
async def execute_protocol_v8(file: UploadFile = File(...), protocol: str = Form(...), outcome: Optional[str] = Form(None), user_id: str = Depends(get_current_user)):
    contents = await file.read()
    record_telemetry("EXECUTE_" + file.filename, contents, protocol, outcome)
    try:
        protocol_list = json.loads(protocol)
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = robust_read_excel(io.BytesIO(contents))
        df = sanitize_df(df)
        
        # Validação de dados
        validation_report, df = validate_and_clean_data(df)
        
        results = []
        errors_detected = []
        
        for item in protocol_list:
            var_name = item.get("name")
            test = item.get("selected_test") or item.get("recommended_test")
            pair_info = item.get("pair", {})
            
            if test == "Excluir":
                continue
            
            col_a = pair_info.get("col_a")
            col_b = pair_info.get("col_b")
            predictor = pair_info.get("predictor")
            outcome_col_pair = pair_info.get("outcome")
            
            # ============================================================
            # TIPO 1: Testes pareados e correlações (duas colunas numéricas)
            # ============================================================
            if col_a and col_b and col_a in df.columns and col_b in df.columns:
                df_curr = df[[col_a, col_b]].dropna()
                if len(df_curr) < 3:
                    errors_detected.append({"test": var_name, "error": "Dados insuficientes (< 3 observações válidas)."})
                    results.append({"testLabel": f"{var_name} ({test})", "statistic": None, "p_value": None, "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": None, "ci": None, "error": "Dados insuficientes.", "visualization": {"primary": "table", "secondary": None}})
                    continue
                
                try:
                    vals_a = pd.to_numeric(df_curr[col_a], errors='coerce').values
                    vals_b = pd.to_numeric(df_curr[col_b], errors='coerce').values
                    
                    if "T Pareado" in test:
                        res = pg_ttest_paired(vals_a, vals_b)
                        stat, p_val = res["statistic"], res["p_value"]
                        diff = vals_a - vals_b
                        median_val = float(np.median(diff))
                        iqr_val = f"{np.percentile(diff, 25):.2f} - {np.percentile(diff, 75):.2f}"
                        ci = {"ci_lower": res["ci_lower"], "ci_upper": res["ci_upper"], "mean": round(float(np.mean(diff)), 4), "se": round(float(np.std(diff, ddof=1) / np.sqrt(len(diff))), 4)} if res["ci_lower"] else compute_ci_95(diff)
                        effect_size = {"cohens_d": res["cohens_d"], "interpretation": interpret_cohens_d(res["cohens_d"])}
                        if res.get("power"): effect_size["achieved_power"] = res["power"]
                        chart_data = {"type": "histogram", "values": [sanitize_chart_value(v) for v in diff if sanitize_chart_value(v) is not None], "var_name": f"Diferença ({col_a} - {col_b})"}
                        viz = decide_visualization("ttest_paired")
                        
                    elif "Wilcoxon" in test:
                        res = pg_wilcoxon(vals_a, vals_b)
                        stat, p_val = res["statistic"], res["p_value"]
                        diff = vals_a - vals_b
                        median_val = float(np.median(diff))
                        iqr_val = f"{np.percentile(diff, 25):.2f} - {np.percentile(diff, 75):.2f}"
                        ci = compute_ci_95(diff)
                        effect_size = {"cohens_d": res.get("cohens_d", 0), "interpretation": interpret_cohens_d(res.get("cohens_d", 0))}
                        chart_data = {"type": "histogram", "values": [sanitize_chart_value(v) for v in diff if sanitize_chart_value(v) is not None], "var_name": f"Diferença ({col_a} - {col_b})"}
                        viz = decide_visualization("wilcoxon")
                        
                    elif "Pearson" in test:
                        res = pg_pearson(vals_a, vals_b)
                        stat, p_val = res["statistic"], res["p_value"]
                        median_val, iqr_val = None, None
                        ci = {"ci_lower": res["ci_lower"], "ci_upper": res["ci_upper"], "mean": round(float(stat), 4), "se": None} if res["ci_lower"] else None
                        effect_size = {"r_squared": res["r_squared"], "interpretation": interpret_r_squared(res["r_squared"])}
                        if res.get("power"): effect_size["achieved_power"] = res["power"]
                        chart_data = {"type": "scatter", "x": [sanitize_chart_value(v) for v in vals_a if sanitize_chart_value(v) is not None], "y": [sanitize_chart_value(v) for v in vals_b if sanitize_chart_value(v) is not None], "var_name": f"{col_a} vs {col_b}"}
                        viz = decide_visualization("pearson")
                        
                    elif "Spearman" in test:
                        res = pg_spearman(vals_a, vals_b)
                        stat, p_val = res["statistic"], res["p_value"]
                        median_val, iqr_val = None, None
                        ci = {"ci_lower": res["ci_lower"], "ci_upper": res["ci_upper"], "mean": round(float(stat), 4), "se": None} if res["ci_lower"] else None
                        effect_size = {"r_squared": res["r_squared"], "interpretation": interpret_r_squared(res["r_squared"])}
                        if res.get("power"): effect_size["achieved_power"] = res["power"]
                        chart_data = {"type": "scatter", "x": [sanitize_chart_value(v) for v in vals_a if sanitize_chart_value(v) is not None], "y": [sanitize_chart_value(v) for v in vals_b if sanitize_chart_value(v) is not None], "var_name": f"{col_a} vs {col_b}"}
                        viz = decide_visualization("spearman")
                        
                    elif "Regressão" in test or "Regressao" in test or "regress" in test.lower():
                        lr_res = pg_linear_regression(vals_a, vals_b, x_name=col_a, y_name=col_b)
                        if lr_res:
                            stat   = lr_res["slope"]
                            p_val  = lr_res["p_value"]
                            ci = {"ci_lower": lr_res["ci_lower"], "ci_upper": lr_res["ci_upper"],
                                  "mean": round(float(lr_res["slope"]), 4), "se": None}
                            effect_size = {
                                "r_squared": lr_res["r_squared"],
                                "interpretation": interpret_r_squared(lr_res["r_squared"])
                            }
                            chart_data = {
                                "type": "scatter",
                                "x": [sanitize_chart_value(v) for v in vals_a if sanitize_chart_value(v) is not None],
                                "y": [sanitize_chart_value(v) for v in vals_b if sanitize_chart_value(v) is not None],
                                "var_name": f"{col_a} vs {col_b}",
                                "regression": {
                                    "slope": sanitize_chart_value(lr_res["slope"]),
                                    "intercept": sanitize_chart_value(lr_res["intercept"]),
                                    "r_squared": sanitize_chart_value(lr_res["r_squared"]),
                                    "ci_lower": sanitize_chart_value(lr_res["ci_lower"]),
                                    "ci_upper": sanitize_chart_value(lr_res["ci_upper"])
                                }
                            }
                            interpretation_text = lr_res.get("interpretation")
                            engine_used = lr_res.get("engine", "scipy")
                        else:
                            stat = p_val = None
                            ci = effect_size = chart_data = interpretation_text = None
                            engine_used = "scipy"
                        median_val, iqr_val = None, None
                        viz = decide_visualization("pearson")
                        
                    else:
                        res = stats.spearmanr(vals_a, vals_b)
                        stat, p_val = res.correlation, res.pvalue
                        median_val, iqr_val = None, None
                        ci = None
                        effect_size = compute_effect_size("spearman", r=stat)
                        chart_data = {"type": "scatter", "x": [sanitize_chart_value(v) for v in vals_a if sanitize_chart_value(v) is not None], "y": [sanitize_chart_value(v) for v in vals_b if sanitize_chart_value(v) is not None], "var_name": f"{col_a} vs {col_b}"}
                        viz = decide_visualization("spearman")
                    
                    # Assumptions + Power + Interpretation
                    if "T Pareado" in test:
                        assumptions = check_statistical_assumptions("ttest_paired", diff=vals_a - vals_b, n=len(vals_a))
                        if effect_size and "cohens_d" in effect_size:
                            power = estimate_achieved_power("ttest_paired", n=len(vals_a), cohens_d=effect_size["cohens_d"])
                            if power: effect_size["achieved_power"] = power
                    elif "Wilcoxon" in test:
                        assumptions = check_statistical_assumptions("wilcoxon", diff=vals_a - vals_b, n=len(vals_a))
                    elif "Pearson" in test:
                        assumptions = check_statistical_assumptions("pearson", n=len(vals_a))
                        if effect_size and "r_squared" in effect_size:
                            power = estimate_achieved_power("pearson", n=len(vals_a), r=stat)
                            if power: effect_size["achieved_power"] = power
                    else:
                        assumptions = check_statistical_assumptions("spearman", n=len(vals_a))
                        if effect_size and "r_squared" in effect_size:
                            power = estimate_achieved_power("spearman", n=len(vals_a), r=stat)
                            if power: effect_size["achieved_power"] = power
                    
                    interp_test = "ttest_paired" if "T Pareado" in test else "wilcoxon" if "Wilcoxon" in test else "pearson" if "Pearson" in test else "spearman"
                    interpretation = generate_interpretation(interp_test, stat, p_val, effect_size)
                    
                    result_item = {
                        "testLabel": f"{var_name} ({test})",
                        "statistic": round(float(stat), 4) if stat is not None else None,
                        "p_value": round(float(p_val), 4) if p_val is not None else None,
                        "median_iqr": f"{median_val:.2f} ({iqr_val})" if median_val is not None else None,
                        "group_stats": None,
                        "chart_data": chart_data,
                        "effect_size": effect_size,
                        "ci": ci,
                        "assumptions": assumptions,
                        "interpretation": interpretation,
                        "visualization": viz
                    }
                    results.append(result_item)
                    
                except Exception as e:
                    err_msg = str(e)
                    print(f"MATH ERR {var_name} ({test}): {err_msg}")
                    errors_detected.append({"test": var_name, "error": err_msg})
                    try:
                        vals_a = pd.to_numeric(df[col_a], errors='coerce').dropna().values
                        vals_b = pd.to_numeric(df[col_b], errors='coerce').dropna().values
                        min_len = min(len(vals_a), len(vals_b))
                        if min_len >= 3:
                            res = stats.spearmanr(vals_a[:min_len], vals_b[:min_len])
                            results.append({"testLabel": f"{var_name} (Spearman - fallback)", "statistic": round(float(res.correlation), 4), "p_value": round(float(res.pvalue), 4), "median_iqr": None, "group_stats": None, "chart_data": {"type": "scatter", "x": [sanitize_chart_value(v) for v in vals_a[:min_len] if sanitize_chart_value(v) is not None], "y": [sanitize_chart_value(v) for v in vals_b[:min_len] if sanitize_chart_value(v) is not None], "var_name": var_name}, "effect_size": compute_effect_size("spearman", r=res.correlation), "ci": None, "recovered": True, "visualization": {"primary": "scatter", "secondary": "table"}})
                            continue
                    except:
                        pass
                    results.append({"testLabel": f"{var_name} ({test})", "statistic": None, "p_value": None, "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": None, "ci": None, "error": f"Falha no cálculo: {err_msg[:150]}", "visualization": {"primary": "table", "secondary": None}})
            
            # ============================================================
            # TIPO 2: Comparações de grupos (predictor categórico → outcome numérico)
            # ============================================================
            elif predictor and outcome_col_pair and predictor in df.columns and outcome_col_pair in df.columns:
                df_curr = df[[predictor, outcome_col_pair]].dropna()
                if len(df_curr) < 2:
                    errors_detected.append({"test": var_name, "error": "Dados insuficientes."})
                    results.append({"testLabel": f"{var_name} ({test})", "statistic": None, "p_value": None, "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": None, "ci": None, "error": "Dados insuficientes.", "visualization": {"primary": "table", "secondary": None}})
                    continue
                
                try:
                    outcome_data = pd.to_numeric(df_curr[outcome_col_pair], errors='coerce').dropna()
                    unique_groups = sorted(df_curr[predictor].dropna().unique(), key=lambda x: str(x))
                    n_groups = len(unique_groups)
                    
                    # Per-group stats COMPLETO
                    group_stats = []
                    group_values = {}
                    total_n = len(df_curr)
                    for g in unique_groups:
                        g_outcome = pd.to_numeric(df_curr[df_curr[predictor] == g][outcome_col_pair], errors='coerce').dropna().values
                        if len(g_outcome) > 0:
                            ci = compute_ci_95(g_outcome)
                            pct_of_total = round(len(g_outcome) / total_n * 100, 1)
                            group_stats.append({
                                "group": str(g),
                                "n": int(len(g_outcome)),
                                "pct_of_total": f"{pct_of_total}%",
                                "mean": round(float(np.mean(g_outcome)), 4),
                                "median": round(float(np.median(g_outcome)), 4),
                                "std": round(float(np.std(g_outcome, ddof=1)), 4),
                                "q1": round(float(np.percentile(g_outcome, 25)), 4),
                                "q3": round(float(np.percentile(g_outcome, 75)), 4),
                                "min": round(float(np.min(g_outcome)), 4),
                                "max": round(float(np.max(g_outcome)), 4),
                                "iqr": round(float(np.percentile(g_outcome, 75) - np.percentile(g_outcome, 25)), 4),
                                "ci_95": ci,
                                "median_iqr": f"{np.median(g_outcome):.2f} ({np.percentile(g_outcome, 25):.2f} - {np.percentile(g_outcome, 75):.2f})"
                            })
                            group_values[str(g)] = g_outcome
                    
                    # Chart data: MEDIAS do outcome por grupo (com error bars)
                    bar_labels = [g["group"] for g in group_stats]
                    bar_means = [sanitize_chart_value(g["mean"]) for g in group_stats]
                    bar_stds = [sanitize_chart_value(g["std"]) for g in group_stats]
                    chart_data = {
                        "type": "bar",
                        "labels": bar_labels,
                        "values": bar_means,
                        "stds": bar_stds,
                        "q1": [sanitize_chart_value(g["q1"]) for g in group_stats],
                        "q3": [sanitize_chart_value(g["q3"]) for g in group_stats],
                        "var_name": var_name,
                        "outcome": outcome_col_pair
                    }
                    
                    stat, p_val = None, None
                    effect_size = None
                    
                    if "T Independente" in test or "Teste T" in test:
                        if n_groups == 2:
                            g1 = group_values.get(str(unique_groups[0]), np.array([]))
                            g2 = group_values.get(str(unique_groups[1]), np.array([]))
                            if len(g1) >= 2 and len(g2) >= 2:
                                res = pg_ttest_ind(g1, g2)
                                stat, p_val = res["statistic"], res["p_value"]
                                effect_size = {"cohens_d": res["cohens_d"], "interpretation": interpret_cohens_d(res["cohens_d"])}
                                if res.get("power"): effect_size["achieved_power"] = res["power"]
                            else:
                                raise ValueError("Grupos com menos de 2 observações cada.")
                        else:
                            test = "ANOVA One-Way (auto-switch)"
                            pg_res = pg_anova(df_curr, outcome_col_pair, predictor)
                            if pg_res:
                                stat, p_val = pg_res["statistic"], pg_res["p_value"]
                                effect_size = {"eta_squared": pg_res["eta_squared"], "interpretation": interpret_eta_squared(pg_res["eta_squared"])}
                                if pg_res.get("power"): effect_size["achieved_power"] = pg_res["power"]
                            else:
                                raise ValueError("Grupos insuficientes para ANOVA.")
                    
                    elif "Mann-Whitney" in test:
                        if n_groups == 2:
                            g1 = group_values.get(str(unique_groups[0]), np.array([]))
                            g2 = group_values.get(str(unique_groups[1]), np.array([]))
                            if len(g1) >= 1 and len(g2) >= 1:
                                res = pg_mannwhitney(g1, g2)
                                stat, p_val = res["statistic"], res["p_value"]
                                effect_size = {"cohens_d": res.get("cohens_d", 0), "interpretation": interpret_cohens_d(res.get("cohens_d", 0))}
                            else:
                                raise ValueError("Grupos com menos de 1 observação.")
                        else:
                            test = "Kruskal-Wallis H (auto-switch)"
                            pg_res = pg_kruskal(df_curr, outcome_col_pair, predictor)
                            if pg_res:
                                stat, p_val = pg_res["statistic"], pg_res["p_value"]
                                effect_size = {"eta_squared": pg_res["eta_squared"], "interpretation": interpret_eta_squared(pg_res["eta_squared"])}
                            else:
                                raise ValueError("Grupos insuficientes.")
                    
                    elif "ANOVA" in test:
                        pg_res = pg_anova(df_curr, outcome_col_pair, predictor)
                        if pg_res:
                            stat, p_val = pg_res["statistic"], pg_res["p_value"]
                            effect_size = {"eta_squared": pg_res["eta_squared"], "interpretation": interpret_eta_squared(pg_res["eta_squared"])}
                            if pg_res.get("power"): effect_size["achieved_power"] = pg_res["power"]
                        else:
                            raise ValueError("Grupos insuficientes para ANOVA.")
                    
                    elif "Kruskal" in test:
                        pg_res = pg_kruskal(df_curr, outcome_col_pair, predictor)
                        if pg_res:
                            stat, p_val = pg_res["statistic"], pg_res["p_value"]
                            effect_size = {"eta_squared": pg_res["eta_squared"], "interpretation": interpret_eta_squared(pg_res["eta_squared"])}
                        else:
                            raise ValueError("Grupos insuficientes para Kruskal-Wallis.")
                    
                    elif "Qui-Quadrado" in test or "Chi-Square" in test:
                        contingency = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair])
                        if not contingency.empty:
                            # Para tabela 2x2 com expected < 5, usar Fisher automaticamente
                            use_fisher = contingency.shape == (2, 2) and np.any(stats.chi2_contingency(contingency)[3] < 5)
                            
                            if use_fisher:
                                fisher_res = pg_fisher_exact(contingency)
                                if fisher_res:
                                    stat, p_val = fisher_res["statistic"], fisher_res["p_value"]
                                    effect_size = {"cramers_v": fisher_res["cramers_v"], "interpretation": interpret_cramers_v(fisher_res["cramers_v"])}
                                    test = "Teste Exato de Fisher (auto-switch)"
                                    
                                    contingency_pct = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], normalize='index') * 100
                                    contingency_total = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], margins=True)
                                    contingency_table = []
                                    for idx in contingency.index:
                                        row = {"row_label": str(idx)}
                                        for col in contingency.columns:
                                            count = int(contingency.loc[idx, col])
                                            pct = round(float(contingency_pct.loc[idx, col]), 1)
                                            row[str(col)] = {"count": count, "pct": f"{pct}%"}
                                        row["total"] = int(contingency_total.loc[idx].iloc[-1])
                                        row["total_pct"] = f"{round(int(contingency_total.loc[idx].iloc[-1]) / len(df_curr) * 100, 1)}%"
                                        contingency_table.append(row)
                                    
                                    chart_data = {"type": "contingency_table", "table": contingency_table, "predictor": predictor, "outcome": outcome_col_pair, "var_name": var_name}
                                    viz = decide_visualization("chi2")
                                    result_item = {
                                        "testLabel": f"{var_name} ({test})",
                                        "statistic": stat,
                                        "p_value": p_val,
                                        "median_iqr": None,
                                        "group_stats": None,
                                        "chart_data": chart_data,
                                        "effect_size": effect_size,
                                        "ci": None,
                                        "contingency_table": contingency_table,
                                        "odds_ratio": {"odds_ratio": fisher_res["odds_ratio"], "or_ci_95": fisher_res["or_ci_95"], "risk_ratio": None, "rr_ci_95": None, "interpretation": fisher_res["interpretation"]},
                                        "visualization": viz
                                    }
                                    results.append(result_item)
                                    continue
                            else:
                                chi2, p, dof, ex = stats.chi2_contingency(contingency)
                                stat, p_val = chi2, p
                                effect_size = compute_effect_size("chi2", chi2=chi2, n_total=int(contingency.sum().sum()))
                                
                                contingency_pct = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], normalize='index') * 100
                                contingency_total = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], margins=True)
                                contingency_table = []
                                for idx in contingency.index:
                                    row = {"row_label": str(idx)}
                                    for col in contingency.columns:
                                        count = int(contingency.loc[idx, col])
                                        pct = round(float(contingency_pct.loc[idx, col]), 1)
                                        row[str(col)] = {"count": count, "pct": f"{pct}%"}
                                    row["total"] = int(contingency_total.loc[idx].iloc[-1])
                                    row["total_pct"] = f"{round(int(contingency_total.loc[idx].iloc[-1]) / len(df_curr) * 100, 1)}%"
                                    contingency_table.append(row)
                                
                                odds_ratio_data = None
                                if contingency.shape == (2, 2):
                                    odds_ratio_data = compute_odds_ratio(contingency)
                                
                                chart_data = {"type": "contingency_table", "table": contingency_table, "predictor": predictor, "outcome": outcome_col_pair, "var_name": var_name}
                                viz = decide_visualization("chi2")
                                result_item = {
                                    "testLabel": f"{var_name} ({test})",
                                    "statistic": round(float(stat), 4) if stat is not None else None,
                                    "p_value": round(float(p_val), 4) if p_val is not None else None,
                                    "median_iqr": None,
                                    "group_stats": None,
                                    "chart_data": chart_data,
                                    "effect_size": effect_size,
                                    "ci": None,
                                    "contingency_table": contingency_table,
                                    "odds_ratio": odds_ratio_data,
                                    "visualization": viz
                                }
                                results.append(result_item)
                                continue
                        else:
                            raise ValueError("Tabela de contingência vazia.")
                    
                    elif "Fisher" in test or "Exato" in test:
                        contingency = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair])
                        if contingency.shape == (2, 2) and not contingency.empty:
                            fisher_res = pg_fisher_exact(contingency)
                            if fisher_res:
                                stat, p_val = fisher_res["statistic"], fisher_res["p_value"]
                                effect_size = {"cramers_v": fisher_res["cramers_v"], "interpretation": interpret_cramers_v(fisher_res["cramers_v"])}
                                
                                contingency_pct = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], normalize='index') * 100
                                contingency_total = pd.crosstab(df_curr[predictor], df_curr[outcome_col_pair], margins=True)
                                contingency_table = []
                                for idx in contingency.index:
                                    row = {"row_label": str(idx)}
                                    for col in contingency.columns:
                                        count = int(contingency.loc[idx, col])
                                        pct = round(float(contingency_pct.loc[idx, col]), 1)
                                        row[str(col)] = {"count": count, "pct": f"{pct}%"}
                                    row["total"] = int(contingency_total.loc[idx].iloc[-1])
                                    row["total_pct"] = f"{round(int(contingency_total.loc[idx].iloc[-1]) / len(df_curr) * 100, 1)}%"
                                    contingency_table.append(row)
                                
                                chart_data = {"type": "contingency_table", "table": contingency_table, "predictor": predictor, "outcome": outcome_col_pair, "var_name": var_name}
                                viz = decide_visualization("chi2")
                                result_item = {
                                    "testLabel": f"{var_name} ({test})",
                                    "statistic": stat,
                                    "p_value": p_val,
                                    "median_iqr": None,
                                    "group_stats": None,
                                    "chart_data": chart_data,
                                    "effect_size": effect_size,
                                    "ci": None,
                                    "contingency_table": contingency_table,
                                    "odds_ratio": {"odds_ratio": fisher_res["odds_ratio"], "or_ci_95": fisher_res["or_ci_95"], "risk_ratio": None, "rr_ci_95": None, "interpretation": fisher_res["interpretation"]},
                                    "visualization": viz
                                }
                                results.append(result_item)
                                continue
                        else:
                            raise ValueError("Teste Exato de Fisher requer tabela de contingência 2x2.")
                    
                    elif "Regressão" in test or "Regressao" in test or "Logística" in test or "Logistica" in test:
                        logistic_preds = pair_info.get("logistic_predictors")
                        if logistic_preds and len(logistic_preds) >= 1:
                            logit_res = pg_logistic_regression(df, logistic_preds, outcome_col_pair)
                        else:
                            all_numeric = [c for c in df.columns if c != predictor and c != outcome_col_pair and c in df.select_dtypes(include=[np.number]).columns.tolist()]
                            if len(all_numeric) >= 1:
                                logit_res = pg_logistic_regression(df, all_numeric[:5], outcome_col_pair)
                            else:
                                logit_res = None
                        
                        if logit_res:
                            stat = logit_res["accuracy"]
                            p_val = logit_res["overall_p_value"]
                            effect_size = {"r_squared": logit_res["pseudo_r2"], "interpretation": interpret_r_squared(logit_res["pseudo_r2"])}
                            
                            sig_preds = logit_res.get("significant_predictors", [])
                            interp_extra = ""
                            if sig_preds:
                                pred_strs = [f"{p['predictor']} (OR={p['odds_ratio']})" for p in sig_preds[:3]]
                                interp_extra = f" Preditores significativos: {', '.join(pred_strs)}."
                            
                            chart_data = {"type": "bar", "labels": [p["predictor"] for p in logit_res["predictors"][:10]], "values": [p["odds_ratio"] for p in logit_res["predictors"][:10]], "var_name": var_name, "logistic_regression": logit_res}
                            viz = decide_visualization("chi2")
                            result_item = {
                                "testLabel": f"{var_name} ({test})",
                                "statistic": stat,
                                "p_value": p_val,
                                "median_iqr": None,
                                "group_stats": None,
                                "chart_data": chart_data,
                                "effect_size": effect_size,
                                "ci": None,
                                "logistic_regression": logit_res,
                                "assumptions": [{"type": "info", "severity": "info", "message": f"Modelo com {logit_res['n_observations']} observações, {len(logit_res['predictors'])} preditores. Pseudo-R²={logit_res['pseudo_r2']:.4f}.", "recommendation": None}],
                                "interpretation": f"Regressão Logística: acurácia={logit_res['accuracy']:.1f}%, pseudo-R²={logit_res['pseudo_r2']:.4f} (p={logit_res['overall_p_value']:.4f}).{interp_extra}",
                                "visualization": viz
                            }
                            results.append(result_item)
                            continue
                        else:
                            raise ValueError("Preditores insuficientes para Regressão Logística.")
                    
                    else:
                        pg_res = pg_kruskal(df_curr, outcome_col_pair, predictor)
                        if pg_res:
                            stat, p_val = pg_res["statistic"], pg_res["p_value"]
                            test = f"Kruskal-Wallis H (pingouin)"
                            effect_size = {"eta_squared": pg_res["eta_squared"], "interpretation": interpret_eta_squared(pg_res["eta_squared"])}
                        else:
                            raise ValueError(f"Teste não reconhecido: {test}")
                    
                    median_val = float(np.median(outcome_data)) if len(outcome_data) > 0 else None
                    q1 = float(np.percentile(outcome_data, 25)) if len(outcome_data) > 0 else None
                    q3 = float(np.percentile(outcome_data, 75)) if len(outcome_data) > 0 else None
                    iqr_val = f"{q1:.2f} - {q3:.2f}" if q1 is not None else None
                    ci_overall = compute_ci_95(outcome_data) if len(outcome_data) >= 2 else None
                    
                    # Post-hoc tests if ANOVA/Kruskal significant
                    post_hoc = None
                    if stat is not None and p_val is not None and p_val < 0.05 and n_groups >= 3:
                        all_groups_list = [group_values[str(g)] for g in unique_groups if len(group_values.get(str(g), [])) >= 1]
                        all_group_names = [str(g) for g in unique_groups if len(group_values.get(str(g), [])) >= 1]
                        if "ANOVA" in test:
                            post_hoc = compute_post_hoc_anova(all_groups_list, all_group_names)
                        elif "Kruskal" in test:
                            post_hoc = compute_post_hoc_kruskal(all_groups_list, all_group_names)
                    
                    # Assumptions checking
                    assumptions = check_statistical_assumptions(
                        "anova" if "ANOVA" in test else "kruskal" if "Kruskal" in test else "ttest_ind",
                        groups=[group_values[str(g)] for g in unique_groups if len(group_values.get(str(g), [])) >= 1] if "ANOVA" in test or "Kruskal" in test else None,
                        g1=group_values.get(str(unique_groups[0]), np.array([])) if n_groups == 2 else None,
                        g2=group_values.get(str(unique_groups[1]), np.array([])) if n_groups == 2 else None,
                        n=len(df_curr)
                    )
                    
                    # Power estimation
                    if effect_size:
                        power_kwargs = {"n": len(df_curr)}
                        if "ANOVA" in test or "Kruskal" in test:
                            power_kwargs["groups"] = [group_values[str(g)] for g in unique_groups if len(group_values.get(str(g), [])) >= 1]
                        elif n_groups == 2:
                            power_kwargs["g1"] = group_values.get(str(unique_groups[0]), np.array([]))
                            power_kwargs["g2"] = group_values.get(str(unique_groups[1]), np.array([]))
                            if "cohens_d" in effect_size:
                                power_kwargs["cohens_d"] = effect_size["cohens_d"]
                        achieved_power = estimate_achieved_power(
                            "anova" if "ANOVA" in test else "kruskal" if "Kruskal" in test else "ttest_ind",
                            **power_kwargs
                        )
                        if achieved_power is not None:
                            effect_size["achieved_power"] = achieved_power
                    
                    # Interpretation
                    interpretation = generate_interpretation(
                        "anova" if "ANOVA" in test else "kruskal" if "Kruskal" in test else "ttest_ind",
                        stat, p_val, effect_size, post_hoc
                    )
                    
                    viz = decide_visualization("anova" if "ANOVA" in test else "kruskal" if "Kruskal" in test else "ttest_ind", group_stats=group_stats, n_groups=n_groups)
                    
                    result_item = {
                        "testLabel": f"{var_name} ({test})",
                        "statistic": round(float(stat), 4) if stat is not None else None,
                        "p_value": round(float(p_val), 4) if p_val is not None else None,
                        "median_iqr": f"{median_val:.2f} ({iqr_val})" if median_val is not None and iqr_val else None,
                        "group_stats": group_stats,
                        "chart_data": chart_data,
                        "effect_size": effect_size,
                        "ci": ci_overall,
                        "post_hoc": post_hoc,
                        "assumptions": assumptions,
                        "interpretation": interpretation,
                        "visualization": viz
                    }
                    results.append(result_item)
                    
                except Exception as e:
                    err_msg = str(e)
                    print(f"MATH ERR {var_name} ({test}): {err_msg}")
                    errors_detected.append({"test": var_name, "error": err_msg})
                    try:
                        unique_groups_f = sorted(df[[predictor, outcome_col_pair]].dropna()[predictor].dropna().unique(), key=lambda x: str(x))
                        all_groups_f = [pd.to_numeric(df[df[predictor] == v][outcome_col_pair], errors='coerce').dropna().values for v in unique_groups_f]
                        all_groups_f = [g for g in all_groups_f if len(g) >= 1]
                        if len(all_groups_f) >= 2:
                            res = stats.kruskal(*all_groups_f)
                            results.append({"testLabel": f"{var_name} (Kruskal-Wallis - fallback)", "statistic": round(float(res.statistic), 4), "p_value": round(float(res.pvalue), 4), "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": compute_effect_size("kruskal", groups=all_groups_f), "ci": None, "recovered": True, "visualization": {"primary": "table", "secondary": "bar"}})
                            continue
                    except:
                        pass
                    results.append({"testLabel": f"{var_name} ({test})", "statistic": None, "p_value": None, "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": None, "ci": None, "error": f"Falha no cálculo: {err_msg[:150]}", "visualization": {"primary": "table", "secondary": None}})
            
            # ============================================================
            # TIPO 3: Variável individual (descritiva)
            # ============================================================
            elif col_a and col_a in df.columns:
                try:
                    numeric_vals = pd.to_numeric(df[col_a], errors='coerce').dropna()
                    
                    if len(numeric_vals) > 0:
                        median_val = float(np.median(numeric_vals))
                        q1 = float(np.percentile(numeric_vals, 25))
                        q3 = float(np.percentile(numeric_vals, 75))
                        iqr_val = f"{q1:.2f} - {q3:.2f}"
                        stat = median_val
                        p_val = None
                        ci = compute_ci_95(numeric_vals) if len(numeric_vals) >= 2 else None
                        chart_data = {"type": "histogram", "values": [sanitize_chart_value(v) for v in numeric_vals if sanitize_chart_value(v) is not None], "var_name": col_a}
                        
                        unique_groups = sorted(df[col_a].dropna().unique(), key=lambda x: str(x))
                        total_valid = len(numeric_vals)
                        if len(unique_groups) <= 10:
                            group_stats = []
                            for g in unique_groups:
                                g_count = int((df[col_a] == g).sum())
                                pct = round(g_count / total_valid * 100, 1) if total_valid > 0 else 0
                                group_stats.append({
                                    "group": str(g), "n": g_count,
                                    "pct": f"{pct}%",
                                    "median": None, "q1": None, "q3": None, "iqr": None,
                                    "median_iqr": f"n={g_count} ({pct}%)"
                                })
                        else:
                            group_stats = None
                        
                        viz = decide_visualization("descriptive_num")
                        
                        # Normality + outliers for numeric descriptive
                        assumptions = []
                        if len(numeric_vals) >= 3:
                            try:
                                _, sw_p = stats.shapiro(numeric_vals)
                                if sw_p < 0.05:
                                    assumptions.append({"type": "non_normal", "severity": "info", "message": f"Distribuição não-normal (Shapiro-Wilk p={sw_p:.4f}). Mediana e IQR são mais robustos que média e DP.", "recommendation": None})
                            except:
                                pass
                        
                        # Outlier detection
                        q1v, q3v = np.percentile(numeric_vals, 25), np.percentile(numeric_vals, 75)
                        iqr_v = q3v - q1v
                        lower_fence = q1v - 1.5 * iqr_v
                        upper_fence = q3v + 1.5 * iqr_v
                        outliers = numeric_vals[(numeric_vals < lower_fence) | (numeric_vals > upper_fence)]
                        if len(outliers) > 0:
                            outlier_pct = round(len(outliers) / len(numeric_vals) * 100, 1)
                            assumptions.append({"type": "outliers_detected", "severity": "warning", "message": f"{len(outliers)} valores atípicos detectados ({outlier_pct}%): [{', '.join([f'{v:.2f}' for v in sorted(outliers)[:5]])}{'...' if len(outliers) > 5 else ''}]. Podem influenciar resultados.", "recommendation": None})
                        
                        result_item = {
                            "testLabel": f"{var_name} ({test})",
                            "statistic": round(float(stat), 4),
                            "p_value": None,
                            "median_iqr": f"{median_val:.2f} ({iqr_val})",
                            "group_stats": group_stats,
                            "chart_data": chart_data,
                            "effect_size": None,
                            "ci": ci,
                            "assumptions": assumptions,
                            "interpretation": f"Variável '{col_a}': n={len(numeric_vals)}, mediana={median_val:.2f}, IQR={iqr_val}, IC95%=[{ci['ci_lower']:.2f}, {ci['ci_upper']:.2f}]." if ci else None,
                            "visualization": viz
                        }
                    else:
                        value_counts = df[col_a].value_counts()
                        total_n = len(df[col_a].dropna())
                        group_stats = []
                        for g, count in value_counts.items():
                            pct = round(count / total_n * 100, 1) if total_n > 0 else 0
                            wilson = wilson_ci_proportion(int(count), total_n)
                            group_stats.append({
                                "group": str(g),
                                "n": int(count),
                                "pct": f"{pct}%",
                                "wilson_ci": wilson,
                                "median": None, "q1": None, "q3": None, "iqr": None,
                                "median_iqr": f"n={int(count)} ({pct}%, IC95%: {wilson['ci_pct']})"
                            })
                        
                        bar_labels = [g["group"] for g in group_stats]
                        bar_counts = [g["n"] for g in group_stats]
                        bar_pcts = [float(g["pct"].replace("%", "")) for g in group_stats]
                        chart_data = {"type": "bar", "labels": bar_labels, "values": bar_counts, "pcts": bar_pcts, "q1": [], "q3": [], "var_name": col_a}
                        
                        viz = decide_visualization("descriptive_cat")
                        result_item = {
                            "testLabel": f"{var_name} ({test})",
                            "statistic": None, "p_value": None,
                            "median_iqr": None,
                            "group_stats": group_stats,
                            "chart_data": chart_data,
                            "effect_size": None, "ci": None,
                            "visualization": viz
                        }
                    
                    results.append(result_item)
                    
                except Exception as e:
                    err_msg = str(e)
                    print(f"MATH ERR {var_name} ({test}): {err_msg}")
                    errors_detected.append({"test": var_name, "error": err_msg})
                    results.append({"testLabel": f"{var_name} ({test})", "statistic": None, "p_value": None, "median_iqr": None, "group_stats": None, "chart_data": None, "effect_size": None, "ci": None, "error": f"Falha no cálculo: {err_msg[:150]}", "visualization": {"primary": "table", "secondary": None}})
            
            else:
                errors_detected.append({"test": var_name, "error": "Coluna não encontrada no dataset."})
        
        print(f"DEBUG: Analysis complete. {len(results)} results, {len(errors_detected)} errors.")
        if errors_detected:
            print(f"ERRORS: {json.dumps(errors_detected, ensure_ascii=False)}")
        
        try:
            with Session(engine) as session:
                record = AnalysisHistory(user_id=user_id, filename=file.filename, outcome=outcome if outcome else "Indefinido", protocol=protocol, results=json.dumps(results))
                session.add(record)
                notif = Notification(user_id=user_id, title="Análise Concluída", message=f"O dataset {file.filename} foi processado com sucesso.", type="success")
                session.add(notif)
                session.commit()
                print(f"DATABASE: Resultado e Notificação salvos.")
        except Exception as db_err:
            print(f"DATABASE ERR: Falha ao salvar histórico -> {db_err}")

        return clean_dict_values({"results": results, "errors": errors_detected, "validation": validation_report})
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERR: Execute v8 -> {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/data/summary-grouped")
async def summary_grouped_v6(file: UploadFile = File(...), group_by: Optional[str] = Form(None)):
    contents = await file.read()
    try:
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = pd.read_excel(io.BytesIO(contents))
        df = sanitize_df(df)
        if not group_by or group_by not in df.columns:
            cats = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c]) and len(df[c].unique()) < 10]
            group_by = cats[0] if cats else None
        if not group_by: return {"summary": []}
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if group_by in num_cols: num_cols.remove(group_by)
        summary = []
        for col in num_cols:
            res = df.groupby(group_by)[col].agg(['count', 'median', lambda x: x.quantile(0.25), lambda x: x.quantile(0.75)]).reset_index()
            res.columns = [group_by, 'n', 'median', 'q1', 'q3']
            for _, row in res.iterrows(): summary.append({"variable": col, "group": str(row[group_by]), "n": int(row['n']), "median": float(row['median']), "iqr": f"{row['q1']:.2f} - {row['q3']:.2f}"})
        return clean_dict_values({"summary": summary, "grouped_by": group_by})
    except Exception as e: raise HTTPException(status_code=400, detail=str(e))

# ============================================================
# Endpoints de Compatibilidade (404 Shields)
# ============================================================

@app.get("/api/trials")
async def get_trials(user_id: str = Depends(get_current_user)):
    with Session(engine) as session:
        statement = select(ClinicalTrial).where(ClinicalTrial.user_id == user_id)
        results = session.exec(statement).all()
        return clean_dict_values(results)

@app.get("/api/history")
async def get_history(user_id: str = Depends(get_current_user)):
    try:
        with Session(engine) as session:
            statement = select(AnalysisHistory).where(AnalysisHistory.user_id == user_id).order_by(AnalysisHistory.id.desc()).limit(20)
            db_results = session.exec(statement).all()
            
            history = []
            for r in db_results:
                history.append({
                    "id": r.id,
                    "filename": r.filename,
                    "outcome": r.outcome,
                    "results": json.loads(r.results) if r.results else [],
                    "created_at": r.created_at.isoformat() if r.created_at else None
                })
            return clean_dict_values(history)
    except Exception as e:
        print(f"DATABASE ERR: History fetch -> {e}")
        return []

@app.get("/api/notifications")
async def get_notifications(user_id: str = Depends(get_current_user)):
    with Session(engine) as session:
        statement = select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_at.desc()).limit(10)
        notifs = session.exec(statement).all()
        return clean_dict_values(notifs)

@app.post("/api/notifications/clear")
async def clear_notifications(user_id: str = Depends(get_current_user)):
    with Session(engine) as session:
        notifs = session.exec(select(Notification).where(Notification.user_id == user_id)).all()
        for n in notifs:
            session.delete(n)
        session.commit()
        return {"status": "ok"}

# ============================================================
# Motores Analíticos Reais (Fase 3)
# ============================================================

class PowerRequest(BaseModel):
    effect_size: float
    alpha: float = 0.05
    power: float = 0.8
    ratio: float = 1.0
    alternative: str = "two-sided"

class SurvivalRequest(BaseModel):
    times: List[float]
    events: List[int]

class LogRankRequest(BaseModel):
    times_a: List[float]
    events_a: List[int]
    times_b: List[float]
    events_b: List[int]

class TrialCreate(BaseModel):
    title: str
    phase: str
    n_target: int
    status: str = "Planejamento"

@app.post("/api/stats/power")
async def calculate_power(req: PowerRequest):
    """Calcula o N necessário usando statsmodels."""
    try:
        analysis = TTestIndPower()
        n = analysis.solve_power(
            effect_size=req.effect_size, 
            alpha=req.alpha, 
            power=req.power, 
            ratio=req.ratio, 
            alternative=req.alternative
        )
        return {"sample_size": int(np.ceil(n))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/stats/survival")
async def survival_analysis(req: SurvivalRequest):
    """Gera dados de Kaplan-Meier usando lifelines."""
    try:
        kmf = KaplanMeierFitter()
        kmf.fit(req.times, event_observed=req.events)
        return {
            "timeline": kmf.survival_function_.index.tolist(),
            "survival": kmf.survival_function_['KM_estimate'].tolist(),
            "ci_lower": kmf.confidence_interval_['KM_estimate_lower_0.95'].tolist(),
            "ci_upper": kmf.confidence_interval_['KM_estimate_upper_0.95'].tolist()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/stats/log-rank")
async def logrank_analysis(req: LogRankRequest):
    """Executa o teste de Log-rank entre dois grupos."""
    try:
        results = logrank_test(req.times_a, req.times_b, event_observed_A=req.events_a, event_observed_B=req.events_b)
        return {"p_value": float(results.p_value), "test_statistic": float(results.test_statistic)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class GenerateRequest(BaseModel):
    distribution: str = "normal"
    n: int = 100
    params: dict = {}

@app.post("/api/data/generate")
async def generate_data(req: GenerateRequest):
    """Gera dados simulados para demonstração."""
    try:
        n = req.n
        params = req.params
        if req.distribution == "normal":
            values = np.random.normal(params.get("mean", 0), params.get("std", 1), n)
        elif req.distribution == "uniform":
            values = np.random.uniform(params.get("low", 0), params.get("high", 1), n)
        elif req.distribution == "exponential":
            values = np.random.exponential(params.get("scale", 1), n)
        elif req.distribution == "binomial":
            values = np.random.binomial(1, params.get("p", 0.5), n)
        else:
            values = np.random.normal(0, 1, n)
        return {
            "data": [round(float(v), 6) for v in values],
            "n": n,
            "mean": round(float(np.mean(values)), 4),
            "std": round(float(np.std(values, ddof=1)), 4),
            "min": round(float(np.min(values)), 4),
            "max": round(float(np.max(values)), 4),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/trials")
async def create_trial(trial: TrialCreate, user_id: str = Depends(get_current_user)):
    """Cria um novo estudo clínico no banco de dados."""
    with Session(engine) as session:
        db_trial = ClinicalTrial(
            user_id=user_id,
            title=trial.title,
            phase=trial.phase,
            n_target=trial.n_target,
            status=trial.status
        )
        session.add(db_trial)
        session.commit()
        session.refresh(db_trial)
        return clean_dict_values(db_trial)

@app.put("/api/trials/{trial_id}")
async def update_trial(trial_id: int, trial_data: Dict[str, Any], user_id: str = Depends(get_current_user)):
    """Atualiza um estudo clínico existente."""
    with Session(engine) as session:
        db_trial = session.get(ClinicalTrial, trial_id)
        if not db_trial or db_trial.user_id != user_id:
            raise HTTPException(status_code=404, detail="Estudo não encontrado.")
        for key, value in trial_data.items():
            if hasattr(db_trial, key):
                setattr(db_trial, key, value)
        db_trial.updated_at = datetime.utcnow()
        session.add(db_trial)
        session.commit()
        session.refresh(db_trial)
        return clean_dict_values(db_trial)

@app.delete("/api/trials/{trial_id}")
async def delete_trial(trial_id: int, user_id: str = Depends(get_current_user)):
    """Remove um estudo clínico."""
    with Session(engine) as session:
        db_trial = session.get(ClinicalTrial, trial_id)
        if not db_trial or db_trial.user_id != user_id:
            raise HTTPException(status_code=404, detail="Estudo não encontrado.")
        session.delete(db_trial)
        session.commit()
        return {"status": "ok", "message": "Estudo removido com sucesso."}

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    page: Optional[str] = None
    trials_summary: Optional[str] = None
    history_summary: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = []

class StudyExtractRequest(BaseModel):
    url: Optional[str] = None

def _try_pubmed_api(url: str) -> str:
    """Tenta buscar abstract via PubMed API (E-utilities) se for um link PubMed."""
    import re as _re
    m = _re.search(r'pubmed\.ncbi\.nlm\.nih\.gov/(\d+)', url)
    if not m:
        m = _re.search(r'PMID[:\s]*(\d+)', url, _re.IGNORECASE)
    if not m:
        return ""
    pmid = m.group(1)
    try:
        resp = requests.get(
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&rettype=abstract&retmode=text",
            timeout=10
        )
        if resp.ok and len(resp.text.strip()) > 100:
            return resp.text.strip()[:15000]
    except Exception:
        pass
    return ""

def _resolve_doi(url: str) -> str:
    """Se for DOI, tenta resolver para URL final."""
    import re as _re
    m = _re.search(r'(10\.\d{4,}/[^\s]+)', url)
    if m:
        doi = m.group(1).rstrip('.')
        return f"https://doi.org/{doi}"
    if 'doi.org/' in url:
        return url
    return ""

def fetch_url_content(url: str) -> str:
    """Busca conteúdo de uma URL (artigo científico, PubMed, etc)."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15, allow_redirects=True)
        resp.raise_for_status()
        content_type = resp.headers.get('content-type', '').lower()

        if 'application/pdf' in content_type:
            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(resp.content))
                text = ""
                for page in pdf_reader.pages[:10]:
                    text += page.extract_text() or ""
                return text[:15000]
            except Exception as e:
                return f"PDF detectado mas não foi possível extrair texto: {str(e)}"

        soup = BeautifulSoup(resp.text, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()
        text = soup.get_text(separator='\n', strip=True)
        return text[:15000]
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else 0
        # Para 403/429, tentar fallbacks antes de falhar
        if status_code in (403, 429, 503):
            # Fallback 1: PubMed API (se for link PubMed ou tiver PMID)
            pubmed_text = _try_pubmed_api(url)
            if pubmed_text:
                return pubmed_text

            # Fallback 2: Tentar Google Scholar cache ou DOI metadata
            doi_url = _resolve_doi(url)
            if doi_url and doi_url != url:
                try:
                    # Tentar via Crossref API para obter metadados do DOI
                    import re as _re
                    doi_match = _re.search(r'(10\.\d{4,}/[^\s]+)', doi_url)
                    if doi_match:
                        doi = doi_match.group(1).rstrip('.')
                        cr_resp = requests.get(
                            f"https://api.crossref.org/works/{doi}",
                            headers={'Accept': 'application/json'},
                            timeout=10
                        )
                        if cr_resp.ok:
                            data = cr_resp.json().get('message', {})
                            parts = []
                            parts.append(f"Title: {' '.join(data.get('title', []))}")
                            if data.get('abstract'):
                                parts.append(f"Abstract: {data['abstract']}")
                            authors = data.get('author', [])
                            if authors:
                                author_str = ', '.join(f"{a.get('family', '')} {a.get('given', '')}" for a in authors[:10])
                                parts.append(f"Authors: {author_str}")
                            parts.append(f"Journal: {' '.join(data.get('container-title', []))}")
                            issued = data.get('issued', {}).get('date-parts', [[]])
                            if issued and issued[0]:
                                parts.append(f"Year: {issued[0][0]}")
                            text = '\n'.join(parts)
                            if len(text) > 100:
                                return text[:15000]
                except Exception:
                    pass

            raise HTTPException(
                status_code=400,
                detail=f"Acesso bloqueado pelo site ({status_code}). Tente: 1) Colar o link do PubMed do mesmo artigo, ou 2) Baixar o PDF e anexar diretamente."
            )
        raise HTTPException(status_code=400, detail=f"Erro ao acessar URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao acessar URL: {str(e)}")

EXTRACT_PROMPT = """Você é um extrator de dados de estudos científicos para metanálise.
Analise o texto abaixo e extraia as seguintes informações em JSON válido.

Retorne APENAS um objeto JSON com esta estrutura (sem markdown, sem ```json):
{
  "name": "Nome do estudo (ex: Smith et al. 2019)",
  "n": número total de participantes (inteiro, ou null se não encontrado),
  "effect": tamanho do efeito numérico (d de Cohen, diferença de médias, odds ratio, hazard ratio, log-OR, ou qualquer medida de efeito numérica reportada. null se não encontrado),
  "se": erro padrão do efeito (calcule a partir do IC95 se necessário: SE = (limite_superior - limite_inferior) / 3.92. null se não encontrado),
  "year": ano de publicação (inteiro, ou null),
  "journal": nome do journal (string, ou null),
  "design": desenho do estudo (ex: "RCT", "coorte", "caso-controle", ou null),
  "outcome": desfecho principal medido (string curta, ou null),
  "measure": medida de efeito usada (ex: "MD", "OR", "RR", "HR", "SMD", ou null),
  "confidence": "alta" se encontrou n, effect e se; "média" se encontrou 2 de 3; "baixa" se encontrou menos
}

TEXTO DO ESTUDO:
"""

@app.post("/api/meta/extract")
async def extract_study(
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user)
):
    if not openai_client:
        raise HTTPException(status_code=503, detail="Serviço de IA não configurado.")

    text_content = ""

    if file:
        contents = await file.read()
        try:
            if file.filename.endswith('.pdf'):
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
                for page in pdf_reader.pages[:10]:
                    text_content += page.extract_text() or ""
            elif file.filename.endswith('.csv'):
                df = robust_read_csv(contents)
                text_content = f"Dataset CSV com {len(df)} linhas e {len(df.columns)} colunas.\nColunas: {df.columns.tolist()}\n{df.head(20).to_string()}"
            else:
                text_content = contents.decode('utf-8', errors='ignore')[:15000]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao processar arquivo: {str(e)}")
    elif url:
        text_content = fetch_url_content(url)
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou um arquivo.")

    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Não foi possível extrair texto do documento.")

    try:
        raw = ask_gpt(EXTRACT_PROMPT + text_content[:12000])
        raw = raw.strip()
        raw = re.sub(r'^```json\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        extracted = json.loads(raw)
        return clean_dict_values(extracted)
    except json.JSONDecodeError:
        return {"raw_response": raw, "error": "Não foi possível parsear a resposta da IA. Extraia manualmente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na extração: {str(e)}")

# ============================================================
# Pipeline de Meta-análise (5 estágios)
# ============================================================

@app.post("/api/meta/pipeline")
async def meta_pipeline(
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user)
):
    """Pipeline completo de extração de meta-análise em 5 estágios."""
    if not openai_client:
        raise HTTPException(status_code=503, detail="Serviço de IA não configurado.")

    text_content = ""

    if file:
        contents = await file.read()
        try:
            if file.filename.endswith('.pdf'):
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
                for page in pdf_reader.pages[:10]:
                    text_content += page.extract_text() or ""
            elif file.filename.endswith('.csv'):
                df = robust_read_csv(contents)
                text_content = f"Dataset CSV com {len(df)} linhas e {len(df.columns)} colunas.\nColunas: {df.columns.tolist()}\n{df.head(20).to_string()}"
            else:
                text_content = contents.decode('utf-8', errors='ignore')[:15000]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao processar arquivo: {str(e)}")
    elif url:
        text_content = fetch_url_content(url)
    else:
        raise HTTPException(status_code=400, detail="Forneça uma URL ou um arquivo.")

    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Não foi possível extrair texto do documento.")

    try:
        result = run_pipeline(text_content, ask_gpt)
        return clean_dict_values(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no pipeline de meta-análise: {str(e)}")

# ============================================================
# Curva ROC / AUC
# ============================================================

def compute_roc_curve(labels, scores):
    """Computes ROC curve (FPR, TPR, thresholds) and AUC from raw data."""
    pairs = list(zip(scores, labels))
    pairs.sort(key=lambda x: -x[0])
    
    n_pos = sum(1 for _, l in pairs if l == 1)
    n_neg = sum(1 for _, l in pairs if l == 0)
    
    if n_pos == 0 or n_neg == 0:
        raise ValueError("É necessário ter pelo menos um caso positivo (1) e um negativo (0).")
    
    tpr_list = [0.0]
    fpr_list = [0.0]
    thresholds = [pairs[0][0] + 1e-9]
    
    tp = 0
    fp = 0
    
    for i, (score, label) in enumerate(pairs):
        if label == 1:
            tp += 1
        else:
            fp += 1
        
        tpr_list.append(tp / n_pos)
        fpr_list.append(fp / n_neg)
        if i < len(pairs) - 1:
            thresholds.append((pairs[i][0] + pairs[i + 1][0]) / 2)
    
    auc = 0.0
    for i in range(1, len(fpr_list)):
        auc += (fpr_list[i] - fpr_list[i - 1]) * (tpr_list[i] + tpr_list[i - 1]) / 2
    
    return {
        "fpr": [round(v, 6) for v in fpr_list],
        "tpr": [round(v, 6) for v in tpr_list],
        "thresholds": [round(v, 6) for v in thresholds],
        "auc": round(auc, 6),
        "n_pos": n_pos,
        "n_neg": n_neg,
        "n_total": n_pos + n_neg
    }

@app.post("/api/meta/roc")
async def compute_roc(
    file: Optional[UploadFile] = File(None),
    score_column: Optional[str] = Form(None),
    label_column: Optional[str] = Form(None),
    data: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user)
):
    """Computes ROC curve and AUC from uploaded CSV or manual JSON data."""
    try:
        if file:
            contents = await file.read()
            if file.filename.endswith('.csv'):
                df = robust_read_csv(contents)
            else:
                df = robust_read_excel(contents)
            df = sanitize_df(df)
            
            if score_column and score_column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Coluna '{score_column}' não encontrada.")
            if label_column and label_column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Coluna '{label_column}' não encontrada.")
            
            if not score_column:
                num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                score_column = num_cols[-1] if num_cols else df.columns[-1]
            if not label_column:
                cat_cols = [c for c in df.columns if c != score_column]
                label_column = cat_cols[-1] if cat_cols else df.columns[0]
            
            scores = pd.to_numeric(df[score_column], errors='coerce').dropna().values
            labels_raw = df[label_column].dropna().values
            
            label_map = {}
            unique_labels = sorted(set(str(l) for l in labels_raw))
            if len(unique_labels) != 2:
                raise HTTPException(status_code=400, detail=f"A variável de desfecho deve ter exatamente 2 categorias. Encontradas: {unique_labels}")
            label_map = {unique_labels[0]: 0, unique_labels[1]: 1}
            labels = np.array([label_map.get(str(l), 0) for l in labels_raw])
            
            valid_mask = ~np.isnan(scores)
            scores = scores[valid_mask]
            labels = labels[valid_mask]
            
            result = compute_roc_curve(labels.tolist(), scores.tolist())
            result["score_column"] = score_column
            result["label_column"] = label_column
            
            return clean_dict_values(result)
        
        elif data:
            raw = json.loads(data)
            scores = raw.get("scores", [])
            labels = raw.get("labels", [])
            
            if len(scores) != len(labels):
                raise HTTPException(status_code=400, detail="Número de scores e labels deve ser igual.")
            if len(scores) < 3:
                raise HTTPException(status_code=400, detail="Mínimo de 3 observações necessário.")
            
            result = compute_roc_curve(labels, scores)
            return clean_dict_values(result)
        
        else:
            raise HTTPException(status_code=400, detail="Forneça um arquivo CSV ou dados JSON.")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERR: ROC -> {e}")
        raise HTTPException(status_code=400, detail=str(e))

SYSTEM_PROMPT = """Você é o Paper Metrics, um assistente amigável e especializado em bioestatística e análise de dados clínicos, integrado à plataforma Paper Metrics.

TOM E ESTILO DE RESPOSTA:
- Seja **conversacional, acolhedor e didático** — como um colega sênior que adora ensinar
- Use **negrito** para destacar conceitos importantes, nomes de testes e valores-chave
- Use *itálico* para ênfase suave
- Use listas com marcadores para organizar informações
- Use blocos de código inline (`assim`) para fórmulas, valores numéricos ou termos técnicos
- Evite respostas secas ou excessivamente formais — explique como se estivesse conversando
- Sempre que possível, dê **exemplos práticos** do cotidiano de pesquisa clínica
- Use emojis com moderação para tornar a leitura mais agradável (📊, 🧬, 📈, ✅, ⚠️)
- **NUNCA** use os marcadores de markdown como asteriscos soltos — o sistema renderiza markdown corretamente, então use **negrito** e *itálico* normalmente

CONHECIMENTO COMPLETO DA PLATAFORMA PAPER METRICS:

O Paper Metrics é uma plataforma completa de análise estatística para pesquisadores. Você conhece cada ferramenta e sabe orientar o usuário sobre a melhor opção para cada cenário:

📊 **Dashboard** (/) — O ponto de partida. O usuário faz upload de um dataset (CSV ou Excel), o sistema detecta automaticamente os tipos de variáveis, sugere o protocolo de análise ideal e executa os testes. É a ferramenta principal para quem tem dados e quer respostas rápidas.

🧪 **Ensaios Clínicos** (/clinical-trials) — Para gerenciar estudos clínicos do planejamento à publicação. Controle de recrutamento, fases (I-IV), status e acompanhamento de pacientes. Ideal para pesquisadores que estão conduzindo trials.

📈 **Análise de Sobrevivência** (/survival-analysis) — Curvas de Kaplan-Meier e teste Log-Rank. Use quando o usuário tem dados de tempo até um evento (morte, recidiva, alta hospitalar) com censura.

🔬 **Metanálise** (/meta-analysis) — Combine resultados de múltiplos estudos para obter uma estimativa pooled do efeito. Use forest plots e modelos de efeitos fixos ou aleatórios.

📉 **Visualizações** (/visualizations) — Gráficos interativos, correlações visuais e exploração de dados. Perfeito para entender padrões antes de rodar testes formais.

🎯 **Cálculo de Poder** (/power-calculator) — Calcule o tamanho amostral necessário antes de começar o estudo. Evite underpowered studies!

📁 **Arquivo Histórico** (/archive) — Todas as análises anteriores ficam salvas aqui para consulta e replicação.

TESTES ESTATÍSTICOS DISPONÍVEIS E QUANDO USAR:

- **Teste T Independente** — Comparar médias de 2 grupos independentes (dados normais)
- **Teste T Pareado** — Comparar antes/depois no mesmo grupo
- **ANOVA One-Way** — Comparar 3+ grupos independentes (dados normais)
- **Mann-Whitney U** — Versão não-paramétrica do Teste T (2 grupos, dados não-normais)
- **Wilcoxon** — Versão não-paramétrica do Teste T Pareado
- **Kruskal-Wallis** — Versão não-paramétrica da ANOVA (3+ grupos)
- **Qui-Quadrado (χ²)** — Associação entre variáveis categóricas
- **Teste Exato de Fisher** — Para tabelas 2×2 com amostras pequenas
- **Correlação de Pearson** — Relação linear entre 2 variáveis contínuas normais
- **Correlação de Spearman** — Relação monotônica (dados não-normais ou ordinais)
- **Regressão Linear** — Predizer variável contínua a partir de preditores
- **Regressão Logística** — Predizer outcome binário (sim/não, sucesso/fracasso)
- **Shapiro-Wilk** — Testar normalidade dos dados
- **Kaplan-Meier + Log-Rank** — Análise de sobrevivência com censura

CORES DOS TESTES NA INTERFACE (use tags especiais quando citar testes):
- Descritiva → `[[DESCRITIVA]]`
- Correlação → `[[CORRELAÇÃO]]`
- Regressão → `[[REGRESSÃO]]`
- Comparação de Grupos → `[[COMPARAÇÃO]]`
- Pareado (antes/depois) → `[[PAREADO]]`
- Normalidade → `[[NORMALIDADE]]`

REGRAS:
1. Quando o usuário pedir para analisar um arquivo ou mencionar ter um dataset, DIRETAMENTE sugira que anexe o arquivo no chat (use a tag [SUGGEST_UPLOAD]).
2. Sempre que mencionar um tipo de teste ou análise, envolva-o na tag de cor correspondente (ex: `[[COMPARAÇÃO]]Teste T Independente[[/COMPARAÇÃO]]`).
3. Seja **conversacional e didático** — nunca seco ou robótico.
4. Responda em português brasileiro.
5. Quando sugerir um teste, explique brevemente POR QUÊ.
6. Se tiver acesso ao contexto de ensaios clínicos ou histórico do usuário, personalize a resposta.
7. Oriente o usuário sobre qual ferramenta do Paper Metrics usar para cada necessidade."""


@app.post("/api/stats/premium-analysis")
async def premium_analysis(target_col: str = Form(...), group_col: Optional[str] = Form(None), file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Premium analysis endpoint using the Antigravity Awesome Skills stats engine."""
    contents = await file.read()
    try:
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = robust_read_excel(contents)
        df = sanitize_df(df)
        
        analysis_results = premium_engine.run_comprehensive_analysis(df, target_col, group_col)
        
        # Gerar Relatório Científico com IA
        if openai_client:
            try:
                # Criar um resumo conciso para o prompt
                test_summaries = []
                for t in analysis_results.get("tests", []):
                    test_summaries.append(f"- {t['test_name']}: stat={t['stat_value']}, p={t['p_value']}, interpretacao={t['interpretation']}")
                
                desc = analysis_results.get("descriptive", {})
                desc_summary = f"Média={desc.get('mean')}, Mediana={desc.get('median')}, DP={desc.get('std')}"
                
                prompt = f"""
                Como um sênior PhD em Bioestatística Clínica, interprete estes resultados para um artigo científico de alto impacto.
                
                VARIAVEL ALVO: {target_col}
                GRUPO (se houver): {group_col or 'Nenhum'}
                ESTATISTICAS DESCRITIVAS: {desc_summary}
                TESTES EXECUTADOS:
                {chr(10).join(test_summaries)}
                
                Gere um relatório estruturado em:
                1. 📝 RESULTADOS (Redação técnica dos achados, mencionando p-valores e magnitudes)
                2. 🔬 DISCUSSÃO (Interpretação clínica, limitações e impacto)
                3. 🚀 CONCLUSÃO (Ponto central e sugestão de próximos passos)
                
                Use Português Brasileiro. Estilo acadêmico formal. Use Markdown.
                """
                
                ai_text = ask_gpt(prompt)
                analysis_results["scientific_report"] = ai_text
            except Exception as e:
                print(f"ERR: AI Report -> {e}")
                analysis_results["scientific_report"] = "Relatório científico indisponível temporariamente."
        else:
            analysis_results["scientific_report"] = "Configure a chave da API OpenAI para gerar relatórios automáticos."

        return clean_dict_values(analysis_results)
    except Exception as e:
        print(f"ERR: Premium Analysis -> {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ai/chat")
async def ai_chat(
    message: str = Form(...),
    context: Optional[str] = Form(None),
    page: Optional[str] = Form(None),
    trials_summary: Optional[str] = Form(None),
    history_summary: Optional[str] = Form(None),
    conversation_history: Optional[str] = Form("[]"),
    file: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user)
):
    try:
        conv_history = json.loads(conversation_history) if conversation_history else []

        file_context = ""
        if file:
            contents = await file.read()
            try:
                if file.filename.endswith('.csv'):
                    df = robust_read_csv(contents)
                else:
                    df = robust_read_excel(contents)
                df = sanitize_df(df)

                cols = df.columns.tolist()
                n_rows = len(df)
                dtypes = {c: str(df[c].dtype) for c in cols}
                desc = json_safe_df(df.describe()).to_dict()

                file_context = f"""
O usuário anexou o arquivo "{file.filename}" com {n_rows} linhas e {len(cols)} colunas.
Colunas: {cols}
Tipos: {dtypes}
Estatísticas descritivas: {json.dumps(clean_dict_values(desc), indent=2)[:2000]}
Primeiras 3 linhas: {json_safe_df(df.head(3)).to_dict(orient='records')}
"""
            except Exception as e:
                file_context = f"O usuário anexou o arquivo '{file.filename}', mas houve erro ao processá-lo: {str(e)}"

        # Tentar resposta local primeiro (para perguntas comuns de bioestatística)
        local_response = get_local_response(message)
        if local_response and not file_context:
            return clean_dict_values({
                "response": local_response,
                "needs_upload": False,
                "source": "local"
            })

        # Tentar GPT com retry
        context_parts = [SYSTEM_PROMPT]
        if page:
            context_parts.append(f"\nPÁGINA ATUAL DO USUÁRIO: {page}")
        if trials_summary:
            context_parts.append(f"\nENSAIOS CLÍNICOS DO USUÁRIO:\n{trials_summary}")
        if history_summary:
            context_parts.append(f"\nHISTÓRICO DE ANÁLISES:\n{history_summary}")
        if context:
            context_parts.append(f"\nCONTEXTO ADICIONAL:\n{context}")
        if file_context:
            context_parts.append(f"\nDADOS DO ARQUIVO:\n{file_context}")
        if local_response:
            context_parts.append(f"\nREFERÊNCIA LOCAL (use como base):\n{local_response}")

        full_system = "\n".join(context_parts)

        try:
            if not openai_client:
                raise Exception("Cliente OpenAI não configurado.")

            messages = [
                {"role": "system", "content": full_system}
            ]

            for m in conv_history[-10:]:
                messages.append({"role": m["role"], "content": m["content"]})

            messages.append({"role": "user", "content": message})

            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.7,
            )
            ai_text = response.choices[0].message.content
        except Exception as openai_err:
            err_str = str(openai_err)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                if local_response:
                    return clean_dict_values({
                        "response": f"{local_response}\n\n---\n_Nota: A IA está temporariamente indisponível (limite de uso exibido). Resposta baseada em conhecimento local._",
                        "needs_upload": False,
                        "source": "local_fallback"
                    })
                return clean_dict_values({
                    "response": "A IA está temporariamente indisponível (limite de uso da API excedido). Aguarde alguns minutos.\n\nEnquanto isso, posso responder perguntas básicas de bioestatística. Tente perguntar sobre: Teste T, ANOVA, Mann-Whitney, Qui-Quadrado, Spearman, Kaplan-Meier, p-valor, tamanho amostral, intervalo de confiança.",
                    "needs_upload": False,
                    "source": "error"
                    })
            raise openai_err

        needs_upload = False
        upload_keywords = ['anexe', 'anexar', 'envie o arquivo', 'envie seu', 'upload', 'compartilhe o dataset', 'preciso do arquivo', 'faça upload', 'SUGGEST_UPLOAD']
        if any(kw.lower() in ai_text.lower() for kw in upload_keywords) or '[SUGGEST_UPLOAD]' in ai_text:
            needs_upload = True
            ai_text = ai_text.replace('[SUGGEST_UPLOAD]', '').strip()

        return clean_dict_values({
            "response": ai_text,
            "needs_upload": needs_upload,
            "source": "openai"
        })
    except Exception as e:
        print(f"ERR: AI Chat -> {e}")
        raise HTTPException(status_code=500, detail=f"Erro no assistente: {str(e)}")

# ============================================================
# FASE 1 — Endpoints de Projetos de Pesquisa (Histórico)
# ============================================================

# Pydantic schemas para request/response
class ProjectCreate(BaseModel):
    title: str
    author: Optional[str] = None
    institution: Optional[str] = None
    doi: Optional[str] = None
    status: str = "em_andamento"
    notes: Optional[str] = None
    tags: Optional[List[str]] = []

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    institution: Optional[str] = None
    doi: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None

@app.get("/api/projects")
async def list_projects(
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,
    q: Optional[str] = None,
    tag: Optional[str] = None,
    sort: Optional[str] = None,
    user_id: str = Depends(get_current_user)
):
    """Lista projetos de pesquisa do usuário com paginação."""
    with Session(engine) as session:
        stmt = select(ResearchProject).where(ResearchProject.user_id == user_id)
        if status:
            stmt = stmt.where(ResearchProject.status == status)
            
        stmt = stmt.order_by(ResearchProject.created_at.desc())
        all_projects = session.exec(stmt).all()
        
        # Apply tag filter (in-memory since tags are JSON)
        if tag:
            all_projects = [p for p in all_projects if p.tags and tag.lower() in p.tags.lower()]
            
        # In-memory search is used as SQLite JSON search and wildcards are limited in SQLModel
        if q:
            q_lower = q.lower()
            all_projects = [p for p in all_projects if getattr(p, "title") and q_lower in p.title.lower() or
                            getattr(p, "author") and q_lower in p.author.lower() or
                            getattr(p, "institution") and q_lower in p.institution.lower() or
                            getattr(p, "tags") and q_lower in p.tags.lower()
                           ]
                            
        # Apply sorting
        if sort:
            reverse = False
            sort_key = lambda p: p.title or ""
            
            if sort == "created_at_desc":
                sort_key = lambda p: p.created_at or datetime.min
                reverse = True
            elif sort == "created_at_asc":
                sort_key = lambda p: p.created_at or datetime.min
                reverse = False
            elif sort == "title_asc":
                sort_key = lambda p: p.title or ""
                reverse = False
            elif sort == "title_desc":
                sort_key = lambda p: p.title or ""
                reverse = True
            elif sort == "analyses_desc":
                # Need to get analysis count for each project
                def get_analysis_count(project):
                    return len(session.exec(select(ProjectAnalysisLink).where(ProjectAnalysisLink.project_id == project.id)).all())
                sort_key = get_analysis_count
                reverse = True
            elif sort == "analyses_asc":
                def get_analysis_count(project):
                    return len(session.exec(select(ProjectAnalysisLink).where(ProjectAnalysisLink.project_id == project.id)).all())
                sort_key = get_analysis_count
                reverse = False
                
            all_projects.sort(key=sort_key, reverse=reverse)

        total = len(all_projects)
        offset = (page - 1) * limit
        projects = all_projects[offset:offset + limit]

        result = []
        for p in projects:
            # Contar anexos, gráficos e análises vinculadas
            attach_count = len(session.exec(select(ProjectAttachment).where(ProjectAttachment.project_id == p.id)).all())
            chart_count = len(session.exec(select(ProjectChart).where(ProjectChart.project_id == p.id)).all())
            analysis_count = len(session.exec(select(ProjectAnalysisLink).where(ProjectAnalysisLink.project_id == p.id)).all())

            result.append({
                "id": p.id,
                "title": p.title,
                "author": p.author,
                "institution": p.institution,
                "doi": p.doi,
                "status": p.status,
                "notes": p.notes,
                "tags": json.loads(p.tags or "[]"),
                "created_at": p.created_at.isoformat(),
                "updated_at": p.updated_at.isoformat(),
                "attachment_count": attach_count,
                "chart_count": chart_count,
                "analysis_count": analysis_count,
            })

        return {"projects": result, "total": total, "page": page, "limit": limit}


@app.post("/api/projects", status_code=201)
async def create_project(
    body: ProjectCreate,
    user_id: str = Depends(get_current_user)
):
    """Cria um novo projeto de pesquisa."""
    project = ResearchProject(
        user_id=user_id,
        title=body.title,
        author=body.author,
        institution=body.institution,
        doi=body.doi,
        status=body.status,
        notes=body.notes,
        tags=json.dumps(body.tags or [])
    )
    with Session(engine) as session:
        session.add(project)
        session.commit()
        session.refresh(project)
        return {"id": project.id, "title": project.title, "status": project.status, "created_at": project.created_at.isoformat()}


@app.get("/api/projects/{project_id}")
async def get_project(
    project_id: int,
    user_id: str = Depends(get_current_user)
):
    """Retorna detalhes completos de um projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        attachments = session.exec(select(ProjectAttachment).where(ProjectAttachment.project_id == project_id)).all()
        charts = session.exec(select(ProjectChart).where(ProjectChart.project_id == project_id)).all()
        analysis_links = session.exec(select(ProjectAnalysisLink).where(ProjectAnalysisLink.project_id == project_id)).all()

        return {
            "id": p.id,
            "title": p.title,
            "author": p.author,
            "institution": p.institution,
            "doi": p.doi,
            "status": p.status,
            "notes": p.notes,
            "tags": json.loads(p.tags or "[]"),
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat(),
            "attachments": [
                {
                    "id": a.id, "original_name": a.original_name,
                    "file_type": a.file_type, "file_size": a.file_size,
                    "created_at": a.created_at.isoformat()
                } for a in attachments
            ],
            "charts": [
                {
                    "id": c.id, "label": c.label, "chart_type": c.chart_type,
                    "thumb_url": f"/api/projects/{project_id}/charts/{c.id}/thumb",
                    "image_url": f"/api/projects/{project_id}/charts/{c.id}/image",
                    "created_at": c.created_at.isoformat()
                } for c in charts
            ],
            "linked_analyses": [link.history_id for link in analysis_links],
        }


@app.put("/api/projects/{project_id}")
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    user_id: str = Depends(get_current_user)
):
    """Atualiza metadados de um projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        if body.title is not None: p.title = body.title
        if body.author is not None: p.author = body.author
        if body.institution is not None: p.institution = body.institution
        if body.doi is not None: p.doi = body.doi
        if body.status is not None: p.status = body.status
        if body.notes is not None: p.notes = body.notes
        if body.tags is not None: p.tags = json.dumps(body.tags)
        p.updated_at = datetime.utcnow()

        session.add(p)
        session.commit()
        return {"success": True, "updated_at": p.updated_at.isoformat()}


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: int,
    user_id: str = Depends(get_current_user)
):
    """Deleta um projeto e todos os seus arquivos associados."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        # Remover arquivos físicos de anexos
        attachments = session.exec(select(ProjectAttachment).where(ProjectAttachment.project_id == project_id)).all()
        for a in attachments:
            try:
                Path(a.file_path).unlink(missing_ok=True)
            except Exception as e:
                print(f"WARN: Could not delete attachment file {a.file_path}: {e}")
            session.delete(a)

        # Remover arquivos físicos de gráficos
        charts = session.exec(select(ProjectChart).where(ProjectChart.project_id == project_id)).all()
        for c in charts:
            try:
                Path(c.image_path).unlink(missing_ok=True)
                if c.thumb_path: Path(c.thumb_path).unlink(missing_ok=True)
            except Exception as e:
                print(f"WARN: Could not delete chart file {c.image_path}: {e}")
            session.delete(c)

        # Remover links de análise
        links = session.exec(select(ProjectAnalysisLink).where(ProjectAnalysisLink.project_id == project_id)).all()
        for link in links:
            session.delete(link)

        session.delete(p)
        session.commit()
        return {"success": True}


# --- Anexos (PDF / CSV / XLSX) ---

ALLOWED_ATTACHMENT_TYPES = {"application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"}
ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".csv", ".xlsx"}

@app.post("/api/projects/{project_id}/attachments", status_code=201)
async def upload_attachment(
    project_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """Faz upload de PDF ou CSV e associa ao projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        # if p.user_id != user_id:
        #     raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido. Use: PDF, CSV ou XLSX.")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=413, detail="Arquivo muito grande. Máximo: 50MB.")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOAD_DIR / "attachments" / unique_name
    save_path.write_bytes(contents)

    file_type_map = {".pdf": "pdf", ".csv": "csv", ".xlsx": "xlsx"}
    attachment = ProjectAttachment(
        project_id=project_id,
        filename=unique_name,
        original_name=file.filename,
        file_type=file_type_map.get(ext, "unknown"),
        file_size=len(contents),
        file_path=str(save_path)
    )
    with Session(engine) as session:
        session.add(attachment)
        session.commit()
        session.refresh(attachment)
        return {
            "id": attachment.id,
            "original_name": attachment.original_name,
            "file_type": attachment.file_type,
            "file_size": attachment.file_size,
            "created_at": attachment.created_at.isoformat()
        }


@app.post("/api/projects/{project_id}/attachments/chunk", status_code=200)
async def upload_attachment_chunk(
    project_id: int,
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    original_filename: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """Realiza o upload de anexos em chunks (1MB) sequenciais."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido.")

    temp_dir = UPLOAD_DIR / "temp"
    temp_dir.mkdir(exist_ok=True, parents=True)
    temp_file = temp_dir / f"{upload_id}.part"

    contents = await file.read()
    with open(temp_file, "ab") as f:
        f.write(contents)

    if chunk_index == total_chunks - 1:
        # Último chunk
        unique_name = f"{uuid.uuid4().hex}{ext}"
        save_path = UPLOAD_DIR / "attachments" / unique_name
        import shutil
        shutil.move(str(temp_file), str(save_path))
        
        file_size = save_path.stat().st_size
        file_type_map = {".pdf": "pdf", ".csv": "csv", ".xlsx": "xlsx"}
        
        attachment = ProjectAttachment(
            project_id=project_id,
            filename=unique_name,
            original_name=original_filename,
            file_type=file_type_map.get(ext, "unknown"),
            file_size=file_size,
            file_path=str(save_path)
        )
        with Session(engine) as session:
            session.add(attachment)
            session.commit()
            session.refresh(attachment)
            return {
                "id": attachment.id,
                "original_name": attachment.original_name,
                "file_type": attachment.file_type,
                "file_size": attachment.file_size,
                "created_at": attachment.created_at.isoformat(),
                "completed": True
            }

    return {"status": "chunk_received", "chunk_index": chunk_index}


@app.get("/api/projects/{project_id}/attachments")
async def list_attachments(
    project_id: int,
    user_id: str = Depends(get_current_user)
):
    """Lista todos os anexos de um projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        
        # Para desenvolvimento, permitir acesso a qualquer projeto
        # Em produção, descomentar a linha abaixo:
        # if p.user_id != user_id:
        #     raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        attachments = session.exec(select(ProjectAttachment).where(ProjectAttachment.project_id == project_id)).all()
        return [
            {
                "id": a.id, "original_name": a.original_name,
                "file_type": a.file_type, "file_size": a.file_size,
                "download_url": f"/api/attachments/{a.id}/file",
                "created_at": a.created_at.isoformat()
            } for a in attachments
        ]


@app.get("/api/attachments/{attachment_id}/file")
async def serve_attachment(
    attachment_id: int,
    token: str = None
):
    """Serve o arquivo de um anexo para download/visualização."""
    # Para desenvolvimento, ignorar autenticação
    # (Em produção, adicionar validação de token aqui)
    
    with Session(engine) as session:
        a = session.get(ProjectAttachment, attachment_id)
        if not a:
            raise HTTPException(status_code=404, detail="Anexo não encontrado.")

    file_path = Path(a.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor.")

    media_type_map = {"pdf": "application/pdf", "csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    return FileResponse(
        path=str(file_path),
        media_type=media_type_map.get(a.file_type, "application/octet-stream"),
        filename=a.original_name
    )


@app.delete("/api/projects/{project_id}/attachments/{attachment_id}")
async def delete_attachment(
    project_id: int,
    attachment_id: int,
    user_id: str = Depends(get_current_user)
):
    """Remove um anexo do projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

        a = session.get(ProjectAttachment, attachment_id)
        if not a or a.project_id != project_id:
            raise HTTPException(status_code=404, detail="Anexo não encontrado.")

        try:
            Path(a.file_path).unlink(missing_ok=True)
        except Exception as e:
            print(f"WARN: Could not delete file {a.file_path}: {e}")

        session.delete(a)
        session.commit()
        return {"success": True}


# --- Gráficos (auto-save via Dashboard) ---

@app.post("/api/projects/{project_id}/charts", status_code=201)
async def save_chart(
    project_id: int,
    label: Optional[str] = Form(None),
    chart_type: Optional[str] = Form(None),
    analysis_id: Optional[int] = Form(None),
    image: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """Salva um gráfico gerado no Dashboard associado ao projeto ativo."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    contents = await image.read()
    unique_name = f"{uuid.uuid4().hex}.png"
    img_path = UPLOAD_DIR / "charts" / unique_name
    thumb_path = UPLOAD_DIR / "thumbs" / unique_name

    img_path.write_bytes(contents)
    create_thumbnail(str(img_path), str(thumb_path))

    chart = ProjectChart(
        project_id=project_id,
        label=label or f"Gráfico {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        chart_type=chart_type,
        image_path=str(img_path),
        thumb_path=str(thumb_path),
        analysis_id=analysis_id
    )
    with Session(engine) as session:
        session.add(chart)
        session.commit()
        session.refresh(chart)
        return {
            "id": chart.id,
            "label": chart.label,
            "thumb_url": f"/api/projects/{project_id}/charts/{chart.id}/thumb",
            "image_url": f"/api/projects/{project_id}/charts/{chart.id}/image",
            "created_at": chart.created_at.isoformat()
        }


@app.get("/api/projects/{project_id}/charts")
async def list_charts(
    project_id: int,
    user_id: str = Depends(get_current_user)
):
    """Lista todos os gráficos de um projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        charts = session.exec(select(ProjectChart).where(ProjectChart.project_id == project_id).order_by(ProjectChart.created_at.desc())).all()
        return [
            {
                "id": c.id, "label": c.label, "chart_type": c.chart_type,
                "thumb_url": f"/api/projects/{project_id}/charts/{c.id}/thumb",
                "image_url": f"/api/projects/{project_id}/charts/{c.id}/image",
                "analysis_id": c.analysis_id,
                "created_at": c.created_at.isoformat()
            } for c in charts
        ]


@app.get("/api/projects/{project_id}/charts/{chart_id}/thumb")
async def serve_chart_thumb(
    project_id: int,
    chart_id: int,
    user_id: str = Depends(get_current_user)
):
    """Serve o thumbnail de um gráfico."""
    with Session(engine) as session:
        c = session.get(ProjectChart, chart_id)
        if not c or c.project_id != project_id:
            raise HTTPException(status_code=404, detail="Gráfico não encontrado.")
        p = session.get(ResearchProject, c.project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

    path = Path(c.thumb_path) if c.thumb_path else Path(c.image_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return FileResponse(path=str(path), media_type="image/png")


@app.get("/api/projects/{project_id}/charts/{chart_id}/image")
async def serve_chart_image(
    project_id: int,
    chart_id: int,
    user_id: str = Depends(get_current_user)
):
    """Serve a imagem completa de um gráfico."""
    with Session(engine) as session:
        c = session.get(ProjectChart, chart_id)
        if not c or c.project_id != project_id:
            raise HTTPException(status_code=404, detail="Gráfico não encontrado.")
        p = session.get(ResearchProject, c.project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

    path = Path(c.image_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    return FileResponse(path=str(path), media_type="image/png", filename=f"{c.label or 'grafico'}.png")


@app.delete("/api/projects/{project_id}/charts/{chart_id}")
async def delete_chart(
    project_id: int,
    chart_id: int,
    user_id: str = Depends(get_current_user)
):
    """Remove um gráfico do projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

        c = session.get(ProjectChart, chart_id)
        if not c or c.project_id != project_id:
            raise HTTPException(status_code=404, detail="Gráfico não encontrado.")

        try:
            Path(c.image_path).unlink(missing_ok=True)
            if c.thumb_path: Path(c.thumb_path).unlink(missing_ok=True)
        except Exception as e:
            print(f"WARN: Could not delete chart image: {e}")

        session.delete(c)
        session.commit()
        return {"success": True}


# --- Vincular/desvincular análises do histórico ---

@app.post("/api/projects/{project_id}/analyses")
async def link_analysis(
    project_id: int,
    history_id: int = Form(...),
    user_id: str = Depends(get_current_user)
):
    """Vincula uma análise do histórico a um projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        existing = session.exec(
            select(ProjectAnalysisLink)
            .where(ProjectAnalysisLink.project_id == project_id)
            .where(ProjectAnalysisLink.history_id == history_id)
        ).first()
        if existing:
            return {"success": True, "message": "Análise já vinculada."}

        link = ProjectAnalysisLink(project_id=project_id, history_id=history_id)
        session.add(link)
        session.commit()
        return {"success": True}


@app.delete("/api/projects/{project_id}/analyses/{history_id}")
async def unlink_analysis(
    project_id: int,
    history_id: int,
    user_id: str = Depends(get_current_user)
):
    """Remove o vínculo entre análise e projeto."""
    with Session(engine) as session:
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

        link = session.exec(
            select(ProjectAnalysisLink)
            .where(ProjectAnalysisLink.project_id == project_id)
            .where(ProjectAnalysisLink.history_id == history_id)
        ).first()
        if link:
            session.delete(link)
            session.commit()
        return {"success": True}


@app.get("/api/projects/{project_id}/analyses")
async def get_project_analyses(
    project_id: int,
    user_id: str = Depends(get_current_user)
):
    """Retorna as análises vinculadas a um projeto."""
    with Session(engine) as session:
        # Verify project belongs to user
        p = session.get(ResearchProject, project_id)
        if not p or p.user_id != user_id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")

        # Get analysis links
        links = session.exec(
            select(ProjectAnalysisLink)
            .where(ProjectAnalysisLink.project_id == project_id)
        ).all()
        
        # Get the actual analysis records
        analyses = []
        for link in links:
            analysis = session.get(AnalysisHistory, link.history_id)
            if analysis:
                analyses.append({
                    "id": analysis.id,
                    "filename": analysis.filename,
                    "outcome": analysis.outcome,
                    "results": json.loads(analysis.results) if analysis.results else [],
                    "created_at": analysis.created_at.isoformat() if analysis.created_at else None
                })
        
        return analyses

@app.get("/api/projects/{project_id}/export")
async def export_project(project_id: int, user_id: str = Depends(get_current_user)):
    """Exporta o projeto e seus artefatos num arquivo ZIP gerado dinamicamente em memória."""
    with Session(engine) as session:
        project = session.get(ResearchProject, project_id)
        if not project or project.user_id != user_id:
            raise HTTPException(status_code=403, detail="Acesso negado.")

        attachments = session.exec(select(ProjectAttachment).where(ProjectAttachment.project_id == project_id)).all()
        charts = session.exec(select(ProjectChart).where(ProjectChart.project_id == project_id)).all()

        mem_zip = io.BytesIO()
        import zipfile
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            meta = {
                "id": project.id,
                "title": project.title,
                "author": project.author,
                "institution": project.institution,
                "doi": project.doi,
                "notes": project.notes,
                "tags": json.loads(project.tags) if project.tags else [],
                "status": project.status,
                "created_at": project.created_at.isoformat()
            }
            zf.writestr("metadata.json", json.dumps(meta, indent=2, ensure_ascii=False))

            for att in attachments:
                file_path = UPLOAD_DIR / "attachments" / str(att.id)
                if file_path.exists():
                    zf.write(file_path, arcname=f"anexos/{att.filename}")

            for chart in charts:
                img_path = UPLOAD_DIR / "charts" / str(chart.id)
                if img_path.exists():
                    zf.write(img_path, arcname=f"graficos/{chart.filename}")

        mem_zip.seek(0)
        return StreamingResponse(
            mem_zip, 
            media_type="application/zip", 
            headers={"Content-Disposition": f'attachment; filename="projeto_{project_id}_export.zip"'}
        )

# ============================================================
# API de Histórico de Análises (para aba Histórico)
# ============================================================

@app.get("/api/history")
async def get_history(user_id: str = Depends(get_current_user)):
    """Retorna todas as análises do histórico do usuário."""
    with Session(engine) as session:
        stmt = select(AnalysisHistory).where(AnalysisHistory.user_id == user_id).order_by(AnalysisHistory.created_at.desc())
        items = session.exec(stmt).all()
        return [
            {
                "id": h.id,
                "filename": h.filename,
                "outcome": h.outcome,
                "results": json.loads(h.results) if h.results else [],
                "created_at": h.created_at.isoformat()
            } for h in items
        ]


# ============================================================
# Sistema de Domínios Inteligentes — Endpoints de Resolução
# ============================================================

# Carregar módulos de domínio de forma lazy para não quebrar startup se faltarem
try:
    from domain_resolver import load_dictionaries, resolve_all_columns, detect_bilateral_pairs
    from domain_resolver import apply_transformation as apply_domain_transformation
    DOMAIN_RESOLVER_AVAILABLE = True
except ImportError as _domain_import_err:
    DOMAIN_RESOLVER_AVAILABLE = False
    print(f"WARN: domain_resolver não disponível: {_domain_import_err}")

try:
    from ai_domain_inferrer import infer_domain
    AI_INFERRER_AVAILABLE = True
except ImportError as _ai_import_err:
    AI_INFERRER_AVAILABLE = False
    print(f"WARN: ai_domain_inferrer não disponível: {_ai_import_err}")


class ColumnSample(BaseModel):
    name: str
    samples: List[str]


class ResolveColumnsRequest(BaseModel):
    columns: List[ColumnSample]


class TeachDomainRequest(BaseModel):
    column_name: str
    sample_values: List[str]
    domain_description: str
    transformation: str
    user_note: Optional[str] = None


@app.post("/api/data/resolve-columns")
async def resolve_columns_endpoint(
    request: ResolveColumnsRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Analisa as colunas de um CSV e detecta domínios especializados.
    Chamado APÓS /api/data/get-columns e ANTES de /api/data/analyze-protocol.

    Retorna resoluções apenas para colunas que precisam de atenção.
    """
    if not DOMAIN_RESOLVER_AVAILABLE:
        return {"resolutions": [], "bilateral_warnings": [], "error": "Domain resolver não disponível."}

    try:
        dictionaries = load_dictionaries()
        resolutions = []

        for col_info in request.columns:
            col_name = col_info.name
            samples = [str(s) for s in col_info.samples if s is not None]

            from domain_resolver import resolve_column, _get_sample_values
            result = resolve_column(col_name, samples, dictionaries)

            # Se não reconheceu via dicionário e IA disponível → tentar IA
            if result["domain"] is None and AI_INFERRER_AVAILABLE and openai_client:
                try:
                    ai_result = infer_domain(col_name, samples[:10])
                    if ai_result.get("needs_transformation") and ai_result.get("confidence") in ("medium", "high"):
                        result["source"] = ai_result.get("source", "ai_generic")
                        result["confidence"] = ai_result.get("confidence", "low")
                        result["rationale"] = ai_result.get("domain_description", "")
                        result["reference"] = ai_result.get("reference")
                        result["warning"] = ai_result.get("warning")
                        result["ai_suggested_transformation"] = ai_result.get("suggested_transformation")
                        result["ai_reasoning"] = ai_result.get("reasoning")
                        # Incluir mesmo sem domínio fixo, para o usuário decidir
                except Exception as e_ai:
                    print(f"WARN: IA falhou para coluna '{col_name}': {e_ai}")

            # Incluir apenas colunas que precisam de ação do usuário
            needs_attention = (
                result.get("domain") is not None
                or (result.get("source") in ("ai_generic", "ai_library") and result.get("confidence") != "low")
            )

            if needs_attention:
                result["sample_values"] = samples[:5]
                resolutions.append(result)

        # Detectar pares bilaterais (OD/OE, etc.) a partir de todas as colunas
        bilateral_warnings = []
        try:
            import pandas as pd
            # Construir DataFrame mínimo somente com as colunas recebidas para detecção bilateral
            df_minimal = pd.DataFrame({
                col.name: pd.Series(col.samples, dtype=str)
                for col in request.columns
            })
            bilateral_warnings = detect_bilateral_pairs(df_minimal, dictionaries)
        except Exception as e_bil:
            print(f"WARN: bilateral detection falhou: {e_bil}")

        return {
            "resolutions": resolutions,
            "bilateral_warnings": bilateral_warnings,
            "total_columns_analyzed": len(request.columns),
            "columns_needing_attention": len(resolutions)
        }

    except Exception as e:
        print(f"ERR: resolve_columns_endpoint -> {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao resolver colunas: {str(e)}")


@app.post("/api/domains/teach")
async def teach_domain_endpoint(
    request: TeachDomainRequest,
    user_id: str = Depends(get_current_user)
):
    """
    Persiste um novo domínio ensinado pelo usuário em user_domains.json.
    Na próxima análise, este domínio será reconhecido automaticamente.
    """
    import re as _re
    from pathlib import Path as _Path

    user_domains_path = _Path(__file__).parent / "user_domains.json"

    try:
        if user_domains_path.exists():
            with open(user_domains_path, "r", encoding="utf-8") as f:
                user_data = json.load(f)
        else:
            user_data = {"version": "1.0", "domains": {}}

        # Gerar chave única baseada na descrição do domínio
        domain_key = "user_" + _re.sub(r"[^a-z0-9_]", "_", request.domain_description.lower())[:40]

        # Detectar pattern automático dos sample_values
        sample_set = set(str(s).strip() for s in request.sample_values if s)
        auto_pattern = None
        if sample_set:
            # Pattern simples: conjunto de valores literais
            escaped = [_re.escape(v) for v in list(sample_set)[:10]]
            auto_pattern = "^(" + "|".join(escaped) + ")$"

        new_domain = {
            "display_name": request.domain_description,
            "description": request.domain_description,
            "source": "user_taught",
            "taught_by": user_id,
            "column_name_example": request.column_name,
            "user_note": request.user_note,
            "detection": {
                "pattern": auto_pattern,
                "sample_match_threshold": 0.7,
                "column_name_hints": [request.column_name.lower()]
            },
            "transformations": {
                request.transformation: {
                    "label": f"{request.transformation} (definido pelo usuário)",
                    "user_note": request.user_note
                }
            },
            "default_transformation": request.transformation
        }

        user_data["domains"][domain_key] = new_domain

        with open(user_domains_path, "w", encoding="utf-8") as f:
            json.dump(user_data, f, ensure_ascii=False, indent=2)

        return {
            "success": True,
            "domain_key": domain_key,
            "message": f"Domínio '{request.domain_description}' salvo com sucesso. Será reconhecido em próximas análises."
        }

    except Exception as e:
        print(f"ERR: teach_domain_endpoint -> {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar domínio: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
