/**
 * API Client for ClearClause Backend
 * 
 * Handles all API communication with session management.
 * Supports multiple concurrent document analyses.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Parse SSE event data from text chunk
 * Handles multiple events in one chunk and partial events
 */
function parseSSEData(text) {
  const events = [];
  const lines = text.split('\n');
  let currentData = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Comment lines start with ":" in SSE
    if (trimmed.startsWith(':')) continue;

    // Empty line marks end of event
    if (trimmed === '') {
      if (currentData) {
        try {
          events.push(JSON.parse(currentData));
        } catch (e) {
          console.warn('Failed to parse SSE event:', e);
        }
        currentData = '';
      }
      continue;
    }

    // Parse data line
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim();
      currentData += data;
    }
  }

  // Handle any remaining data (partial event)
  if (currentData) {
    try {
      events.push(JSON.parse(currentData));
    } catch (e) {
      // Partial event, wait for more data
    }
  }

  return events;
}

/**
 * Upload a document and start analysis.
 * Returns session ID for tracking progress.
 *
 * @param {File} file - PDF file to upload
 * @returns {Promise<{sessionId: string}>}
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message || 'Failed to upload document');
  }

  // Get session ID from header (may be null if CORS blocks it)
  let sessionId = response.headers.get('X-Session-ID');

  // Return SSE stream reader
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    get sessionId() { return sessionId; },
    reader,

    /**
     * Read all available progress events from the current chunk
     * Returns array of all events (may be empty if stream is done)
     */
    async readAllProgress() {
      const { done, value } = await reader.read();
      if (done) return [];

      // Decode and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Parse all complete events from buffer
      const events = parseSSEData(buffer);

      // Keep any incomplete event in buffer
      const lastEventEnd = buffer.lastIndexOf('\n\n');
      if (lastEventEnd > 0) {
        buffer = buffer.slice(lastEventEnd + 2);
      }

      // Extract sessionId from any event if not yet known
      for (const event of events) {
        if (event?.session_id && !sessionId) {
          sessionId = event.session_id;
          break;
        }
      }

      return events;
    },

    /**
     * Read the most recent progress event (convenience wrapper)
     */
    async readProgress() {
      const events = await this.readAllProgress();
      return events.length > 0 ? events[events.length - 1] : null;
    },
  };
}

/**
 * Get analysis status for a session.
 * 
 * @param {string} sessionId - Session ID
 * @returns {Promise<AnalysisStatus>}
 */
export async function getAnalysisStatus(sessionId) {
  const response = await fetch(`${API_BASE_URL}/analyze/${sessionId}`);

  if (!response.ok) {
    // Differentiate between 404 (session gone) and 429 (rate limited)
    if (response.status === 429) {
      const error = new Error('Too many requests. Slowing down...');
      error.code = 'rate_limited';
      throw error;
    }

    let message = 'Analysis session not found or has expired. Please upload your document again.';
    try {
      const body = await response.json();
      if (body?.detail) {
        message = body.detail;
      }
    } catch {
      // ignore JSON parse errors, fall back to default message
    }
    const error = new Error(message);
    error.code = response.status === 404 ? 'session_not_found' : 'api_error';
    throw error;
  }

  return response.json();
}

/**
 * List all active analysis sessions.
 * 
 * @returns {Promise<SessionStatus[]>}
 */
export async function listSessions() {
  const response = await fetch(`${API_BASE_URL}/sessions`);

  if (!response.ok) {
    return [];
  }

  return response.json();
}

/**
 * Cancel an analysis session.
 * 
 * @param {string} sessionId - Session ID to cancel
 * @returns {Promise<{status: string}>}
 */
export async function cancelSession(sessionId) {
  const response = await fetch(`${API_BASE_URL}/session/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to cancel session');
  }

  return response.json();
}

/**
 * Ask a question about an analyzed document.
 * 
 * @param {string} sessionId - Session ID
 * @param {string} question - User question
 * @param {Array} history - Previous chat messages
 * @param {Object} options - Additional API options
 * @returns {Promise<ChatResponse>}
 */
export async function askQuestion(sessionId, question, history = [], options = {}) {
  const { onChunk, onSources, signal } = options;

  const response = await fetch(`${API_BASE_URL}/chat?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      question,
      history,
    }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 429) {
      const error = new Error('You are asking questions too quickly. Please wait a moment before trying again.');
      error.code = 'rate_limited';
      throw error;
    }

    let message = 'Chat request failed';
    try {
      const body = await response.json();
      if (body?.detail) {
        message = body.detail;
      }
    } catch {
      // ignore parse errors, fall back to default
    }

    const error = new Error(message);
    error.code = 'api_error';
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let fullText = '';
  let finalSources = null;
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');

    // The last part might be incomplete, keep it in the buffer
    buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.startsWith('data: ')) {
        const dataStr = part.substring(6).trim();

        if (dataStr === '[DONE]') continue;
        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);

          if (data.error) {
            throw new Error(data.error);
          }
          if (data.text) {
            fullText += data.text;
            if (onChunk) onChunk(fullText, data.text);
          }
          if (data.sources) {
            finalSources = data.sources;
            if (onSources) onSources(data.sources);
          }
        } catch (e) {
          if (e.message !== 'Unexpected end of JSON input') {
            console.error("Error parsing SSE chunk:", e, "Data string:", dataStr);
          }
        }
      }
    }
  }

  return { answer: fullText, sources: finalSources || [] };
}

/**
 * Generate speech from text using Deepgram Aura-2.
 * 
 * @param {string} sessionId - Session ID
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Blob>} Audio blob
 */
export async function generateSpeech(sessionId, text) {
  const response = await fetch(`${API_BASE_URL}/voice-summary?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      const rateError = new Error('Too many voice playback requests. Please slow down and try again.');
      rateError.code = 'rate_limited';
      throw rateError;
    }

    let message = 'Speech generation failed';
    try {
      const body = await response.json();
      if (body?.error === 'session_not_found') {
        message = 'This analysis session has expired. Please upload your document again.';
      } else if (body?.detail) {
        message = body.detail;
      }
    } catch {
      // ignore JSON parse errors
    }
    const error = new Error(message);
    if (message.includes('expired')) {
      error.code = 'session_not_found';
    }
    throw error;
  }

  return response.blob();
}

/**
 * Transcribe audio using Deepgram Nova-2 STT.
 * 
 * @param {string} sessionId - Session ID
 * @param {Blob} audioBlob - Audio data
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(sessionId, audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');

  const response = await fetch(`${API_BASE_URL}/transcribe?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let raw = '';
    let message = 'Transcription failed';
    try {
      raw = await response.text();
      try {
        const body = JSON.parse(raw);
        if (body?.error === 'session_not_found') {
          message = 'This analysis session has expired. Please upload your document again.';
        } else if (body?.detail) {
          message = body.detail;
        }
      } catch {
        // non‑JSON body, fall back to raw text
        if (raw) {
          message = `Transcription failed: ${raw}`;
        }
      }
    } catch {
      // ignore read errors
    }

    const error = new Error(message);
    if (response.status === 429) {
      error.code = 'rate_limited';
    }
    if (message.includes('expired')) {
      error.code = 'session_not_found';
    }
    throw error;
  }

  const data = await response.json();
  return data.transcript;
}
