from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "https://immiglens.vercel.app",
    ]

    DATABASE_URL: str = "postgresql+asyncpg://postgres:12345@localhost/immiglens"

    SECRET_KEY: str = "change-this-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    SCREENSHOTS_DIR: str = "screenshots"
    DOCUMENTS_DIR: str = "documents"
    REPORTS_DIR: str = "reports"

    MAX_CONCURRENT_SCREENSHOTS: int = 5
    PAGE_TIMEOUT_MS: int = 60_000
    NETWORK_IDLE_TIMEOUT_MS: int = 10_000
    JS_SETTLE_DELAY_S: float = 1.5
    MAX_URLS_PER_BATCH: int = 100
    JOB_MAX_AGE_S: int = 3_600

    RECRUITMENT_PERIOD_DAYS: int = 28

    # ── Email / SMTP ─────────────────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@immiglens.com"
    SMTP_USE_TLS: bool = True

    # ── Invitation token expiry ───────────────────────────────────────────────
    INVITATION_EXPIRE_HOURS: int = 72


settings = Settings()
