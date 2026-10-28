"""Application Configuration & Environment Settings."""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ASTRA FDR Vault API"
    PORT: int = 4000
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgrespassword@localhost:5434/fdr_vault"
    SYNC_DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5434/fdr_vault"

    # Authentication & JWT
    JWT_SECRET: str = "astrasih26265supersecretjwtkeyforprototypeevaluation2026"
    REFRESH_TOKEN_SECRET: str = "astrasih26265refreshtokensecretforprototypeevaluation2026"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Storage & Cryptography
    STORAGE_ENCRYPTION_KEY: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    LOCAL_STORAGE_DIR: str = "/tmp/fdr_vault_docs"

    # Microservices & SMTP
    AI_SERVICE_URL: str = "http://127.0.0.1:8000"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1026

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def async_database_url(self) -> str:
        """Ensures asyncpg driver is specified in URL."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://")
        return url


settings = Settings()
