"""
ClearClause Backend - FastAPI Application Entry Point

Multi-document concurrent analysis server with:
- Session-based tracking for multiple uploads
- SSE streaming for real-time progress
- CORS for frontend communication
- Graceful shutdown with cleanup
"""
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from config import get_settings
from api.router import router
from services.session_manager import init_session_manager, shutdown_session_manager
from core.logger import setup_logging
from core.exceptions import ClearClauseException, RateLimitExceeded, SessionNotFound

# Setup structured logging
setup_logging()
logger = structlog.get_logger()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    
    Startup:
    - Initialize logging
    - Start session manager with cleanup task
    - Log startup info
    
    Shutdown:
    - Stop session cleanup task
    - Clean up all active sessions
    - Log shutdown info
    """
    # Startup
    logger.info("ClearClause backend starting up")
    
    # Initialize session manager
    await init_session_manager(
        ttl_minutes=settings.session_ttl_minutes,
        cleanup_interval=settings.cleanup_interval_minutes
    )
    
    logger.info(
        "Session manager initialized",
        ttl_minutes=settings.session_ttl_minutes,
        cleanup_interval=settings.cleanup_interval_minutes
    )
    
    yield
    
    # Shutdown
    logger.info("ClearClause backend shutting down")
    await shutdown_session_manager()
    logger.info("All sessions cleaned up")


# Initialize FastAPI app
app = FastAPI(
    title="ClearClause API",
    description="Document analysis API with OCR + AI clause classification",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware - allow all origins for development
# In production, restrict to specific domains
# Note: allow_credentials=True with allow_origins=["*"] is invalid per CORS spec
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "https://clearclause.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-ID"],
)


# Global exception handlers
@app.exception_handler(ClearClauseException)
async def clearclause_exception_handler(request: Request, exc: ClearClauseException):
    """Handle custom ClearClause exceptions."""
    logger.warning(
        "ClearClause exception",
        error=exc.error_code,
        message=exc.message,
        path=request.url.path
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "detail": exc.detail,
            "session_id": exc.session_id,
        },
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Handle rate limit exceeded errors."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please wait and try again.",
            "detail": f"Retry after {exc.retry_after} seconds",
        },
        headers={"Retry-After": str(exc.retry_after)},
    )


@app.exception_handler(SessionNotFound)
async def session_not_found_handler(request: Request, exc: SessionNotFound):
    """Handle session not found errors."""
    return JSONResponse(
        status_code=404,
        content={
            "error": "session_not_found",
            "message": "Analysis session not found or expired",
            "detail": exc.detail,
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error(
        "Unexpected error",
        error=str(exc),
        path=request.url.path,
        exc_info=True
    )
    
    # Get detail from exception if available
    detail = str(exc) if settings.log_level == "DEBUG" else None
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred",
            "detail": detail,
            "error_type": type(exc).__name__,
        },
    )


# Mount API router
app.include_router(router, prefix="/api")


# Health check endpoint
@app.get("/health", response_model=dict)
async def health_check():
    """
    Health check for Kubernetes liveness/readiness probes.
    
    Returns OK if server is running and session manager is healthy.
    """
    from services.session_manager import get_session_manager
    
    try:
        session_manager = get_session_manager()
        active_sessions = await session_manager.get_active_session_count()
    except RuntimeError:
        active_sessions = 0
    
    return {
        "status": "ok",
        "version": "1.0.0",
        "active_sessions": active_sessions,
        "timestamp": asyncio.get_event_loop().time(),
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "ClearClause API",
        "version": "1.0.0",
        "description": "Document analysis with OCR + AI",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower(),
    )
