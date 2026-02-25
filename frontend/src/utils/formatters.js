/**
 * Utility Functions for ClearClause Frontend
 * 
 * Formatters, helpers, and common utilities.
 */

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format timestamp to locale string
 */
export function formatTimestamp(date, options = {}) {
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return new Date(date).toLocaleString(undefined, { ...defaultOptions, ...options });
}

/**
 * Format time duration (MM:SS)
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format clause ID to readable label
 */
export function formatClauseId(clauseId) {
  if (!clauseId) return '';
  
  // Convert clause_1 to Clause 1
  const match = clauseId.match(/clause_(\d+)/i);
  if (match) {
    return `Clause ${match[1]}`;
  }
  
  return clauseId;
}

/**
 * Calculate percentage with bounds
 */
export function calculatePercentage(part, total, decimals = 1) {
  if (!total || total === 0) return 0;
  return Math.min(100, Math.max(0, ((part / total) * 100).toFixed(decimals)));
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Sleep/delay utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

/**
 * Download file from blob
 */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Parse SSE event data
 */
export function parseSSEEvent(text) {
  if (!text) return null;
  
  // Handle multiple events in one chunk
  const events = text.split('\n\n').filter(Boolean);
  const parsed = [];
  
  for (const event of events) {
    const lines = event.split('\n');
    let data = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        data += line.slice(6);
      }
    }
    
    if (data) {
      try {
        parsed.push(JSON.parse(data));
      } catch (e) {
        console.warn('Failed to parse SSE data:', e);
      }
    }
  }
  
  return parsed;
}

/**
 * Validate PDF file
 */
export function validatePDFile(file, maxSizeMB = 50) {
  const errors = [];
  
  // Check file type
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    errors.push('File must be a PDF');
  }
  
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    errors.push(`File size must be less than ${maxSizeMB}MB`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
