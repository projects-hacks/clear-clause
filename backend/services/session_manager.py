"""
Session Manager for Multi-Document Concurrency

Handles concurrent analysis sessions with:
- Unique session IDs per upload
- In-memory storage with TTL-based cleanup
- Thread-safe operations for concurrent requests
- Progress tracking per session
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
import structlog

logger = structlog.get_logger()


class SessionStatus(str, Enum):
    """Analysis session status."""
    UPLOADING = "uploading"
    EXTRACTING = "extracting"
    ANALYZING = "analyzing"
    COMPLETE = "complete"
    ERROR = "error"
    EXPIRED = "expired"


@dataclass
class AnalysisSession:
    """
    Represents a single document analysis session.
    
    Each upload creates a new session with its own:
    - Unique ID
    - Progress state
    - Result data (when complete)
    - TTL for cleanup
    """
    session_id: str
    document_name: str
    status: SessionStatus = SessionStatus.UPLOADING
    progress: int = 0
    message: str = "Document received"
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime = field(default_factory=lambda: datetime.utcnow() + timedelta(minutes=30))
    
    # Analysis result (populated on completion)
    result: Optional[Dict[str, Any]] = None
    
    # Temporary file path (for PDF storage during analysis)
    temp_file_path: Optional[str] = None
    
    def is_expired(self) -> bool:
        """Check if session has expired."""
        return datetime.utcnow() > self.expires_at
    
    def touch(self) -> None:
        """Update session timestamp to prevent cleanup."""
        self.updated_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert session to dictionary for API responses."""
        return {
            "session_id": self.session_id,
            "document_name": self.document_name,
            "status": self.status.value,
            "progress": self.progress,
            "message": self.message,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "result": self.result,
        }


class SessionManager:
    """
    Manages multiple concurrent analysis sessions.
    
    Thread-safe operations using asyncio locks.
    Automatic cleanup of expired sessions.
    """
    
    def __init__(self, ttl_minutes: int = 30, cleanup_interval_minutes: int = 10):
        self._sessions: Dict[str, AnalysisSession] = {}
        self._lock = asyncio.Lock()
        self._ttl_minutes = ttl_minutes
        self._cleanup_interval = cleanup_interval_minutes * 60  # Convert to seconds
        self._cleanup_task: Optional[asyncio.Task] = None
        
        logger.info("SessionManager initialized", ttl_minutes=ttl_minutes)
    
    async def start_cleanup_task(self) -> None:
        """Start background task for cleaning up expired sessions."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Session cleanup task started")
    
    async def stop_cleanup_task(self) -> None:
        """Stop the background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Session cleanup task stopped")
    
    async def _cleanup_loop(self) -> None:
        """Background loop that removes expired sessions."""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval)
                await self._cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Cleanup loop error", error=str(e))
    
    async def _cleanup_expired(self) -> int:
        """Remove all expired sessions. Returns count of removed sessions."""
        async with self._lock:
            expired_ids = [
                sid for sid, session in self._sessions.items()
                if session.is_expired()
            ]
            
            for sid in expired_ids:
                session = self._sessions[sid]
                # Clean up temp file if exists
                if session.temp_file_path:
                    try:
                        import os
                        os.remove(session.temp_file_path)
                    except OSError:
                        pass
                del self._sessions[sid]
            
            if expired_ids:
                logger.info("Cleaned up expired sessions", count=len(expired_ids))
            
            return len(expired_ids)
    
    async def create_session(self, document_name: str) -> AnalysisSession:
        """
        Create a new analysis session.
        
        Args:
            document_name: Original filename of the uploaded document
            
        Returns:
            New AnalysisSession instance
        """
        session_id = str(uuid.uuid4())
        session = AnalysisSession(
            session_id=session_id,
            document_name=document_name,
            expires_at=datetime.utcnow() + timedelta(minutes=self._ttl_minutes)
        )
        
        async with self._lock:
            self._sessions[session_id] = session
        
        logger.info("Session created", session_id=session_id, document=document_name)
        return session
    
    async def get_session(self, session_id: str) -> Optional[AnalysisSession]:
        """
        Retrieve a session by ID.
        
        Returns None if session doesn't exist or is expired.
        """
        async with self._lock:
            session = self._sessions.get(session_id)
            
            if session is None:
                return None
            
            if session.is_expired():
                # Clean up expired session
                del self._sessions[session_id]
                return None
            
            session.touch()
            return session
    
    async def update_session(
        self,
        session_id: str,
        status: Optional[SessionStatus] = None,
        progress: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> Optional[AnalysisSession]:
        """
        Update session fields atomically.
        
        Used by pipeline to report progress at each stage.
        """
        async with self._lock:
            session = self._sessions.get(session_id)
            
            if session is None or session.is_expired():
                return None
            
            if status is not None:
                session.status = status
            if progress is not None:
                session.progress = progress
            if message is not None:
                session.message = message
            if error is not None:
                session.error = error
            if result is not None:
                session.result = result
            
            session.updated_at = datetime.utcnow()
            session.touch()
            
            return session
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and clean up resources.
        
        Returns True if session was deleted, False if it didn't exist.
        """
        async with self._lock:
            session = self._sessions.pop(session_id, None)
            
            if session is None:
                return False
            
            # Clean up temp file
            if session.temp_file_path:
                try:
                    import os
                    os.remove(session.temp_file_path)
                    logger.info("Temp file cleaned", session_id=session_id)
                except OSError as e:
                    logger.warning("Failed to clean temp file", error=str(e))
            
            logger.info("Session deleted", session_id=session_id)
            return True
    
    async def get_active_session_count(self) -> int:
        """Get count of currently active (non-expired) sessions."""
        async with self._lock:
            return sum(
                1 for s in self._sessions.values()
                if not s.is_expired()
            )
    
    async def list_sessions(self) -> list[AnalysisSession]:
        """List all active sessions (for debugging/admin)."""
        async with self._lock:
            return [
                s for s in self._sessions.values()
                if not s.is_expired()
            ]


# Global session manager instance (injected via FastAPI dependencies)
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    if _session_manager is None:
        raise RuntimeError("SessionManager not initialized")
    return _session_manager


async def init_session_manager(ttl_minutes: int = 30, cleanup_interval: int = 10) -> SessionManager:
    """Initialize the global session manager."""
    global _session_manager
    _session_manager = SessionManager(ttl_minutes=ttl_minutes, cleanup_interval_minutes=cleanup_interval)
    await _session_manager.start_cleanup_task()
    return _session_manager


async def shutdown_session_manager() -> None:
    """Shutdown the global session manager."""
    if _session_manager:
        await _session_manager.stop_cleanup_task()
