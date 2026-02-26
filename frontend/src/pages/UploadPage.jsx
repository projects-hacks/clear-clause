/**
 * Upload Page Component
 * 
 * Drag-and-drop file upload with validation.
 * Supports multiple concurrent document uploads.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentAnalysis } from '../hooks/useAnalysis';
import { useAnalysis } from '../context/AnalysisContext';
import { Zap, FileUp, CheckCircle2, AlertTriangle, FileText, Smartphone, Handshake, Search, Loader2, ArrowLeft, Brain, Volume2, Scale, ShieldCheck } from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

/**
 * Upload Page
 */
export default function UploadPage() {
  const navigate = useNavigate();
  const { startAnalysis, isUploading, error, clearError } = useDocumentAnalysis();
  const { sessions, addSession, setActiveSession, removeSession, clearComplete } = useAnalysis();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [duplicateError, setDuplicateError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [sampleError, setSampleError] = useState(null);
  const [queueFilter, setQueueFilter] = useState('all'); // all | in_progress | complete | error

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((file) => {
    setValidationError(null);
    // Validate file type
    if (file.type !== 'application/pdf') {
      setValidationError('Please upload a PDF file.');
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setValidationError('File size must be less than 50MB.');
      return;
    }

    setSelectedFile(file);
    clearError();
    setDuplicateError(null);
  }, [clearError]);

  /**
   * Handle drag events
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  /**
   * Start analysis
   */
  const handleAnalyze = async () => {
    if (!selectedFile) return;

    // Prevent duplicate uploads
    const isDuplicate = sessions.some(
      s => s.document_name === selectedFile.name &&
        !['complete', 'error'].includes(s.status)
    );
    if (isDuplicate) {
      setDuplicateError(`"${selectedFile.name}" is already being processed.`);
      return;
    }

    try {
      const sessionId = await startAnalysis(selectedFile);
      setSelectedFile(null); // Clear for next upload
      // Navigate to analysis page to show progress steps
      if (sessionId) {
        navigate(`/analysis/${sessionId}`);
      }
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  /**
   * Load sample document (for demo)
   */
  const handleSampleDocument = async (docName) => {
    const fileMap = {
      'Airbnb ToS': 'airbnb_tos.pdf',
      'NDA Template': 'nda_template.pdf'
    };

    const fileName = fileMap[docName];
    if (!fileName) return;

    setSampleError(null);
    try {
      const response = await fetch(`/samples/${fileName}`);
      if (!response.ok) throw new Error('Sample not found');

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      handleFileSelect(file);
    } catch (err) {
      setSampleError(`Could not load sample: ${docName}. Please try again.`);
    }
  };

  const isInProgressStatus = (status) => !['complete', 'error'].includes(status);

  const formatRelativeTime = (createdAt) => {
    if (!createdAt) return null;
    const ts = new Date(createdAt).getTime();
    if (Number.isNaN(ts)) return null;
    const diffSeconds = Math.floor((Date.now() - ts) / 1000);
    if (diffSeconds < 10) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const sortedSessions = [...sessions]
    .sort((a, b) => {
      const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    })
    .slice(0, 10);

  const counts = {
    all: sortedSessions.length,
    in_progress: sortedSessions.filter(s => isInProgressStatus(s.status)).length,
    complete: sortedSessions.filter(s => s.status === 'complete').length,
    error: sortedSessions.filter(s => s.status === 'error').length,
  };

  const sessionsToShow = sortedSessions.filter((s) => {
    if (queueFilter === 'in_progress') return isInProgressStatus(s.status);
    if (queueFilter === 'complete') return s.status === 'complete';
    if (queueFilter === 'error') return s.status === 'error';
    return true;
  });

  // Warn before closing tab if analyses are in progress
  useEffect(() => {
    const hasInProgress = sessions.some(
      s => !['complete', 'error'].includes(s.status)
    );
    const handleBeforeUnload = (e) => {
      if (hasInProgress) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessions]);

  return (
    <div className="upload-page">
      {/* Navigation */}
      <nav className="landing-nav" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
          <span className="brand-name">ClearClause</span>
        </div>
        <div className="nav-links" />
        <div className="nav-actions">
          <ThemeToggle />
          <button
            className="btn btn-secondary back-btn"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </nav>

      {/* Page Title */}
      <div className="upload-title-section">
        <h1 className="upload-title">Upload & Analyze</h1>
        <p className="upload-subtitle">
          Upload any contract, lease, or legal document. Our AI reads every clause,
          flags risks, and gives you plain-language explanations in under 60 seconds.
        </p>
      </div>

      {/* Feature Highlights */}
      <div className="feature-highlights">
        <div className="feature-card">
          <div className="feature-icon blue"><Brain size={24} /></div>
          <h4>AI-Powered Analysis</h4>
          <p>Gemini AI classifies every clause by risk category and severity level</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon purple"><Volume2 size={24} /></div>
          <h4>Voice Summary</h4>
          <p>Listen to an AI-narrated summary of findings via Deepgram TTS</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon green"><Scale size={24} /></div>
          <h4>Fairness Compare</h4>
          <p>See how your document stacks up against industry-standard contracts</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="upload-content" id="main-content">
        {/* Drop Zone */}
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="region"
          aria-label="File drop zone"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              document.getElementById('file-input')?.click();
            }
          }}
        >
          {!selectedFile ? (
            <>
              <div className="drop-zone-icon" aria-hidden="true"><FileUp size={48} color="var(--accent-primary)" /></div>
              <h2>Drag & drop your document</h2>
              <p>or click to browse</p>
              <p className="drop-zone-hint">Supports: PDF (up to 50MB)</p>
              <p className="drop-zone-security"><ShieldCheck size={14} aria-hidden="true" /> Encrypted in transit · Auto-deleted after 30 min</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleInputChange}
                className="file-input"
                id="file-input"
                aria-label="Select PDF file to upload"
              />
              <label htmlFor="file-input" className="btn btn-secondary" role="button" tabIndex={0}>
                Browse Files
              </label>
            </>
          ) : (
            <>
              <div className="drop-zone-icon"><CheckCircle2 size={48} color="var(--success)" /></div>
              <h2>Selected: {selectedFile.name}</h2>
              <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedFile(null)}
              >
                Choose Different File
              </button>
            </>
          )}
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="error-message" role="alert" aria-live="assertive">
            <span className="error-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
            {validationError}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message" role="alert" aria-live="assertive">
            <span className="error-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
            {error}
          </div>
        )}

        {/* Duplicate Error Message */}
        {duplicateError && (
          <div className="error-message" role="alert" aria-live="assertive">
            <span className="error-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
            {duplicateError}
          </div>
        )}

        {/* Analyze Button */}
        {selectedFile && (
          <button
            className="btn btn-primary btn-large analyze-btn"
            onClick={handleAnalyze}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="spinner" />
                Uploading...
              </>
            ) : (
              <>
                <Search size={18} /> Analyze Document
              </>
            )}
          </button>
        )}

        {/* Sample Documents */}
        <div className="sample-documents">
          <div className="sample-section-header">
            <h3>See a Real-World Example</h3>
            <p>Don't have a document ready? Discover how ClearClause spots hidden risks in common contracts.</p>
          </div>

          <div className="sample-cards-grid">
            <div
              className="sample-doc-card"
              onClick={() => handleSampleDocument('Airbnb ToS')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSampleDocument('Airbnb ToS') }}
            >
              <div className="sample-icon purple"><Smartphone size={24} /></div>
              <div className="sample-info">
                <h4>App Terms of Service</h4>
                <p>See exactly what data you're giving away and if you're waiving your right to sue.</p>
              </div>
              <div className="sample-action"><Search size={14} /> Analyze ToS</div>
            </div>

            <div
              className="sample-doc-card"
              onClick={() => handleSampleDocument('NDA Template')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSampleDocument('NDA Template') }}
            >
              <div className="sample-icon green"><Handshake size={24} /></div>
              <div className="sample-info">
                <h4>Freelance NDA</h4>
                <p>Check for overly broad IP assignments or unreasonable non-compete clauses.</p>
              </div>
              <div className="sample-action"><Search size={14} /> Analyze NDA</div>
            </div>
          </div>
          {sampleError && (
            <div className="error-message" role="alert" style={{ marginTop: 'var(--space-4)' }}>
              <span className="error-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
              {sampleError}
            </div>
          )}
        </div>

        {/* Processing Queue */}
        {sessions.length > 0 && (
          <div className="processing-queue" aria-live="polite" aria-atomic="false">
            <div className="queue-header">
              <div className="queue-title">
                <Loader2 size={16} className={sessions.some(s => isInProgressStatus(s.status)) ? 'spinner' : ''} />
                <div>
                  <h3>Analyses</h3>
                  <p className="queue-subtitle">In progress and recent results</p>
                </div>
              </div>
              {counts.complete + counts.error > 0 && (
                <button
                  className="btn btn-secondary btn-small"
                  onClick={clearComplete}
                  title="Remove completed and failed analyses from this list"
                >
                  Clear completed
                </button>
              )}
            </div>

            <div className="queue-filters" role="tablist" aria-label="Filter analyses">
              <button className={`queue-filter ${queueFilter === 'all' ? 'active' : ''}`} onClick={() => setQueueFilter('all')} role="tab" aria-selected={queueFilter === 'all'}>
                All <span className="queue-count">{counts.all}</span>
              </button>
              <button className={`queue-filter ${queueFilter === 'in_progress' ? 'active' : ''}`} onClick={() => setQueueFilter('in_progress')} role="tab" aria-selected={queueFilter === 'in_progress'}>
                In progress <span className="queue-count">{counts.in_progress}</span>
              </button>
              <button className={`queue-filter ${queueFilter === 'complete' ? 'active' : ''}`} onClick={() => setQueueFilter('complete')} role="tab" aria-selected={queueFilter === 'complete'}>
                Completed <span className="queue-count">{counts.complete}</span>
              </button>
              <button className={`queue-filter ${queueFilter === 'error' ? 'active' : ''}`} onClick={() => setQueueFilter('error')} role="tab" aria-selected={queueFilter === 'error'}>
                Failed <span className="queue-count">{counts.error}</span>
              </button>
            </div>

            <div className="queue-list">
              {sessionsToShow.map((session) => {
                const relTime = formatRelativeTime(session.created_at);
                const inProgress = isInProgressStatus(session.status);
                const flagged = session.result?.flagged_clauses;
                const total = session.result?.total_clauses;

                const statusLabel = inProgress
                  ? 'In progress'
                  : session.status === 'complete'
                    ? 'Completed'
                    : 'Failed';

                return (
                  <div key={session.session_id} className={`queue-item ${session.status}`}>
                    <div className="queue-item-left">
                      <div className={`queue-status-icon ${session.status}`}>
                        {session.status === 'complete' ? <CheckCircle2 size={16} /> : session.status === 'error' ? <AlertTriangle size={16} /> : <FileText size={16} />}
                      </div>
                      <div className="queue-item-info">
                        <span className="queue-doc-name">{session.document_name}</span>
                        <div className="queue-meta">
                          <span className={`queue-chip ${session.status}`}>{statusLabel}</span>
                          {relTime && <span className="queue-time">{relTime}</span>}
                          {session.status === 'complete' && typeof flagged === 'number' && typeof total === 'number' && (
                            <span className="queue-stats">{flagged} flagged · {total} clauses</span>
                          )}
                        </div>
                        <span className="queue-status-text">
                          {session.status === 'complete' ? (session.message || 'Analysis complete') :
                            session.status === 'error' ? (session.message || 'Failed') :
                              (session.message || 'Processing...')}
                        </span>
                      </div>
                    </div>
                    <div className="queue-item-right">
                      {session.status === 'complete' ? (
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => navigate(`/analysis/${session.session_id}`)}
                        >
                          <CheckCircle2 size={14} /> View results
                        </button>
                      ) : session.status === 'error' ? (
                        <span className="queue-error-badge">
                          <AlertTriangle size={14} /> Failed
                        </span>
                      ) : (
                        <div className="thinking-log">
                          {session.message_history?.map((msg, idx) => {
                            const isLast = idx === session.message_history.length - 1;
                            const isComplete = session.status === 'complete';

                            return (
                              <div key={idx} className={`thinking-step ${isLast && !isComplete ? 'active' : 'done'}`}>
                                <div className="step-indicator">
                                  {isLast && !isComplete ? (
                                    <Loader2 size={12} className="spinner" />
                                  ) : (
                                    <CheckCircle2 size={12} />
                                  )}
                                </div>
                                <span>{msg}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
