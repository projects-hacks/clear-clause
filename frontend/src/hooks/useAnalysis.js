/**
 * Custom Hook for Document Analysis
 * 
 * Manages SSE connection for real-time progress updates.
 * Handles multiple concurrent analyses.
 */
import { useState, useCallback } from 'react';
import { uploadDocument, getAnalysisStatus } from '../services/api';
import { useAnalysis } from '../context/AnalysisContext';

/**
 * Hook for managing document analysis lifecycle
 */
export function useDocumentAnalysis() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { addSession, updateSession } = useAnalysis();

  /**
   * Start analysis for a new document
   */
  const startAnalysis = useCallback(async (file) => {
    setIsUploading(true);
    setError(null);

    try {
      const stream = await uploadDocument(file);

      // Prefer session ID from header; SSE is optional now
      const sessionId = stream.sessionId;

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

      // Poll status in the background until analysis completes.
      // This avoids relying on SSE parsing and keeps the UI in sync.
      (async () => {
        try {
          let done = false;
          while (!done) {
            const status = await getAnalysisStatus(sessionId);
            updateSession(sessionId, {
              status: status.status,
              progress: status.progress,
              message: status.message,
              result: status.result || null,
            });
            if (status.status === 'complete' || status.status === 'error') {
              done = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          console.error('Background polling failed:', err);
          updateSession(sessionId, { status: 'error', message: 'Analysis failed while polling for updates.' });
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
    if (isLoading) {
      // Drop duplicate submissions while a request is in flight.
      return null;
    }
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
