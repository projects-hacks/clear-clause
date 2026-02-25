"""
FastAPI dependency injection setup

Provides reusable dependencies for API routes.
"""
from functools import lru_cache
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.responses import StreamingResponse
import structlog

from config import get_settings, Settings
from services.session_manager import (
    SessionManager,
    get_session_manager,
    AnalysisSession,
    SessionStatus,
)
from core.exceptions import SessionNotFound, FileValidationError

logger = structlog.get_logger()


async def get_session_manager_dep() -> SessionManager:
    """Dependency to get session manager instance."""
    return get_session_manager()


async def validate_session(
    session_id: str,
    session_manager: SessionManager = Depends(get_session_manager_dep),
) -> AnalysisSession:
    """
    Validate that a session exists and is not expired.
    
    Usage:
        @app.post("/api/chat")
        async def chat(
            session: AnalysisSession = Depends(validate_session)
        ):
            ...
    """
    session = await session_manager.get_session(session_id)
    
    if session is None:
        raise SessionNotFound(session_id=session_id)
    
    return session


async def check_concurrent_limit(
    session_manager: SessionManager = Depends(get_session_manager_dep),
    settings: Settings = Depends(get_settings),
) -> None:
    """
    Check if concurrent analysis limit is reached.
    
    Prevents too many simultaneous analyses from overwhelming the system.
    """
    active_count = await session_manager.get_active_session_count()
    
    if active_count >= settings.max_concurrent_analyses:
        logger.warning(
            "Concurrent limit reached",
            active=active_count,
            max=settings.max_concurrent_analyses
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "concurrent_limit_reached",
                "message": "Too many analyses in progress. Please wait a moment.",
                "active_analyses": active_count,
                "max_allowed": settings.max_concurrent_analyses,
            }
        )


def validate_file_upload(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Validate uploaded file meets requirements.
    
    Checks:
    - File type is PDF
    - File size within limit
    - Filename is valid
    
    Returns sanitized filename.
    """
    # Check content type
    if content_type != "application/pdf":
        raise FileValidationError(
            message=f"Invalid file type. Expected PDF, got {content_type}"
        )
    
    # Check file size
    max_size = settings.max_file_size_bytes
    if len(file_bytes) > max_size:
        raise FileValidationError(
            message=f"File too large. Max size is {settings.max_file_size_mb}MB"
        )
    
    # Check file extension
    if not filename.lower().endswith(".pdf"):
        raise FileValidationError(
            message="File must have .pdf extension"
        )
    
    # Sanitize filename (basic security)
    safe_filename = "".join(
        c for c in filename
        if c.isalnum() or c in "._- "
    ).strip()
    
    if not safe_filename:
        safe_filename = "document.pdf"
    
    return safe_filename


@lru_cache
def get_settings_dep() -> Settings:
    """Dependency to get settings instance."""
    return get_settings()
