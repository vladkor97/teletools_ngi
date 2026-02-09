FROM python:3.11-slim

WORKDIR /app

# Устанавливаем системные зависимости (если нужны)
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Копируем зависимости
COPY requirements.txt .

# Устанавливаем Python зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем исходный код
COPY src/ ./src/

# Создаем директории для данных
RUN mkdir -p data

# Переменные окружения для Python
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Запуск бота
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
