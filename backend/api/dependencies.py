"""
FastAPI dependency injection setup

Provides reusable dependencies for API routes.
"""
from functools import lru_cache
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status, Query, Header, Request
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

_per_ip_counters: dict[str, int] = {}


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
    - PDF header is valid
    - File is not empty
    
    Returns sanitized filename.
    """
    # Check file is not empty
    if len(file_bytes) == 0:
        raise FileValidationError(
            message="File is empty",
            error_code="EMPTY_FILE",
            recovery="Please select a non-empty PDF file."
        )
    
    # Check content type
    if content_type != "application/pdf":
        raise FileValidationError(
            message=f"Invalid file type: {content_type}. Only PDF files are accepted.",
            error_code="INVALID_FILE_TYPE",
            recovery="Please convert your document to PDF format and try again."
        )
    
    # Check file size
    max_size = settings.max_file_size_bytes
    if len(file_bytes) > max_size:
        file_size_mb = len(file_bytes) / (1024 * 1024)
        raise FileValidationError(
            message=f"File too large: {file_size_mb:.2f}MB. Maximum size is {settings.max_file_size_mb}MB.",
            error_code="FILE_TOO_LARGE",
            recovery=f"Compress your PDF or split it into smaller files (max {settings.max_file_size_mb}MB each)."
        )
    
    # Check file extension
    if not filename.lower().endswith(".pdf"):
        raise FileValidationError(
            message="File must have .pdf extension",
            error_code="INVALID_EXTENSION",
            recovery="Please rename your file to end with .pdf or convert it to PDF format."
        )
    
    # Check PDF header (basic validation)
    if len(file_bytes) < 5 or not file_bytes[:5] == b"%PDF-":
        raise FileValidationError(
            message="File is not a valid PDF or may be corrupted",
            error_code="CORRUPTED_FILE",
            recovery="Please re-download or re-scan the original document. Make sure it's not password-protected."
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


async def require_admin_auth(
    settings: Settings = Depends(get_settings_dep),
    x_api_key: str | None = Header(default=None, convert_underscores=False),
) -> None:
    """
    Optional admin authentication for sensitive endpoints.

    When settings.admin_api_key is set, callers must provide X-API-Key
    matching that value. When unset, authentication is skipped.
    """
    if not settings.admin_api_key:
        return

    if not x_api_key or x_api_key != settings.admin_api_key:
        logger.warning("Admin auth failed or missing X-API-Key header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )


async def enforce_per_ip_analysis_limit(
    request: Request,
    settings: Settings = Depends(get_settings_dep),
) -> None:
    """
    Best-effort per-IP limit on concurrent /analyze requests.

    This complements the global concurrent analysis limit by ensuring
    a single IP cannot monopolize all available analysis slots.
    """
    client_ip = request.client.host if request.client else "unknown"
    max_per_ip = settings.max_concurrent_analyses_per_ip

    current = _per_ip_counters.get(client_ip, 0)
    if current >= max_per_ip:
        logger.warning(
            "Per-IP concurrent analysis limit reached",
            ip=client_ip,
            current=current,
            max_per_ip=max_per_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many analyses in progress from this IP. Please wait for an existing analysis to finish.",
        )

    _per_ip_counters[client_ip] = current + 1

    async def _decrement_counter() -> None:
        # This helper relies on FastAPI calling dependencies at request scope.
        # It is invoked from the route handler using finally-block semantics.
        remaining = _per_ip_counters.get(client_ip, 0)
        if remaining <= 1:
            _per_ip_counters.pop(client_ip, None)
        else:
            _per_ip_counters[client_ip] = remaining - 1

    # Attach the cleanup helper so routes can call it in a finally block.
    # We stash it on the request state to avoid changing route signatures.
    request.state.decrement_ip_counter = _decrement_counter
