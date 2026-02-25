"""
ClearClause Backend Configuration
Environment-based settings using Pydantic Settings
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # API Keys
    gemini_api_key: str
    apryse_license_key: str
    deepgram_api_key: str
    
    # Gemini Models
    gemini_analysis_model: str = "gemini-3.1-pro-preview"
    gemini_chat_model: str = "gemini-3-flash-preview"
    
    # Server Configuration
    frontend_url: str = "http://localhost:5173"
    max_file_size_mb: int = 50
    max_concurrent_analyses: int = 5
    
    # Rate Limiting
    gemini_requests_per_minute: int = 8
    gemini_max_retries: int = 5
    
    # Session Management
    session_ttl_minutes: int = 30
    cleanup_interval_minutes: int = 10
    
    # Logging
    log_level: str = "INFO"
    
    # Computed
    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024
    
    @property
    def gemini_api_base(self) -> str:
        return "https://generativelanguage.googleapis.com/v1beta"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Using lru_cache ensures we only load settings once,
    then reuse the same instance throughout the app lifecycle.
    """
    return Settings()
