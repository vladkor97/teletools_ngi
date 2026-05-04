"""Тесты для summary API (хелперы)."""
import pytest
from src.api.routes.summary import _build_summary_prompt


class TestBuildSummaryPrompt:
    def test_basic_prompt(self):
        result = _build_summary_prompt("Привет, давай обсудим проект", "")
        assert "ТРАНСКРИПТ ЗВОНКА" in result
        assert "Привет, давай обсудим проект" in result
        assert "Action Items" in result

    def test_with_custom_instruction(self):
        result = _build_summary_prompt("текст звонка", "Сфокусируйся на метриках")
        assert "Сфокусируйся на метриках" in result
        assert "Дополнительные инструкции" in result

    def test_without_custom_instruction(self):
        result = _build_summary_prompt("текст звонка", "")
        assert "Дополнительные инструкции" not in result

    def test_prompt_contains_system_instructions(self):
        result = _build_summary_prompt("test", "")
        assert "структурированные саммари" in result
        assert "Участники" in result
        assert "Решения" in result
