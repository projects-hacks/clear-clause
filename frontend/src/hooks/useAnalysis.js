/**
 * Custom Hook for Document Analysis
 * 
 * Manages SSE connection for real-time progress updates.
 * Handles multiple concurrent analyses.
 */
import { useState, useCallback, useRef } from 'react';
import { uploadDocument, getAnalysisStatus } from '../services/api';
import { useAnalysis } from '../context/AnalysisContext';

/**
 * Hook for managing document analysis lifecycle
 */
export function useDocumentAnalysis() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const { addSession, updateSession } = useAnalysis();

  /**
   * Start analysis for a new document
   */
  const startAnalysis = useCallback(async (file) => {
    setIsUploading(true);
    setError(null);

    try {
      const stream = await uploadDocument(file);

      // Read first SSE event to get sessionId
      const firstEvent = await stream.readProgress();
      const sessionId = stream.sessionId || firstEvent?.session_id;

      if (!sessionId) {
        throw new Error('Failed to get session ID from server');
      }

      // Add session immediately with 'uploading' status so the progress UI shows
      addSession({
        session_id: sessionId,
        document_name: file.name,
        status: 'uploading',
        progress: 10,
        message: 'Document received, starting analysis...',
        created_at: new Date().toISOString(),
        result: null,
      });

      // Process the first event's data if it already has progress
      if (firstEvent) {
        updateSession(sessionId, {
          status: firstEvent.stage,
          progress: firstEvent.progress,
          message: firstEvent.message,
          result: firstEvent.data || null,
        });
      }

      // Continue reading ALL remaining SSE events in background (non-blocking)
      (async () => {
        try {
          let done = false;
          while (!done) {
            const events = await stream.readAllProgress();
            if (events.length === 0) break; // stream ended

            // Process EVERY event so progress UI updates incrementally
            for (const progress of events) {
              if (progress.error) {
                updateSession(sessionId, { status: 'error', message: progress.error });
                done = true;
                break;
              }
              updateSession(sessionId, {
                status: progress.stage,
                progress: progress.progress,
                message: progress.message,
                result: progress.data || null,
              });
              if (progress.stage === 'complete' || progress.stage === 'error') {
                done = true;
                break;
              }
            }
          }
        } catch (err) {
          console.error('SSE read error:', err);
          updateSession(sessionId, { status: 'error', message: 'Connection lost. Retrying...' });
        }
      })();

      return sessionId;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [addSession, updateSession]);

  /**
   * Poll status for a session (alternative to SSE)
   */
  const pollStatus = useCallback(async (sessionId) => {
    try {
      const status = await getAnalysisStatus(sessionId);
      updateSession(sessionId, {
        status: status.status,
        progress: status.progress,
        message: status.message,
        result: status.result || null,
      });
      return status;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [updateSession]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isUploading,
    error,
    startAnalysis,
    pollStatus,
    clearError,
  };
}

/**
 * Hook for chat functionality
 */
export function useChat() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (sessionId, question) => {
    setIsLoading(true);
    setError(null);

    try {
      const { askQuestion } = await import('../services/api');
      const response = await askQuestion(sessionId, question);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    sendMessage,
    clearError,
  };
}

/**
 * Hook for voice summary
 */
export function useVoiceSummary() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const generate = useCallback(async (sessionId, text) => {
    setIsGenerating(true);
    setError(null);

    try {
      const { generateVoiceSummary } = await import('../services/api');
      const audioBlob = await generateVoiceSummary(sessionId, text);

      // Create object URL for playback
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      return url;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clearAudio = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
  }, [audioUrl]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isGenerating,
    error,
    audioUrl,
    generate,
    clearAudio,
    clearError,
  };
}
