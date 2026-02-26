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
import React, { useEffect, useState } from 'react';
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
import { ArrowLeft, LayoutDashboard, MessageSquare, Upload, FileSearch, Brain, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

/**
 * Analysis Page
 */
export default function AnalysisPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { sessions, getActiveSession, setActiveSession, updateSession, addSession } = useAnalysis();
  const { pollStatus } = useDocumentAnalysis();
  const chat = useChat();

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'chat'
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedClauseId, setSelectedClauseId] = useState(null);

  // Find current session
  const session = sessions.find(s => s.session_id === sessionId);

  // Session not found in context - try to recover from backend or show error
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  // Try to load session from backend if not in context
  useEffect(() => {
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
        })
        .catch(err => {
          console.error('Failed to load session:', err);
          setSessionError(err.message);
        })
        .finally(() => setSessionLoading(false));
    }
  }, [session, sessionId, sessionLoading, addSession]);

  // Set as active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  // Derive status as a primitive to avoid infinite re-render loops
  const sessionStatus = session?.status;
  const sessionCreatedAt = session?.created_at;

  // Poll for updates if analysis in progress
  useEffect(() => {
    if (!sessionStatus) return;

    const isInProgress = sessionStatus === 'uploading' ||
      sessionStatus === 'extracting' ||
      sessionStatus === 'analyzing';

    if (isInProgress) {
      const interval = setInterval(async () => {
        try {
          await pollStatus(sessionId);
        } catch (err) {
          console.error('Polling failed:', err);
        }
      }, 2000);

      return () => clearInterval(interval);
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
      { key: 'extracting', label: 'Extracting', desc: 'OCR text extraction...', icon: FileSearch },
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
          <nav className="landing-nav" style={{ borderBottom: 'none', padding: 0, background: 'transparent', position: 'relative' }}>
            <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
              <Zap className="logo-icon" size={24} color="var(--accent-primary)" />
              <span className="brand-name">ClearClause</span>
            </div>
          </nav>
          <span style={{ color: 'var(--surface-border)', margin: '0 var(--space-3)' }}>|</span>
          <h2 style={{ fontSize: 'var(--text-base)', margin: 0 }}>{session.document_name}</h2>
          {session.result && (
            <span className="clause-count">
              {session.result.total_clauses} clauses · {session.result.flagged_clauses} flagged
            </span>
          )}
        </div>
        <div className="header-actions">
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
          />
        </div>

        {/* Right: Dashboard or Chat */}
        <div className="side-panel">
          <AnalysisOnboarding />
          {activeTab === 'dashboard' && session.result && (
            <Dashboard
              result={session.result}
              onClauseSelect={(clauseId) => setSelectedClauseId(clauseId)}
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
