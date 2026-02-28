"""
Pipeline Service - Orchestrates the full analysis workflow

Coordinates OCR → AI Analysis → Result packaging with progress tracking.
"""
import asyncio
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import structlog

from services.session_manager import SessionManager, SessionStatus as SessionStatusEnum
from services.ocr_service import extract_text_with_apryse, OCRResult
from services.analysis_service import analyze_document_with_gemini
from services.pii_service import redact_text, restore_pii
from services.vector_store import index_clause_embeddings_for_session
from core.exceptions import AnalysisError, OCRError, AIAnalysisError

logger = structlog.get_logger()


def match_clause_positions(
    analysis_result,
    ocr_result: OCRResult,
) -> None:
    """
    Match clause text against OCR word positions to compute bounding boxes.

    For each clause:
    1. Search OCR words for subsequences matching the clause text
    2. Compute union bounding box of matched words
    3. Update clause.position and clause.page_number

    Modifies analysis_result.clauses in place.
    """
    import re

    # Common words that appear everywhere in legal text and cause false positives
    STOPWORDS = {
        "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at",
        "by", "is", "be", "as", "it", "if", "no", "do", "so", "we", "he",
        "she", "my", "me", "am", "us", "up", "all", "any", "its", "our",
        "may", "can", "has", "had", "was", "are", "not", "but", "you",
        "your", "this", "that", "with", "will", "from", "such", "been",
        "have", "each", "than", "also", "into", "more", "only", "upon",
        "then", "them", "they", "their", "these", "those", "does", "did",
        "shall", "would", "could", "should", "which", "what", "when",
        "where", "who", "whom", "how", "very", "just", "both", "some",
        "other", "about", "after", "before", "between", "under", "over",
    }

    def _normalize(word: str) -> str:
        """Strip punctuation and lowercase."""
        return re.sub(r'[^\w]', '', word.lower().strip())

    # Build a searchable index of words by page
    words_by_page: Dict[int, List[Dict[str, Any]]] = {}

    for page in ocr_result.pages:
        words_by_page[page.page_number] = [
            {"text": _normalize(w.text), "raw": w.text, "bbox": w.bbox}
            for w in page.words
            if _normalize(w.text)  # skip empty after normalization
        ]

    # Process each clause
    for clause in analysis_result.clauses:
        clause_text = clause.text.lower().strip()

        # Extract meaningful words from clause (skip stopwords for scoring)
        all_clause_words = [_normalize(w) for w in clause_text.split() if _normalize(w)]
        scoring_words = [w for w in all_clause_words if w not in STOPWORDS and len(w) > 2]

        if len(scoring_words) < 2:
            # Too few meaningful words — use page 1 default
            clause.page_number = clause.page_number or 1
            clause.position = {"x1": 72, "y1": 100, "x2": 540, "y2": 150}
            continue

        best_match = None
        best_match_score = 0.0
        found_excellent = False

        for page_num, page_words in words_by_page.items():
            if not page_words or found_excellent:
                continue

            # Build a set of unique words on this page for fast lookup
            page_word_set = {w["text"] for w in page_words}

            # Quick check: at least 40% of scoring words must exist on this page
            page_hit_count = sum(1 for sw in scoring_words if sw in page_word_set)
            if page_hit_count / len(scoring_words) < 0.4:
                continue

            # Use a window ~2x the clause word count to allow for OCR gaps
            window_size = min(len(page_words), max(len(all_clause_words) * 2, 20))

            for i in range(len(page_words) - min(window_size, len(page_words)) + 1):
                window = page_words[i : i + window_size]
                window_word_set = {w["text"] for w in window}

                # Count scoring words that appear in the window (exact word match)
                matched_scoring = [sw for sw in scoring_words if sw in window_word_set]
                match_score = len(matched_scoring) / len(scoring_words)

                if match_score > best_match_score and match_score >= 0.5:
                    best_match_score = match_score

                    # Compute TIGHT bounding box using only matched words
                    matched_set = set(matched_scoring)
                    matched_page_words = [w for w in window if w["text"] in matched_set]

                    if matched_page_words:
                        x1 = min(w["bbox"]["x1"] for w in matched_page_words)
                        y1 = min(w["bbox"]["y1"] for w in matched_page_words)
                        x2 = max(w["bbox"]["x2"] for w in matched_page_words)
                        y2 = max(w["bbox"]["y2"] for w in matched_page_words)

                        best_match = {
                            "page_number": page_num,
                            "position": {
                                "x1": x1,
                                "y1": y1,
                                "x2": x2,
                                "y2": y2,
                            },
                        }

                    if best_match_score >= 0.90:
                        found_excellent = True
                        break

        # Update clause with position if found
        if best_match:
            clause.page_number = best_match["page_number"]
            clause.position = best_match["position"]
        else:
            # Fallback: keep existing page_number or use page 1
            clause.page_number = clause.page_number or 1
            clause.position = {"x1": 72, "y1": 100, "x2": 540, "y2": 150}

        logger.debug(
            "Clause position matched",
            clause_id=clause.clause_id,
            page=clause.page_number,
            match_score=best_match_score
        )


