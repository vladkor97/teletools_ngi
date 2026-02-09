"""
AI-поиск по постам канала через Gemini API.
Пользователь задаёт вопрос — модель находит релевантные посты.
"""
import os
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

DATA_DIR = Path("data")

SYSTEM_PROMPT = """Ты — ассистент, который помогает находить релевантный контент из Telegram-канала.

Тебе предоставлен JSON с постами канала. Каждый пост: {id, url, text, date}.

Правила:
1. Отвечай ТОЛЬКО готовым постом — без вступлений, пояснений и комментариев.
2. Формат ответа — Markdown.
3. Каждый пост оформляй с гиперссылкой: [Краткое описание](url)
4. Группируй по темам с заголовками **Тема**.
5. Добавь краткое описание (1-2 предложения) перед каждой ссылкой.
6. Используй ТОЛЬКО посты из предоставленных данных. Не придумывай ссылки.
7. Если точного совпадения нет — предложи ближайшие по смыслу.

Пример формата:

**Инструменты для кодинга**

1. **Cursor:** Мощный AI-редактор кода, но уже не тот, что раньше.
    * [Раньше было лучше: Cursor испортился](https://t.me/channel/422)
2. **Bolt:** Фаворит для быстрого создания сайтов и прототипов.
    * [Как я попробовал почти все AI-инструменты для кода](https://t.me/channel/129)"""


DEFAULT_MODEL = "gemini-2.0-flash"


class SearchRequest(BaseModel):
    question: str
    posts_json: str  # Содержимое posts.json как строка
    model: str = DEFAULT_MODEL


class SearchResponse(BaseModel):
    ok: bool
    markdown: str = ""
    error: str = ""


class ChannelsResponse(BaseModel):
    channels: list[str]


class ModelsResponse(BaseModel):
    ok: bool
    models: list[dict] = []  # [{id, name}]
    error: str = ""


@router.get("/gemini-models", response_model=ModelsResponse)
async def list_gemini_models():
    """Получаем список моделей Gemini, поддерживающих generateContent."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return ModelsResponse(ok=False, error="GOOGLE_API_KEY не настроен в .env")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            )
        data = resp.json()
        if "error" in data:
            return ModelsResponse(ok=False, error=data["error"].get("message", ""))

        models = []
        # Исключаем модели не для текстовых задач
        skip_keywords = {"tts", "image-generation", "gemma", "embedding", "aqa", "vision",
                         "robotics", "computer-use", "nano-banana", "-image"}
        for m in data.get("models", []):
            methods = m.get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                continue
            model_id = m.get("name", "").replace("models/", "")
            # Пропускаем нерелевантные модели
            if any(kw in model_id.lower() for kw in skip_keywords):
                continue
            display = m.get("displayName", model_id)
            models.append({"id": model_id, "name": display})

        return ModelsResponse(ok=True, models=models)
    except Exception as e:
        return ModelsResponse(ok=False, error=str(e))


@router.get("/channels", response_model=ChannelsResponse)
async def list_channels():
    """Список доступных распарсенных каналов."""
    channels = []
    if DATA_DIR.exists():
        if (DATA_DIR / "posts.json").exists():
            channels.append("default")
        for f in sorted(DATA_DIR.glob("posts_*.json")):
            # posts_NGI_ru.json → NGI_ru
            name = f.stem.replace("posts_", "")
            if name:
                channels.append(name)
    return ChannelsResponse(channels=channels)


@router.get("/channel-posts/{channel_name}")
async def get_channel_posts(channel_name: str):
    """Возвращает содержимое posts.json для канала."""
    # Очищаем от опасных символов
    import re
    safe = re.sub(r"[^\w\-]", "_", channel_name)
    path = DATA_DIR / f"posts_{safe}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/ai-search", response_model=SearchResponse)
async def ai_search(request: SearchRequest):
    """Поиск по постам через Gemini API."""
    # API ключ из .env
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return SearchResponse(
            ok=False,
            error="GOOGLE_API_KEY не настроен в .env",
        )

    if not request.question:
        return SearchResponse(ok=False, error="Введите вопрос")

    if not request.posts_json:
        return SearchResponse(ok=False, error="Нет данных постов")

    # Формируем запрос к Gemini
    user_message = f"Вот данные постов канала:\n\n{request.posts_json}\n\nЗапрос пользователя: {request.question}"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            model = request.model or DEFAULT_MODEL
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={
                    "systemInstruction": {
                        "parts": [{"text": SYSTEM_PROMPT}]
                    },
                    "contents": [
                        {"role": "user", "parts": [{"text": user_message}]}
                    ],
                    "generationConfig": {
                        "temperature": 0,
                    },
                },
            )

        data = resp.json()

        if "error" in data:
            return SearchResponse(ok=False, error=data["error"].get("message", str(data["error"])))

        # Извлекаем текст ответа
        candidates = data.get("candidates", [])
        if not candidates:
            return SearchResponse(ok=False, error="Модель не вернула ответ")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)

        return SearchResponse(ok=True, markdown=text)

    except httpx.TimeoutException:
        return SearchResponse(ok=False, error="Timeout — попробуйте ещё раз")
    except Exception as e:
        return SearchResponse(ok=False, error=str(e))
