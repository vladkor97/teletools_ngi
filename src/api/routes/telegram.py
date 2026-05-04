"""
Отправка сообщений в Telegram через Bot API.
Фоновый polling обрабатывает /start, кэширует username → chat_id.
Автоподхват постов канала — если бот добавлен админом,
ловит channel_post и сохраняет в posts_{channel}.json.
"""
import os
import re
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)
log.setLevel(logging.INFO)
if not log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    log.addHandler(_h)

router = APIRouter()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
CACHE_FILE = Path("data/telegram_users.json")
DATA_DIR = Path("data")

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


# --- Автоподхват постов канала ---

def _extract_stats(msg: dict) -> dict:
    """Извлекает статистику из объекта channel_post / edited_channel_post."""
    views = msg.get("views", 0) or 0
    forwards = msg.get("forward_count", 0) or 0

    # Реакции: reactions.results[] — массив {type, total_count}
    reactions_count = 0
    reactions_obj = msg.get("reactions", {})
    for r in reactions_obj.get("results", []):
        reactions_count += r.get("total_count", 0)

    return {"views": views, "forwards": forwards, "reactions": reactions_count}


def _get_posts_file(channel_username: str) -> Path:
    """Возвращает путь к JSON-файлу постов канала."""
    safe_name = re.sub(r"[^\w\-]", "_", channel_username)
    return DATA_DIR / f"posts_{safe_name}.json"


def _load_posts_file(posts_file: Path) -> list:
    """Загружает посты из JSON или возвращает пустой список."""
    if not posts_file.exists():
        return []
    try:
        with open(posts_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, Exception):
        return []


