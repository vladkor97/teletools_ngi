"""Тесты для digest API (хелперы)."""
import pytest
from src.api.routes.digest import (
    _find_digest_post,
    _extract_digest_number,
    _extract_prev_digest_link,
)


class TestFindDigestPost:
    def test_finds_latest_digest(self):
        posts = [
            {"id": 100, "text": "🚀 NGI дайджест №10\nсодержимое", "url": "https://t.me/NGI_ru/100"},
            {"id": 200, "text": "обычный пост"},
            {"id": 300, "text": "🚀 NGI дайджест №15\nсодержимое", "url": "https://t.me/NGI_ru/300"},
        ]
        result = _find_digest_post(posts)
        assert result is not None
        assert result["id"] == 300

    def test_no_digest_found(self):
        posts = [
            {"id": 1, "text": "обычный пост"},
            {"id": 2, "text": "ещё пост"},
        ]
        assert _find_digest_post(posts) is None

    def test_hash_syntax(self):
        posts = [{"id": 50, "text": "дайджест #5 — вот такой"}]
        result = _find_digest_post(posts)
        assert result is not None


class TestExtractDigestNumber:
    def test_number_sign(self):
        assert _extract_digest_number("🚀 NGI дайджест №36") == 36

    def test_hash_sign(self):
        assert _extract_digest_number("дайджест #12 за неделю") == 12

    def test_no_number(self):
        assert _extract_digest_number("обычный пост") is None

    def test_with_space(self):
        assert _extract_digest_number("дайджест № 7") == 7


class TestExtractPrevDigestLink:
    def test_standard_pattern(self):
        text = "Прошлый дайджест тут https://t.me/NGI_ru/450"
        result = _extract_prev_digest_link(text)
        assert result == "https://t.me/NGI_ru/450"

    def test_previous_synonym(self):
        text = "предыдущий дайджест: https://t.me/channel/100"
        result = _extract_prev_digest_link(text)
        assert result == "https://t.me/channel/100"

    def test_fallback_last_link(self):
        text = "Посмотри https://t.me/ch/1 и https://t.me/ch/2"
        result = _extract_prev_digest_link(text)
        assert result == "https://t.me/ch/2"

    def test_no_link(self):
        text = "Обычный пост без ссылок"
        assert _extract_prev_digest_link(text) is None

    def test_link_with_trailing_paren(self):
        text = "Прошлый дайджест [тут](https://t.me/NGI_ru/123)"
        result = _extract_prev_digest_link(text)
        assert result == "https://t.me/NGI_ru/123"
