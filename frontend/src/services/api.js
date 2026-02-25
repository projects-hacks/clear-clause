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

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(':')) continue;

    // Parse data line
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim();
      currentData += data;
    }

    // Empty line marks end of event
    if (trimmed === '' && currentData) {
      try {
        events.push(JSON.parse(currentData));
        currentData = '';
      } catch (e) {
        console.warn('Failed to parse SSE event:', e);
      }
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
    async readProgress() {
      const { done, value } = await reader.read();
      if (done) return null;

      // Decode and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Parse all complete events from buffer
      const events = parseSSEData(buffer);

      // Keep any incomplete event in buffer
      const lastEventEnd = buffer.lastIndexOf('\n\n');
      if (lastEventEnd > 0) {
        buffer = buffer.slice(lastEventEnd + 2);
      }

      // Return the last event (most recent progress)
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;

      // Fallback: extract sessionId from SSE payload
      if (lastEvent?.session_id && !sessionId) {
        sessionId = lastEvent.session_id;
      }

      return lastEvent;
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
    throw new Error('Session not found or expired');
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
 * @returns {Promise<ChatResponse>}
 */
export async function askQuestion(sessionId, question) {
  const response = await fetch(`${API_BASE_URL}/chat?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
    }),
  });

  if (!response.ok) {
    throw new Error('Chat request failed');
  }

  return response.json();
}

/**
 * Generate voice summary.
 * 
 * @param {string} sessionId - Session ID
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Blob>} Audio blob
 */
export async function generateVoiceSummary(sessionId, text) {
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
    throw new Error('Voice summary generation failed');
  }

  return response.blob();
}
