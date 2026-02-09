from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import httpx
from pathlib import Path

router = APIRouter()
DATA_DIR = Path("data")
DEFAULT_MODEL = "gemini-2.0-flash"

class GenerateRequest(BaseModel):
    channel_name: str
    selected_post_ids: List[int]
    instruction: str
    instruction: str
    model: str = DEFAULT_MODEL
    temperature: float = 0.7

class GenerateResponse(BaseModel):
    ok: bool
    content: str = ""
    error: str = ""

@router.post("/toolkit/generate", response_model=GenerateResponse)
async def generate_content(request: GenerateRequest):
    """
    Generate content ideas based on selected posts using Gemini.
    """
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return GenerateResponse(ok=False, error="GOOGLE_API_KEY not configured")

    # Load posts
    safe_name = "".join(c for c in request.channel_name if c.isalnum() or c in ("_", "-"))
    file_path = DATA_DIR / f"posts_{safe_name}.json"
    if not file_path.exists():
        if request.channel_name in ["default", "posts"]:
             file_path = DATA_DIR / "posts.json"
    
    if not file_path.exists():
        return GenerateResponse(ok=False, error=f"Channel {request.channel_name} not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            all_posts = json.load(f)
    except Exception as e:
         return GenerateResponse(ok=False, error=str(e))

    # Filter selected posts
    selected_posts = [p for p in all_posts if p["id"] in request.selected_post_ids]
    
    if not selected_posts:
        return GenerateResponse(ok=False, error="No valid posts selected")

    # Prepare prompt
    posts_text = "\n\n".join([f"Post {p['id']} ({p['date']}):\n{p['text']}\nStats: {p.get('reactions',0)} reactions" for p in selected_posts])
    
    system_prompt = """Ты — опытный редактор и помощник автора Telegram-канала.
Твоя задача — помогать работать с контентом, опираясь на предоставленные примеры постов (контекст).

Ты умеешь:
1. Генерировать новые идеи и темы, соответствующие стилю канала.
2. Писать дайджесты и саммари по выбранным постам.
3. Проводить рерайт или адаптацию контента.
4. Анализировать успешные элементы (по реакциям) и использовать их.

Всегда отвечай на русском языке. Старайся сохранять авторский стиль (tone-of-voice), если это уместно.
"""

    user_message = f"""Here are the selected posts from the author's channel:

{posts_text}

User Instruction: {request.instruction}

Please generate the requested content."""

    # Call Gemini
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent?key={api_key}",
                json={
                    "systemInstruction": {
                        "parts": [{"text": system_prompt}]
                    },
                    "contents": [
                        {"role": "user", "parts": [{"text": user_message}]}
                    ],
                    "generationConfig": {
                        "temperature": request.temperature,
                    },
                },
            )
            
        data = resp.json()
        
        if "error" in data:
            return GenerateResponse(ok=False, error=data["error"].get("message", str(data["error"])))

        candidates = data.get("candidates", [])
        if not candidates:
            return GenerateResponse(ok=False, error="Model returned no content")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        
        return GenerateResponse(ok=True, content=text)

    except Exception as e:
        return GenerateResponse(ok=False, error=str(e))
