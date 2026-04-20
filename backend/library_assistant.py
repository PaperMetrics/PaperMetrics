"""
library_assistant.py — GPT Assistant com File Search (RAG via OpenAI).

Substitui o GPT genérico quando OPENAI_ASSISTANT_ID estiver configurado no .env.
Permite inferência de domínios baseada em literatura científica real (PDFs dos livros).

SETUP MANUAL (feito uma única vez pelo programador):
1. Acesse: https://platform.openai.com/assistants
2. Crie um assistant com:
   - Name: "PaperMetrics Domain Expert"
   - Model: gpt-4o-mini
   - Tools: marcar "File Search"
3. Faça upload dos PDFs dos livros de referência
4. Copie o ASSISTANT_ID (asst_xxxx) e adicione ao backend/.env
"""

import os
import json
import logging

logger = logging.getLogger("library_assistant")


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
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    assistant_id = os.getenv("OPENAI_ASSISTANT_ID", "").strip()

    if not assistant_id:
        logger.info("OPENAI_ASSISTANT_ID não configurado. Usando GPT genérico como fallback.")
        from ai_domain_inferrer import infer_domain_generic
        result = infer_domain_generic(column_name, sample_values)
        if result.get("warning"):
            result["warning"] += " [AVISO: Biblioteca de referências não configurada. Configure OPENAI_ASSISTANT_ID no .env para respostas com embasamento bibliográfico.]"
        else:
            result["warning"] = "[AVISO: Biblioteca de referências não configurada. Configure OPENAI_ASSISTANT_ID no .env.]"
        return result

    user_message = f"""Analise a coluna abaixo e responda APENAS com JSON válido, sem texto extra.

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
e indique no warning que a inferência não tem respaldo bibliográfico."""

    try:
        thread = client.beta.threads.create()
        client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=user_message
        )
        run = client.beta.threads.runs.create_and_poll(
            thread_id=thread.id,
            assistant_id=assistant_id,
            additional_instructions=SYSTEM_PROMPT,
            timeout=30.0
        )

        if run.status == "completed":
            messages = client.beta.threads.messages.list(thread_id=thread.id)
            raw = messages.data[0].content[0].text.value
            # Limpar possíveis markdown fences
            clean = raw.replace("```json", "").replace("```", "").strip()
            result = json.loads(clean)
            result["source"] = "ai_library"
            return result
        else:
            return _error_response(f"Run status: {run.status}")

    except Exception as e:
        logger.error(f"Erro no library_assistant: {e}")
        return _error_response(str(e)[:200])


def _error_response(reason: str) -> dict:
    return {
        "source": "unknown",
        "confidence": "low",
        "domain_description": None,
        "data_type": "outro",
        "needs_transformation": False,
        "suggested_transformation": None,
        "reasoning": None,
        "warning": f"Falha ao consultar biblioteca: {reason}. Revisão manual recomendada.",
        "reference": None
    }