def _save_posts_file(posts_file: Path, posts: list):
    """Сохраняет список постов в JSON."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(posts_file, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


def _save_channel_post(channel_post: dict):
    """Сохраняет новый пост канала в posts_{channel}.json."""
    chat = channel_post.get("chat", {})
    channel_username = chat.get("username", "")
    if not channel_username:
        return

    posts_file = _get_posts_file(channel_username)
    msg_id = channel_post.get("message_id", 0)
    text = channel_post.get("text", "")
    date_ts = channel_post.get("date", 0)

    # Форматируем дату как в экспорте Telegram Desktop
    date_str = ""
    if date_ts:
        dt = datetime.fromtimestamp(date_ts, tz=timezone.utc)
        date_str = dt.strftime("%d.%m.%Y %H:%M:%S UTC+00:00")

    stats = _extract_stats(channel_post)
    url = f"https://t.me/{channel_username}/{msg_id}"

    new_post = {
        "id": msg_id,
        "url": url,
        "text": text,
        "date": date_str,
        "reactions": stats["reactions"],
        "views": stats["views"],
        "forwards": stats["forwards"],
    }

    existing_posts = _load_posts_file(posts_file)

    # Не дублируем — проверяем по id
    existing_ids = {p.get("id") for p in existing_posts}
    if msg_id in existing_ids:
        return

    existing_posts.append(new_post)
    _save_posts_file(posts_file, existing_posts)
    log.info(f"Сохранён пост @{channel_username}/{msg_id} "
             f"(👁 {stats['views']}, ↗ {stats['forwards']}, ❤ {stats['reactions']})")


def _update_channel_post_stats(edited_post: dict):
    """Обновляет статистику существующего поста (при edited_channel_post)."""
    chat = edited_post.get("chat", {})
    channel_username = chat.get("username", "")
    if not channel_username:
        return

    posts_file = _get_posts_file(channel_username)
    posts = _load_posts_file(posts_file)
    if not posts:
        return

    msg_id = edited_post.get("message_id", 0)
    stats = _extract_stats(edited_post)
    updated_text = edited_post.get("text")

    for post in posts:
        if post.get("id") == msg_id:
            post["views"] = stats["views"]
            post["forwards"] = stats["forwards"]
            post["reactions"] = stats["reactions"]
            # Обновляем текст, если он изменился
            if updated_text is not None:
                post["text"] = updated_text
            _save_posts_file(posts_file, posts)
            log.info(f"Обновлён пост @{channel_username}/{msg_id} "
                     f"(👁 {stats['views']}, ↗ {stats['forwards']}, ❤ {stats['reactions']})")
            return


def _update_reaction_count(update: dict):
    """Обновляет реакции по message_reaction_count update."""
    chat = update.get("chat", {})
    channel_username = chat.get("username", "")
    if not channel_username:
        return

    posts_file = _get_posts_file(channel_username)
    posts = _load_posts_file(posts_file)
    if not posts:
        return

    msg_id = update.get("message_id", 0)
    total_reactions = 0
    for r in update.get("reactions", []):
        total_reactions += r.get("total_count", 0)

    for post in posts:
        if post.get("id") == msg_id:
            post["reactions"] = total_reactions
            _save_posts_file(posts_file, posts)
            log.info(f"Реакции @{channel_username}/{msg_id} обновлены: ❤ {total_reactions}")
            return


# --- Фоновый polling: обрабатывает /start, кэширует пользователей, ловит посты каналов ---

async def _poll_updates():
    """Лёгкий long-polling — обрабатывает входящие сообщения бота и посты каналов."""
    if not BOT_TOKEN or BOT_TOKEN == "your_bot_token_here":
        log.warning("TELEGRAM_BOT_TOKEN не настроен — polling отключён")
        return

    offset = 0
    log.info("Telegram bot polling запущен")

    # Разрешаем получать все нужные типы обновлений
    async with httpx.AsyncClient(timeout=35) as client:
        while True:
            try:
                resp = await client.get(
                    f"{TELEGRAM_API}/getUpdates",
                    params={
                        "offset": offset,
                        "timeout": 25,
                        "allowed_updates": json.dumps([
                            "message",
                            "channel_post",
                            "edited_channel_post",
                            "message_reaction_count",
                        ]),
                    },
                )
                data = resp.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue

                for update in data.get("result", []):
                    offset = update["update_id"] + 1

                    # Новый пост канала → сохраняем
                    channel_post = update.get("channel_post")
                    if channel_post:
                        try:
                            _save_channel_post(channel_post)
                        except Exception as e:
                            log.error(f"Ошибка сохранения поста канала: {e}")
                        continue

                    # Отредактированный пост канала → обновляем статистику
                    edited = update.get("edited_channel_post")
                    if edited:
                        try:
                            _update_channel_post_stats(edited)
                        except Exception as e:
                            log.error(f"Ошибка обновления статистики: {e}")
                        continue

                    # Изменение реакций → обновляем счётчик
                    reaction_count = update.get("message_reaction_count")
                    if reaction_count:
                        try:
                            _update_reaction_count(reaction_count)
                        except Exception as e:
                            log.error(f"Ошибка обновления реакций: {e}")
                        continue

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


@router.get("/bot-status")
async def bot_status(channel: str = ""):
    """Проверяет статус бота: подключён, является ли админом канала, polling активен."""
    if not BOT_TOKEN or BOT_TOKEN == "your_bot_token_here":
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN не настроен", "polling": False, "is_admin": False}

    result = {"ok": True, "polling": _polling_task is not None and not _polling_task.done(), "is_admin": False, "bot_username": ""}

    async with httpx.AsyncClient(timeout=10) as client:
        # Получаем инфо о боте
        try:
            me_resp = await client.get(f"{TELEGRAM_API}/getMe")
            me_data = me_resp.json()
            if me_data.get("ok"):
                result["bot_username"] = me_data["result"].get("username", "")
        except Exception:
            pass

        # Проверяем, является ли бот админом канала
        if channel:
            safe_channel = channel.lstrip("@")
            try:
                resp = await client.get(
                    f"{TELEGRAM_API}/getChatMember",
                    params={"chat_id": f"@{safe_channel}", "user_id": me_data["result"]["id"]},
                )
                data = resp.json()
                if data.get("ok"):
                    status = data["result"].get("status", "")
                    result["is_admin"] = status in ("administrator", "creator")
                    result["member_status"] = status
                else:
                    result["member_status"] = data.get("description", "unknown")
            except Exception as e:
                result["member_status"] = str(e)

    return result


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
