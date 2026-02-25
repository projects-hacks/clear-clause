"""
Core exceptions for ClearClause backend

Custom exception hierarchy for consistent error handling.
"""
from typing import Optional


class ClearClauseException(Exception):
    """Base exception for all ClearClause errors."""
    
    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        detail: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.detail = detail
        self.session_id = session_id
        super().__init__(self.message)


class SessionNotFound(ClearClauseException):
    """Analysis session not found or expired."""
    
    def __init__(self, session_id: str, detail: Optional[str] = None):
        super().__init__(
            message="Analysis session not found or expired",
            error_code="session_not_found",
            status_code=404,
            detail=detail or f"Session {session_id} does not exist or has expired",
            session_id=session_id,
        )


class SessionExpired(ClearClauseException):
    """Analysis session has expired."""
    
    def __init__(self, session_id: str):
        super().__init__(
            message="Analysis session has expired",
            error_code="session_expired",
            status_code=410,
            detail="Sessions expire after 30 minutes of inactivity",
            session_id=session_id,
        )


class RateLimitExceeded(ClearClauseException):
    """Rate limit exceeded for API calls."""
    
    def __init__(self, retry_after: int):
        super().__init__(
            message="Too many requests. Please wait and try again.",
            error_code="rate_limit_exceeded",
            status_code=429,
            detail=f"Retry after {retry_after} seconds",
        )
        self.retry_after = retry_after


class AnalysisError(ClearClauseException):
    """Error during document analysis pipeline."""
    
    def __init__(self, message: str, session_id: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="analysis_error",
            status_code=500,
            detail="Failed to complete document analysis",
            session_id=session_id,
        )


class OCRError(ClearClauseException):
    """Error during OCR text extraction."""
    
    def __init__(self, message: str, session_id: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="ocr_error",
            status_code=500,
            detail="Failed to extract text from document",
            session_id=session_id,
        )


class AIAnalysisError(ClearClauseException):
    """Error during AI analysis."""
    
    def __init__(self, message: str, session_id: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="ai_analysis_error",
            status_code=500,
            detail="Failed to analyze document with AI",
            session_id=session_id,
        )


class FileValidationError(ClearClauseException):
    """Invalid file upload."""
    
    def __init__(self, message: str):
        super().__init__(
            message=message,
            error_code="file_validation_error",
            status_code=400,
            detail="File does not meet requirements",
        )


class ConfigurationError(ClearClauseException):
    """Configuration or API key missing."""
    
    def __init__(self, message: str):
        super().__init__(
            message=message,
            error_code="configuration_error",
            status_code=500,
            detail="Server configuration error",
        )
