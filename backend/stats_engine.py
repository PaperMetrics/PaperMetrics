"""
Stats Engine - Antigravity Pro Portfolio
Associated Skills: python-pro, matplotlib, systematic-debugging
"""

import io
import base64
from typing import Dict, List, Any, Optional, Tuple, Protocol
from dataclasses import dataclass, asdict
import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
import matplotlib.style as style
import seaborn as sns

# Constants for "Premium" Aesthetics (HSL-based or Sleek Harmony)
ACCENT_COLOR = '#6366f1'  # Indigo-500
BG_COLOR = '#0f172a'      # Slate-900 (Dark Mode)
GRID_COLOR = '#1e293b'    # Slate-800
TEXT_COLOR = '#f8fafc'    # Slate-50

class StatsProvider(Protocol):
    def calculate(self, data: pd.DataFrame) -> Dict[str, Any]:
        ...

@dataclass(frozen=True)
class StatisticalResult:
    test_name: str
    stat_value: float
    p_value: float
    interpretation: str
    ci_lower: Optional[float] = None
    ci_upper: Optional[float] = None
    effect_size: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class PremiumStatsEngine:
    """
    High-performance statistical analysis engine with high-fidelity visualization support.
    Follows 'python-pro' mastery patterns.
    """
    
    def __init__(self, theme: str = 'dark'):
        self.theme = theme
        self._set_style()

    def _set_style(self):
        """Applies premium design system tokens to Matplotlib/Seaborn."""
        if self.theme == 'dark':
            plt.style.use('dark_background')
            plt.rcParams.update({
                'axes.facecolor': BG_COLOR,
                'figure.facecolor': BG_COLOR,
                'axes.edgecolor': GRID_COLOR,
                'grid.color': GRID_COLOR,
                'axes.labelcolor': TEXT_COLOR,
                'xtick.color': TEXT_COLOR,
                'ytick.color': TEXT_COLOR,
                'text.color': TEXT_COLOR,
                'font.family': 'sans-serif',
                'font.sans-serif': ['Inter', 'Roboto', 'Arial']
            })
        sns.set_palette([ACCENT_COLOR, '#ec4899', '#8b5cf6', '#10b981'])

    def run_comprehensive_analysis(self, df: pd.DataFrame, target_col: str, group_col: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes a sequence of tests and generates visualizations.
        Returns a serializable dictionary.
        """
        results = {
            "descriptive": self._get_descriptive(df[target_col]),
            "tests": [],
            "chart": self._generate_distribution_chart(df, target_col, group_col)
        }

        # Auto-detect test based on groups
        if group_col and df[group_col].nunique() == 2:
            groups = [df[df[group_col] == val][target_col].dropna() for val in df[group_col].unique()]
            t_stat, p_val = stats.ttest_ind(*groups)
            results["tests"].append(StatisticalResult(
                test_name="Independent T-Test",
                stat_value=float(t_stat),
                p_value=float(p_val),
                interpretation="Statistically Significant" if p_val < 0.05 else "Not Significant"
            ).to_dict())

        return results

    def _get_descriptive(self, series: pd.Series) -> Dict[str, float]:
        return {
            "mean": float(series.mean()),
            "median": float(series.median()),
            "std": float(series.std()),
            "min": float(series.min()),
            "max": float(series.max())
        }

    def _generate_distribution_chart(self, df: pd.DataFrame, target_col: str, group_col: Optional[str] = None) -> str:
        """Generates a high-quality distribution plot and returns base64 string."""
        plt.figure(figsize=(10, 6))
        
        if group_col:
            sns.kdeplot(data=df, x=target_col, hue=group_col, fill=True, alpha=0.3, linewidth=2)
        else:
            sns.histplot(df[target_col], kde=True, color=ACCENT_COLOR, alpha=0.4, linewidth=0)
            
        plt.title(f'Distribution Analysis: {target_col}', fontsize=16, pad=20, fontweight='bold')
        plt.xlabel(target_col, labelpad=10)
        plt.ylabel('Density', labelpad=10)
        
        # Add glassmorphism-like grid
        plt.grid(True, linestyle='--', alpha=0.1)
        
        # Save to buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', transparent=False)
        plt.close()
        return base64.b64encode(buf.getvalue()).decode('utf-8')

def clean_dataframe(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Higieniza o DataFrame antes das análises estatísticas, transformando strings anômalas,
    infinitos e lidando com inconsistência na coluna gênero. Idempotente.
    """
    warnings = []
    df_clean = df.copy()
    df_clean.replace([np.inf, -np.inf], np.nan, inplace=True)
    
    # Padronização de Gênero explicitamente antes das conversões numéricas
    gender_cols = [c for c in df_clean.columns if str(c).lower().strip() in ("genero", "gênero", "sex", "sexo")]
    for col in gender_cols:
        if df_clean[col].dtype == 'object':
            df_clean[col] = df_clean[col].str.strip().str.upper()
            df_clean[col] = df_clean[col].replace({'MASCULINO': 'M', 'FEMININO': 'F', 'MASC': 'M', 'FEM': 'F'})
        
        df_clean = df_clean.dropna(subset=[col])
        unique_vals = df_clean[col].dropna().unique()
        if len(unique_vals) > 2:
            warnings.append(f"Atenção na coluna de gênero ('{col}'): encontrados mais de 2 valores únicos: {list(unique_vals)}")
            
    # Tentativa conservadora de conversão numérica generalizada
    for col in df_clean.columns:
        if df_clean[col].dtype == 'object' and col not in gender_cols:
            df_clean[col] = pd.to_numeric(df_clean[col].astype(str).str.strip().replace({'': np.nan, 'None': np.nan, 'NaN': np.nan}), errors='ignore')
            
    return df_clean, warnings

def choose_and_run_group_comparison(df: pd.DataFrame, outcome_col: str, group_col: str) -> dict:
    """
    Executa exclusivamente métodos não-paramétricos já que acuidade visual e a volumetria local
    possuem forte assimetria:
    - 2 grupos numéricos: Mann-Whitney U.
    - 3+ grupos numéricos: Kruskal-Wallis H.
    """
    groups_raw = {
        g: pd.to_numeric(df.loc[df[group_col] == g, outcome_col], errors='coerce').dropna().values
        for g in df[group_col].dropna().unique()
    }
    # Filtra NAN e grupos vazios/com n insuficiente
    groups = {k: v for k, v in groups_raw.items() if str(k).upper() != 'NAN'}
    
    if any(len(v) < 2 for v in groups.values()):
        return {"test": "N/A", "statistic": None, "p_value": None, "msg": "Grupo com n insuficiente após limpeza. Teste não executado.", "is_normal": False}

    group_arrays = list(groups.values())
    n_groups = len(group_arrays)
    
    if n_groups < 2:
        return {"test": "N/A", "statistic": None, "p_value": None, "msg": "Grupos insuficientes para comparação.", "is_normal": False}
        
    if n_groups == 2:
        stat, p_value = stats.mannwhitneyu(group_arrays[0].ravel(), group_arrays[1].ravel(), alternative='two-sided')
        test_name = "Mann-Whitney U"
    else:
        stat, p_value = stats.kruskal(*[g.ravel() for g in group_arrays])
        test_name = "Kruskal-Wallis"
            
    return {
        "test": test_name,
        "statistic": float(stat) if not pd.isna(stat) else None,
        "p_value": float(p_value) if not pd.isna(p_value) else None,
        "is_normal": False
    }

def calculate_power_and_required_n(effect_size: float, alpha=0.05, power=0.80) -> dict:
    """
    Kalkula power estatístico baseando-se em statsmodels.
    Grace fallback provido se não disponível.
    """
    try:
        from statsmodels.stats.power import TTestIndPower
        analysis = TTestIndPower()
        req_n = analysis.solve_power(effect_size=effect_size, power=power, alpha=alpha, ratio=1.0, alternative='two-sided')
        return {
            "power": float(power),
            "alpha": float(alpha),
            "required_n": int(np.ceil(req_n)) if not np.isnan(req_n) else None,
            "effect_size_used_for_calc": round(effect_size, 4) if effect_size else None
        }
    except Exception as e:
        return {"power": None, "required_n": None, "msg": f"Erro de cálculo com statsmodels: {str(e)}"}

# Singleton-instance for export
engine = PremiumStatsEngine(theme='dark')
