"""
API Router - All route definitions

Thin controllers that delegate to services.
"""
import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import structlog

from api.schemas import (
    AnalysisProgressEvent,
    AnalysisResult,
    SessionStatus,
    ChatRequest,
    ChatResponse,
    VoiceSummaryRequest,
    HealthResponse,
    ErrorResponse,
)
from api.dependencies import (
    get_session_manager_dep,
    validate_session,
    check_concurrent_limit,
    validate_file_upload,
    get_settings_dep,
)
from services.session_manager import SessionManager, AnalysisSession, SessionStatus as SessionStatusEnum
from config import Settings
from core.exceptions import AnalysisError, FileValidationError

logger = structlog.get_logger()

router = APIRouter()


# SSE event generator
async def progress_event_generator(
    session_id: str,
    session_manager: SessionManager,
) -> AsyncGenerator[str, None]:
    """
    Server-Sent Events generator for streaming progress.
    
    Yields SSE-formatted progress events to client.
    Client receives: data: {"session_id": "...", "stage": "...", ...}\n\n
    """
    while True:
        session = await session_manager.get_session(session_id)
        
        if session is None:
            # Session expired or deleted
            yield f"data: {json.dumps({'error': 'Session expired'})}\n\n"
            break
        
        # Send current progress
        event = AnalysisProgressEvent(
            session_id=session.session_id,
            stage=SessionStatusEnum(session.status.value),
            progress=session.progress,
            message=session.message,
            data=session.result if session.status == SessionStatusEnum.COMPLETE else None,
        )
        
        yield f"data: {json.dumps(event.model_dump())}\n\n"
        
        # Stop streaming if complete or error
        if session.status in [SessionStatusEnum.COMPLETE, SessionStatusEnum.ERROR]:
            break
        
        # Poll every 500ms
        await asyncio.sleep(0.5)


@router.post("/analyze")
async def analyze_document(
    file: UploadFile = File(..., description="PDF document to analyze"),
    session_manager: SessionManager = Depends(get_session_manager_dep),
    settings: Settings = Depends(get_settings_dep),
) -> StreamingResponse:
    """
    Upload a PDF document and start analysis pipeline.
    
    Returns SSE stream with progress updates:
    - uploading: Document received, validating
    - extracting: OCR text extraction in progress
    - analyzing: AI clause classification in progress
    - complete: Analysis finished, result data included
    - error: Analysis failed, error message included
    
    Client should open EventSource to /api/analyze/{session_id}
    after uploading to receive progress updates.
    """
    try:
        # Read file bytes
        file_bytes = await file.read()
        
        # Validate file
        safe_filename = validate_file_upload(
            file_bytes=file_bytes,
            filename=file.filename or "document.pdf",
            content_type=file.content_type or "application/octet-stream",
            settings=settings,
        )
        
        # Check concurrent limit
        await check_concurrent_limit(session_manager=session_manager, settings=settings)
        
        # Create new session
        session = await session_manager.create_session(document_name=safe_filename)
        
        logger.info(
            "Document upload started",
            session_id=session.session_id,
            filename=safe_filename,
            size_bytes=len(file_bytes)
        )
        
        # Save temp file for pipeline processing
        import os
        import tempfile
        
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, f"{session.session_id}.pdf")
        
        with open(temp_path, "wb") as f:
            f.write(file_bytes)
        
        session.temp_file_path = temp_path
        await session_manager.update_session(
            session_id=session.session_id,
            status=SessionStatusEnum.UPLOADING,
            progress=10,
            message="Document received, starting analysis..."
        )
        
        # Start pipeline in background (don't block SSE response)
        from services.pipeline_service import run_analysis_pipeline
        
        asyncio.create_task(
            run_analysis_pipeline(
                session_id=session.session_id,
                temp_file_path=temp_path,
                session_manager=session_manager,
            )
        )
        
        # Return SSE stream for progress updates
        return StreamingResponse(
            progress_event_generator(session.session_id, session_manager),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Session-ID": session.session_id,
            },
        )
        
    except FileValidationError as e:
        logger.warning("File validation failed", error=e.message)
        # Capture values outside the generator to avoid NameError once the except scope exits
        error_code = e.error_code
        message = e.message

        async def error_generator():
            yield f"data: {json.dumps({'error': error_code, 'message': message})}\n\n"

        return StreamingResponse(
            error_generator(),
            media_type="text/event-stream",
            status_code=400,
        )
    
    except HTTPException as e:
        # Concurrent limit reached
        async def error_generator():
            yield f"data: {json.dumps({'error': 'service_unavailable', 'message': e.detail})}\n\n"
        
        return StreamingResponse(
            error_generator(),
            media_type="text/event-stream",
            status_code=e.status_code,
        )


