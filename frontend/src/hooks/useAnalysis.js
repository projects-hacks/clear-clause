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
      // Upload document and get SSE stream
      const { sessionId, reader, readProgress } = await uploadDocument(file);

      // Add session to state
      addSession({
        session_id: sessionId,
        document_name: file.name,
        status: 'uploading',
        progress: 10,
        message: 'Document uploaded, starting analysis...',
        created_at: new Date().toISOString(),
      });

      // Read progress updates from SSE stream
      while (true) {
        const progress = await readProgress();
        
        if (!progress) {
          // Stream ended
          break;
        }

        if (progress.error) {
          // Error from server
          throw new Error(progress.error);
        }

        // Update session with progress
        updateSession(sessionId, {
          status: progress.stage,
          progress: progress.progress,
          message: progress.message,
          result: progress.data || null,
        });

        // Stop if complete or error
        if (progress.stage === 'complete' || progress.stage === 'error') {
          break;
        }
      }

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