async def run_analysis_pipeline(
    session_id: str,
    session_manager: SessionManager,
) -> None:
    """
    Run the complete analysis pipeline for a document.
    
    Pipeline stages:
    1. OCR Text Extraction (Apryse)
    2. AI Clause Analysis (Gemini 3.1 Pro)
    3. Result Packaging & Storage
    
    Each stage updates session progress via session_manager.
    Errors at any stage are captured and stored in session.
    
    Args:
        session_id: Unique session identifier
        session_manager: Session manager for progress updates
    """
    temp_path = None
    try:
        logger.info("Pipeline started", session_id=session_id)
        
        session = await session_manager.get_session(session_id)
        if not session or not session.document_bytes:
            raise AnalysisError("Failed to start pipeline: document bytes missing", session_id)
            
        import tempfile
        import os
        
        # Write bytes to temp file since Apryse/PyPDF2 require file paths
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"{session_id}_pipeline.pdf")
        with open(temp_path, "wb") as f:
            f.write(session.document_bytes)
        
        # ========== Stage 1: OCR Text Extraction (roughly first 20% of work) ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.EXTRACTING,
            progress=20,
            message="Extracting text with Apryse OCR..."
        )
        
        logger.info("Stage 1: OCR extraction started", session_id=session_id)
        
        try:
            ocr_result = await extract_text_with_apryse(temp_path)
            
            await session_manager.update_session(
                session_id=session_id,
                status=SessionStatusEnum.EXTRACTING,
                progress=40,
                message=f"Extracted {ocr_result.metadata['page_count']} pages successfully"
            )
            
            logger.info(
                "OCR extraction complete",
                session_id=session_id,
                pages=ocr_result.metadata['page_count'],
                word_count=ocr_result.metadata.get('word_count', 0)
            )
            
        except Exception as e:
            logger.error("OCR extraction failed", session_id=session_id, error=str(e))
            raise OCRError(
                message=f"Failed to extract text: {str(e)}",
                session_id=session_id
            )
            
        # ========== Stage 1.5: PII Redaction ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.REDACTING,
            progress=45,
            message="🛡️ Scanning for personal information..."
        )
        
        redacted_text, pii_map, pii_categories = redact_text(ocr_result.full_text)
        
        # Log redaction metrics
        if pii_map:
            logger.info("PII Redacted", session_id=session_id, items=len(pii_map), categories=pii_categories)
            await session_manager.update_session(
                session_id=session_id,
                status=SessionStatusEnum.REDACTING,
                progress=50,
                message=f"🛡️ Redacted {len(pii_map)} PII items before AI analysis"
            )
        else:
            await session_manager.update_session(
                session_id=session_id,
                status=SessionStatusEnum.REDACTING,
                progress=50,
                message="No PII detected, proceeding to analysis..."
            )
        
        # ========== Stage 2: AI Clause Analysis (majority of work) ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ANALYZING,
            progress=70,
            message="AI analyzing document clauses... This is where most of the work happens."
        )
        
        logger.info("Stage 2: AI analysis started", session_id=session_id)
        
        try:
            # Pass REDACTED text to Gemini, not raw OCR text
            session = await session_manager.get_session(session_id)
            document_name = session.document_name if session else 'document.pdf'

            async def _progress_updater():
                messages = [
                    (72, "Reading document structure..."),
                    (75, "Identifying clauses..."),
                    (78, "Classifying risk levels..."),
                    (82, "Comparing against typical standards..."),
                    (85, "Generating plain language summaries..."),
                    (88, "Finalizing clause analysis..."),
                ]
                try:
                    for prog, msg in messages:
                        await asyncio.sleep(4)
                        await session_manager.update_session(
                            session_id=session_id,
                            status=SessionStatusEnum.ANALYZING,
                            progress=prog,
                            message=msg
                        )
                except asyncio.CancelledError:
                    pass

            # Start updating progress in the background
            loop = asyncio.get_running_loop()
            progress_task = loop.create_task(_progress_updater())

            try:
                analysis_result = await analyze_document_with_gemini(
                    document_text=redacted_text,
                    document_name=document_name,
                    session_id=session_id,
                )
            finally:
                progress_task.cancel()
            
            # Store PII stats in the result
            analysis_result.pii_redacted_count = len(pii_map)
            analysis_result.pii_categories = pii_categories
            
            # Restore PII into the clause text for the viewer (so highlighting matches)
            # We ONLY do this for the final output, Gemini never saw the PII
            if pii_map:
                for clause in analysis_result.clauses:
                    clause.text = restore_pii(clause.text, pii_map)
                
                # Also restore the summary if it hallucinated a redaction tag
                analysis_result.summary = restore_pii(analysis_result.summary, pii_map)
                
                # Update the full document context for future chat to have the restored text
                analysis_result.document_text = ocr_result.full_text

            # Match clause positions using OCR word data
            logger.info("Matching clause positions...", session_id=session_id)
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, match_clause_positions, analysis_result, ocr_result)

            # Calculate flagged clause count
            flagged_count = sum(
                1 for clause in analysis_result.clauses
                if clause.category != "standard"
            )
            
            # Move progress closer to completion as AI wraps up
            await session_manager.update_session(
                session_id=session_id,
                status=SessionStatusEnum.ANALYZING,
                progress=90,
                message=f"Classified {len(analysis_result.clauses)} clauses ({flagged_count} flagged)"
            )
            
            logger.info(
                "AI analysis complete",
                session_id=session_id,
                total_clauses=len(analysis_result.clauses),
                flagged_clauses=flagged_count
            )

            # ========== Stage 2.5: Index clause embeddings for semantic chat ==========
            try:
                await index_clause_embeddings_for_session(
                    session_id=session_id,
                    clauses=analysis_result.clauses,
                )
            except Exception as e:
                # Indexing failures should never break the main analysis pipeline.
                logger.warning(
                    "Clause embedding indexing failed",
                    session_id=session_id,
                    error=str(e),
                )
            
        except Exception as e:
            logger.error("AI analysis failed", session_id=session_id, error=str(e))
            raise AIAnalysisError(
                message=f"Failed to analyze document: {str(e)}",
                session_id=session_id
            )
        
        # ========== Stage 3: Result Packaging ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.COMPLETE,
            progress=100,
            message="Analysis complete!",
            result=analysis_result.model_dump()
        )
        
        session = await session_manager.get_session(session_id)
        document_name = session.document_name if session else 'document.pdf'

        logger.info(
            "Pipeline complete",
            session_id=session_id,
            document_name=document_name,
        )
        
    except OCRError as e:
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ERROR,
            progress=30,
            error=str(e),
            message="Failed to extract text from document"
        )
    
    except AIAnalysisError as e:
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ERROR,
            progress=60,
            error=str(e),
            message="Failed to analyze document with AI"
        )
    
    except AnalysisError as e:
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ERROR,
            progress=e.status_code,
            error=e.message,
            message="Analysis failed"
        )
    
    except Exception as e:
        logger.error("Unexpected pipeline error", session_id=session_id, error=str(e), exc_info=True)
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ERROR,
            progress=0,
            error=f"Unexpected error: {str(e)}",
            message="An unexpected error occurred"
        )
    finally:
        if temp_path:
            try:
                import os
                os.remove(temp_path)
            except OSError:
                pass
