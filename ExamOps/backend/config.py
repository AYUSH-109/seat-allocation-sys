"""
Configuration settings for FastAPI Backend
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:8010",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8010",
    "http://127.0.0.1:8000",
]


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Exam Invigilation Reporting System"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8010
    
    # CORS
    CORS_ORIGINS: List[str] = DEFAULT_CORS_ORIGINS.copy()

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def validate_and_merge_cors_origins(cls, value):
        """
        Merge caller-supplied origins with the safe localhost defaults.
        pydantic_settings already JSON-parses List[str] env vars before this
        validator runs, so `value` is normally already a list here.
        """
        if not value:
            return DEFAULT_CORS_ORIGINS.copy()

        origins = value if isinstance(value, list) else list(value)

        merged = []
        for origin in [*origins, *DEFAULT_CORS_ORIGINS]:
            normalized = str(origin).strip()
            if normalized and normalized not in merged:
                merged.append(normalized)

        return merged
    
    # Google Apps Script
    GOOGLE_APPS_SCRIPT_URL: str = os.getenv(
        "GOOGLE_APPS_SCRIPT_URL",
        "https://script.google.com/macros/s/AKfycbxbpg_4pQui9agLQa6sPFUZ8uh5yxTS78NJ9HFV6spmhp4FSloB59NEskLoOl280RT_/exec"
    )
    
    GOOGLE_APPS_SCRIPT_API_KEY: str = os.getenv(
        "GOOGLE_APPS_SCRIPT_API_KEY",
        "X9fT7qLm2ZpR4vYc8WjK1sHbN6uQeD3aGoVr5tUy"
    )

    # Upstream timeout to avoid long UI waits when Apps Script is slow/unreachable
    APPS_SCRIPT_TIMEOUT_SECONDS: float = 20.0
    
    # File Upload Settings
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_IMAGE_TYPES: List[str] = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp"
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = 'ignore'  # Ignore extra fields in .env


# Create settings instance
settings = Settings()
