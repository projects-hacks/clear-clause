"""
TTS Service - Deepgram Aura-2 Text-to-Speech

Generates voice summaries from analysis text.
"""
import structlog

from config import get_settings
from core.exceptions import ConfigurationError

logger = structlog.get_logger()

settings = get_settings()


async def generate_voice_summary(
    text: str,
    voice: str = "aura-asteria-en",
) -> bytes:
    """
    Generate audio from text using Deepgram TTS.
    
    Args:
        text: Text to convert to speech
        voice: Voice model (default: aura-asteria-en)
        
    Returns:
        Audio bytes (WAV format)
    """
    logger.info(
        "Generating voice summary",
        text_length=len(text),
        voice=voice
    )
    
    api_key = settings.deepgram_api_key
    
    if not api_key:
        raise ConfigurationError("DEEPGRAM_API_KEY not configured")
    
    try:
        from deepgram import DeepgramClient, SpeakOptions
        
        # Create client
        client = DeepgramClient(api_key=api_key)
        
        # Configure speech options
        options = SpeakOptions(
            model="aura-2-en",
            encoding="linear16",
            sample_rate=24000,
            container="wav",
        )
        
        # Generate audio
        response = client.speak.rest.v("1").stream_raw(
            {"text": text},
            options
        )
        
        # Collect audio bytes
        audio_bytes = b""
        
        for chunk in response.stream:
            audio_bytes += chunk
        
        logger.info(
            "Voice summary generated",
            audio_size=len(audio_bytes),
            duration_seconds=len(audio_bytes) / (24000 * 2)  # Approximate
        )
        
        return audio_bytes
        
    except ImportError:
        logger.warning("Deepgram SDK not available, using mock TTS")
        return _generate_mock_audio(text)
    
    except Exception as e:
        logger.error("TTS generation failed", error=str(e))
        raise


def _generate_mock_audio(text: str) -> bytes:
    """Generate silent WAV file as fallback."""
    import wave
    import io
    
    # Create a short silent WAV file
    sample_rate = 24000
    duration = 2  # seconds
    num_samples = int(sample_rate * duration)
    
    # Generate silent audio
    audio_data = b'\x00\x00' * num_samples  # 16-bit silent samples
    
    # Write WAV file
    buffer = io.BytesIO()
    
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data)
    
    logger.info("Mock audio generated (silent)")
    
    return buffer.getvalue()
