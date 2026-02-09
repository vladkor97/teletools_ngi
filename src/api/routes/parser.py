from fastapi import APIRouter, UploadFile, HTTPException, Form, Query
from fastapi.responses import FileResponse
from pathlib import Path
from urllib.parse import urlparse
import shutil
import json
import re
from src.etl.parser import TelegramExportParser
from typing import List, Optional

router = APIRouter()

DATA_DIR = Path("data")


def _extract_channel_name(channel_link: str) -> str:
    """Извлекает username канала из ссылки (https://t.me/NGI_ru -> NGI_ru)."""
    link = channel_link.rstrip("/")
    parsed = urlparse(link)
    channel_name = parsed.path.strip("/").split("/")[-1]
    # Очищаем от небезопасных символов для имени файла
    channel_name = re.sub(r"[^\w\-]", "_", channel_name)
    return channel_name or "unknown"


@router.post("/parse")
async def parse_messages(
    file: UploadFile,
    channel_link: Optional[str] = Form("https://t.me/channel"),
):
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        # Имя канала для файлов
        channel_name = _extract_channel_name(channel_link)
        messages_file = DATA_DIR / f"messages_{channel_name}.html"
        posts_file = DATA_DIR / f"posts_{channel_name}.json"

        # Сохраняем загруженный файл
        with open(messages_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Парсим
        parser = TelegramExportParser(messages_file, channel_link=channel_link)
        posts = parser.parse()

        # Сохраняем посты в JSON
        with open(posts_file, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)

        return {
            "message": "Successfully parsed messages",
            "count": len(posts),
            "channel_name": channel_name,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/posts/download")
async def download_posts(channel: str = Query("unknown")):
    """Скачивание posts JSON по имени канала."""
    # Очищаем от небезопасных символов
    safe_name = re.sub(r"[^\w\-]", "_", channel)
    posts_file = DATA_DIR / f"posts_{safe_name}.json"

    if not posts_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Posts file for channel '{channel}' not found.",
        )
    return FileResponse(
        posts_file,
        media_type="application/json",
        filename=f"posts_{safe_name}.json",
    )
