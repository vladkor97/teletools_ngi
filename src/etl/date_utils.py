"""
Утилиты для работы с датами из экспорта Telegram.
Формат: "DD.MM.YYYY HH:MM:SS UTC±XX:XX"
"""
import re
from datetime import datetime, timezone, timedelta
from typing import Optional


def parse_telegram_date(date_str: str) -> Optional[datetime]:
    """Парсит дату из формата Telegram-экспорта в datetime с timezone."""
    if not date_str:
        return None

    # Паттерн: "08.05.2024 07:51:12 UTC-05:00"
    pattern = r"(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+UTC([+-])(\d{2}):(\d{2})"
    match = re.match(pattern, date_str.strip())
    if not match:
        return None

    day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hour, minute, second = int(match.group(4)), int(match.group(5)), int(match.group(6))
    tz_sign = 1 if match.group(7) == "+" else -1
    tz_hours, tz_minutes = int(match.group(8)), int(match.group(9))

    tz = timezone(timedelta(hours=tz_sign * tz_hours, minutes=tz_sign * tz_minutes))

    try:
        return datetime(year, month, day, hour, minute, second, tzinfo=tz)
    except ValueError:
        return None


def filter_posts_by_date(posts: list, date_from: str, date_to: str) -> list:
    """
    Фильтрует посты по диапазону дат.
    date_from, date_to — строки в формате 'YYYY-MM-DD'.
    """
    try:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=timezone.utc
        )
    except ValueError:
        return posts

    filtered = []
    for post in posts:
        parsed = parse_telegram_date(post.get("date", ""))
        if parsed is None:
            continue
        # Приводим к UTC для корректного сравнения
        post_utc = parsed.astimezone(timezone.utc)
        if dt_from <= post_utc <= dt_to:
            filtered.append(post)

    return filtered
