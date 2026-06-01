"""
Синхронизация статистики постов через Telethon (MTProto).
Позволяет получить views, forwards, reactions для ЛЮБЫХ постов канала,
включая старые, импортированные через HTML-экспорт.

Требует: TELEGRAM_API_ID и TELEGRAM_API_HASH в .env (https://my.telegram.org)
"""
import os
import json
import logging
import asyncio
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import timezone
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)
log.setLevel(logging.INFO)
if not log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    log.addHandler(_h)

router = APIRouter()
DATA_DIR = Path("data")

# Telethon credentials
API_ID = os.getenv("TELEGRAM_API_ID", "")
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# Глобальный клиент — переиспользуем между запросами
_client = None
_client_lock = asyncio.Lock()


async def _get_client():
    """Получает или создаёт Telethon-клиент с авторизацией через бот-токен."""
    global _client

    if not API_ID or not API_HASH or not BOT_TOKEN:
        return None

    async with _client_lock:
        if _client is not None and _client.is_connected():
            return _client

        try:
            from telethon import TelegramClient

            session_path = str(DATA_DIR / "bot_session")
            _client = TelegramClient(session_path, int(API_ID), API_HASH)
            await _client.start(bot_token=BOT_TOKEN)
            log.info("Telethon клиент подключён")
            return _client
        except Exception as e:
            log.error(f"Ошибка подключения Telethon: {e}")
            _client = None
            return None


class SyncRequest(BaseModel):
    channel_name: str


class SyncResponse(BaseModel):
    ok: bool
    updated: int = 0
    total: int = 0
    error: str = ""


