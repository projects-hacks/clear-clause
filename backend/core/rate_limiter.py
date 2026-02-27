"""
Rate Limiter for Gemini API calls

Token bucket implementation with exponential backoff.
Prevents single user/session from exhausting API quota.
"""
import asyncio
import random
from datetime import datetime, timedelta, timezone
from typing import Optional
import structlog

from core.exceptions import RateLimitExceeded

logger = structlog.get_logger()


class TokenBucket:
    """
    Async token bucket rate limiter.
    
    Allows burst up to max_tokens, then refills at rate tokens_per_second.
    """
    
    def __init__(self, tokens_per_minute: int, max_tokens: Optional[int] = None):
        """
        Initialize token bucket.
        
        Args:
            tokens_per_minute: Rate at which tokens refill
            max_tokens: Maximum burst capacity (defaults to tokens_per_minute)
        """
        self.tokens_per_minute = tokens_per_minute
        self.max_tokens = max_tokens or tokens_per_minute
        self.tokens = float(self.max_tokens)
        self.last_update = datetime.now(timezone.utc)
        self._lock = asyncio.Lock()
        
        # Calculate tokens per second for refill
        self.tokens_per_second = tokens_per_minute / 60.0
        
        logger.info(
            "TokenBucket initialized",
            tokens_per_minute=tokens_per_minute,
            max_tokens=self.max_tokens
        )
    
    def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = datetime.now(timezone.utc)
        elapsed = (now - self.last_update).total_seconds()
        
        # Add tokens based on elapsed time
        self.tokens = min(
            self.max_tokens,
            self.tokens + (elapsed * self.tokens_per_second)
        )
        self.last_update = now
    
    async def acquire(self, tokens: int = 1, timeout: Optional[float] = None) -> bool:
        """
        Acquire tokens from the bucket.
        
        Args:
            tokens: Number of tokens to acquire
            timeout: Max time to wait (None = wait forever)
            
        Returns:
            True if tokens acquired, False if timeout
            
        Raises:
            RateLimitExceeded: If timeout is 0 and no tokens available
        """
        start_time = datetime.now(timezone.utc)
        
        while True:
            async with self._lock:
                self._refill()
                
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    logger.debug("Token acquired", remaining=self.tokens)
                    return True
                
                # Calculate wait time for enough tokens
                tokens_needed = tokens - self.tokens
                wait_time = tokens_needed / self.tokens_per_second
            
            # Check timeout
            if timeout is not None:
                elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                if elapsed >= timeout:
                    if timeout == 0:
                        retry_after = int(wait_time) + 1
                        raise RateLimitExceeded(retry_after=retry_after)
                    return False
            
            # Wait for tokens to refill (with small jitter)
            wait_time = min(wait_time, 1.0)  # Cap at 1 second
            jitter = random.uniform(0, 0.1)  # 0-100ms jitter
            await asyncio.sleep(wait_time + jitter)
    
    async def get_available_tokens(self) -> float:
        """Get current available token count."""
        async with self._lock:
            self._refill()
            return self.tokens


class RateLimiter:
    """
    High-level rate limiter with exponential backoff.

    Usage:
        limiter = RateLimiter(rpm=10)
        async with limiter.request():
            response = await gemini_call()
    """

    def __init__(
        self,
        requests_per_minute: int,
        max_retries: int = 5,
        base_delay: float = 2.0,
        max_delay: float = 30.0,
    ):
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Max sustained request rate
            max_retries: Max retry attempts on rate limit
            base_delay: Base delay for exponential backoff (seconds)
            max_delay: Maximum delay between retries (seconds)
        """
        self.bucket = TokenBucket(tokens_per_minute=requests_per_minute)
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay

        logger.info(
            "RateLimiter initialized",
            rpm=requests_per_minute,
            max_retries=max_retries
        )

    async def request(self, func, *args, **kwargs):
        """
        Execute a function with rate limiting and automatic retries.

        Implements exponential backoff with jitter on 429 responses.

        Usage:
            response = await limiter.request(gemini_call, arg1, arg2)
            
        Or as a context manager for manual control:
            async with limiter.context():
                response = await gemini_call()
        """
        attempt = 0
        
        while True:
            try:
                # Acquire token
                await self.bucket.acquire(tokens=1, timeout=0)
                
                # Execute the function
                return await func(*args, **kwargs)
                
            except RateLimitExceeded:
                # This shouldn't happen with timeout=0, but handle it
                attempt += 1
                if attempt >= self.max_retries:
                    logger.warning("Max retries exceeded", attempts=attempt)
                    raise
                
                delay = self._calculate_backoff(attempt)
                logger.info("Rate limited, retrying with backoff", 
                           attempt=attempt, delay_seconds=round(delay, 2))
                await asyncio.sleep(delay)
                
            except Exception as e:
                # Check if it's a rate limit error (429)
                if hasattr(e, 'status_code') and e.status_code == 429:
                    attempt += 1
                    
                    if attempt >= self.max_retries:
                        logger.warning("Max retries exceeded", attempts=attempt)
                        raise
                    
                    delay = self._calculate_backoff(attempt)
                    logger.info("Rate limited, retrying with backoff", 
                               attempt=attempt, delay_seconds=round(delay, 2))
                    await asyncio.sleep(delay)
                else:
                    # Re-raise non-rate-limit errors
                    raise
    
    def context(self):
        """
        Get a context manager for rate-limited requests.
        
        Usage:
            async with limiter.context():
                response = await api_call()
        """
        return RateLimitedContext(self)

    def _calculate_backoff(self, attempt: int) -> float:
        """Calculate backoff delay with exponential increase and jitter."""
        # Exponential backoff: base_delay * 2^attempt
        exponential_delay = self.base_delay * (2 ** attempt)

        # Add jitter (±25%)
        jitter = random.uniform(-0.25, 0.25) * exponential_delay
        delay = exponential_delay + jitter

        # Cap at max_delay
        return min(delay, self.max_delay)


class RateLimitedContext:
    """Async context manager for rate-limited request execution."""
    
    def __init__(self, limiter: RateLimiter):
        self.limiter = limiter
        self.attempt = 0
    
    async def __aenter__(self):
        """Acquire token before executing request."""
        await self.limiter.bucket.acquire(tokens=1, timeout=0)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Handle rate limit errors with backoff."""
        if exc_type is not None:
            # Check if it's a rate limit error (429)
            if hasattr(exc_val, 'status_code') and exc_val.status_code == 429:
                self.attempt += 1
                
                if self.attempt >= self.limiter.max_retries:
                    logger.warning(
                        "Max retries exceeded",
                        attempts=self.attempt
                    )
                    return False  # Re-raise exception
                
                # Calculate backoff delay
                delay = self.limiter._calculate_backoff(self.attempt)
                
                logger.info(
                    "Rate limited, retrying with backoff",
                    attempt=self.attempt,
                    delay_seconds=round(delay, 2)
                )
                
                # Wait before retry
                await asyncio.sleep(delay)
                
                # Retry by acquiring token again
                await self.limiter.bucket.acquire(tokens=1, timeout=self.limiter.max_delay)
        
        return False  # Don't suppress exceptions


# Global rate limiter instance (per API key)
_gemini_limiter: Optional[RateLimiter] = None


def get_gemini_limiter(rpm: int = 8, max_retries: int = 5) -> RateLimiter:
    """Get or create the global Gemini rate limiter."""
    global _gemini_limiter
    if _gemini_limiter is None:
        _gemini_limiter = RateLimiter(
            requests_per_minute=rpm,
            max_retries=max_retries
        )
    return _gemini_limiter
