import os
import json
import jwt
import hashlib
import secrets
import requests
import io
import re
import time
import datetime
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from scipy import stats
from dotenv import load_dotenv
import google.generativeai as genai
from sqlmodel import SQLModel, Field, create_engine, Session, select
from statsmodels.stats.power import TTestIndPower
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test
from bs4 import BeautifulSoup

# Carregar variáveis de ambiente
load_dotenv()

# Configurar Gemini
GEMINI_KEY = os.getenv("GOOGLE_API_KEY")
if GEMINI_KEY and GEMINI_KEY != "your_api_key_here":
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
else:
    model = None

import time

def ask_gemini(prompt: str, max_retries: int = 2) -> str:
    """Chama Gemini com retry automático em caso de rate limit."""
    if not model:
        raise HTTPException(status_code=503, detail="Serviço de IA não configurado.")

    for attempt in range(max_retries + 1):
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower():
                if attempt < max_retries:
                    wait = 5 * (attempt + 1)
                    print(f"GEMINI: Rate limit. Tentativa {attempt+1}/{max_retries+1}. Esperando {wait}s...")
                    time.sleep(wait)
                    continue
                raise HTTPException(status_code=429, detail="Limite de uso da API Gemini excedido. Aguarde alguns minutos ou adicione billing ao projeto Google Cloud.")
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
        return ("Sou o SciStat AI, especializado em bioestatística. Posso ajudar com:\n\n"
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
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class ClinicalTrial(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    status: str = "Planejamento" # Planejamento, Recrutamento, Analise, Finalizado
    phase: str = "I" # I, II, III, IV
    n_target: int = 100
    n_actual: int = 0
    start_date: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)
    updated_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    title: str
    message: str
    type: str = "info" # info, success, warning
    is_read: bool = False
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True)
    password_hash: str
    salt: str
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

JWT_SECRET = os.getenv("JWT_SECRET", secrets.token_hex(32))

def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()

def create_jwt(user_id: int, email: str, name: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "name": name,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

auth_scheme = HTTPBearer()

async def get_current_user(token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    """Valida JWT (local HS256 ou Neon Auth RS256) e extrai o ID do usuário."""
    try:
        creds = token.credentials

        segments = creds.split('.')
        if len(segments) != 3:
            print(f"AUTH WARN: Token não é JWT (segmentos: {len(segments)}). Usando fallback.")
            return creds[:64] if creds else "anonymous"

        # Tentar decodificar como JWT local (HS256) primeiro
        try:
            payload = jwt.decode(creds, JWT_SECRET, algorithms=["HS256"])
            return payload.get("sub")
        except jwt.InvalidTokenError:
            pass  # Não é token local, tentar Neon Auth

        # Fallback: Neon Auth (RS256)
        jwks_url = f"{NEON_AUTH_URL}/.well-known/jwks.json"
        jwks = requests.get(jwks_url, timeout=5).json()
        unverified_header = jwt.get_unverified_header(creds)
        kid = unverified_header.get("kid")

        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == kid:
                rsa_key = {"kty": key["kty"], "kid": key["kid"], "n": key["n"], "e": key["e"]}
                break

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Chave pública não encontrada.")

        payload = jwt.decode(creds, rsa_key, algorithms=["RS256"], options={"verify_aud": False})
        return payload.get("sub")

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado.")
    except jwt.InvalidTokenError as e:
        print(f"AUTH WARN: JWT inválido: {e}. Usando fallback.")
        return token.credentials[:64] if token.credentials else "anonymous"
    except Exception as e:
        print(f"AUTH ERR: {str(e)}")
        return token.credentials[:64] if token.credentials else "anonymous"

app = FastAPI(title="SciStat API Pro", version="2.12.0")

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "2.12.0"}

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

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
# Auth local (email/senha)
# ============================================================

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register")
async def register(body: RegisterRequest):
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres.")
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == body.email)).first()
        if existing:
            raise HTTPException(status_code=409, detail="E-mail já cadastrado.")
        salt = secrets.token_hex(16)
        pw_hash = hash_password(body.password, salt)
        user = User(name=body.name, email=body.email, password_hash=pw_hash, salt=salt)
        session.add(user)
        session.commit()
        session.refresh(user)
        token = create_jwt(user.id, user.email, user.name)
        return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.post("/api/auth/login")
