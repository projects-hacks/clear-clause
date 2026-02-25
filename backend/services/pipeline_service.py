"""
Pipeline Service - Orchestrates the full analysis workflow

Coordinates OCR → AI Analysis → Result packaging with progress tracking.
"""
import asyncio
import json
from datetime import datetime
from typing import Optional
import structlog

from services.session_manager import SessionManager, SessionStatus as SessionStatusEnum
from services.ocr_service import extract_text_with_apryse
from services.analysis_service import analyze_document_with_gemini
from core.exceptions import AnalysisError, OCRError, AIAnalysisError

logger = structlog.get_logger()


async def run_analysis_pipeline(
    session_id: str,
    temp_file_path: str,
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
        temp_file_path: Path to uploaded PDF file
        session_manager: Session manager for progress updates
    """
    try:
        logger.info("Pipeline started", session_id=session_id)
        
        # ========== Stage 1: OCR Text Extraction ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.EXTRACTING,
            progress=20,
            message="Extracting text with Apryse OCR..."
        )
        
        logger.info("Stage 1: OCR extraction started", session_id=session_id)
        
        try:
            ocr_result = await extract_text_with_apryse(temp_file_path)
            
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
        
        # ========== Stage 2: AI Clause Analysis ==========
        await session_manager.update_session(
            session_id=session_id,
            status=SessionStatusEnum.ANALYZING,
            progress=50,
            message="AI analyzing document clauses..."
        )
        
        logger.info("Stage 2: AI analysis started", session_id=session_id)
        
        try:
            analysis_result = await analyze_document_with_gemini(
                document_text=ocr_result.full_text,
                document_name=session_manager._sessions[session_id].document_name if session_id in session_manager._sessions else "document.pdf",
                session_id=session_id,
            )
            
            # Calculate flagged clause count
            flagged_count = sum(
                1 for clause in analysis_result.clauses
                if clause.category != "standard"
            )
            
            await session_manager.update_session(
                session_id=session_id,
                status=SessionStatusEnum.ANALYZING,
                progress=80,
                message=f"Classified {len(analysis_result.clauses)} clauses ({flagged_count} flagged)"
            )
            
            logger.info(
                "AI analysis complete",
                session_id=session_id,
                total_clauses=len(analysis_result.clauses),
                flagged_clauses=flagged_count
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
        
        logger.info(
            "Pipeline complete",
            session_id=session_id,
            document_name=session_manager._sessions[session_id].document_name if session_id in session_manager._sessions else "document.pdf"
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
