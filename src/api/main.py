from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import parser, formatter, telegram, ai_search, posts, toolkit, missed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Запускаем polling бота при старте
    telegram.start_polling()
    yield
    # Останавливаем при завершении
    telegram.stop_polling()


app = FastAPI(title="TeleTools API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parser.router, prefix="/api", tags=["Parser"])
app.include_router(formatter.router, prefix="/api", tags=["Formatter"])
app.include_router(telegram.router, prefix="/api", tags=["Telegram"])
app.include_router(ai_search.router, prefix="/api", tags=["AI Search"])
app.include_router(posts.router, prefix="/api", tags=["Posts"])
app.include_router(toolkit.router, prefix="/api", tags=["Toolkit"])
app.include_router(missed.router, prefix="/api", tags=["Missed"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
