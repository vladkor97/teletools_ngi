"""
API-роутер для саммари звонков/транскриптов.
Формирование промпта и генерация через Gemini.
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel
import httpx

router = APIRouter()
DEFAULT_MODEL = "gemini-2.0-flash"

SUMMARY_SYSTEM_PROMPT = """Ты — профессиональный ассистент, который создаёт структурированные саммари звонков и встреч.

Тебе предоставлен транскрипт звонка/встречи. Создай краткое, полезное резюме.

Формат резюме:
1. **📋 Общая информация** — тема встречи, контекст (1-2 предложения)
2. **👥 Участники** — если удаётся определить из транскрипта (имена, роли)
3. **🎯 Ключевые темы** — основные обсуждаемые вопросы (нумерованный список)
4. **✅ Решения и договорённости** — что решили, к чему пришли
5. **📌 Action Items** — конкретные задачи с ответственными (если определяются)
6. **💡 Важные инсайты** — ключевые цитаты или мысли, которые стоит зафиксировать

Правила:
- Пиши на том же языке, на котором ведётся разговор
- Будь конкретным — избегай общих фраз
- Если транскрипт нечёткий (артефакты распознавания) — интерпретируй по смыслу
- Выделяй самое важное, не пересказывай всё подряд
- Формат: Markdown"""


class SummaryPromptRequest(BaseModel):
    transcript: str
    custom_instruction: str = ""


class SummaryGenerateRequest(SummaryPromptRequest):
    model: str = DEFAULT_MODEL
    temperature: float = 0.3


class PromptResponse(BaseModel):
    ok: bool
    prompt: str = ""
    error: str = ""


class GenerateResponse(BaseModel):
    ok: bool
    content: str = ""
    error: str = ""


def _build_summary_prompt(transcript: str, custom_instruction: str) -> str:
    """Собирает промпт для генерации саммари."""
    parts = [SUMMARY_SYSTEM_PROMPT]

    if custom_instruction:
        parts.append(f"\nДополнительные инструкции:\n{custom_instruction}")

    parts.append(f"\n\n--- ТРАНСКРИПТ ЗВОНКА ---\n\n{transcript}")

    return "\n".join(parts)


@router.post("/summary/prompt", response_model=PromptResponse)
async def build_summary_prompt(request: SummaryPromptRequest):
    """Формирует готовый промпт для копирования в AI Studio."""
    if not request.transcript.strip():
        return PromptResponse(ok=False, error="Транскрипт не может быть пустым")

    prompt = _build_summary_prompt(request.transcript, request.custom_instruction)
    return PromptResponse(ok=True, prompt=prompt)


@router.post("/summary/generate", response_model=GenerateResponse)
async def generate_summary(request: SummaryGenerateRequest):
    """Генерирует саммари через Gemini API."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return GenerateResponse(ok=False, error="GOOGLE_API_KEY не настроен")

    if not request.transcript.strip():
        return GenerateResponse(ok=False, error="Транскрипт не может быть пустым")

    prompt = _build_summary_prompt(request.transcript, request.custom_instruction)

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent?key={api_key}",
                json={
                    "contents": [
                        {"role": "user", "parts": [{"text": prompt}]}
                    ],
                    "generationConfig": {
                        "temperature": request.temperature,
                    },
                },
            )

        data = resp.json()

        if "error" in data:
            return GenerateResponse(
                ok=False, error=data["error"].get("message", str(data["error"]))
            )

        candidates = data.get("candidates", [])
        if not candidates:
            return GenerateResponse(ok=False, error="Модель не вернула ответ")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)

        return GenerateResponse(ok=True, content=text)

    except Exception as e:
        return GenerateResponse(ok=False, error=str(e))
