"""
Structured logging setup using structlog

Provides consistent, machine-readable logs with context.
"""
import logging
import sys
from typing import Any, Dict

import structlog
from structlog.types import Processor


def setup_logging(log_level: str = "INFO") -> None:
    """
    Configure structured logging for the application.
    
    Output format:
    - Development: Colored console output with pretty printing
    - Production: JSON format for log aggregation
    """
    # Shared processors for all loggers
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]
    
    # Console logging for development
    structlog.configure(
        processors=shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Configure standard library logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )


def get_logger(name: str = __name__) -> structlog.BoundLogger:
    """
    Get a structured logger instance.
    
    Usage:
        logger = get_logger(__name__)
        logger.info("Something happened", extra_context="value")
    """
    return structlog.get_logger(name)
