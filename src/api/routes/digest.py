"""
API-роутер для генерации дайджестов.
Фильтрация постов по дате, автопоиск прошлого дайджеста,
формирование промпта для AI Studio, генерация через Gemini.
"""
import os
import re
import json
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx

from src.etl.date_utils import filter_posts_by_date, parse_telegram_date

router = APIRouter()
DATA_DIR = Path("data")
DEFAULT_MODEL = "gemini-2.0-flash"

# Системный промпт для генерации дайджестов
DIGEST_SYSTEM_PROMPT = """Ты — опытный редактор Telegram-канала. Твоя задача — создать дайджест постов за указанный период.

Правила оформления дайджеста:
1. Заголовок: эмодзи + название канала + "дайджест №{номер}"
2. Краткое вступление (1-2 предложения) — что было за этот период
3. Нумерованный список постов. Каждый пункт:
   - Название-гиперссылка на оригинальный пост (формат Markdown: [Название](url))
   - Краткое описание поста (1-3 предложения), передающее суть
4. В конце — ссылка на прошлый дайджест в формате: "Прошлый дайджест [тут](url)"
5. Стиль: живой, разговорный, с эмодзи где уместно. Не сухой, не формальный.
6. Пиши на русском языке.
7. НЕ придумывай посты — используй ТОЛЬКО предоставленные данные.
8. Если пост пустой (нет текста) — пропусти его.

Пример формата:
🚀 Канал дайджест №5

Неделя выдалась насыщенной! Разбирал новые инструменты и делился опытом. Вот главное:

1. [Как выбрать AI-инструмент для работы](https://t.me/channel/123) - подробный разбор критериев выбора между ChatGPT, Gemini и Claude для разных задач.

2. [Новая модель от Google](https://t.me/channel/124) - первые впечатления от Gemini 2.0 Flash: скорость, качество и контекстное окно.

Прошлый дайджест [тут](https://t.me/channel/100)"""


# --- Модели запросов/ответов ---

class DigestPostsRequest(BaseModel):
    channel_name: str
    date_from: str  # YYYY-MM-DD
    date_to: str    # YYYY-MM-DD


class DigestPromptRequest(BaseModel):
    channel_name: str
    date_from: str
    date_to: str
    prev_digest_link: str = ""
    digest_number: Optional[int] = None
    custom_instruction: str = ""
    excluded_post_ids: List[int] = []


class DigestGenerateRequest(DigestPromptRequest):
    model: str = DEFAULT_MODEL
    temperature: float = 0.7


class DigestPostsResponse(BaseModel):
    posts: list
    total: int


class FindPreviousResponse(BaseModel):
    found: bool
    post_id: Optional[int] = None
    post_url: Optional[str] = None
    digest_number: Optional[int] = None
    prev_link: Optional[str] = None


class PromptResponse(BaseModel):
    ok: bool
    prompt: str = ""
    post_count: int = 0
    error: str = ""


class GenerateResponse(BaseModel):
    ok: bool
    content: str = ""
    post_count: int = 0
    error: str = ""


# --- Вспомогательные функции ---

def _load_posts(channel_name: str) -> list:
    """Загружает посты канала из JSON-файла."""
    safe_name = "".join(c for c in channel_name if c.isalnum() or c in ("_", "-"))
    file_path = DATA_DIR / f"posts_{safe_name}.json"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Канал '{channel_name}' не найден")

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _find_digest_post(posts: list) -> dict | None:
    """
    Находит последний пост-дайджест в списке постов.
    Ищет по паттерну "дайджест №" в тексте.
    """
    digest_posts = []
    for post in posts:
        text = post.get("text", "")
        if re.search(r"дайджест\s*[#№]\s*\d+", text, re.IGNORECASE):
            digest_posts.append(post)

    if not digest_posts:
        return None

    # Сортируем по id (больший id = более свежий пост)
    digest_posts.sort(key=lambda p: p.get("id", 0), reverse=True)
    return digest_posts[0]


