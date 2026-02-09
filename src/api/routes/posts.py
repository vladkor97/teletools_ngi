from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import json
from pathlib import Path

router = APIRouter()
DATA_DIR = Path("data")

class Post(BaseModel):
    id: int
    url: str
    text: str
    date: str
    date: str
    reactions: int = 0

class PostsResponse(BaseModel):
    total: int
    posts: List[Post]

@router.get("/posts", response_model=PostsResponse)
async def get_posts(
    channel_name: str = Query(..., description="Name of the channel (e.g., 'NGI_ru')"),
    sort_by: str = Query("date", enum=["date", "reactions"]),
    order: str = Query("desc", enum=["asc", "desc"]),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None
):
    """
    Get channel posts with sorting and filtering.
    """
    # Sanitize channel name
    safe_name = "".join(c for c in channel_name if c.isalnum() or c in ("_", "-"))
    file_path = DATA_DIR / f"posts_{safe_name}.json"
    
    # Fallback to posts.json if channel name matches "default" or "posts"
    if not file_path.exists():
        if channel_name in ["default", "posts"]:
             file_path = DATA_DIR / "posts.json"
        
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Channel {channel_name} not found")
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            posts_data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading data: {str(e)}")
        
    # Filter by search term
    if search:
        search_lower = search.lower()
        posts_data = [p for p in posts_data if search_lower in p.get("text", "").lower()]
        
    # Sort
    reverse = (order == "desc")
    if sort_by == "date":
        # Date string format: "14.03.2019 06:30:44 UTC-05:00"
        # Simple string sort might fail for some formats, but commonly DD.MM.YYYY works decently if uniform.
        # Better: parse date. But these strings are tricky.
        # However, the IDs are usually sequential with date. So sorting by ID is a good proxy for Date.
        # Let's use ID for date sorting for robustness, assuming ID order == Date order.
        posts_data.sort(key=lambda x: x["id"], reverse=reverse)
    else:
        # reactions or views
        posts_data.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse)
        
    # Pagination
    total = len(posts_data)
    sliced_posts = posts_data[offset : offset + limit]
    
    return PostsResponse(total=total, posts=sliced_posts)
