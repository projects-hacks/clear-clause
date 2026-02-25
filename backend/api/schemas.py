"""
Pydantic schemas for API request/response validation

Designed for multi-document support with session-based tracking.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from enum import Enum


class SessionStatusEnum(str, Enum):
    """Analysis session status."""
    UPLOADING = "uploading"
    EXTRACTING = "extracting"
    ANALYZING = "analyzing"
    COMPLETE = "complete"
    ERROR = "error"


class AnalysisProgressEvent(BaseModel):
    """
    SSE progress event sent to client during analysis.
    
    Each event represents a stage update in the pipeline.
    Clients use this to show real-time progress.
    """
    session_id: str
    stage: SessionStatusEnum
    progress: int = Field(ge=0, le=100, description="Progress percentage 0-100")
    message: str = Field(description="Human-readable status message")
    data: Optional[Dict[str, Any]] = None
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "session_id": "abc123-def456",
                    "stage": "extracting",
                    "progress": 30,
                    "message": "Extracting text with Apryse OCR..."
                },
                {
                    "session_id": "abc123-def456",
                    "stage": "analyzing",
                    "progress": 60,
                    "message": "AI analyzing document clauses..."
                },
                {
                    "session_id": "abc123-def456",
                    "stage": "complete",
                    "progress": 100,
                    "message": "Analysis complete",
                    "data": {"document_name": "lease.pdf", "total_clauses": 47}
                }
            ]
        }
    }


class ClauseClassification(BaseModel):
    """Single classified clause from document analysis."""
    clause_id: str
    text: str = Field(description="Original clause text from document")
    plain_language: str = Field(description="Plain English explanation")
    category: str = Field(
        description="Category: rights_given_up|one_sided|financial_impact|missing_protection|standard"
    )
    severity: str = Field(description="Severity: critical|warning|info|safe")
    typical_comparison: Optional[str] = Field(
        default=None,
        description="Comparison to industry standard"
    )
    suggestion: Optional[str] = Field(
        default=None,
        description="Negotiation suggestion or alternative language"
    )
    page_number: int = Field(ge=1)
    position: Dict[str, float] = Field(
        description="Bounding box: {x1, y1, x2, y2} in PDF coordinates"
    )
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "clause_id": "clause_1",
                    "text": "Landlord may enter premises with 24-hour notice",
                    "plain_language": "Your landlord can come in after telling you a day before",
                    "category": "rights_given_up",
                    "severity": "warning",
                    "typical_comparison": "Standard leases require 48-hour notice",
                    "suggestion": "Request 48-hour notice clause",
                    "page_number": 2,
                    "position": {"x1": 72, "y1": 450, "x2": 540, "y2": 480}
                }
            ]
        }
    }


class AnalysisResult(BaseModel):
    """Complete document analysis response."""
    document_name: str
    document_type: str = Field(
        description="Detected type: lease|employment|insurance|tos|nda|medical|financial|other"
    )
    total_clauses: int
    flagged_clauses: int = Field(description="Count of non-standard clauses")
    clauses: List[ClauseClassification]
    summary: str = Field(description="Executive summary paragraph")
    top_concerns: List[str] = Field(description="Top 3-5 findings")
    category_counts: Dict[str, int] = Field(
        description="Breakdown by category: {rights_given_up: 3, one_sided: 4, ...}"
    )
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "document_name": "lease.pdf",
                    "document_type": "lease",
                    "total_clauses": 47,
                    "flagged_clauses": 12,
                    "summary": "This lease agreement contains several non-standard clauses...",
                    "top_concerns": [
                        "Landlord entry with only 24-hour notice",
                        "No termination notice requirement",
                        "Auto-renewal at market rate (undefined)"
                    ],
                    "category_counts": {
                        "rights_given_up": 3,
                        "one_sided": 4,
                        "financial_impact": 2,
                        "missing_protection": 3,
                        "standard": 35
                    }
                }
            ]
        }
    }


class SessionStatus(BaseModel):
    """Current status of an analysis session."""
    session_id: str
    document_name: str
    status: SessionStatusEnum
    progress: int
    message: str
    error: Optional[str] = None
    created_at: str
    result: Optional[AnalysisResult] = None


class ChatRequest(BaseModel):
    """Request for document-aware chat."""
    question: str = Field(description="User's question about the document")
    max_tokens: int = Field(default=512, ge=64, le=2048)
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "question": "What are my termination rights?",
                    "max_tokens": 512
                }
            ]
        }
    }


class ChatResponse(BaseModel):
    """Streaming chat response."""
    answer: str
    sources: Optional[List[str]] = Field(
        default=None,
        description="Clause IDs or page references used in answer"
    )


class VoiceSummaryRequest(BaseModel):
    """Request for TTS voice summary generation."""
    text: str = Field(description="Summary text to convert to speech")
    voice: str = Field(default="aura-asteria-en", description="Voice model")
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "text": "This lease contains 12 flagged clauses. Top concerns include...",
                    "voice": "aura-asteria-en"
                }
            ]
        }
    }


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    active_sessions: int
    timestamp: str


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    message: str
    detail: Optional[str] = None
    session_id: Optional[str] = None
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "error": "session_not_found",
                    "message": "Analysis session not found or expired",
                    "detail": "Session abc123 has expired after 30 minutes"
                },
                {
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please wait and try again.",
                    "detail": "Retry after 45 seconds"
                }
            ]
        }
    }