def _extract_digest_number(text: str) -> int | None:
    """Извлекает номер дайджеста из текста."""
    match = re.search(r"дайджест\s*[#№]\s*(\d+)", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _extract_prev_digest_link(text: str) -> str | None:
    """Извлекает ссылку на прошлый дайджест из текста поста."""
    # Ищем паттерн "Прошлый дайджест" рядом с ссылкой t.me/...
    match = re.search(r"(?:прошлый|предыдущий)\s+дайджест.*?(https?://t\.me/\S+)", text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip(")")

    # Фоллбек: последняя ссылка t.me в тексте
    links = re.findall(r"https?://t\.me/\S+", text)
    if links:
        return links[-1].rstrip(")")

    return None


def _build_prompt(posts: list, prev_digest_link: str, digest_number: int | None, custom_instruction: str) -> str:
    """Собирает полный промпт для генерации дайджеста."""
    posts_text = "\n\n".join([
        f"--- Пост ID {p['id']} ({p['date']}) ---\n"
        f"URL: {p['url']}\n"
        f"Текст: {p['text']}\n"
        f"Реакции: {p.get('reactions', 0)}"
        for p in posts if p.get("text", "").strip()
    ])

    parts = [DIGEST_SYSTEM_PROMPT]

    if custom_instruction:
        parts.append(f"\nДополнительные инструкции автора:\n{custom_instruction}")

    parts.append(f"\n\n--- ПОСТЫ ЗА ПЕРИОД ({len(posts)} шт.) ---\n\n{posts_text}")

    if prev_digest_link:
        parts.append(f"\nСсылка на прошлый дайджест: {prev_digest_link}")

    if digest_number is not None:
        parts.append(f"\nНомер этого дайджеста: {digest_number + 1}")

    return "\n".join(parts)


# --- Эндпоинты ---

@router.post("/digest/posts", response_model=DigestPostsResponse)
async def get_digest_posts(request: DigestPostsRequest):
    """Возвращает посты канала за указанный период."""
    all_posts = _load_posts(request.channel_name)
    filtered = filter_posts_by_date(all_posts, request.date_from, request.date_to)
    # Сортируем по id (хронологический порядок)
    filtered.sort(key=lambda p: p.get("id", 0))

    return DigestPostsResponse(posts=filtered, total=len(filtered))


@router.get("/digest/find-previous")
async def find_previous_digest(
    channel_name: str = Query(..., description="Имя канала"),
) -> FindPreviousResponse:
    """Автопоиск последнего дайджеста и ссылки на предыдущий."""
    all_posts = _load_posts(channel_name)
    digest_post = _find_digest_post(all_posts)

    if not digest_post:
        return FindPreviousResponse(found=False)

    text = digest_post.get("text", "")
    digest_number = _extract_digest_number(text)
    prev_link = _extract_prev_digest_link(text)

    return FindPreviousResponse(
        found=True,
        post_id=digest_post.get("id"),
        post_url=digest_post.get("url"),
        digest_number=digest_number,
        prev_link=prev_link,
    )


@router.post("/digest/prompt", response_model=PromptResponse)
async def build_digest_prompt(request: DigestPromptRequest):
    """Формирует готовый промпт для копирования в AI Studio."""
    all_posts = _load_posts(request.channel_name)
    filtered = filter_posts_by_date(all_posts, request.date_from, request.date_to)

    # Исключаем посты, которые пользователь убрал
    if request.excluded_post_ids:
        filtered = [p for p in filtered if p["id"] not in request.excluded_post_ids]

    # Сортируем хронологически
    filtered.sort(key=lambda p: p.get("id", 0))

    if not filtered:
        return PromptResponse(ok=False, error="Нет постов за указанный период")

    prompt = _build_prompt(
        posts=filtered,
        prev_digest_link=request.prev_digest_link,
        digest_number=request.digest_number,
        custom_instruction=request.custom_instruction,
    )

    return PromptResponse(ok=True, prompt=prompt, post_count=len(filtered))


@router.post("/digest/generate", response_model=GenerateResponse)
async def generate_digest(request: DigestGenerateRequest):
    """Генерирует дайджест через Gemini API."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return GenerateResponse(ok=False, error="GOOGLE_API_KEY не настроен")

    all_posts = _load_posts(request.channel_name)
    filtered = filter_posts_by_date(all_posts, request.date_from, request.date_to)

    if request.excluded_post_ids:
        filtered = [p for p in filtered if p["id"] not in request.excluded_post_ids]

    filtered.sort(key=lambda p: p.get("id", 0))

    if not filtered:
        return GenerateResponse(ok=False, error="Нет постов за указанный период")

    prompt = _build_prompt(
        posts=filtered,
        prev_digest_link=request.prev_digest_link,
        digest_number=request.digest_number,
        custom_instruction=request.custom_instruction,
    )

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

        return GenerateResponse(ok=True, content=text, post_count=len(filtered))

    except Exception as e:
        return GenerateResponse(ok=False, error=str(e))
