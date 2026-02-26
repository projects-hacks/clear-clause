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
        recovery: Optional[str] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.detail = detail
        self.session_id = session_id
        self.recovery = recovery
        super().__init__(self.message)
    
    def to_dict(self):
        """Convert exception to dictionary for JSON response."""
        result = {
            "error": self.error_code,
            "message": self.message,
        }
        if self.detail:
            result["detail"] = self.detail
        if self.recovery:
            result["recovery"] = self.recovery
        if self.session_id:
            result["session_id"] = self.session_id
        return result


class SessionNotFound(ClearClauseException):
    """Analysis session not found or expired."""
    
    def __init__(self, session_id: str, detail: Optional[str] = None):
        super().__init__(
            message="Analysis session not found or expired",
            error_code="session_not_found",
            status_code=404,
            detail=detail or f"Session {session_id} does not exist or has expired",
            session_id=session_id,
            recovery="Please upload your document again to start a new analysis session.",
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
            recovery="Please upload your document again to start a new analysis session.",
        )


class RateLimitExceeded(ClearClauseException):
    """Rate limit exceeded for API calls."""
    
    def __init__(self, retry_after: int):
        super().__init__(
            message="Too many requests. Please wait and try again.",
            error_code="rate_limit_exceeded",
            status_code=429,
            detail=f"Retry after {retry_after} seconds",
            recovery=f"Please wait {retry_after} seconds before making another request.",
        )
        self.retry_after = retry_after


class AnalysisError(ClearClauseException):
    """Error during document analysis pipeline."""
    
    def __init__(self, message: str, session_id: Optional[str] = None, recovery: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="analysis_error",
            status_code=500,
            detail="Failed to complete document analysis",
            session_id=session_id,
            recovery=recovery or "Please try again. If the problem persists, the document may be too complex or corrupted.",
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
            recovery="Try using a scanned PDF or ensure the document is not password-protected.",
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
            recovery="Please try again. If the problem persists, try uploading a shorter document.",
        )


class FileValidationError(ClearClauseException):
    """Invalid file upload."""
    
    def __init__(
        self, 
        message: str, 
        error_code: str = "file_validation_error",
        recovery: Optional[str] = None
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=400,
            detail="File does not meet requirements",
            recovery=recovery or "Please ensure your file is a valid PDF and meets the size requirements.",
        )


class ConfigurationError(ClearClauseException):
    """Configuration or API key missing."""
    
    def __init__(self, message: str, recovery: Optional[str] = None):
        super().__init__(
            message=message,
            error_code="configuration_error",
            status_code=500,
            detail="Server configuration error",
            recovery=recovery or "Please contact support if this error persists.",
        )
