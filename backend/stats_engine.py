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

# Singleton-instance for export
engine = PremiumStatsEngine(theme='dark')
