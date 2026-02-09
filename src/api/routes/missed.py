from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import httpx
from pathlib import Path
from datetime import datetime, timedelta

router = APIRouter()
DATA_DIR = Path("data")
DEFAULT_MODEL = "gemini-2.0-flash"

class MissedRequest(BaseModel):
    channel_name: str
    days_back: int
    user_interest: str
    model: str = DEFAULT_MODEL

class MissedResponse(BaseModel):
    ok: bool
    markdown: str = ""
    error: str = ""

def parse_date(date_str: str) -> Optional[datetime]:
    # format: "14.03.2019 06:30:44 UTC-05:00"
    try:
        # Simplification: slice off timezone for rough comparison if needed, or use dateutil
        # "14.03.2019" is the first 10 chars
        day, month, year = map(int, date_str[:10].split('.'))
        return datetime(year, month, day)
    except:
        return None

@router.post("/missed/search", response_model=MissedResponse)
async def missed_posts_search(request: MissedRequest):
    """
    Find relevant posts from the last N days based on user interest.
    """
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return MissedResponse(ok=False, error="GOOGLE_API_KEY not configured")

    # Load posts
    safe_name = "".join(c for c in request.channel_name if c.isalnum() or c in ("_", "-"))
    file_path = DATA_DIR / f"posts_{safe_name}.json"
    if not file_path.exists():
        if request.channel_name in ["default", "posts"]:
             file_path = DATA_DIR / "posts.json"
    
    if not file_path.exists():
        return MissedResponse(ok=False, error=f"Channel {request.channel_name} not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            all_posts = json.load(f)
    except Exception as e:
         return MissedResponse(ok=False, error=str(e))

    # Filter by date
    # Determine the anchor date: use the latest post date in the dataset
    latest_date = None
    parsed_posts = []
    
    for p in all_posts:
        d = parse_date(p["date"])
        if d:
            parsed_posts.append((d, p))
            if latest_date is None or d > latest_date:
                latest_date = d
    
    if not latest_date:
        return MissedResponse(ok=True, markdown="Could not parse dates in posts data.")
        
    cutoff_date = latest_date - timedelta(days=request.days_back)
    
    filtered_posts = [p for d, p in parsed_posts if d >= cutoff_date]
            
    # If no posts found in range (should rarely happen with this logic unless gaps), return helpful message
    if not filtered_posts:
        return MissedResponse(ok=True, markdown=f"No posts found between {cutoff_date.date()} and {latest_date.date()}.")

    # Prepare for LLM
    # Limit number of posts to avoid token limits? 
    # If there are too many, maybe prioritize by reactions?
    filtered_posts.sort(key=lambda x: x.get("reactions", 0), reverse=True)
    top_posts = filtered_posts[:50] # Take top 50 by reactions to fit context
    
    posts_json_str = json.dumps(top_posts, ensure_ascii=False, indent=1)
    
    system_prompt = """You are a helpful assistant filtering Telegram channel updates for a user.
The user wants to know what they missed that is relevant to their specific interest.
You are provided with a list of recent posts.
Your task:
1. Identify posts that match the user's specific interest.
2. Present them in a summary list with links.
3. If nothing matches, say so clearly.
4. Format as Markdown.
5. ALWAYS answer in Russian language.
"""
    
    user_message = f"""Here are the recent posts:
{posts_json_str}

User Interest: {request.user_interest}

Please show me what I missed that matches my interest."""

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
                        "temperature": 0.3,
                    },
                },
            )
            
        data = resp.json()
        
        if "error" in data:
            return MissedResponse(ok=False, error=data["error"].get("message", str(data["error"])))

        candidates = data.get("candidates", [])
        if not candidates:
            return MissedResponse(ok=False, error="Model returned no content")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        
        return MissedResponse(ok=True, markdown=text)

    except Exception as e:
        return MissedResponse(ok=False, error=str(e))
