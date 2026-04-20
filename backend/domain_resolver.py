"""
domain_resolver.py — Módulo central de resolução de domínios especializados.

Consulta domain_dictionaries.json (e user_domains.json) antes de invocar IA.
Nunca decide sozinho — o humano é sempre o ponto de confirmação final.
"""

import re
import json
import math
import logging
from pathlib import Path
import pandas as pd
import numpy as np

logger = logging.getLogger("domain_resolver")




def _log10_transform(value) -> float | None:
    import math
    try:
        v = float(value)
        if v <= 0: return None
        return round(math.log10(v), 4)
    except (ValueError, TypeError): return None

# ============================================================
# Carregamento dos dicionários
# ============================================================

BACKEND_DIR = Path(__file__).parent
OFFICIAL_DICT_PATH = BACKEND_DIR / "domain_dictionaries.json"
USER_DICT_PATH = BACKEND_DIR / "user_domains.json"


def load_dictionaries() -> dict:
    """
    Carrega domain_dictionaries.json e user_domains.json, com merge.
    O dicionário oficial tem prioridade sobre domínios do usuário.
    """
    official = {}
    user = {}

    if OFFICIAL_DICT_PATH.exists():
        with open(OFFICIAL_DICT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            official = data.get("domains", {})
    else:
        logger.warning(f"domain_dictionaries.json não encontrado em {OFFICIAL_DICT_PATH}")

    if USER_DICT_PATH.exists():
        with open(USER_DICT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            user = data.get("domains", {})

    # Merge: oficial sobrescreve usuário para evitar adulteração
    merged = {**user, **official}
    return merged


# ============================================================
# Funções auxiliares de detecção
# ============================================================

def _get_sample_values(series: pd.Series, n: int = 15) -> list:
    """Retorna até n valores não-nulos de uma série como strings limpas."""
    return series.dropna().head(n).astype(str).str.strip().tolist()


def _match_pattern(pattern: str, values: list) -> float:
    """
    Testa quantos valores batem o regex pattern.
    Retorna proporção de 0.0 a 1.0.
    """
    if not pattern or not values:
        return 0.0
    compiled = re.compile(pattern)
    hits = sum(1 for v in values if compiled.match(v))
    return hits / len(values) if values else 0.0


def _check_column_name_hints(col_name: str, hints: list) -> bool:
    """Verifica se o nome da coluna contém algum dos hints (case-insensitive)."""
    col_lower = col_name.lower().strip()
    return any(h.lower() in col_lower for h in (hints or []))


def _check_value_range(values: list, value_range: list) -> float:
    """
    Verifica que proporção dos valores cai dentro do range esperado.
    """
    if not value_range or len(value_range) != 2:
        return 1.0  # sem restrição de range → não penalizar
    lo, hi = value_range
    numeric_vals = []
    for v in values:
        try:
            numeric_vals.append(float(v))
        except (ValueError, TypeError):
            pass
    if not numeric_vals:
        return 0.0
    in_range = sum(1 for v in numeric_vals if lo <= v <= hi)
    return in_range / len(numeric_vals)


def _check_unique_values_exact(values: list, exact_set: list) -> bool:
    """Verifica se o conjunto de valores únicos é um subconjunto do exact_set."""
    if not exact_set:
        return True
    try:
        unique_numeric = set(int(float(v)) for v in values)
        return unique_numeric.issubset(set(exact_set))
    except (ValueError, TypeError):
        return False


# ============================================================
# Detecção por dicionário
# ============================================================

def _try_dict_match(col_name: str, sample_values: list, dictionaries: dict) -> tuple[str | None, float, str]:
    """
    Tenta casar a coluna com um domínio do dicionário.
    Retorna: (domain_key, confidence_score, confidence_label)
    """
    best_domain = None
    best_score = 0.0

    for domain_key, domain_cfg in dictionaries.items():
        detection = domain_cfg.get("detection", {})
        pattern = detection.get("pattern")
        threshold = detection.get("sample_match_threshold", 0.8)
        hints = detection.get("column_name_hints", [])
        value_range = detection.get("value_range")
        exact_set = detection.get("unique_values_exact")

        # Heurística multi-fator
        pattern_score = _match_pattern(pattern, sample_values) if pattern else 0.0
        name_bonus = 0.15 if _check_column_name_hints(col_name, hints) else 0.0
        range_score = _check_value_range(sample_values, value_range) if value_range else 1.0
        exact_match = _check_unique_values_exact(sample_values, exact_set) if exact_set else True

        # Pontuação composta
        score = pattern_score * 0.7 + name_bonus + (0.15 if range_score >= 0.9 else 0.0)
        if not exact_match:
            score *= 0.5  # penalizar se os valores não casam o conjunto exato

        # Só considerar se atingir threshold mínimo de pattern
        if pattern_score >= threshold * 0.6 and score > best_score:
            best_score = score
            best_domain = domain_key

    if best_domain is None:
        return None, 0.0, "unknown"

    if best_score >= 0.75:
        return best_domain, best_score, "high"
    elif best_score >= 0.45:
        return best_domain, best_score, "medium"
    else:
        return None, best_score, "low"


# ============================================================
# Detecção de pares bilaterais (OD/OE)
# ============================================================

def detect_bilateral_pairs(df: pd.DataFrame, dictionaries: dict) -> list[dict]:
    """
    Detecta pares bilaterais (ex: OD + OE) em domínios que possuem bilateral_rule.
    Retorna lista de avisos clínicos estruturados para o frontend.
    """
    warnings = []
    cols_lower = {c.lower().strip(): c for c in df.columns}

    for domain_key, domain_cfg in dictionaries.items():
        bilateral = domain_cfg.get("bilateral_rule", {})
        if not bilateral.get("enabled"):
            continue

        pair_kw = bilateral.get("pair_keywords", {})
        right_hints = pair_kw.get("right", [])
        left_hints = pair_kw.get("left", [])

        # Encontrar colunas que correspondem ao par
        right_col = next(
            (original for lower, original in cols_lower.items()
             if any(h.lower() == lower or lower.startswith(h.lower()) for h in right_hints)),
            None
        )
        left_col = next(
            (original for lower, original in cols_lower.items()
             if any(h.lower() == lower or lower.startswith(h.lower()) for h in left_hints)
             and (cols_lower.get(lower) != right_col)),
            None
        )

        if right_col and left_col:
            rule = bilateral.get("clinical_rule", "")
            derived = bilateral.get("derived_column_name")
            ref = bilateral.get("reference", "")

            warnings.append({
                "domain": domain_key,
                "display_name": domain_cfg.get("display_name", domain_key),
                "right_column": right_col,
                "left_column": left_col,
                "clinical_rule": rule,
                "derived_column_suggestion": derived,
                "reference": ref,
                "severity": "info"  # não é erro, é orientação clínica
            })

    return warnings


# ============================================================
# Função principal: resolve_column
# ============================================================

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
        "transformation_options": [...],           # lista de {key, label, warning?}
        "rationale": "LogMAR é o padrão ouro...",
        "reference": "Holladay 2004",
        "thresholds": {...},                       # limites clínicos se existirem
        "warning": None | "string com aviso"
    }
    """
    domain_key, score, confidence = _try_dict_match(column_name, sample_values, dictionaries)

    if domain_key and confidence in ("high", "medium"):
        domain_cfg = dictionaries[domain_key]
        transformations = domain_cfg.get("transformations", {})
        default_tf = domain_cfg.get("default_transformation", "none")

        options = []
        for tf_key, tf_cfg in transformations.items():
            opt = {"key": tf_key, "label": tf_cfg.get("label", tf_key)}
            if "warning" in tf_cfg:
                opt["warning"] = tf_cfg["warning"]
            if "suitable_for" in tf_cfg:
                opt["suitable_for"] = tf_cfg["suitable_for"]
            options.append(opt)

        # Garantir que "none" / manter texto esteja sempre disponível
        if not any(o["key"] == "none" for o in options):
            options.append({"key": "none", "label": "Manter como está (sem transformação)"})

        return {
            "column": column_name,
            "domain": domain_key,
            "source": "dictionary",
            "confidence": confidence,
            "confidence_score": round(score, 3),
            "suggested_transformation": default_tf,
            "transformation_options": options,
            "rationale": domain_cfg.get("rationale", ""),
            "reference": domain_cfg.get("reference", ""),
            "thresholds": domain_cfg.get("thresholds"),
            "warning": (
                f"Confiança média ({round(score*100)}%) — verifique se a detecção está correta."
                if confidence == "medium" else None
            )
        }

    # Domínio não reconhecido por dicionário
    return {
        "column": column_name,
        "domain": None,
        "source": "unknown",
        "confidence": "low",
        "confidence_score": round(score, 3),
        "suggested_transformation": "none",
        "transformation_options": [{"key": "none", "label": "Manter como está"}],
        "rationale": "Domínio não reconhecido. Será enviado para análise por IA.",
        "reference": None,
        "thresholds": None,
        "warning": "Domínio desconhecido. A IA tentará inferir — revisão manual recomendada."
    }


def resolve_all_columns(df: pd.DataFrame, dictionaries: dict) -> list[dict]:
    """
    Aplica resolve_column para todas as colunas do DataFrame.
    Retorna apenas colunas que precisam de atenção (domínio detectado ou incerto).
    """
    resolutions = []
    for col in df.columns:
        samples = _get_sample_values(df[col])
        result = resolve_column(col, samples, dictionaries)

        # Incluir apenas colunas que precisam de ação
        needs_attention = (
            result["domain"] is not None  # domínio especialista detectado
            or result["confidence"] == "low"  # ou incerto (para IA revisar)
        )

        if needs_attention:
            result["sample_values"] = samples[:5]  # mostrar amostras no frontend
            resolutions.append(result)

    return resolutions


# ============================================================
# Aplicação de transformações
# ============================================================

def _snellen_to_logmar(value: str) -> float | None:
    """Converte fração Snellen (ex: '20/40') para LogMAR."""
    try:
        parts = str(value).strip().split("/")
        if len(parts) != 2:
            return None
        num, den = float(parts[0]), float(parts[1])
        if num <= 0 or den <= 0:
            return None
        return round(math.log10(den / num), 4)
    except (ValueError, ZeroDivisionError, AttributeError):
        return None


def _snellen_to_decimal(value: str) -> float | None:
    """Converte fração Snellen para decimal."""
    try:
        parts = str(value).strip().split("/")
        if len(parts) != 2:
            return None
        num, den = float(parts[0]), float(parts[1])
        if den <= 0:
            return None
        return round(num / den, 4)
    except (ValueError, ZeroDivisionError, AttributeError):
        return None


def _snellen_to_clinical_category(value: str, domain_cfg: dict) -> str | None:
    """Mapeia fração Snellen para categoria clínica."""
    try:
        mapping = domain_cfg["transformations"]["clinical_category"]["mapping"]
        return mapping.get(str(value).strip(), None)
    except (KeyError, TypeError):
        return None



def _time_to_days(value: str, conversion_factors: dict) -> float | None:
    """Converte valores de tempo com unidade textual para dias."""
    if not value:
        return None
    val = str(value).strip().lower()
    match = re.match(r"(\d+(?:\.\d+)?)\s*(\w+)", val)
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2)
    factor = conversion_factors.get(unit)
    if factor is None:
        return None
    return round(number * factor, 3)


def apply_transformation(
    series: pd.Series, domain_key: str, transformation: str, dictionaries: dict
) -> pd.Series:
    """
    Aplica a transformação escolhida a uma coluna.
    Retorna pd.Series transformada (pode ter NaN onde a conversão falhar).
    """
    domain_cfg = dictionaries.get(domain_key, {})

    if transformation == "none" or not transformation:
        return series
        
    tf_cfg = domain_cfg.get("transformations", {}).get(transformation, {})

    # ============================================================
    # 1. Processador Genérico de Categorias Baseadas em Cutoffs
    # ============================================================
    if tf_cfg.get("type") == "category_cutoffs":
        thresholds = tf_cfg.get("thresholds")
        labels = tf_cfg.get("labels")
        right_inclusive = tf_cfg.get("right_inclusive", False)

        if thresholds and labels and len(labels) == len(thresholds) + 1:
            bins = [-np.inf] + thresholds + [np.inf]
            numeric_series = pd.to_numeric(series, errors="coerce")
            
            # pd.cut mapeia contínuo -> categórico usando os bins do JSON
            categorized = pd.cut(
                numeric_series, 
                bins=bins, 
                labels=labels, 
                right=right_inclusive, 
                include_lowest=True
            )
            # Retornar como objeto (strings) e manter NaN
            return categorized.astype(object).where(categorized.notna(), None)
        else:
            logger.error(f"Configuração category_cutoffs inválida para {domain_key}")
            return series

    # ============================================================
    # 2. Regras personalizadas complexas
    # ============================================================
    if domain_key == "visual_acuity_snellen":
        if transformation == "logmar":
            return series.apply(_snellen_to_logmar)
        elif transformation == "decimal":
            return series.apply(_snellen_to_decimal)
        elif transformation == "clinical_category":
            return series.apply(lambda v: _snellen_to_clinical_category(v, domain_cfg))

    elif domain_key == "mixed_time_units":
        if transformation == "to_days":
            cf = domain_cfg.get("conversion_factors", {})
            return series.apply(lambda v: _time_to_days(str(v), cf))
        elif transformation == "to_months":
            cf = domain_cfg.get("conversion_factors", {})
            return series.apply(lambda v: (
                round(_time_to_days(str(v), cf) / 30.44, 3)
                if _time_to_days(str(v), cf) is not None else None
            ))

    elif domain_key == "viral_load_hiv" and transformation == "log10":
        return series.apply(_log10_transform)

    # Fallback: retornar série original sem transformação
    logger.warning(f"Transformação '{transformation}' não mapeada dinamicamente e sem handler custom. Retornando original.")
    return series


# ============================================================
# Geração de coluna derivada (melhor olho, IMC etc.)
# ============================================================

def build_best_eye_column(df: pd.DataFrame, right_col: str, left_col: str, domain_key: str, dictionaries: dict) -> pd.Series | None:
    """
    Para pares OD/OE em LogMAR: constrói a coluna 'melhor olho'
    como o mínimo entre OD e OE (menor LogMAR = melhor visão).
    """
    if domain_key != "visual_acuity_snellen":
        return None

    # Tentar converter ambas as colunas para LogMAR
    logmar_right = df[right_col].apply(_snellen_to_logmar)
    logmar_left = df[left_col].apply(_snellen_to_logmar)

    if logmar_right is None or logmar_left is None:
        return None

    combined = pd.DataFrame({"right": logmar_right, "left": logmar_left})
    best = combined.min(axis=1)
    best.name = "VA_melhor_olho_LogMAR"
    return best


# ============================================================
# Teste unitário mínimo (executar via: python domain_resolver.py)
# ============================================================

if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("domain_resolver.py — Teste Unitário")
    print("=" * 60)

    dicts = load_dictionaries()
    print(f"\n[OK] Dicionários carregados: {list(dicts.keys())}\n")

    # Teste 1: Acuidade visual Snellen
    samples_va = ["20/20", "20/30", "20/40", "20/60", "20/200"]
    result = resolve_column("OD", samples_va, dicts)
    assert result["domain"] == "visual_acuity_snellen", f"FAIL: esperado visual_acuity_snellen, obtido {result['domain']}"
    assert result["suggested_transformation"] == "logmar", f"FAIL: esperado logmar, obtido {result['suggested_transformation']}"
    assert result["source"] == "dictionary", f"FAIL: esperado dictionary, obtido {result['source']}"
    print("[OK] Teste 1 PASSOU: OD -> visual_acuity_snellen, logmar, dictionary")

    # Teste 2: Escala de dor
    samples_dor = ["5", "3", "8", "2", "7"]
    result_dor = resolve_column("Dor_pos", samples_dor, dicts)
    assert result_dor["domain"] == "pain_scale_vas_nrs", f"FAIL escala dor: {result_dor['domain']}"
    print("[OK] Teste 2 PASSOU: Dor_pos -> pain_scale_vas_nrs")

    # Teste 3: Transformação LogMAR
    series = pd.Series(["20/20", "20/40", "20/200", None])
    transformed = apply_transformation(series, "visual_acuity_snellen", "logmar", dicts)
    assert abs(transformed[0] - 0.0) < 0.001
    assert abs(transformed[1] - 0.301) < 0.01
    assert abs(transformed[2] - 1.0) < 0.001
    print("[OK] Teste 3 PASSOU: Transformação LogMAR correta")

    # Teste 4: Pressão intraocular
    samples_pio = ["14", "16", "22", "18", "25"]
    result_pio = resolve_column("PIO_OD", samples_pio, dicts)
    assert result_pio["domain"] == "intraocular_pressure", f"FAIL PIO: {result_pio['domain']}"
    print("[OK] Teste 4 PASSOU: PIO_OD -> intraocular_pressure")

    print("\n[OK] Todos os testes passaram com sucesso.\n")
