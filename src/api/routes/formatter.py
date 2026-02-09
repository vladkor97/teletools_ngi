from fastapi import APIRouter
from pydantic import BaseModel
import re

router = APIRouter()


class MarkdownRequest(BaseModel):
    text: str


class FormattedResponse(BaseModel):
    html: str
    telegram: str  # Текст в формате Telegram markdown (для копирования)


def _format_inline(text: str) -> str:
    """Форматирование инлайн-элементов Markdown в HTML, поддерживаемый Telegram."""
    # Экранируем HTML-спецсимволы
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # Инлайн код `text` — обрабатываем первым, чтобы внутри не срабатывали другие правила
    parts = []
    last_end = 0
    for m in re.finditer(r"`(.*?)`", text):
        parts.append(_format_non_code(text[last_end : m.start()]))
        parts.append(f"<code>{m.group(1)}</code>")
        last_end = m.end()
    parts.append(_format_non_code(text[last_end:]))
    return "".join(parts)


def _format_non_code(text: str) -> str:
    """Форматирование текста вне блоков кода."""
    # Жирный **text**
    text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", text)
    # Курсив _text_ (до одиночной звёздочки, чтобы не конфликтовать с буллетами)
    text = re.sub(r"_(.*?)_", r"<i>\1</i>", text)
    # Курсив *text* — только если окружён не-пробельным символом
    text = re.sub(r"(?<!\s)\*(.*?)\*(?!\s)", r"<i>\1</i>", text)
    # Зачёркнутый ~~text~~
    text = re.sub(r"~~(.*?)~~", r"<s>\1</s>", text)
    # Ссылки [text](url)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r'<a href="\2">\1</a>', text)
    return text


def _convert_links_for_telegram(text: str) -> str:
    """
    Telegram Desktop не парсит [text](url) при вставке.
    Конвертируем в: text (url) — URL будет автолинком.
    """
    return re.sub(r"\[(.*?)\]\((.*?)\)", r"\1 (\2)", text)


def _to_telegram_markdown(text: str) -> str:
    """
    Конвертирует markdown в формат, который Telegram Desktop парсит при отправке.
    **bold** → **bold** (Telegram парсит)
    __italic__ → __italic__ (Telegram парсит)
    ~~strike~~ → ~~strike~~ (Telegram парсит)
    `code` → `code` (Telegram парсит)
    [text](url) → text (url) (Telegram НЕ парсит ссылки, делаем URL видимым)
    - item / * item → • item (нормализуем буллеты)
    """
    lines = text.split("\n")
    result: list[str] = []

    for line in lines:
        # Нумерованный список — убираем лишние отступы, конвертируем ссылки
        numbered = re.match(r"^\s*(\d+)\.\s+(.*)", line)
        if numbered:
            num, content = numbered.groups()
            result.append(f"{num}. {_convert_links_for_telegram(content)}")
            continue

        # Маркированный список — нормализуем маркер в •, конвертируем ссылки
        bullet = re.match(r"^\s*[-*•]\s+(.*)", line)
        if bullet:
            content = bullet.group(1)
            result.append(f"• {_convert_links_for_telegram(content)}")
            continue

        # Обычная строка — конвертируем ссылки
        result.append(_convert_links_for_telegram(line))

    return "\n".join(result)


@router.post("/format", response_model=FormattedResponse)
async def format_markdown(request: MarkdownRequest):
    """
    Возвращает два формата:
    - html: для предпросмотра в браузере (теги <b>, <a> и т.д.)
    - telegram: для копирования в Telegram (**bold**, [text](url))
    """
    text = request.text
    if not text:
        return FormattedResponse(html="", telegram="")

    # --- Telegram markdown (для копирования) ---
    tg_text = _to_telegram_markdown(text)

    # --- HTML (для предпросмотра) ---
    # 1. Извлекаем многострочные блоки кода
    code_blocks: dict[str, str] = {}
    counter = 0

    def _replace_code_block(m: re.Match) -> str:
        nonlocal counter
        key = f"\x00CODEBLOCK{counter}\x00"
        content = m.group(1)
        content = content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        code_blocks[key] = f"<pre>{content}</pre>"
        counter += 1
        return key

    html_text = re.sub(r"```(.*?)```", _replace_code_block, text, flags=re.DOTALL)

    # 2. Обрабатываем построчно
    lines = html_text.split("\n")
    result_lines: list[str] = []

    for line in lines:
        # Плейсхолдер блока кода
        if any(key in line for key in code_blocks):
            restored = line
            for key, value in code_blocks.items():
                restored = restored.replace(key, value)
            result_lines.append(restored)
            continue

        # Нумерованный список
        numbered = re.match(r"^\s*(\d+)\.\s+(.*)", line)
        if numbered:
            num, content = numbered.groups()
            result_lines.append(f"{num}. {_format_inline(content)}")
            continue

        # Маркированный список
        bullet = re.match(r"^\s*[-*•]\s+(.*)", line)
        if bullet:
            content = bullet.group(1)
            result_lines.append(f"• {_format_inline(content)}")
            continue

        # Обычная строка
        result_lines.append(_format_inline(line))

    return FormattedResponse(
        html="\n".join(result_lines),
        telegram=tg_text,
    )
