"""
Analysis Service - Gemini 3.1 Pro integration

Analyzes extracted document text and classifies clauses.
Uses structured JSON output for reliable parsing.
"""
import json
from typing import List, Dict, Any
import structlog

from config import get_settings
from api.schemas import AnalysisResult, ClauseClassification
from core.rate_limiter import get_gemini_limiter
from core.exceptions import AIAnalysisError, ConfigurationError
from prompts.analysis_prompt import ANALYSIS_SYSTEM_PROMPT, ANALYSIS_USER_PROMPT

logger = structlog.get_logger()

settings = get_settings()


class GeminiAnalysisService:
    """
    Gemini AI service for document analysis.
    
    Uses gemini-3.1-pro-preview for deep clause analysis.
    Falls back to gemini-3-flash-preview if pro is unavailable.
    """
    
    def __init__(self):
        self.api_key = settings.gemini_api_key
        self.model_name = settings.gemini_analysis_model
        self._client = None
        
        if not self.api_key:
            raise ConfigurationError("GEMINI_API_KEY not configured")
        
        logger.info(
            "GeminiAnalysisService initialized",
            model=self.model_name
        )
    
    def _get_client(self):
        """Get or create Gemini client."""
        if self._client is None:
            try:
                import google.genai as genai
                self._client = genai.Client(api_key=self.api_key)
                logger.info("Gemini client created")
            except ImportError:
                logger.error("google-genai package not installed")
                raise ConfigurationError("google-genai package required")
        
        return self._client
    
    async def analyze(
        self,
        document_text: str,
        document_name: str = "document.pdf",
        session_id: str = None,
    ) -> AnalysisResult:
        """
        Analyze document and classify clauses.

        Args:
            document_text: Full extracted text from OCR
            document_name: Original filename (for context)
            session_id: Session ID for logging

        Returns:
            AnalysisResult with classified clauses and summary
        """
        logger.info(
            "Starting AI analysis",
            session_id=session_id,
            document=document_name,
            text_length=len(document_text)
        )

        # Rate limiting
        limiter = get_gemini_limiter(
            rpm=settings.gemini_requests_per_minute,
            max_retries=settings.gemini_max_retries
        )

        try:
            # Use rate limiter with function call
            return await limiter.request(
                self._call_gemini,
                document_text,
                document_name,
                session_id
            )

        except Exception as e:
            logger.error("AI analysis failed", session_id=session_id, error=str(e))
            raise AIAnalysisError(
                message=f"AI analysis failed: {str(e)}",
                session_id=session_id
            )
    
    async def _call_gemini(
        self,
        document_text: str,
        document_name: str,
        session_id: str,
    ) -> AnalysisResult:
        """Call Gemini API for analysis."""
        client = self._get_client()

        # Build prompt
        system_prompt = ANALYSIS_SYSTEM_PROMPT
        user_prompt = ANALYSIS_USER_PROMPT.format(
            document_text=document_text,
            document_name=document_name
        )

        logger.info(
            "Calling Gemini API",
            session_id=session_id,
            model=self.model_name
        )
        
        try:
            import google.genai as genai
            
            # Generate response with JSON schema
            response = client.models.generate_content(
                model=self.model_name,
                contents=f"{system_prompt}\n\n{user_prompt}",
                config=genai.types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,  # Low temperature for consistent analysis
                    max_output_tokens=8192,
                )
            )
            
            # Parse JSON response
            response_text = response.text.strip()
            
            # Remove markdown code blocks if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            response_data = json.loads(response_text.strip())
            
            logger.info(
                "Gemini response parsed",
                session_id=session_id,
                clauses_found=len(response_data.get("clauses", []))
            )
            
            # Build AnalysisResult
            return self._build_analysis_result(response_data, document_name)
            
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Gemini JSON response", error=str(e))
            raise AIAnalysisError(
                message=f"Failed to parse AI response: {str(e)}",
                session_id=session_id
            )
        
        except Exception as e:
            logger.error("Gemini API call failed", session_id=session_id, error=str(e))
            raise AIAnalysisError(
                message=f"Gemini API error: {str(e)}",
                session_id=session_id
            )
    
    def _build_analysis_result(
        self,
        response_data: Dict[str, Any],
        document_name: str,
    ) -> AnalysisResult:
        """Build AnalysisResult from Gemini response."""
        clauses_data = response_data.get("clauses", [])
        
        # Build clause classifications
        clauses: List[ClauseClassification] = []
        
        for i, clause_data in enumerate(clauses_data):
            clause = ClauseClassification(
                clause_id=clause_data.get("clause_id", f"clause_{i+1}"),
                text=clause_data.get("text", ""),
                plain_language=clause_data.get("plain_language", ""),
                category=clause_data.get("category", "standard"),
                severity=clause_data.get("severity", "info"),
                typical_comparison=clause_data.get("typical_comparison"),
                suggestion=clause_data.get("suggestion"),
                page_number=clause_data.get("page_number", 1),
                position=clause_data.get("position", {"x1": 0, "y1": 0, "x2": 0, "y2": 0}),
            )
            clauses.append(clause)
        
        # Calculate category counts
        category_counts: Dict[str, int] = {}
        for clause in clauses:
            category_counts[clause.category] = category_counts.get(clause.category, 0) + 1
        
        # Count flagged clauses (non-standard)
        flagged_count = sum(
            1 for c in clauses
            if c.category != "standard"
        )
        
        return AnalysisResult(
            document_name=document_name,
            document_type=response_data.get("document_type", "other"),
            total_clauses=len(clauses),
            flagged_clauses=flagged_count,
            clauses=clauses,
            summary=response_data.get("summary", ""),
            top_concerns=response_data.get("top_concerns", [])[:5],  # Max 5
            category_counts=category_counts,
        )


# Global service instance
_analysis_service: GeminiAnalysisService = None


def get_analysis_service() -> GeminiAnalysisService:
    """Get or create the analysis service instance."""
    global _analysis_service
    if _analysis_service is None:
        _analysis_service = GeminiAnalysisService()
    return _analysis_service


async def analyze_document_with_gemini(
    document_text: str,
    document_name: str = "document.pdf",
    session_id: str = None,
) -> AnalysisResult:
    """Convenience function for document analysis."""
    service = get_analysis_service()
    return await service.analyze(document_text, document_name, session_id)