async def login(body: LoginRequest):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == body.email)).first()
        if not user:
            raise HTTPException(status_code=401, detail="Credenciais inválidas.")
        if hash_password(body.password, user.salt) != user.password_hash:
            raise HTTPException(status_code=401, detail="Credenciais inválidas.")
        token = create_jwt(user.id, user.email, user.name)
        return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.get("/api/auth/me")
async def auth_me(user_id: str = Depends(get_current_user)):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == int(user_id))).first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return {"id": user.id, "name": user.name, "email": user.email}

# ============================================================
# Utilitários de Telemetria e Blindagem (The Blackbox)
# ============================================================

TELEMETRY_DIR = "telemetry"
if not os.path.exists(TELEMETRY_DIR): os.makedirs(TELEMETRY_DIR)

def record_telemetry(filename: str, contents: bytes, protocol: str = None, outcome: str = None):
    """Grava o estado exato para perícia técnica posterior."""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
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

def clean_dict_values(d: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(d, dict): return d
    new_dict = {}
    for k, v in d.items():
        if isinstance(v, dict): new_dict[k] = clean_dict_values(v)
        elif isinstance(v, float) and (np.isnan(v) or np.isinf(v)): new_dict[k] = None
        elif isinstance(v, list): new_dict[k] = [None if isinstance(x, float) and (np.isnan(x) or np.isinf(x)) else x for x in v]
        else: new_dict[k] = v
    return new_dict

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
            msg = "Esta parece uma Planilha de Resumo/Frequências. Para realizar análises estatísticas, o SciStat precisa da Planilha de Microdados (onde cada linha é um paciente e cada coluna é uma variável)."
            raise HTTPException(status_code=400, detail=msg)

        summary = json_safe_df(df.describe()).to_dict()
        preview = json_safe_df(df.head(10)).to_dict(orient='records')
        
        descriptive = {}
        for col in df.columns:
            col_data = pd.to_numeric(df[col], errors='coerce')
            non_null = col_data.dropna()
            if len(non_null) > 0:
                descriptive[col] = {
                    "n": int(len(non_null)),
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
        
        return clean_dict_values({
            "filename": file.filename, 
            "rows": len(df), 
            "columns": df.columns.tolist(), 
            "summary": summary, 
            "data_preview": preview,
            "descriptive_stats": descriptive
        })
    except HTTPException: raise
    except Exception as e:
        print(f"ERR: API Upload -> {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/data/analyze-protocol")
async def analyze_protocol_v6(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = robust_read_excel(contents)
        df = sanitize_df(df)
        
        print(f"DEBUG: analyze_protocol_v6 -> File: {file.filename}, Shape: {df.shape}")
        
        if is_summary_table(df):
            msg = "Esta Planilha parece conter APENAS O RESUMO (Tabela de Frequência). O SciStat AI precisa dos MICRODADOS BRUTOS (onde cada linha é um paciente) para realizar correlações e testes estatísticos."
            print(f"REJECTED: Summary table detected -> {file.filename}")
            raise HTTPException(status_code=400, detail=msg)
        
        ignore_patterns = r'\b(id|nº|nome|prontuario|data|sexo|registro|index|paciente|unidade|setor|atendimento)\b'
        
        # 1. Identificar o Desfecho (Outcome) com maior probabilidade (Última coluna numérica ou categórica não-ID)
        candidate_cols = [c for c in df.columns if not re.search(ignore_patterns, c.lower())]
        outcome_suggested = candidate_cols[-1] if candidate_cols else df.columns[-1]
        
        # Determinar tipo do desfecho (Outcome)
        # Tentar converter para numérico para ser mais resiliente
        outcome_series = pd.to_numeric(df[outcome_suggested].astype(str).str.replace(',', '.'), errors='coerce')
        is_outcome_numeric = not outcome_series.isna().all() and len(outcome_series.dropna().unique()) >= 5
        
        variables = []
        for col in df.columns:
            if col == outcome_suggested: continue
            
            # Detecção Robusta de Tipo (Numérico vs Categórico)
            col_series = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce')
            unique_count = len(df[col].dropna().unique())
            is_col_numeric = not col_series.isna().all() and unique_count >= 5
            
            # Lógica Infallible de Sugestão (4 Quadrantes)
            if re.search(ignore_patterns, col.lower()) and unique_count > (len(df) * 0.8):
                rec, opt, rat = "Excluir", ["Excluir"], "Identificador único detectado (ID)."
            
            elif is_outcome_numeric and is_col_numeric:
                # Quadrante 1: Numérico vs Numérico -> Spearman
                rec = "Correlação de Spearman"
                opt = ["Correlação de Spearman", "Regressão Linear", "Excluir"]
                rat = "Análise de relação (Correlação) entre duas escalas numéricas."
            
            elif is_outcome_numeric and not is_col_numeric:
                # Quadrante 2: Categórico (Preditor) vs Numérico (Desfecho) -> Mann-Whitney/Kruskal
                if unique_count == 2:
                    rec = "Mann-Whitney U"
                    opt = ["Mann-Whitney U", "Teste T Independente", "Excluir"]
                    rat = "Comparação de 2 grupos sobre o desfecho numérico."
                else:
                    rec = "Kruskal-Wallis H"
                    opt = ["Kruskal-Wallis H", "ANOVA One-Way", "Excluir"]
                    rat = "Comparação de múltiplos grupos (>2) sobre o desfecho numérico."
            
            elif not is_outcome_numeric and is_col_numeric:
                # Quadrante 3: Numérico (Preditor) vs Categórico (Desfecho) -> Mann-Whitney (Invertido)
                # Na prática clínica, compara-se o valor numérico entre os grupos do desfecho
                outcome_unique = len(df[outcome_suggested].dropna().unique())
                if outcome_unique == 2:
                    rec = "Mann-Whitney U"
                    opt = ["Mann-Whitney U", "Qui-Quadrado (X²)", "Excluir"]
                    rat = "Comparação desta escala numérica entre os grupos do desfecho."
                else:
                    rec = "Kruskal-Wallis H"
                    opt = ["Kruskal-Wallis H", "Qui-Quadrado (X²)", "Excluir"]
                    rat = "Comparação da escala entre os múltiplos grupos do desfecho."
            
            else:
                # Quadrante 4: Categórico vs Categórico -> Qui-Quadrado
                rec = "Qui-Quadrado (X²)"
                opt = ["Qui-Quadrado (X²)", "Excluir"]
                rat = "Associação entre variáveis categóricas (Frequências)."

            variables.append({
                "name": col, 
                "type": "Numérica" if is_col_numeric else "Categórica", 
                "unique_count": int(unique_count), 
                "recommended_test": rec, 
                "test_options": opt, 
                "rationale": rat
            })
            
        # Desfecho no topo do Protocolo (Sempre como Descritiva)
        variables.insert(0, {
            "name": outcome_suggested,
            "type": "DESFECHO (Numérico)" if is_outcome_numeric else "DESFECHO (Categórico)",
            "unique_count": int(len(df[outcome_suggested].unique())),
            "recommended_test": "Estatística Descritiva",
            "test_options": ["Estatística Descritiva"],
            "rationale": "Análise descritiva/perfil do desfecho principal selecionado."
        })
        
        return clean_dict_values({"outcome": outcome_suggested, "protocol": variables})
    except Exception as e:
        print(f"ERR: Analyze Protocol -> {e}")
        raise HTTPException(status_code=400, detail=str(e))
        print(f"ERR: Analyze -> {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/data/execute-protocol")
async def execute_protocol_v6(file: UploadFile = File(...), protocol: str = Form(...), outcome: Optional[str] = Form(None), user_id: str = Depends(get_current_user)):
    contents = await file.read()
    record_telemetry("EXECUTE_" + file.filename, contents, protocol, outcome)
    try:
        protocol_list = json.loads(protocol)
        if file.filename.endswith('.csv'): df = robust_read_csv(contents)
        else: df = pd.read_excel(io.BytesIO(contents))
        df = sanitize_df(df)
        
        # Sincronizar desfecho (Outcome) com Fuzzy Matching
        found_outcome = find_best_column_match(outcome, df.columns.tolist())
        if found_outcome:
            if found_outcome != outcome:
                print(f"DEBUG: Matched Outcome '{outcome[:30]}...' -> '{found_outcome[:30]}...'")
            outcome_col = found_outcome
        else:
            # Fallback se não encontrou o desfecho solicitado
            print(f"WARNING: Outcome '{outcome}' not found. Using fallback.")
            ignore_patterns = r'\b(id|nº|nome|data|prontuario)\b'
            num_cols = [c for c in df.select_dtypes(include=[np.number]).columns if not re.search(ignore_patterns, c.lower())]
            outcome_col = num_cols[-1] if num_cols else df.columns[-1]
        
        if outcome_col:
            df[outcome_col] = pd.to_numeric(df[outcome_col], errors='coerce')
            print(f"DEBUG: Outcome Final -> {outcome_col} (Nulls: {df[outcome_col].isna().sum()}/{len(df)})")

        results = []
        for item in protocol_list:
            var_name = item.get("name")
            test = item.get("selected_test") or item.get("recommended_test")
            if test == "Excluir" or var_name not in df.columns: continue
            
            # Limpeza de dados para este par
            cols_to_use = [var_name]
            if outcome_col and outcome_col != var_name: cols_to_use.append(outcome_col)
            df_curr = df[cols_to_use].dropna()
            
            stat, p_val = None, None
            median_val, iqr_val = None, None
            group_stats = None
            chart_data = None
            desc = ""
            if len(df_curr) >= 2:
                var_data = df_curr[var_name].values
                
                # Auto-bin numeric columns with too many unique values (max 5 groups)
                binned_series = None
                is_binned = False
                var_numeric = pd.to_numeric(df_curr[var_name], errors='coerce')
                unique_numeric = var_numeric.dropna().nunique()
                if unique_numeric > 5 and not var_numeric.isna().all():
                    binned_series, is_binned = bin_numeric_groups(df_curr[var_name], max_bins=5)
                    if is_binned:
                        df_curr[var_name] = binned_series
                        var_data = df_curr[var_name].values
                        print(f"DEBUG: Binned '{var_name}' into {df_curr[var_name].nunique()} groups")
                
                try:
                    if outcome_col and outcome_col != var_name:
                        outcome_data = pd.to_numeric(df_curr[outcome_col], errors='coerce').dropna()
                        
                        if ("Mann-Whitney" in test or "Kruskal" in test) and not pd.api.types.is_numeric_dtype(df_curr[outcome_col]):
                            print(f"DEBUG: Auto-Switch to Chi-Square for {var_name}")
                            test = f"Chi-Square Fallback ({test})"
                        
                        if "Mann-Whitney" in test:
                            u_vals = sorted(list(set(var_data)))
                            if len(u_vals) >= 2:
                                g1 = df_curr[df_curr[var_name] == u_vals[0]][outcome_col].values
                                g2 = df_curr[df_curr[var_name] == u_vals[1]][outcome_col].values
                                if len(g1) >= 1 and len(g2) >= 1: 
                                    res = stats.mannwhitneyu(g1, g2); stat, p_val = res.statistic, res.pvalue
                        elif "Kruskal" in test:
                            grps = [df_curr[df_curr[var_name] == v][outcome_col].values for v in set(var_data)]
                            if len(grps) >= 2: 
                                res = stats.kruskal(*grps); stat, p_val = res.statistic, res.pvalue
                        elif "Spearman" in test: 
                            res = stats.spearmanr(var_data, pd.to_numeric(df_curr[outcome_col], errors='coerce').values); stat, p_val = res.correlation, res.pvalue
                        elif "Chi-Square" in test or "Qui-Quadrado" in test or "Fallback" in test:
                            contingency = pd.crosstab(df_curr[var_name], df_curr[outcome_col])
                            if not contingency.empty:
                                chi2, p, dof, ex = stats.chi2_contingency(contingency)
                                stat, p_val = chi2, p
                        
                        if len(outcome_data) > 0:
                            median_val = float(np.median(outcome_data))
                            q1 = float(np.percentile(outcome_data, 25))
                            q3 = float(np.percentile(outcome_data, 75))
                            iqr_val = f"{q1:.2f} - {q3:.2f}"
                        
                        # Per-group stats: median (IQR) + N for each group of the predictor
                        unique_groups = sorted(df_curr[var_name].dropna().unique(), key=lambda x: str(x))
                        group_stats = []
                        for g in unique_groups:
                            g_outcome = pd.to_numeric(df_curr[df_curr[var_name] == g][outcome_col], errors='coerce').dropna()
                            if len(g_outcome) > 0:
                                group_stats.append({
                                    "group": str(g),
                                    "n": int(len(g_outcome)),
                                    "median": round(float(np.median(g_outcome)), 2),
                                    "q1": round(float(np.percentile(g_outcome, 25)), 2),
                                    "q3": round(float(np.percentile(g_outcome, 75)), 2),
                                    "iqr": f"{np.percentile(g_outcome, 25):.2f} - {np.percentile(g_outcome, 75):.2f}",
                                    "median_iqr": f"{np.median(g_outcome):.2f} ({np.percentile(g_outcome, 25):.2f} - {np.percentile(g_outcome, 75):.2f})"
                                })
                        
                        # Bar chart data for this variable
                        bar_labels = [g["group"] for g in group_stats]
                        bar_medians = [g["median"] for g in group_stats]
                        bar_q1 = [g["q1"] for g in group_stats]
                        bar_q3 = [g["q3"] for g in group_stats]
                        chart_data = {
                            "type": "bar",
                            "labels": bar_labels,
                            "values": bar_medians,
                            "q1": bar_q1,
                            "q3": bar_q3,
                            "var_name": var_name,
                            "outcome": outcome_col
                        }
                    
                    elif "Descritiva" in test:
                        numeric_vals = pd.to_numeric(var_data, errors='coerce').dropna()
                        if len(numeric_vals) > 0:
                            median_val = float(np.median(numeric_vals))
                            q1 = float(np.percentile(numeric_vals, 25))
                            q3 = float(np.percentile(numeric_vals, 75))
                            iqr_val = f"{q1:.2f} - {q3:.2f}"
                            stat = median_val
                            chart_data = {
                                "type": "histogram",
                                "values": [float(v) for v in numeric_vals],
                                "var_name": var_name
                            }
                except Exception as e: 
                    print(f"MATH ERR {var_name} ({test}): {e}")
            
            label_suffix = " [faixas]" if is_binned else ""
            result_item = {
                "testLabel": f"{var_name}{label_suffix} ({test})", 
                "statistic": round(float(stat), 4) if stat is not None else None, 
                "p_value": round(float(p_val), 4) if p_val is not None else None,
                "median_iqr": f"{median_val:.2f} ({iqr_val})" if median_val is not None and iqr_val else None,
                "group_stats": group_stats,
                "chart_data": chart_data
            }
            results.append(result_item)
        print(f"DEBUG: Analysis complete, {len(results)} items in results.")
        
        # Database save logic (Neon)
        try:
            with Session(engine) as session:
                record = AnalysisHistory(
                    user_id=user_id,
                    filename=file.filename,
                    outcome=outcome if outcome else "Indefinido",
                    protocol=protocol,
                    results=json.dumps(results)
                )
                session.add(record)
                
                # Criar Notificação Automática
                notif = Notification(
                    user_id=user_id,
                    title="Análise Concluída",
                    message=f"O dataset {file.filename} foi processado com sucesso.",
                    type="success"
                )
                session.add(notif)
                
                session.commit()
                print(f"DATABASE: Resultado e Notificação salvos.")
        except Exception as db_err:
            print(f"DATABASE ERR: Falha ao salvar histórico -> {db_err}")

        return clean_dict_values({"results": results})
    except Exception as e:
        print(f"ERR: Execute -> {e}")
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
        db_trial.updated_at = datetime.datetime.utcnow()
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

def fetch_url_content(url: str) -> str:
    """Busca conteúdo de uma URL (artigo científico, PubMed, etc)."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    if not model:
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
        response = model.generate_content(EXTRACT_PROMPT + text_content[:12000])
        raw = response.text.strip()
        raw = re.sub(r'^```json\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        extracted = json.loads(raw)
        return clean_dict_values(extracted)
    except json.JSONDecodeError:
        return {"raw_response": raw, "error": "Não foi possível parsear a resposta da IA. Extraia manualmente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na extração: {str(e)}")

SYSTEM_PROMPT = """Você é o SciStat AI, um assistente especializado em bioestatística e análise de dados clínicos integrado à plataforma SciStat v4.

SUAS CAPACIDADES:
- Orientar sobre qual teste estatístico usar (t-test, ANOVA, Mann-Whitney, Kruskal-Wallis, Qui-Quadrado, Spearman, Kaplan-Meier, Log-Rank, Regressão Linear, Regressão Logística)
- Interpretar resultados de análises (valor p, intervalo de confiança, tamanho de efeito)
- Explicar conceitos estatísticos de forma clara
- Sugerir protocolos de análise para datasets
- Orientar sobre desenhos de estudos clínicos (Fase I-IV)
- Ajudar com cálculo de poder estatístico e tamanho amostral

PÁGINAS DA PLATAFORMA:
- Dashboard (/): Upload de datasets, sumário bioestatístico, histórico de análises
- Ensaios Clínicos (/clinical-trials): Gerenciamento de estudos, recrutamento, status por fase
- Análise de Sobrevivência (/survival-analysis): Kaplan-Meier, Log-Rank test
- Metanálise (/meta-analysis): Pool de efeitos de múltiplos estudos
- Visualizações (/visualizations): Gráficos e correlações
- Cálculo de Poder (/power-calculator): Tamanho amostral e poder estatístico
- Arquivo Histórico (/archive): Histórico de análises realizadas

REGRAS:
1. Quando o usuário pedir para analisar um arquivo ou mencionar ter um dataset, DIRETAMENTE sugira que anexe o arquivo no chat (use a tag [SUGGEST_UPLOAD]).
2. Seja conciso mas completo. Use linguagem técnica quando apropriado.
3. Responda em português brasileiro.
4. Quando sugerir um teste, explique brevemente POR QUÊ.
5. Se tiver acesso ao contexto de ensaios clínicos ou histórico do usuário, personalize a resposta."""

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

        # Tentar Gemini com retry
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
            if not model:
                raise Exception("Modelo Gemini não configurado.")

            chat = model.start_chat(history=[
                {"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]}
                for m in conv_history[-10:]
            ])

            ai_text = ask_gemini(full_system + "\n\nPERGUNTA DO USUÁRIO: " + message)
        except Exception as gemini_err:
            err_str = str(gemini_err)
            if "429" in err_str or "quota" in err_str.lower():
                if local_response:
                    return clean_dict_values({
                        "response": f"{local_response}\n\n---\n_Nota: A IA está temporariamente indisponível (limite de uso exibido). Resposta baseada em conhecimento local._",
                        "needs_upload": False,
                        "source": "local_fallback"
                    })
                return clean_dict_values({
                    "response": "A IA está temporariamente indisponível (limite de uso da API excedido). Aguarde alguns minutos ou adicione billing ao projeto Google Cloud para aumentar o limite.\n\nEnquanto isso, posso responder perguntas básicas de bioestatística. Tente perguntar sobre: Teste T, ANOVA, Mann-Whitney, Qui-Quadrado, Spearman, Kaplan-Meier, p-valor, tamanho amostral, intervalo de confiança.",
                    "needs_upload": False,
                    "source": "error"
                    })
            raise gemini_err

        needs_upload = False
        upload_keywords = ['anexe', 'anexar', 'envie o arquivo', 'envie seu', 'upload', 'compartilhe o dataset', 'preciso do arquivo', 'faça upload', 'SUGGEST_UPLOAD']
        if any(kw.lower() in ai_text.lower() for kw in upload_keywords) or '[SUGGEST_UPLOAD]' in ai_text:
            needs_upload = True
            ai_text = ai_text.replace('[SUGGEST_UPLOAD]', '').strip()

        return clean_dict_values({
            "response": ai_text,
            "needs_upload": needs_upload,
            "source": "gemini"
        })
    except Exception as e:
        print(f"ERR: AI Chat -> {e}")
        raise HTTPException(status_code=500, detail=f"Erro no assistente: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