@router.post("/sync/stats", response_model=SyncResponse)
async def sync_channel_stats(request: SyncRequest):
    """
    Подтягивает views/forwards/reactions для всех постов канала
    через Telethon (MTProto). Требует TELEGRAM_API_ID и TELEGRAM_API_HASH.
    """
    if not API_ID or not API_HASH:
        return SyncResponse(
            ok=False,
            error="TELEGRAM_API_ID и TELEGRAM_API_HASH не настроены. "
                  "Получите их на https://my.telegram.org → API Development Tools."
        )

    client = await _get_client()
    if not client:
        return SyncResponse(ok=False, error="Не удалось подключить Telethon-клиент")

    # Загружаем существующие посты
    safe_name = "".join(c for c in request.channel_name if c.isalnum() or c in ("_", "-"))
    posts_file = DATA_DIR / f"posts_{safe_name}.json"

    if not posts_file.exists():
        return SyncResponse(ok=False, error=f"Канал '{request.channel_name}' не найден")

    try:
        with open(posts_file, "r", encoding="utf-8") as f:
            posts = json.load(f)
    except Exception as e:
        return SyncResponse(ok=False, error=f"Ошибка чтения: {e}")

    if not posts:
        return SyncResponse(ok=True, updated=0, total=0)

    # Получаем entity канала
    try:
        entity = await client.get_entity(f"@{safe_name}")
    except Exception as e:
        return SyncResponse(ok=False, error=f"Канал @{safe_name} не найден: {e}")

    # Собираем все ID постов
    post_ids = [p.get("id") for p in posts if p.get("id")]

    # Получаем сообщения батчами (Telethon поддерживает до 100 за раз)
    updated_count = 0
    posts_by_id = {p.get("id"): p for p in posts}
    batch_size = 100

    try:
        for i in range(0, len(post_ids), batch_size):
            batch_ids = post_ids[i:i + batch_size]

            messages = await client.get_messages(entity, ids=batch_ids)

            for msg in messages:
                if msg is None:
                    continue

                pid = msg.id
                if pid not in posts_by_id:
                    continue

                post = posts_by_id[pid]
                old_views = post.get("views", 0)
                old_forwards = post.get("forwards", 0)
                old_reactions = post.get("reactions", 0)

                # Извлекаем статистику
                new_views = getattr(msg, "views", 0) or 0
                new_forwards = getattr(msg, "forwards", 0) or 0

                # Реакции
                new_reactions = 0
                if hasattr(msg, "reactions") and msg.reactions:
                    for r in msg.reactions.results:
                        new_reactions += r.count

                # Обновляем только если данные изменились
                if new_views != old_views or new_forwards != old_forwards or new_reactions != old_reactions:
                    post["views"] = new_views
                    post["forwards"] = new_forwards
                    post["reactions"] = max(new_reactions, old_reactions)
                    updated_count += 1

            # Небольшая пауза между батчами чтобы не флудить
            if i + batch_size < len(post_ids):
                await asyncio.sleep(0.5)

    except Exception as e:
        log.error(f"Ошибка получения сообщений: {e}")
        return SyncResponse(ok=False, error=str(e), updated=updated_count, total=len(posts))

    # Сохраняем обновлённые данные
    try:
        with open(posts_file, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return SyncResponse(ok=False, error=f"Ошибка сохранения: {e}")

    log.info(f"Синхронизация @{safe_name}: обновлено {updated_count}/{len(posts)} постов")

    return SyncResponse(ok=True, updated=updated_count, total=len(posts))


@router.post("/sync/fetch-new", response_model=SyncResponse)
async def fetch_new_posts(request: SyncRequest):
    """
    Подтягивает новые посты из канала, которых ещё нет в JSON файле.
    Использует Telethon (MTProto).
    """
    if not API_ID or not API_HASH:
        return SyncResponse(
            ok=False,
            error="TELEGRAM_API_ID и TELEGRAM_API_HASH не настроены."
        )

    client = await _get_client()
    if not client:
        return SyncResponse(ok=False, error="Не удалось подключить Telethon-клиент")

    safe_name = "".join(c for c in request.channel_name if c.isalnum() or c in ("_", "-"))
    posts_file = DATA_DIR / f"posts_{safe_name}.json"

    posts = []
    if posts_file.exists():
        try:
            with open(posts_file, "r", encoding="utf-8") as f:
                posts = json.load(f)
        except Exception:
            pass

    max_id = max([p.get("id", 0) for p in posts]) if posts else 0

    try:
        entity = await client.get_entity(f"@{safe_name}")
    except Exception as e:
        return SyncResponse(ok=False, error=f"Канал @{safe_name} не найден: {e}")

    new_posts = []
    try:
        # Боты не могут использовать GetHistoryRequest (min_id/limit).
        # Поэтому мы запрашиваем сообщения по конкретным ID (по 100 штук за раз).
        existing_ids = {p.get("id") for p in posts if p.get("id")}
        
        ids_to_check = []
        if max_id > 0:
            start_id = max(1, max_id - 300)
            gaps = [pid for pid in range(start_id, max_id) if pid not in existing_ids]
            ids_to_check.extend(gaps)
        
        ids_to_check.extend(range(max_id + 1, max_id + 501))
        
        batch_size = 100
        for i in range(0, len(ids_to_check), batch_size):
            batch_ids = ids_to_check[i:i + batch_size]
            messages = await client.get_messages(entity, ids=batch_ids)
            
            for msg in messages:
                if msg is None or not getattr(msg, 'message', None):
                    if msg is not None and not getattr(msg, 'media', None) and not getattr(msg, 'message', None):
                        continue
                    if msg is None:
                        continue
                        
                pid = msg.id
                if pid in existing_ids:
                    continue
                    
                text = getattr(msg, 'message', '') or ''
                if msg.date:
                    dt_utc = msg.date.astimezone(timezone.utc)
                    date_str = dt_utc.strftime("%d.%m.%Y %H:%M:%S UTC+00:00")
                else:
                    date_str = ""
                
                reactions_count = 0
                if hasattr(msg, "reactions") and msg.reactions:
                    for r in msg.reactions.results:
                        reactions_count += r.count
                        
                views = getattr(msg, "views", 0) or 0
                forwards = getattr(msg, "forwards", 0) or 0
                
                channel_link = f"https://t.me/{safe_name}"
                
                new_post = {
                    "id": pid,
                    "url": f"{channel_link}/{pid}",
                    "text": text.strip(),
                    "date": date_str,
                    "reactions": reactions_count,
                    "views": views,
                    "forwards": forwards
                }
                new_posts.append(new_post)
                existing_ids.add(pid)
            
            await asyncio.sleep(0.5) # Пауза между батчами
            
    except Exception as e:
        log.error(f"Ошибка получения новых сообщений: {e}")
        return SyncResponse(ok=False, error=str(e), updated=0, total=len(posts))

    if not new_posts:
        return SyncResponse(ok=True, updated=0, total=len(posts))

    # Добавляем новые посты
    posts.extend(new_posts)
    
    # Сортируем по id по возрастанию (или убыванию, но в json обычно просто массив, UI сортирует сам)
    posts.sort(key=lambda x: x.get("id", 0))

    try:
        with open(posts_file, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return SyncResponse(ok=False, error=f"Ошибка сохранения: {e}")

    log.info(f"Синхронизация @{safe_name}: добавлено {len(new_posts)} новых постов")
    return SyncResponse(ok=True, updated=len(new_posts), total=len(posts))




@router.get("/sync/status")
async def sync_status():
    """Проверяет готовность Telethon (есть ли API_ID/API_HASH)."""
    has_creds = bool(API_ID and API_HASH and BOT_TOKEN)
    connected = _client is not None and _client.is_connected() if _client else False

    return {
        "ok": True,
        "configured": has_creds,
        "connected": connected,
        "missing": [] if has_creds else [
            k for k, v in [
                ("TELEGRAM_API_ID", API_ID),
                ("TELEGRAM_API_HASH", API_HASH),
                ("TELEGRAM_BOT_TOKEN", BOT_TOKEN),
            ] if not v
        ],
    }
