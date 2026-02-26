"""
Vector Store - Clause embeddings with Postgres + pgvector

This module provides a lightweight, production-friendly vector store used to
improve chat retrieval over analyzed clauses. It is intentionally scoped to:

- Store embeddings for clauses for a given analysis session
- Retrieve the top-k most relevant clause_ids for a chat question

If VECTOR_DB_URL is not configured or the database is unavailable, all
functions become no-ops and the rest of the system continues to work,
falling back to keyword-based retrieval.
"""

from __future__ import annotations

import asyncio
from typing import List, Sequence

import structlog

from config import get_settings
from api.schemas import ClauseClassification

logger = structlog.get_logger()
settings = get_settings()

try:
    import asyncpg  # type: ignore
    from pgvector.asyncpg import register_vector  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    asyncpg = None
    register_vector = None


_pool = None
_tables_initialized = False


def is_vector_store_enabled() -> bool:
    """Return True if a vector DB URL is configured and dependencies are present."""
    return bool(settings.vector_db_url and asyncpg is not None and register_vector is not None)


async def _get_pool():
    """Get or create the asyncpg connection pool."""
    global _pool
    if not is_vector_store_enabled():
        return None

    if _pool is None:
        logger.info("Initializing vector DB pool", url=settings.vector_db_url)
        _pool = await asyncpg.create_pool(dsn=settings.vector_db_url, min_size=1, max_size=5)
        # Register pgvector type codecs
        await register_vector(_pool)

    return _pool


async def _ensure_tables():
    """Create pgvector extension and tables if they do not already exist."""
    global _tables_initialized
    if _tables_initialized:
        return

    pool = await _get_pool()
    if pool is None:
        return

    async with pool.acquire() as conn:
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        except Exception as e:  # pragma: no cover - depends on DB privileges
            logger.warning("Failed to create pgvector extension (ensure it exists manually)", error=str(e))

        dim = settings.embedding_dimension
        await conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS clause_embeddings (
                id          BIGSERIAL PRIMARY KEY,
                session_id  TEXT NOT NULL,
                clause_id   TEXT NOT NULL,
                content     TEXT NOT NULL,
                embedding   VECTOR({dim}) NOT NULL
            );
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_clause_embeddings_session
            ON clause_embeddings(session_id);
            """
        )

    _tables_initialized = True
    logger.info("Vector store tables ensured")


async def _embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """
    Compute embeddings for a batch of texts using Gemini embeddings.

    Uses the text-embedding-004 model by default. This is synchronous under
    the hood, so we offload to a thread to avoid blocking the event loop.
    """
    if not texts:
        return []

    import google.genai as genai  # type: ignore

    client = genai.Client(api_key=settings.gemini_api_key)
    model = settings.embedding_model

    def _run_embed():
        # Batch embedding call
        result = client.models.batch_embed_contents(
            model=model,
            contents=[
                {"parts": [{"text": text}], "role": "user"}
                for text in texts
            ],
        )
        return [emb.values for emb in result.embeddings]

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _run_embed)


async def index_clause_embeddings_for_session(
    session_id: str,
    clauses: Sequence[ClauseClassification],
) -> None:
    """
    Index clause embeddings for a given analysis session.

    Each clause is embedded using a concatenation of its key fields
    (category, severity, plain language explanation, and original text).
    """
    if not is_vector_store_enabled():
        logger.info("Vector store not enabled; skipping clause indexing")
        return

    if not clauses:
        return

    await _ensure_tables()
    pool = await _get_pool()
    if pool is None:
        return

    # Prepare text payloads
    texts: List[str] = []
    ids: List[str] = []
    for clause in clauses:
        content = " | ".join(
            [
                str(clause.category or ""),
                str(clause.severity or ""),
                str(clause.plain_language or ""),
                str(clause.text or ""),
            ]
        )
        texts.append(content)
        ids.append(clause.clause_id)

    try:
        embeddings = await _embed_texts(texts)
    except Exception as e:  # pragma: no cover - external service
        logger.error("Failed to compute embeddings for clauses", error=str(e))
        return

    if len(embeddings) != len(ids):
        logger.warning("Embedding count mismatch; skipping indexing")
        return

    async with pool.acquire() as conn:
        # Remove any existing embeddings for this session to avoid duplicates
        await conn.execute(
            "DELETE FROM clause_embeddings WHERE session_id = $1",
            session_id,
        )

        records = [
            (session_id, clause_id, text, embedding)
            for clause_id, text, embedding in zip(ids, texts, embeddings)
        ]

        # Bulk insert
        await conn.executemany(
            """
            INSERT INTO clause_embeddings (session_id, clause_id, content, embedding)
            VALUES ($1, $2, $3, $4)
            """,
            records,
        )

    logger.info(
        "Indexed clause embeddings",
        session_id=session_id,
        clause_count=len(records),
    )


async def get_top_clause_ids_for_question(
    session_id: str,
    question: str,
    top_k: int = 15,
) -> List[str]:
    """
    Retrieve top-k clause_ids for a question using vector similarity.

    Falls back to an empty list if the vector store is disabled or unavailable.
    """
    if not is_vector_store_enabled():
        return []

    if not question.strip():
        return []

    await _ensure_tables()
    pool = await _get_pool()
    if pool is None:
        return []

    try:
        [question_embedding] = await _embed_texts([question])
    except Exception as e:  # pragma: no cover - external service
        logger.error("Failed to embed chat question", error=str(e))
        return []

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT clause_id
            FROM clause_embeddings
            WHERE session_id = $1
            ORDER BY embedding <=> $2
            LIMIT $3
            """,
            session_id,
            question_embedding,
            top_k,
        )

    return [row["clause_id"] for row in rows]

