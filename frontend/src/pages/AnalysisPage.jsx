/**
 * Analysis Page Component
 * 
 * Main analysis view with three-panel layout:
 * - Document Viewer (Apryse WebViewer)
 * - Dashboard (category breakdown, top concerns)
 * - Chat (document-aware Q&A)
 * 
 * Supports multiple concurrent analyses via session management.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalysis } from '../context/AnalysisContext';
import { useDocumentAnalysis, useChat } from '../hooks/useAnalysis';
import { getAnalysisStatus } from '../services/api';

// Components
import DocumentViewer from '../components/viewer/DocumentViewer';
import Dashboard from '../components/analysis/Dashboard';
import AIAssistantPanel from '../components/chat/AIAssistantPanel';
import AnalysisOnboarding from '../components/common/AnalysisOnboarding';

// Icons
import { ArrowLeft, LayoutDashboard, MessageSquare, Upload, FileSearch, Brain, CheckCircle2, Zap, AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

/**
 * Analysis Page
 */
export default function AnalysisPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { sessions, getActiveSession, setActiveSession, updateSession, addSession, removeSession } = useAnalysis();
  const { pollStatus } = useDocumentAnalysis();
  const chat = useChat();

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'chat'
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedClauseId, setSelectedClauseId] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);
  const startX = useRef(0);
  const startWidth = useRef(400);

  const SIDEBAR_MIN = 280;
  const SIDEBAR_MAX = 700;

  // Pointer Capture approach: the resize handle captures ALL pointer events
  // during drag, so iframes (like Apryse WebViewer) cannot steal them.
  const onPointerDown = useCallback((e) => {
    e.target.setPointerCapture(e.pointerId);
    setResizing(true);
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const onPointerMove = useCallback((e) => {
    if (!resizing) return;
    const delta = startX.current - e.clientX;
    const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + delta));
    setSidebarWidth(newWidth);
  }, [resizing]);

  const onPointerUp = useCallback((e) => {
    if (!resizing) return;
    e.target.releasePointerCapture(e.pointerId);
    setResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [resizing]);

  // Find current session
  const session = sessions.find(s => s.session_id === sessionId);

  // Session not found in context - try to recover from backend or show error
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  // Try to load session from backend if not in context
  useEffect(() => {
    // If it's already failed to load, don't infinitely retry
    if (sessionError) return;

    if (!session && sessionId && !sessionLoading) {
      setSessionLoading(true);
      getAnalysisStatus(sessionId)
        .then(status => {
          addSession({
            session_id: status.session_id,
            document_name: status.document_name,
            status: status.status,
            progress: status.progress,
            message: status.message,
            created_at: status.created_at,
            result: status.result || null,
          });
          setSessionLoading(false);
        })
        .catch(err => {
          console.error('Failed to load session:', err);
          setSessionError(
            err.code === 'session_not_found'
              ? 'This analysis has expired. Please upload your document again to start a fresh review.'
              : 'Failed to load analysis session. Please try refreshing the page.'
          );
          // Proactively remove stale session from local state if it exists
          if (err.code === 'session_not_found' && sessionId) {
            removeSession(sessionId);
          }
          // Intentionally do NOT reset sessionLoading(false) immediately. 
          // Setting the error will block it from retrying.
        });
    }
  }, [session, sessionId, sessionLoading, addSession, sessionError, removeSession]);

  // Set as active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  // Show onboarding automatically the first time unless user has dismissed it
  useEffect(() => {
    const seen = localStorage.getItem('clearclause-analysis-onboarding-seen');
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  // Derive status as a primitive to avoid infinite re-render loops
  const sessionStatus = session?.status;
  const sessionCreatedAt = session?.created_at;

  // Poll for updates if analysis in progress (with exponential backoff on errors)
  useEffect(() => {
    if (!sessionStatus) return;

    const isInProgress = sessionStatus === 'uploading' ||
      sessionStatus === 'extracting' ||
      sessionStatus === 'redacting' ||
      sessionStatus === 'analyzing';

    if (isInProgress) {
      let consecutiveErrors = 0;
      let cancelled = false;

      const poll = async () => {
        if (cancelled) return;
        try {
          await pollStatus(sessionId);
          consecutiveErrors = 0; // Reset on success
          if (!cancelled) setTimeout(poll, 2000);
        } catch (err) {
          consecutiveErrors++;
          console.error(`Polling failed (attempt ${consecutiveErrors}):`, err);
          if (consecutiveErrors >= 5) {
            // Stop polling after 5 consecutive errors to prevent storm
            console.error('Stopping poll after 5 consecutive failures');
            return;
          }
          // Exponential backoff: 4s, 8s, 16s, 32s
          const backoff = Math.min(4000 * Math.pow(2, consecutiveErrors - 1), 32000);
          if (!cancelled) setTimeout(poll, backoff);
        }
      };

      // Start first poll after 2s
      const initialTimer = setTimeout(poll, 2000);

      return () => {
        cancelled = true;
        clearTimeout(initialTimer);
      };
    }
  }, [sessionStatus, sessionId, pollStatus]);

  // Timer for elapsed time
  useEffect(() => {
    if (!sessionStatus) return;
    const isInProgress = !['complete', 'error'].includes(sessionStatus);
    if (!isInProgress) return;
    const startTime = sessionCreatedAt ? new Date(sessionCreatedAt).getTime() : Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStatus, sessionCreatedAt]);

  // Loading state - session not found or loading from backend
  if (!session) {
    if (sessionLoading) {
      return (
        <div className="analysis-page loading">
          <nav className="landing-nav">
            <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
              <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
              <span className="brand-name">ClearClause</span>
            </div>
            <div className="nav-links" />
            <ThemeToggle />
          </nav>
          <div className="loading-state">
            <div className="spinner-large"></div>
            <h2>Restoring session...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Fetching analysis results from server...</p>
          </div>
        </div>
      );
    }

    if (sessionError) {
      return (
        <div className="analysis-page loading">
          <nav className="landing-nav">
            <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
              <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
              <span className="brand-name">ClearClause</span>
            </div>
            <div className="nav-links" />
            <ThemeToggle />
          </nav>
          <div className="loading-state error">
            <AlertTriangle size={48} color="var(--error)" />
            <h2>Session Not Found</h2>
            <p style={{ color: 'var(--text-secondary)' }}>{sessionError}</p>
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>
              Upload New Document
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="analysis-page loading">
        <nav className="landing-nav">
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
            <span className="brand-name">ClearClause</span>
          </div>
          <div className="nav-links" />
          <ThemeToggle />
        </nav>
        <div className="loading-state">
          <div className="spinner-large"></div>
          <h2>Loading analysis...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Waiting for session data...</p>
          <button className="btn btn-primary" onClick={() => navigate('/upload')}>
            Upload New Document
          </button>
        </div>
      </div>
    );
  }

  // Analysis in progress - show step-by-step progress
  if (session.status !== 'complete' && session.status !== 'error') {
    const steps = [
      { key: 'uploading', label: 'Uploading', desc: 'Receiving document...', icon: Upload },
      { key: 'extracting', label: 'Extracting', desc: 'Extracting text with Apryse OCR...', icon: FileSearch },
      { key: 'redacting', label: 'Redacting', desc: 'Masking personal information...', icon: ShieldCheck },
      { key: 'analyzing', label: 'Analyzing', desc: 'AI clause classification...', icon: Brain },
      { key: 'complete', label: 'Complete', desc: 'Results ready!', icon: CheckCircle2 },
    ];
    const currentStepIndex = steps.findIndex(s => s.key === session.status);
    return (
      <div className="analysis-page loading">
        {/* Branded Navbar */}
        <nav className="landing-nav">
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
            <span className="brand-name">ClearClause</span>
          </div>
          <div className="nav-links" />
          <div className="nav-actions">
            <ThemeToggle />
            <button className="btn btn-secondary" onClick={() => navigate('/upload')}>
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </nav>
        {/* Progress Card */}
        <div className="progress-card">
          <h2 className="progress-title">Analyzing: {session.document_name}</h2>
          <p className="progress-subtitle">Our AI is reading every clause — this takes about 30–60 seconds.</p>
          {/* Step Indicators */}
          <div className="progress-steps">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStepIndex;
              const isComplete = index < currentStepIndex;
              const stepClass = isComplete ? 'complete' : isActive ? 'active' : 'pending';
              return (
                <React.Fragment key={step.key}>
                  <div className={`progress-step ${stepClass}`}>
                    <div className={`step-circle ${stepClass}`}>
                      {isComplete ? <CheckCircle2 size={20} /> : <StepIcon size={20} />}
                    </div>
                    <span className="step-label">{step.label}</span>
                    <span className="step-desc">{isActive ? session.message : step.desc}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`step-connector ${isComplete ? 'complete' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${session.progress}%` }}
              />
            </div>
            <span className="progress-percent">{session.progress}%</span>
          </div>
          {/* Time Info */}
          <div className="progress-time-info" aria-live="polite" aria-atomic="true">
            <span>Elapsed: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}</span>
            <span>
              {elapsedTime < 60
                ? `~${Math.max(0, 60 - elapsedTime)}s remaining`
                : 'Almost done...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (session.status === 'error') {
    return (
      <div className="analysis-page loading">
        <nav className="landing-nav">
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
            <span className="brand-name">ClearClause</span>
          </div>
          <div className="nav-links" />
          <ThemeToggle />
        </nav>
        <div className="progress-card error-card" role="alert">
          <AlertTriangle size={48} color="var(--error)" />
          <h2 className="progress-title">Analysis Failed</h2>
          <p className="progress-subtitle">{session.message || 'An unexpected error occurred during analysis.'}</p>
          <div className="error-card-actions">
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>
              Try Again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Analysis complete - show full interface
  return (
    <div className="analysis-page">
      {/* Header */}
      <header className="analysis-header">
        <div className="header-left">
          <div className="nav-brand" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/')}>
            <Zap className="logo-icon" size={24} color="var(--accent-primary)" />
            <span className="brand-name">ClearClause</span>
          </div>
          <span className="header-divider">|</span>
          <h2 className="header-doc-name">{session.document_name}</h2>
          {session.result && (
            <span className="clause-count">
              {session.result.total_clauses} clauses · {session.result.flagged_clauses} flagged
            </span>
          )}
        </div>
        <div className="header-actions">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className="header-info-btn"
              onClick={() => setShowOnboarding(true)}
              title="What you can do here"
              aria-label="Show tips for using this analysis view"
            >
              <Info size={16} />
            </button>
            <AnalysisOnboarding
              visible={showOnboarding}
              onDismiss={() => {
                setShowOnboarding(false);
                localStorage.setItem('clearclause-analysis-onboarding-seen', 'true');
              }}
            />
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => navigate('/upload')}
          >
            <Upload size={14} style={{ marginRight: 6 }} />
            Analyze Another Document
          </button>
          <ThemeToggle />
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button
            className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={16} /> Chat
          </button>
        </div>
      </header>

      {/* Mobile Tab Bar */}
      <div className="mobile-tab-bar" aria-label="Switch between Dashboard and Chat">
        <button
          className={`mobile-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          aria-pressed={activeTab === 'dashboard'}
        >
          <LayoutDashboard size={20} /> Dashboard
        </button>
        <button
          className={`mobile-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-pressed={activeTab === 'chat'}
        >
          <MessageSquare size={20} /> Chat
        </button>
      </div>

      {/* Main Content */}
      <main className="analysis-content">
        {/* Left: Document Viewer */}
        <div className="viewer-panel">
          <DocumentViewer
            sessionId={sessionId}
            clauses={session.result?.clauses || []}
            selectedClauseId={selectedClauseId}
            onAnnotationClick={(clauseId) => setSelectedClauseId(clauseId)}
          />
        </div>

        {/* Resize Handle — uses Pointer Capture for iframe-safe dragging */}
        <div
          className={`resize-handle ${resizing ? 'active' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: 'none' }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              setSidebarWidth(w => Math.min(SIDEBAR_MAX, w + 20));
            } else if (e.key === 'ArrowRight') {
              setSidebarWidth(w => Math.max(SIDEBAR_MIN, w - 20));
            }
          }}
        />

        {/* Right: Dashboard or Chat */}
        <div className="side-panel" style={{ width: sidebarWidth }}>
          {activeTab === 'dashboard' && session.result && (
            <Dashboard
              result={session.result}
              onClauseSelect={(clauseId) => setSelectedClauseId(clauseId)}
              selectedClauseId={selectedClauseId}
            />
          )}

          {activeTab === 'chat' && (
            <AIAssistantPanel
              sessionId={sessionId}
            />
          )}
        </div>
      </main>

    </div>
  );
}
