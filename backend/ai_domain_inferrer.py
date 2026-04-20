"""
ai_domain_inferrer.py — Camada de fallback de IA para domínios desconhecidos.

Usa library_assistant.py (GPT Assistant com File Search) quando disponível.
Fallback para GPT-4o-mini genérico se OPENAI_ASSISTANT_ID não estiver configurado.
"""

import json
import logging
import os

logger = logging.getLogger("ai_domain_inferrer")


def infer_domain(column_name: str, sample_values: list) -> dict:
    """
    Infere o domínio de uma coluna via IA.
    Usa o GPT Assistant com biblioteca de referências se configurado.
    Caso contrário, usa GPT-4o-mini genérico como fallback.
    """
    try:
        from library_assistant import infer_domain_with_library
        result = infer_domain_with_library(column_name, sample_values)
        return result
    except ImportError:
        logger.warning("library_assistant.py não encontrado. Usando GPT genérico.")
        return infer_domain_generic(column_name, sample_values)
    except Exception as e:
        logger.error(f"Erro em library_assistant: {e}. Usando GPT genérico.")
        return infer_domain_generic(column_name, sample_values)


def infer_domain_generic(column_name: str, sample_values: list) -> dict:
    """
    Fallback: GPT-4o-mini genérico sem base bibliográfica.
    """
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    prompt = f"""Você é um especialista em análise de dados científicos.
Analise a coluna abaixo e responda APENAS com JSON válido, sem texto extra.

Coluna: "{column_name}"
Valores de amostra: {sample_values}

Responda no formato:
{{
  "domain_description": "descrição em português do que essa coluna provavelmente representa",
  "data_type": "contínua | categórica | ordinal | binária | temporal | outro",
  "needs_transformation": true | false,
  "suggested_transformation": "descrição da transformação sugerida ou null",
  "confidence": "high | medium | low",
  "reasoning": "explicação curta do raciocínio",
  "warning": "aviso importante se houver, ou null",
  "reference": null
}}

IMPORTANTE: Se não tiver certeza, use confidence: "low" e seja honesto no warning.
Nunca invente transformações sem base."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400,
        )
        raw = response.choices[0].message.content
        clean = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        result["source"] = "ai_generic"
        return result
    except Exception as e:
        logger.error(f"Erro na chamada GPT genérica: {e}")
        return {
            "source": "unknown",
            "confidence": "low",
            "domain_description": None,
            "data_type": "outro",
            "needs_transformation": False,
            "suggested_transformation": None,
            "reasoning": None,
            "warning": f"Falha na chamada IA: {str(e)[:120]}. Revisão manual recomendada.",
            "reference": None
        }