@router.get("/analyze/{session_id}")
async def get_analysis_status(
    session: AnalysisSession = Depends(validate_session),
) -> SessionStatus:
    """
    Get current status of an analysis session.

    Polling alternative to SSE stream.
    """
    return SessionStatus(
        session_id=session.session_id,
        document_name=session.document_name,
        status=SessionStatusEnum(session.status.value),
        progress=session.progress,
        message=session.message,
        error=session.error,
        created_at=session.created_at.isoformat(),
        result=session.result,
    )


@router.get("/documents/{session_id}")
async def get_document(
    session: AnalysisSession = Depends(validate_session),
):
    """
    Serve the uploaded PDF document for WebViewer.

    Returns the original PDF file for display in Apryse WebViewer.
    """
    import os
    from fastapi.responses import FileResponse

    if not session.temp_file_path or not os.path.exists(session.temp_file_path):
        raise HTTPException(
            status_code=404,
            detail="Document file not found"
        )

    return FileResponse(
        session.temp_file_path,
        media_type="application/pdf",
        filename=session.document_name,
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    session: AnalysisSession = Depends(validate_session),
) -> ChatResponse:
    """
    Ask a question about an analyzed document.
    
    Uses Gemini 3 Flash for fast, conversational responses.
    Response includes answer and source clause references.
    """
    from services.chat_service import chat_with_document
    
    if session.result is None:
        raise HTTPException(
            status_code=400,
            detail="Document analysis not complete yet"
        )
    
    logger.info(
        "Chat request",
        session_id=session.session_id,
        question=request.question
    )
    
    response = await chat_with_document(
        question=request.question,
        document_context=session.result,
        max_tokens=request.max_tokens,
        session_id=session.session_id,
    )
    
    return response


@router.post("/transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    session: AnalysisSession = Depends(validate_session),
) -> dict:
    """
    Transcribe audio from user microphone using Deepgram Nova-2.
    """
    from services.stt_service import transcribe_audio
    
    logger.info("Transcription request", session_id=session.session_id)
    
    try:
        audio_bytes = await file.read()
        transcript = await transcribe_audio(audio_bytes)
        return {"transcript": transcript}
    except Exception as e:
        logger.error("Transcription failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.post("/voice-summary")
async def voice_summary(
    request: VoiceSummaryRequest,
    session: AnalysisSession = Depends(validate_session),
) -> StreamingResponse:
    """
    Generate voice summary of analysis findings.
    
    Uses Deepgram Aura-2 TTS to convert summary text to audio.
    Returns audio stream (WAV format).
    """
    from services.tts_service import generate_voice_summary
    
    if session.result is None:
        raise HTTPException(
            status_code=400,
            detail="Document analysis not complete yet"
        )
    
    logger.info(
        "Voice summary request",
        session_id=session.session_id,
        text_length=len(request.text)
    )
    
    audio_bytes = await generate_voice_summary(
        text=request.text,
        voice=request.voice,
    )
    
    # Return audio stream
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/wav",
        headers={
            "Content-Disposition": f"attachment; filename=summary_{session.session_id}.wav",
        },
    )


@router.get("/sessions")
async def list_sessions(
    session_manager: SessionManager = Depends(get_session_manager_dep),
) -> list[SessionStatus]:
    """
    List all active analysis sessions.
    
    Admin/debugging endpoint - may be restricted in production.
    """
    sessions = await session_manager.list_sessions()
    
    return [
        SessionStatus(
            session_id=s.session_id,
            document_name=s.document_name,
            status=SessionStatusEnum(s.status.value),
            progress=s.progress,
            message=s.message,
            error=s.error,
            created_at=s.created_at.isoformat(),
            result=s.result,
        )
        for s in sessions
    ]


@router.delete("/session/{session_id}")
async def cancel_session(
    session: AnalysisSession = Depends(validate_session),
    session_manager: SessionManager = Depends(get_session_manager_dep),
) -> dict:
    """
    Cancel an analysis session and clean up resources.
    
    Stops pipeline execution and deletes session data.
    """
    success = await session_manager.delete_session(session.session_id)
    
    logger.info("Session cancelled", session_id=session.session_id)
    
    return {
        "status": "ok",
        "message": "Session cancelled successfully",
        "session_id": session.session_id,
    }
