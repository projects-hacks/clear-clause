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
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import structlog

from config import get_settings

logger = structlog.get_logger()
settings = get_settings()

try:
    import asyncpg  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    asyncpg = None

_db_pool = None
_db_tables_initialized = False


def _is_session_db_enabled() -> bool:
    """Return True if a Postgres URL is configured and asyncpg is available."""
    return bool(settings.vector_db_url and asyncpg is not None)


async def _get_session_pool():
    """Get or create the asyncpg connection pool for sessions."""
    global _db_pool
    if not _is_session_db_enabled():
        return None

    if _db_pool is None:
        logger.info("Initializing session DB pool", url=settings.vector_db_url)
        _db_pool = await asyncpg.create_pool(dsn=settings.vector_db_url, min_size=1, max_size=5)

    return _db_pool


async def _ensure_session_tables() -> None:
    """Create analysis_sessions table if it does not already exist."""
    global _db_tables_initialized
    if _db_tables_initialized:
        return

    pool = await _get_session_pool()
    if pool is None:
        return

    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_sessions (
                session_id      TEXT PRIMARY KEY,
                document_name   TEXT NOT NULL,
                status          TEXT NOT NULL,
                progress        INTEGER NOT NULL,
                message         TEXT NOT NULL,
                error           TEXT,
                created_at      TIMESTAMPTZ NOT NULL,
                updated_at      TIMESTAMPTZ NOT NULL,
                expires_at      TIMESTAMPTZ NOT NULL,
                result          JSONB,
                message_history JSONB,
                temp_file_path  TEXT
            );
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_analysis_sessions_expires_at
            ON analysis_sessions (expires_at);
            """
        )

    _db_tables_initialized = True
    logger.info("Session DB tables ensured")


class SessionStatus(str, Enum):
    """Analysis session status."""
    UPLOADING = "uploading"
    EXTRACTING = "extracting"
    REDACTING = "redacting"
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
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=30))
    
    # Analysis result (populated on completion)
    result: Optional[Dict[str, Any]] = None
    
    # Temporary file path (for PDF storage during analysis)
    temp_file_path: Optional[str] = None
    # Human-readable thinking log for frontend UX
    message_history: list[str] = field(default_factory=list)
    
    def is_expired(self) -> bool:
        """Check if session has expired."""
        return datetime.now(timezone.utc) > self.expires_at
    
    def touch(self) -> None:
        """Update session timestamp to prevent cleanup."""
        self.updated_at = datetime.now(timezone.utc)
    
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
            "message_history": self.message_history,
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
        self._use_db = _is_session_db_enabled()
        self._tasks: Dict[str, asyncio.Task] = {}

        logger.info(
            "SessionManager initialized",
            ttl_minutes=ttl_minutes,
            backend="postgres" if self._use_db else "memory",
        )
    
    async def start_cleanup_task(self) -> None:
        """Start background task for cleaning up expired sessions."""
        if self._use_db:
            await _ensure_session_tables()
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
        if self._use_db:
            pool = await _get_session_pool()
            if pool is None:
                return 0

            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    DELETE FROM analysis_sessions
                    WHERE expires_at < $1
                    RETURNING session_id, temp_file_path
                    """,
                    datetime.now(timezone.utc),
                )

            count = len(rows)
            if rows:
                import os

                for row in rows:
                    sid = row["session_id"]
                    path = row["temp_file_path"]
                    if path:
                        try:
                            os.remove(path)
                        except OSError:
                            pass
                    # Best-effort cancel of any in-memory task for this session
                    task = self._tasks.pop(sid, None)
                    if task and not task.done():
                        task.cancel()

                logger.info("Cleaned up expired DB sessions", count=count)

            return count

        async with self._lock:
            expired_ids = [
                sid for sid, session in self._sessions.items()
                if session.is_expired()
            ]

            for sid in expired_ids:
                session = self._sessions[sid]
                if session.temp_file_path:
                    try:
                        import os
                        os.remove(session.temp_file_path)
                    except OSError:
                        pass
                # Best-effort cancel of any in-memory task for this session
                task = self._tasks.pop(sid, None)
                if task and not task.done():
                    task.cancel()
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
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=self._ttl_minutes)
        session = AnalysisSession(
            session_id=session_id,
            document_name=document_name,
            created_at=now,
            updated_at=now,
            expires_at=expires_at,
        )

        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                async with self._lock:
                    self._sessions[session_id] = session
            else:
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO analysis_sessions (
                            session_id,
                            document_name,
                            status,
                            progress,
                            message,
                            error,
                            created_at,
                            updated_at,
                            expires_at,
                            result,
                            message_history,
                            temp_file_path
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        """,
                        session.session_id,
                        session.document_name,
                        session.status.value,
                        session.progress,
                        session.message,
                        session.error,
                        session.created_at,
                        session.updated_at,
                        session.expires_at,
                        session.result,
                        session.message_history,
                        session.temp_file_path,
                    )
        else:
            async with self._lock:
                self._sessions[session_id] = session

        logger.info("Session created", session_id=session_id, document=document_name)
        return session
    
    async def get_session(self, session_id: str) -> Optional[AnalysisSession]:
        """
        Retrieve a session by ID.
        
        Returns None if session doesn't exist or is expired.
        """
        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                return None

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        session_id,
                        document_name,
                        status,
                        progress,
                        message,
                        error,
                        created_at,
                        updated_at,
                        expires_at,
                        result,
                        message_history,
                        temp_file_path
                    FROM analysis_sessions
                    WHERE session_id = $1
                      AND expires_at > $2
                    """,
                    session_id,
                    datetime.now(timezone.utc),
                )

            if row is None:
                return None

            session = AnalysisSession(
                session_id=row["session_id"],
                document_name=row["document_name"],
                status=SessionStatus(row["status"]),
                progress=row["progress"],
                message=row["message"],
                error=row["error"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                expires_at=row["expires_at"],
                result=row["result"],
                message_history=row["message_history"] or [],
                temp_file_path=row["temp_file_path"],
            )
            session.touch()
            return session

        async with self._lock:
            session = self._sessions.get(session_id)

            if session is None:
                return None

            if session.is_expired():
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
        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                return None

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        session_id,
                        document_name,
                        status,
                        progress,
                        message,
                        error,
                        created_at,
                        updated_at,
                        expires_at,
                        result,
                        message_history,
                        temp_file_path
                    FROM analysis_sessions
                    WHERE session_id = $1
                      AND expires_at > $2
                    """,
                    session_id,
                    datetime.now(timezone.utc),
                )

                if row is None:
                    return None

                current_status = SessionStatus(row["status"])
                current_progress = row["progress"]
                current_message = row["message"]
                current_error = row["error"]
                current_result = row["result"]
                history = row["message_history"] or []

                if status is not None:
                    current_status = status
                if progress is not None:
                    current_progress = progress
                if message is not None:
                    current_message = message
                    if not history or history[-1] != message:
                        history = history + [message]
                if error is not None:
                    current_error = error
                if result is not None:
                    current_result = result

                updated_at = datetime.now(timezone.utc)

                await conn.execute(
                    """
                    UPDATE analysis_sessions
                    SET status = $2,
                        progress = $3,
                        message = $4,
                        error = $5,
                        result = $6,
                        message_history = $7,
                        updated_at = $8
                    WHERE session_id = $1
                    """,
                    session_id,
                    current_status.value,
                    current_progress,
                    current_message,
                    current_error,
                    current_result,
                    history,
                    updated_at,
                )

            session = AnalysisSession(
                session_id=row["session_id"],
                document_name=row["document_name"],
                status=current_status,
                progress=current_progress,
                message=current_message,
                error=current_error,
                created_at=row["created_at"],
                updated_at=updated_at,
                expires_at=row["expires_at"],
                result=current_result,
                message_history=history,
                temp_file_path=row["temp_file_path"],
            )
            session.touch()
            return session

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
                # Append unique messages to history for "thinking" log
                if not session.message_history or session.message_history[-1] != message:
                    session.message_history.append(message)
            if error is not None:
                session.error = error
            if result is not None:
                session.result = result

            session.updated_at = datetime.now(timezone.utc)
            session.touch()

            return session
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session and clean up resources.
        
        Returns True if session was deleted, False if it didn't exist.
        """
        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                return False

            # Best-effort cancel of any in-memory task for this session
            task = self._tasks.pop(session_id, None)
            if task and not task.done():
                task.cancel()

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    DELETE FROM analysis_sessions
                    WHERE session_id = $1
                    RETURNING temp_file_path
                    """,
                    session_id,
                )

            if row is None:
                return False

            temp_file_path = row["temp_file_path"]
            if temp_file_path:
                try:
                    import os
                    os.remove(temp_file_path)
                    logger.info("Temp file cleaned", session_id=session_id)
                except OSError as e:
                    logger.warning("Failed to clean temp file", error=str(e))

            logger.info("Session deleted", session_id=session_id)
            return True

        async with self._lock:
            # Best-effort cancel of any in-memory task for this session
            task = self._tasks.pop(session_id, None)
            if task and not task.done():
                task.cancel()

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
        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                return 0

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT COUNT(*) AS count
                    FROM analysis_sessions
                    WHERE expires_at > $1
                    """,
                    datetime.now(timezone.utc),
                )
            return int(row["count"]) if row else 0

        async with self._lock:
            return sum(
                1 for s in self._sessions.values()
                if not s.is_expired()
            )
    
    async def list_sessions(self) -> list[AnalysisSession]:
        """List all active sessions (for debugging/admin)."""
        if self._use_db:
            await _ensure_session_tables()
            pool = await _get_session_pool()
            if pool is None:
                return []

            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        session_id,
                        document_name,
                        status,
                        progress,
                        message,
                        error,
                        created_at,
                        updated_at,
                        expires_at,
                        result,
                        message_history,
                        temp_file_path
                    FROM analysis_sessions
                    WHERE expires_at > $1
                    """,
                    datetime.now(timezone.utc),
                )

            sessions: list[AnalysisSession] = []
            for row in rows:
                sessions.append(
                    AnalysisSession(
                        session_id=row["session_id"],
                        document_name=row["document_name"],
                        status=SessionStatus(row["status"]),
                        progress=row["progress"],
                        message=row["message"],
                        error=row["error"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                        expires_at=row["expires_at"],
                        result=row["result"],
                        message_history=row["message_history"] or [],
                        temp_file_path=row["temp_file_path"],
                    )
                )
            return sessions

        async with self._lock:
            return [
                s for s in self._sessions.values()
                if not s.is_expired()
            ]

    def register_task(self, session_id: str, task: asyncio.Task) -> None:
        """
        Track a background analysis task for a session so it can be cancelled
        on session deletion or expiry.
        """
        self._tasks[session_id] = task


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
