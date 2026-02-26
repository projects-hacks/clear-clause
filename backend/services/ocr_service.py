"""
OCR Service - Apryse SDK integration

Extracts text and layout information from PDF documents.
Preserves word-level positions for annotation mapping.
"""
import os
import asyncio
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import structlog

from config import get_settings
from core.exceptions import ConfigurationError, OCRError

logger = structlog.get_logger()

settings = get_settings()


@dataclass
class WordResult:
    """Single word with bounding box."""
    text: str
    bbox: Dict[str, float]  # {x1, y1, x2, y2} in PDF coordinates
    confidence: float = 1.0  # OCR confidence (0-1)
    page_number: int = 1


@dataclass
class PageResult:
    """Single page extraction result."""
    page_number: int
    text: str
    words: List[WordResult] = field(default_factory=list)


@dataclass
class OCRResult:
    """Complete OCR extraction result."""
    full_text: str
    pages: List[PageResult]
    metadata: Dict[str, Any]  # page_count, has_scanned_pages, word_count, etc.


class ApryseOCRService:
    """
    Apryse SDK OCR service implementation.
    
    Uses PDFTron SDK for text extraction with layout preservation.
    Supports both native text extraction and OCR for scanned documents.
    """
    
    def __init__(self):
        """Initialize Apryse SDK with license key."""
        self.license_key = settings.apryse_license_key
        self._initialized = False
        self._apryse_available = False
        
        if not self.license_key:
            logger.warning("APRYSE_LICENSE_KEY not configured, using PyPDF2 fallback")
        
        logger.info("ApryseOCRService initialized")
    
    async def initialize(self) -> None:
        """
        Initialize Apryse SDK.
        
        Must be called before using OCR functionality.
        """
        if self._initialized:
            return
        
        try:
            # Try to import Apryse SDK (correct package name per official docs)
            try:
                from apryse_sdk import PDFNet
                
                # Initialize with license key
                if self.license_key:
                    PDFNet.Initialize(self.license_key)
                else:
                    PDFNet.Initialize()
                
                self._apryse_available = True
                self._initialized = True
                logger.info("Apryse SDK initialized successfully")
                
            except ImportError:
                logger.warning("Apryse SDK not available, using fallback")
                self._apryse_available = False
                self._initialized = True
            
        except Exception as e:
            logger.error("Failed to initialize Apryse SDK", error=str(e))
            self._apryse_available = False
            self._initialized = True
    
    async def extract(self, pdf_path: str) -> OCRResult:
        """
        Extract text from PDF with layout preservation.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            OCRResult with full text, per-page results, and word positions
        """
        await self.initialize()
        
        logger.info("Starting text extraction", path=pdf_path)
        
        try:
            # Try Apryse SDK first if available
            loop = asyncio.get_running_loop()
            if self._apryse_available:
                try:
                    return await loop.run_in_executor(None, self._extract_with_apryse_sync, pdf_path)
                except Exception as e:
                    logger.warning("Apryse extraction failed, using fallback", error=str(e))
                    return await loop.run_in_executor(None, self._extract_fallback_sync, pdf_path)
            else:
                return await loop.run_in_executor(None, self._extract_fallback_sync, pdf_path)
                
        except Exception as e:
            logger.error("Text extraction failed", path=pdf_path, error=str(e))
            raise OCRError(message=f"Failed to extract text: {str(e)}")
    
    def _extract_with_apryse_sync(self, pdf_path: str) -> OCRResult:
        """Extract text using Apryse SDK (runs in executor)."""
        from apryse_sdk import PDFDoc, TextExtractor

        # Load PDF document
        doc = PDFDoc(pdf_path)
        doc.InitSecurityHandler()

        # Check if OCR is needed (scanned documents)
        needs_ocr = self._check_needs_ocr(doc)

        # Note: We skip OCRModule entirely for now.
        # OCRModule requires separate 500MB download and is only needed for scanned documents.
        # For native PDFs (most contracts, leases, etc.), TextExtractor works perfectly.
        # If needs_ocr is True, we still extract text but note that positions may be unreliable.

        # Extract text page by page
        pages: List[PageResult] = []
        full_text_parts: List[str] = []
        total_words = 0

        page_count = doc.GetPageCount()

        for page_num in range(1, page_count + 1):
            page = doc.GetPage(page_num)

            # Extract text with positions
            extractor = TextExtractor()
            extractor.Begin(page)

            page_text = extractor.GetAsText()
            full_text_parts.append(page_text)

            # Extract words with bounding boxes using correct Apryse API
            # Iterate through lines, then words (GetWords() doesn't exist)
            words: List[WordResult] = []

            line = extractor.GetFirstLine()
            while line.IsValid():
                word = line.GetFirstWord()
                while word.IsValid():
                    if word.GetStringLen() == 0:
                        word = word.GetNextWord()
                        continue

                    word_text = word.GetString()
                    bbox = word.GetBBox()  # Returns Rect object with .x1, .y1, .x2, .y2

                    words.append(WordResult(
                        text=word_text,
                        bbox={
                            "x1": bbox.x1,
                            "y1": bbox.y1,
                            "x2": bbox.x2,
                            "y2": bbox.y2
                        },
                        page_number=page_num,
                    ))

                    word = word.GetNextWord()

                line = line.GetNextLine()

            total_words += len(words)

            pages.append(PageResult(
                page_number=page_num,
                text=page_text,
                words=words,
            ))

        full_text = "\n\n".join(full_text_parts)

        logger.info(
            "Apryse extraction complete",
            pages=page_count,
            words=total_words,
            needs_ocr=needs_ocr
        )

        return OCRResult(
            full_text=full_text,
            pages=pages,
            metadata={
                "page_count": page_count,
                "word_count": total_words,
                "has_scanned_pages": needs_ocr,
                "extraction_method": "apryse",
            }
        )
    
    def _extract_fallback_sync(self, pdf_path: str) -> OCRResult:
        """Extract text using PyPDF2 (runs in executor)."""
        
        """
        Fallback text extraction using PyPDF2.
        
        Used when Apryse SDK is not available.
        Does not provide word-level positions.
        """
        from PyPDF2 import PdfReader
        
        reader = PdfReader(pdf_path)
        
        pages: List[PageResult] = []
        full_text_parts: List[str] = []
        
        for page_num, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""
            full_text_parts.append(page_text)
            
            # Create PageResult without word positions
            pages.append(PageResult(
                page_number=page_num,
                text=page_text,
                words=[],  # No word-level data in fallback mode
            ))
        
        full_text = "\n\n".join(full_text_parts)
        
        logger.info(
            "Fallback extraction complete",
            pages=len(pages),
            method="PyPDF2"
        )
        
        return OCRResult(
            full_text=full_text,
            pages=pages,
            metadata={
                "page_count": len(pages),
                "word_count": len(full_text.split()),
                "has_scanned_pages": False,
                "extraction_method": "fallback_pypdf2",
            }
        )
    
    def _check_needs_ocr(self, doc) -> bool:
        """
        Check if document needs OCR (scanned vs native PDF).

        Improved heuristic: check multiple pages instead of just page 1,
        since page 1 might be a cover page with little text.
        """
        try:
            from apryse_sdk import TextExtractor
            page_count = doc.GetPageCount()
            total_text_length = 0

            # Check up to first 3 pages (or all pages if fewer)
            pages_to_check = min(3, page_count)

            for page_num in range(1, pages_to_check + 1):
                page = doc.GetPage(page_num)
                extractor = TextExtractor()
                extractor.Begin(page)
                text = extractor.GetAsText()
                total_text_length += len(text.strip())

            # Calculate average text per page
            avg_text_per_page = total_text_length / pages_to_check

            # Native PDFs typically have >100 chars per page
            # Scanned PDFs (without OCR) have <20 chars per page (just metadata)
            return avg_text_per_page < 50

        except Exception:
            return True  # Assume scanned if check fails


# Global service instance
_ocr_service: Optional[ApryseOCRService] = None


def get_ocr_service() -> ApryseOCRService:
    """Get or create the OCR service instance."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = ApryseOCRService()
    return _ocr_service


async def extract_text_with_apryse(pdf_path: str) -> OCRResult:
    """Convenience function for text extraction."""
    service = get_ocr_service()
    return await service.extract(pdf_path)
