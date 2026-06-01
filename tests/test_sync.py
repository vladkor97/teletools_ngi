import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path
import json
from datetime import datetime, timezone

from src.api.routes.sync import fetch_new_posts, SyncRequest

class DummyMessage:
    def __init__(self, id, message, date=None, views=0, forwards=0, reactions=None):
        self.id = id
        self.message = message
        self.date = date or datetime.now(timezone.utc)
        self.views = views
        self.forwards = forwards
        self.reactions = reactions

@pytest.mark.asyncio
@patch("src.api.routes.sync._get_client")
@patch("src.api.routes.sync.DATA_DIR")
async def test_fetch_new_posts_fills_gaps(mock_data_dir, mock_get_client, tmp_path):
    # Настраиваем временную директорию для тестов
    mock_data_dir.__truediv__.return_value = tmp_path / "posts_test_channel.json"
    posts_file = tmp_path / "posts_test_channel.json"
    
    # Исходная база: пост 621 и пост 625 (пропуски 622, 623, 624)
    initial_posts = [
        {"id": 621, "url": "https://t.me/test_channel/621", "text": "Post 621", "date": "13.05.2026 14:29:41 UTC+00:00"},
        {"id": 625, "url": "https://t.me/test_channel/625", "text": "Post 625", "date": "18.05.2026 15:31:49 UTC+00:00"}
    ]
    with open(posts_file, "w", encoding="utf-8") as f:
        json.dump(initial_posts, f)

    # Настраиваем мок клиента Telethon
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client
    
    mock_entity = MagicMock()
    mock_client.get_entity.return_value = mock_entity
    
    # Мокаем получение сообщений
    # Мы ожидаем, что клиент запросит пробелы (622, 623, 624) и новые ID (>625)
    # Вернем сообщение 622 и новое сообщение 626
    def side_effect(entity, ids):
        results = []
        for i in ids:
            if i == 622:
                results.append(DummyMessage(622, "Missing Post 622", datetime(2026, 5, 17, 12, 0, 0, tzinfo=timezone.utc)))
            elif i == 626:
                results.append(DummyMessage(626, "New Post 626", datetime(2026, 5, 19, 15, 0, 0, tzinfo=timezone.utc)))
            else:
                results.append(None)
        return results

    mock_client.get_messages.side_effect = side_effect

    # Запускаем эндпоинт
    request = SyncRequest(channel_name="test_channel")
    with patch("src.api.routes.sync.API_ID", "12345"), patch("src.api.routes.sync.API_HASH", "abcde"):
        response = await fetch_new_posts(request)

    assert response.ok is True
    # Должно быть добавлено 2 поста: 622 и 626
    assert response.updated == 2

    # Проверяем содержимое файла
    with open(posts_file, "r", encoding="utf-8") as f:
        saved_posts = json.load(f)

    assert len(saved_posts) == 4
    # Проверяем, что посты отсортированы по ID
    assert [p["id"] for p in saved_posts] == [621, 622, 625, 626]
    
    # Проверяем формат даты у нового поста
    post_622 = next(p for p in saved_posts if p["id"] == 622)
    assert post_622["text"] == "Missing Post 622"
    assert post_622["date"] == "17.05.2026 12:00:00 UTC+00:00"
