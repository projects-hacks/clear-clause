"""
PII Redaction Service

Uses regular expressions to detect and redact Personal Identifiable Information (PII)
before document text is sent to the LLM. It maintains a mapping of redacted strings
to their original values so they can be optionally restored or matched back.
"""
import re
from typing import List, Dict, Tuple
from pydantic import BaseModel
import structlog

from config import get_settings

logger = structlog.get_logger()
settings = get_settings()

try:  # Optional dependency – code falls back to regex if missing
    from presidio_analyzer import AnalyzerEngine  # type: ignore

    PRESIDIO_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    AnalyzerEngine = None  # type: ignore
    PRESIDIO_AVAILABLE = False


class PIIMatch(BaseModel):
    category: str
    original: str
    redacted: str
    start: int
    end: int


#
# Regex-based fallback patterns (used when Presidio is unavailable or disabled)
#
PII_PATTERNS = {
    # Require separators between SSN parts to avoid matching arbitrary 9-digit
    # sequences (e.g., account numbers) without dashes or spaces.
    "SSN": r"\b(?!000)(?!666)[0-8]\d{2}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b",
    "Email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "Phone": r"\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b",
    "CreditCard": r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b",
    "DOB": r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(st|nd|rd|th)?,\s+(?:19|20)\d{2}\b",
}

_presidio_analyzer: "AnalyzerEngine | None" = None


def _get_presidio_analyzer() -> "AnalyzerEngine":
    global _presidio_analyzer
    if _presidio_analyzer is None:
        # Default configuration uses spaCy-based NLP. This is created once and
        # reused across all requests for efficiency.
        _presidio_analyzer = AnalyzerEngine()  # type: ignore[call-arg]
        logger.info("Presidio AnalyzerEngine initialized")
    return _presidio_analyzer


def _detect_pii_with_regex(text: str) -> List[PIIMatch]:
    """Scan text for PII using simple regex patterns (fallback implementation)."""
    matches: List[PIIMatch] = []
    counters = {cat: 1 for cat in PII_PATTERNS.keys()}

    for category, pattern in PII_PATTERNS.items():
        for match in re.finditer(pattern, text, re.IGNORECASE):
            original = match.group(0)
            redacted = f"[REDACTED-{category}-{counters[category]}]"
            counters[category] += 1

            matches.append(
                PIIMatch(
                    category=category,
                    original=original,
                    redacted=redacted,
                    start=match.start(),
                    end=match.end(),
                )
            )

    # Sort matches by start index to handle overlaps properly later
    matches.sort(key=lambda x: x.start)

    # Remove overlapping matches (keep the first, longest one)
    filtered_matches: List[PIIMatch] = []
    last_end = 0
    for match in matches:
        if match.start >= last_end:
            filtered_matches.append(match)
            last_end = match.end

    return filtered_matches


def _detect_pii_with_presidio(text: str) -> List[PIIMatch]:
    """
    Detect PII using Microsoft Presidio.

    We favor lower false positives by:
    - Restricting to a focused set of entities
    - Applying conservative score thresholds per entity type
    """
    analyzer = _get_presidio_analyzer()

    # Focus on entities that map well to our existing categories.
    target_entities = [
        "US_SSN",
        "EMAIL_ADDRESS",
        "PHONE_NUMBER",
        "CREDIT_CARD",
        "DATE_TIME",
        "PERSON",
    ]

    results = analyzer.analyze(
        text=text,
        language="en",
        entities=target_entities,
    )

    matches: List[PIIMatch] = []
    counters: Dict[str, int] = {}

    for result in results:
        entity = result.entity_type
        score = result.score or 0.0

        # Conservative thresholds to reduce false positives.
        if entity == "PERSON":
            if score < 0.75:
                continue
            category = "PersonName"
        elif entity == "US_SSN":
            if score < 0.5:
                continue
            category = "SSN"
        elif entity == "EMAIL_ADDRESS":
            if score < 0.5:
                continue
            category = "Email"
        elif entity == "PHONE_NUMBER":
            if score < 0.5:
                continue
            category = "Phone"
        elif entity == "CREDIT_CARD":
            if score < 0.5:
                continue
            category = "CreditCard"
        elif entity == "DATE_TIME":
            if score < 0.6:
                continue
            category = "DOB"
        else:
            # Ignore anything outside our allowlist.
            continue

        original = text[result.start : result.end]
        counters[category] = counters.get(category, 0) + 1
        redacted = f"[REDACTED-{category}-{counters[category]}]"

        matches.append(
            PIIMatch(
                category=category,
                original=original,
                redacted=redacted,
                start=result.start,
                end=result.end,
            )
        )

    # Sort and de-duplicate overlaps as before.
    matches.sort(key=lambda x: x.start)
    filtered_matches: List[PIIMatch] = []
    last_end = 0
    for match in matches:
        if match.start >= last_end:
            filtered_matches.append(match)
            last_end = match.end

    return filtered_matches


def detect_pii(text: str) -> List[PIIMatch]:
    """
    Detect PII in text, preferring Presidio when available and enabled.

    Falls back to regex-based detection if Presidio is not installed or
    explicitly disabled in settings.
    """
    if PRESIDIO_AVAILABLE and getattr(settings, "use_presidio_pii", True):
        try:
            return _detect_pii_with_presidio(text)
        except Exception as e:
            # Fail soft: log and fall back to regex so analysis can proceed.
            logger.warning("Presidio detection failed, falling back to regex", error=str(e))
            return _detect_pii_with_regex(text)

    return _detect_pii_with_regex(text)


def redact_text(text: str) -> Tuple[str, Dict[str, str], List[str]]:
    """
    Redact PII from text.

    Returns:
        redacted_text: The text with PII replaced by placeholders
        pii_map: A dictionary mapping redacted placeholder to original text
        categories: A list of unique PII categories found
    """
    matches = detect_pii(text)

    if not matches:
        return text, {}, []

    pii_map: Dict[str, str] = {}
    categories = set()
    result_chars = list(text)

    # Replace from back to front so indices remain valid
    for match in reversed(matches):
        pii_map[match.redacted] = match.original
        categories.add(match.category)

        # Slice replacement
        result_chars[match.start:match.end] = list(match.redacted)

    redacted_text = "".join(result_chars)

    logger.info(
        "PII Redaction complete",
        pii_redacted_count=len(matches),
        categories=list(categories),
    )

    return redacted_text, pii_map, list(categories)


def restore_pii(text: str, pii_map: Dict[str, str]) -> str:
    """Restore original PII values from a map of redacted placeholders."""
    if not text or not pii_map:
        return text

    for redacted, original in pii_map.items():
        text = text.replace(redacted, original)

    return text
