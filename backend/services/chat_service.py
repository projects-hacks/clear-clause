"""
Chat Service - Document-aware Q&A with Gemini 3 Flash

Provides fast, conversational responses about analyzed documents.
The heavy document analysis (clause classification, summary, PII redaction)
is performed once up-front in the analysis pipeline. Here we:

- Take the stored `AnalysisResult` for a session
- Select the most relevant clauses/sections for the current question
- Build a focused prompt for Gemini Flash using overall summary + top
  concerns + a subset of clauses likely relevant to the question.
"""
import structlog

from config import get_settings
from api.schemas import ChatResponse, AnalysisResult
from core.rate_limiter import get_gemini_limiter
from prompts.analysis_prompt import CHAT_SYSTEM_PROMPT, CHAT_USER_PROMPT

logger = structlog.get_logger()

settings = get_settings()


def _select_relevant_clauses(
    question: str,
    clauses: list[dict],
    max_clauses: int = 15,
) -> list[dict]:
    """
    Lightweight retrieval over clauses for the current question.

    This avoids re-running analysis and keeps the LLM prompt focused while
    still being fully derived from the already-computed AnalysisResult.
    """
    if not clauses:
        return []

    q = (question or "").lower()
    if not q.strip():
        return clauses[:max_clauses]

    # Very small stopword list just to avoid scoring on glue words.
    stopwords = {
        "the", "a", "an", "and", "or", "of", "to", "in", "on",
        "for", "with", "about", "my", "our", "your", "this", "that",
    }
    import re

    tokens = [t for t in re.findall(r"\\w+", q) if t not in stopwords]
    if not tokens:
        return clauses[:max_clauses]

    def score_clause(clause: dict) -> float:
        text = " ".join([
            str(clause.get("plain_language", "")),
            str(clause.get("text", "")),
            str(clause.get("category", "")),
        ]).lower()
        if not text:
            return 0.0

        matches = sum(1 for t in tokens if t in text)

        # Severity boost so critical/warning issues bubble up.
        severity = str(clause.get("severity", "")).lower()
        if severity == "critical":
            matches *= 3
        elif severity == "warning":
            matches *= 2

        return float(matches)

    scored = [(score_clause(c), c) for c in clauses]
    scored.sort(key=lambda x: x[0], reverse=True)

    # If everything scored 0, just fall back to the first N clauses
    # (typically already ordered by appearance in the document).
    if scored and scored[0][0] <= 0:
        return clauses[:max_clauses]

    return [c for s, c in scored[:max_clauses] if s > 0]


async def chat_with_document(
    question: str,
    document_context: dict,
    max_tokens: int = 512,
) -> ChatResponse:
    """
    Answer a question about an analyzed document.

    Uses Gemini 3 Flash for fast, low-latency responses.

    Args:
        question: User's question
        document_context: Analysis result dict from earlier analysis
        max_tokens: Max tokens in response

    Returns:
        ChatResponse with answer and source references
    """
    logger.info(
        "Chat request",
        document=document_context.get('document_name', 'unknown'),
        question=question,
        max_tokens=max_tokens
    )

    # Rate limiting
    limiter = get_gemini_limiter(rpm=15, max_retries=3)  # Higher limit for chat

    try:
        # Use rate limiter with function call
        return await limiter.request(
            _call_gemini_chat,
            question,
            document_context,
            max_tokens
        )
    except Exception as e:
        logger.error("Chat failed", error=str(e))
        return ChatResponse(
            answer=f"I apologize, but I encountered an error processing your question: {str(e)}",
            sources=None,
        )


async def _call_gemini_chat(
    question: str,
    document_context: dict,
    max_tokens: int,
) -> ChatResponse:
    """Call Gemini for chat response."""
    try:
        import google.genai as genai
        
        client = genai.Client(api_key=settings.gemini_api_key)
        
        # Prepare clauses summary for context
        clauses_summary: list[str] = []
        all_clauses = document_context.get('clauses', [])
        # Focus on clauses that are likely relevant to this specific question
        clauses = _select_relevant_clauses(question, all_clauses, max_clauses=15)
        for clause in clauses:
            clause_id = clause.get('clause_id', 'unknown')
            text = clause.get('text', '')  # Full text
            plain = clause.get('plain_language', '')
            category = clause.get('category', 'unknown')
            severity = clause.get('severity', 'unknown')
            clauses_summary.append(
                f"--- Clause: {clause_id} ---\n"
                f"Category: {category}\n"
                f"Severity: {severity}\n"
                f"Original Text: {text}\n"
                f"Plain Language: {plain}\n"
            )
        clauses_text = "\n".join(clauses_summary)
        
        # Build prompt
        user_prompt = CHAT_USER_PROMPT.format(
            document_name=document_context.get('document_name', 'Unknown'),
            document_type=document_context.get('document_type', 'Unknown'),
            document_text=document_context.get('document_text', 'No text available'),
            summary=document_context.get('summary', 'No summary available'),
            top_concerns="\n".join(f"- {c}" for c in document_context.get('top_concerns', [])),
            clauses_json=clauses_text,
            question=question,
        )
        
        # Generate response
        response = client.models.generate_content(
            model=settings.gemini_chat_model,
            contents=f"{CHAT_SYSTEM_PROMPT}\n\n{user_prompt}",
            config=genai.types.GenerateContentConfig(
                temperature=0.3,  # Slightly higher for conversational tone
                max_output_tokens=max_tokens,
            )
        )
        
        answer = response.text.strip()
        
        # Extract clause references from answer
        sources = _extract_clause_references(answer)
        
        logger.info("Chat response generated", sources=sources)
        
        return ChatResponse(
            answer=answer,
            sources=sources if sources else None,
        )
        
    except Exception as e:
        logger.error("Gemini chat call failed", error=str(e))
        raise


def _extract_clause_references(text: str) -> list[str]:
    """Extract clause IDs mentioned in the response."""
    import re
    
    # Look for patterns like "clause_1", "Section 8.1", etc.
    clause_pattern = r'clause_\d+'
    section_pattern = r'Section\s+[\d.]+'
    
    sources = []
    
    # Find clause references
    clause_matches = re.findall(clause_pattern, text, re.IGNORECASE)
    sources.extend(clause_matches)
    
    # Find section references
    section_matches = re.findall(section_pattern, text, re.IGNORECASE)
    sources.extend(section_matches)
    
    return list(set(sources))  # Remove duplicates
