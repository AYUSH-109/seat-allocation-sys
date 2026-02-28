"""
Configuration settings for FastAPI Backend
"""

import os
from typing import List
from pydantic_settings import BaseSettings


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
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8010",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8010",
        "http://127.0.0.1:8000",
        # Add your frontend deployment URL here
    ]
    
    # Google Apps Script
    GOOGLE_APPS_SCRIPT_URL: str = os.getenv(
        "GOOGLE_APPS_SCRIPT_URL",
        "https://script.google.com/macros/s/AKfycbyfnkB8UzxBQHF4OoD9PoshFGHBcsiu54SmtCh6WWjwRtX6RE1d6ePkdIwsR4BZT64d/exec"
    )
    
    GOOGLE_APPS_SCRIPT_API_KEY: str = os.getenv(
        "GOOGLE_APPS_SCRIPT_API_KEY",
        "X9fT7qLm2ZpR4vYc8WjK1sHbN6uQeD3aGoVr5tUy"
    )
    
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
