/**
 * Voice Summary Component
 * 
 * Audio player for TTS-generated voice summaries.
 */
import React, { useRef, useEffect, useState } from 'react';
import { Volume2, Play, Pause, Mic, AlertTriangle } from 'lucide-react';

/**
 * Voice Summary
 */
export default function VoiceSummary({
  sessionId,
  summary,
  isGenerating,
  audioUrl,
  onGenerate,
  onClose
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  /**
   * Generate voice summary on mount
   */
  useEffect(() => {
    if (!audioUrl && !isGenerating) {
      handleGenerate();
    }
  }, []);

  /**
   * Handle voice generation
   */
  const handleGenerate = async () => {
    try {
      await onGenerate(sessionId, summary);
    } catch (err) {
      console.error('Voice generation failed:', err);
    }
  };

  /**
   * Toggle playback
   */
  const togglePlay = () => {
    if (!audioUrl || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  /**
   * Handle audio time update
   */
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;

    const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
    setProgress(progress || 0);
  };

  /**
   * Handle audio ended
   */
  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  /**
   * Seek to position
   */
  const handleSeek = (e) => {
    if (!audioRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;

    audioRef.current.currentTime = percentage * audioRef.current.duration;
  };

  return (
    <div className="voice-summary-overlay">
      <div className="voice-summary-card">
        {/* Header */}
        <div className="voice-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Volume2 size={20} /> Voice Summary
          </h3>
          <button className="btn btn-secondary btn-small close-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
            ✕
          </button>
        </div>

        {/* Audio Player */}
        <div className="voice-player">
          {isGenerating ? (
            <div className="generating-state">
              <div className="spinner"></div>
              <p>Generating voice summary...</p>
            </div>
          ) : audioUrl ? (
            <>
              {/* Hidden Audio Element */}
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
              />

              {/* Play/Pause Button */}
              <button
                className="btn btn-primary play-btn flex items-center justify-center p-3"
                onClick={togglePlay}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              {/* Progress Bar */}
              <div
                className="voice-progress-bar"
                onClick={handleSeek}
              >
                <div
                  className="voice-progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              {/* Time Display */}
              <div className="voice-time">
                {audioRef.current ? (
                  <span>
                    {formatTime(audioRef.current.currentTime)} /{' '}
                    {formatTime(audioRef.current.duration)}
                  </span>
                ) : (
                  <span>--:--</span>
                )}
              </div>

              {/* Voice Info */}
              <div className="voice-info">
                <span className="voice-icon"><Mic size={16} /></span>
                <span className="voice-text">AI-generated summary using Deepgram Aura-2</span>
              </div>
            </>
          ) : (
            <div className="error-state">
              <span className="error-icon"><AlertTriangle size={24} className="text-warning" /></span>
              <p>Failed to generate voice summary</p>
              <button className="btn btn-secondary" onClick={handleGenerate}>
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Summary Text */}
        <div className="voice-summary-text">
          <h4>Summary</h4>
          <p>{summary}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format time in MM:SS
 */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
