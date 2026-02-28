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
import asyncio
import json
import structlog
import re
from typing import AsyncGenerator

from config import get_settings
from api.schemas import ChatResponse, AnalysisResult
from core.rate_limiter import get_gemini_limiter
from prompts.analysis_prompt import CHAT_SYSTEM_PROMPT, CHAT_USER_PROMPT
from services.vector_store import (
    is_vector_store_enabled,
    get_top_clause_ids_for_question,
)

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

    tokens = [t for t in re.findall(r"\w+", q) if t not in stopwords]
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
    max_tokens: int = 2048,
    session_id: str | None = None,
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Answer a question about an analyzed document using SSE streaming.

    Uses Gemini Flash for fast, conversational responses.

    Args:
        question: User's question
        document_context: Analysis result dict from earlier analysis
        max_tokens: Max tokens in response
        session_id: The analysis session ID
        history: Previous chat messages for context

    Yields:
        Server-Sent Events (SSE) strings containing text chunks
    """
    logger.info(
        "Chat request (streaming)",
        document=document_context.get('document_name', 'unknown'),
        question=question,
        max_tokens=max_tokens,
        history_length=len(history) if history else 0
    )

    try:
        # Directly call the streaming generator
        async for chunk in _call_gemini_chat_stream(
            question=question,
            document_context=document_context,
            max_tokens=max_tokens,
            session_id=session_id,
            history=history,
        ):
            yield chunk
            
    except Exception as e:
        logger.error("Chat streaming failed", error=str(e))
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def _call_gemini_chat_stream(
    question: str,
    document_context: dict,
    max_tokens: int,
    session_id: str | None = None,
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Call Gemini for chat response."""
    try:
        import google.genai as genai
        
        client = genai.Client(api_key=settings.gemini_api_key)
        
        # Prepare clauses summary for context
        clauses_summary: list[str] = []
        all_clauses = document_context.get('clauses', [])

        # Prefer semantic retrieval via vector store when available.
        clauses: list[dict]
        if session_id and is_vector_store_enabled():
            try:
                top_ids = await get_top_clause_ids_for_question(
                    session_id=session_id,
                    question=question,
                    top_k=15,
                )
                id_set = set(top_ids)
                clauses = [c for c in all_clauses if c.get("clause_id") in id_set]
                # Fallback to keyword scoring if vector store returns nothing
                if not clauses:
                    clauses = _select_relevant_clauses(question, all_clauses, max_clauses=15)
            except Exception as e:
                logger.warning("Vector-based clause retrieval failed; falling back", error=str(e))
                clauses = _select_relevant_clauses(question, all_clauses, max_clauses=15)
        else:
            # Keyword / severity-based retrieval (previous behaviour)
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
        
        # Format conversation history
        history_text = ""
        if history:
            history_text = "Conversation History:\n"
            # Take the last 6 messages to keep context window reasonable
            for msg in history[-6:]:
                role = "User: " if msg.get("role") == "user" else "Assistant: "
                # Replace actual newlines in messages so they read as a block per message
                content = (msg.get("content") or "").replace("\n", " ")
                history_text += f"{role}{content}\n"
            history_text += "\n---"

        # Build prompt
        user_prompt = CHAT_USER_PROMPT.format(
            document_name=document_context.get('document_name', 'Unknown'),
            document_type=document_context.get('document_type', 'Unknown'),
            document_text=document_context.get('document_text', 'No text available'),
            summary=document_context.get('summary', 'No summary available'),
            top_concerns="\n".join(f"- {c}" for c in document_context.get('top_concerns', [])),
            clauses_json=clauses_text,
            history_text=history_text,
            question=question,
        )
        
        # Generate streamed response
        # The Gemini SDK's generate_content_stream() iterator is synchronous
        # and blocks the event loop on each chunk.  We offload iteration to a
        # thread and bridge chunks back via an asyncio.Queue so the event loop
        # stays responsive for health-checks and concurrent requests.
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()  # marks end of stream

        def _stream_in_thread():
            """Run in a worker thread — blocks on the sync iterator."""
            try:
                stream = client.models.generate_content_stream(
                    model=settings.gemini_chat_model,
                    contents=f"{CHAT_SYSTEM_PROMPT}\n\n{user_prompt}",
                    config=genai.types.GenerateContentConfig(
                        temperature=0.3,
                        max_output_tokens=max_tokens,
                    )
                )
                for chunk in stream:
                    if chunk.text:
                        queue.put_nowait(chunk.text)
            except Exception as exc:
                queue.put_nowait(exc)
            finally:
                queue.put_nowait(_SENTINEL)

        # Start the blocking stream in a background thread
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _stream_in_thread)

        full_answer = ""

        # Consume chunks asynchronously
        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            if isinstance(item, Exception):
                raise item
            full_answer += item
            yield f"data: {json.dumps({'text': item})}\n\n"
        
        # After completing the text stream, quickly parse it for clause references
        # and send them as the final chunk
        sources = _extract_clause_references(full_answer.strip())
        if sources:
            yield f"data: {json.dumps({'sources': sources})}\n\n"
            
        logger.info("Chat response stream completed", sources=sources)
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        logger.error("Gemini chat call failed", error=str(e))
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


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
