"""Тесты для утилиты парсинга дат."""
import pytest
from datetime import datetime, timezone, timedelta
from src.etl.date_utils import parse_telegram_date, filter_posts_by_date


class TestParseTelegramDate:
    def test_basic_utc_minus(self):
        result = parse_telegram_date("08.05.2024 07:51:12 UTC-05:00")
        assert result is not None
        assert result.year == 2024
        assert result.month == 5
        assert result.day == 8
        assert result.hour == 7
        assert result.minute == 51
        tz = timezone(timedelta(hours=-5))
        assert result.tzinfo == tz

    def test_basic_utc_plus(self):
        result = parse_telegram_date("15.03.2025 14:30:00 UTC+03:00")
        assert result is not None
        assert result.year == 2025
        assert result.hour == 14

    def test_utc_zero(self):
        result = parse_telegram_date("01.01.2026 00:00:00 UTC+00:00")
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_empty_string(self):
        assert parse_telegram_date("") is None

    def test_none(self):
        assert parse_telegram_date(None) is None

    def test_invalid_format(self):
        assert parse_telegram_date("2024-05-08") is None
        assert parse_telegram_date("not a date") is None


class TestFilterPostsByDate:
    @pytest.fixture
    def sample_posts(self):
        return [
            {"id": 1, "text": "post 1", "date": "01.01.2025 10:00:00 UTC+00:00"},
            {"id": 2, "text": "post 2", "date": "05.01.2025 10:00:00 UTC+00:00"},
            {"id": 3, "text": "post 3", "date": "10.01.2025 10:00:00 UTC+00:00"},
            {"id": 4, "text": "post 4", "date": "15.01.2025 10:00:00 UTC+00:00"},
            {"id": 5, "text": "post 5", "date": "20.01.2025 10:00:00 UTC+00:00"},
        ]

    def test_filter_middle_range(self, sample_posts):
        result = filter_posts_by_date(sample_posts, "2025-01-04", "2025-01-16")
        assert len(result) == 3
        assert [p["id"] for p in result] == [2, 3, 4]

    def test_filter_single_day(self, sample_posts):
        result = filter_posts_by_date(sample_posts, "2025-01-05", "2025-01-05")
        assert len(result) == 1
        assert result[0]["id"] == 2

    def test_filter_all(self, sample_posts):
        result = filter_posts_by_date(sample_posts, "2025-01-01", "2025-01-31")
        assert len(result) == 5

    def test_filter_none(self, sample_posts):
        result = filter_posts_by_date(sample_posts, "2024-01-01", "2024-01-31")
        assert len(result) == 0

    def test_filter_with_timezone_offset(self):
        """Пост с UTC-05:00 попадает в диапазон при конвертации в UTC."""
        posts = [
            {"id": 1, "text": "late post", "date": "31.12.2024 23:00:00 UTC-05:00"},
        ]
        # 23:00 UTC-5 = 04:00 UTC 01.01.2025
        result = filter_posts_by_date(posts, "2025-01-01", "2025-01-01")
        assert len(result) == 1

    def test_filter_empty_dates(self, sample_posts):
        posts_with_empty = sample_posts + [{"id": 99, "text": "no date", "date": ""}]
        result = filter_posts_by_date(posts_with_empty, "2025-01-01", "2025-01-31")
        assert len(result) == 5  # пост без даты не включается
