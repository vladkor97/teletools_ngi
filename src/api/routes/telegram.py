"""
Отправка сообщений в Telegram через Bot API.
Фоновый polling обрабатывает /start, кэширует username → chat_id.
"""
import os
import json
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

router = APIRouter()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
CACHE_FILE = Path("data/telegram_users.json")

# Текст приветствия при /start
START_MESSAGE = (
    "Привет! Я бот <b>TeleTools</b>.\n\n"
    "Теперь я могу отправлять тебе отформатированные посты "
    "прямо из веб-редактора — с <b>жирным</b>, <i>курсивом</i> "
    'и <a href="https://example.com">кликабельными ссылками</a>.\n\n'
    "Твой аккаунт подключён. Укажи свой @username в редакторе и жми "
    '«Отправить в Telegram».'
)


# --- Кэш username → chat_id ---

def _load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_cache(cache: dict):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def _cache_user(username: str, chat_id: int):
    """Сохраняет маппинг username → chat_id."""
    cache = _load_cache()
    cache[username.lower()] = chat_id
    _save_cache(cache)


async def _resolve_chat_id(username: str) -> int | None:
    """Резолвит @username → chat_id из кэша."""
    clean = username.lstrip("@").lower()
    cache = _load_cache()
    return cache.get(clean)


# --- Фоновый polling: обрабатывает /start и кэширует пользователей ---

async def _poll_updates():
    """Лёгкий long-polling — обрабатывает входящие сообщения бота."""
    if not BOT_TOKEN or BOT_TOKEN == "your_bot_token_here":
        log.warning("TELEGRAM_BOT_TOKEN не настроен — polling отключён")
        return

    offset = 0
    log.info("Telegram bot polling запущен")

    async with httpx.AsyncClient(timeout=35) as client:
        while True:
            try:
                resp = await client.get(
                    f"{TELEGRAM_API}/getUpdates",
                    params={"offset": offset, "timeout": 25},
                )
                data = resp.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue

                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message")
                    if not msg:
                        continue

                    user = msg.get("from", {})
                    uname = user.get("username", "")
                    chat_id = msg["chat"]["id"]
                    text = (msg.get("text") or "").strip()

                    # Кэшируем любого пользователя, написавшего боту
                    if uname:
                        _cache_user(uname, chat_id)

                    # Отвечаем на /start
                    if text == "/start":
                        await client.post(
                            f"{TELEGRAM_API}/sendMessage",
                            json={
                                "chat_id": chat_id,
                                "text": START_MESSAGE,
                                "parse_mode": "HTML",
                                "disable_web_page_preview": True,
                            },
                        )
                        log.info(f"Пользователь @{uname} подключён (chat_id={chat_id})")

            except httpx.TimeoutException:
                continue
            except Exception as e:
                log.error(f"Polling error: {e}")
                await asyncio.sleep(5)


# Фоновая задача — запускается из main.py через lifespan
_polling_task: asyncio.Task | None = None


def start_polling():
    """Запускает polling как фоновую задачу."""
    global _polling_task
    _polling_task = asyncio.create_task(_poll_updates())


def stop_polling():
    """Останавливает polling."""
    global _polling_task
    if _polling_task:
        _polling_task.cancel()
        _polling_task = None


# --- Модели ---

class SendRequest(BaseModel):
    username: str
    html: str


class SendResponse(BaseModel):
    ok: bool
    message_id: int | None = None
    error: str | None = None


# --- Эндпоинты ---

@router.post("/send-telegram", response_model=SendResponse)
async def send_to_telegram(request: SendRequest):
    """Отправляет HTML-сообщение пользователю в Telegram через Bot API."""
    if not BOT_TOKEN or BOT_TOKEN == "your_bot_token_here":
        raise HTTPException(
            status_code=400,
            detail="TELEGRAM_BOT_TOKEN не настроен. Добавьте токен бота в .env",
        )

    if not request.username or not request.html:
        raise HTTPException(status_code=400, detail="username и html обязательны")

    chat_id = await _resolve_chat_id(request.username)
    if not chat_id:
        return SendResponse(
            ok=False,
            error=f"Пользователь @{request.username.lstrip('@')} не найден. "
                  f"Напишите боту /start и попробуйте снова.",
        )

    MAX_LENGTH = 4096
    
    # Simple splitting strategy:
    # 1. If message < MAX_LENGTH, send as is.
    # 2. If longer, split by newlines to respect paragraph boundaries where possible.
    
    if len(request.html) <= MAX_LENGTH:
        messages = [request.html]
    else:
        messages = []
        current_chunk = ""
        
        # Split by <br> or \n to try and keep HTML structure intact
        # This is a basic implementation. Ideally, one would use an HTML-aware splitter.
        parts = request.html.split('\n')
        
        for part in parts:
            if len(current_chunk) + len(part) + 1 < MAX_LENGTH:
                current_chunk += part + "\n"
            else:
                if current_chunk:
                    messages.append(current_chunk)
                current_chunk = part + "\n"
                
                # If a single part is extremely long (longer than limit), we must hard split it
                while len(current_chunk) > MAX_LENGTH:
                    messages.append(current_chunk[:MAX_LENGTH])
                    current_chunk = current_chunk[MAX_LENGTH:]
        
        if current_chunk:
            messages.append(current_chunk)

    async with httpx.AsyncClient(timeout=30) as client:
        last_msg_id = None
        for chunk in messages:
            if not chunk.strip(): continue
            try:
                resp = await client.post(
                    f"{TELEGRAM_API}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": chunk,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True,
                    },
                )
                data = resp.json()
                if not data.get("ok"):
                    # If HTML parsing fails (e.g. broken tag across chunks), try sending as plain text?
                    # Or just return error. For now, return error to let user know.
                    return SendResponse(ok=False, error=f"Chunk error: {data.get('description')}")
                
                last_msg_id = data.get("result", {}).get("message_id")
                # Small delay to ensure order and avoid rate limits
                await asyncio.sleep(0.3)
                
            except Exception as e:
                return SendResponse(ok=False, error=str(e))

        return SendResponse(ok=True, message_id=last_msg_id)
