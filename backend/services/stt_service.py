"""
STT Service - Deepgram Nova-2 Speech-to-Text

Converts user voice input to text for conversational AI.
"""
import structlog

from config import get_settings
from core.exceptions import ConfigurationError

logger = structlog.get_logger()

settings = get_settings()


async def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Transcribe audio bytes to text using Deepgram STT.
    
    Args:
        audio_bytes: Raw audio data from user microphone (webm/mp4)
        
    Returns:
        Transcribed text string
    """
    logger.info("Transcribing audio", data_size=len(audio_bytes))
    
    api_key = settings.deepgram_api_key
    
    if not api_key:
        raise ConfigurationError("DEEPGRAM_API_KEY not configured")
        
    try:
        from deepgram import DeepgramClient, PrerecordedOptions
        
        client = DeepgramClient(api_key=api_key)
        
        payload = {
            "buffer": audio_bytes,
            "mimetype": "audio/webm", # Default for browser MediaRecorder
        }
        
        options = PrerecordedOptions(
            model="nova-2",
            language="en",
            smart_format=True,
            punctuate=True,
        )
        
        response = client.listen.rest.v("1").transcribe_file(payload, options)
        
        transcript = response.results.channels[0].alternatives[0].transcript
        
        logger.info("Transcription successful", transcript_length=len(transcript))
        return transcript
        
    except Exception as e:
        logger.error("STT transcription failed", error=str(e))
        raise
