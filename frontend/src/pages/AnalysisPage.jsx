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
import { useDocumentAnalysis, useChat, useVoiceSummary } from '../hooks/useAnalysis';

// Components
import DocumentViewer from '../components/viewer/DocumentViewer';
import Dashboard from '../components/analysis/Dashboard';
import ChatPanel from '../components/chat/ChatPanel';
import VoiceSummary from '../components/voice/VoiceSummary';

// Icons
import { ArrowLeft, Volume2, LayoutDashboard, MessageSquare } from 'lucide-react';

/**
 * Analysis Page
 */
export default function AnalysisPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { sessions, getActiveSession, setActiveSession, updateSession } = useAnalysis();
  const { pollStatus } = useDocumentAnalysis();
  const chat = useChat();
  const voice = useVoiceSummary();

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'chat'
  const [showVoice, setShowVoice] = useState(false);

  // Find current session
  const session = sessions.find(s => s.session_id === sessionId);

  // Set as active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  // Poll for updates if analysis in progress
  useEffect(() => {
    if (!session) return;

    const isInProgress = session.status === 'uploading' ||
      session.status === 'extracting' ||
      session.status === 'analyzing';

    if (isInProgress) {
      const interval = setInterval(async () => {
        try {
          await pollStatus(sessionId);
        } catch (err) {
          console.error('Polling failed:', err);
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [session, sessionId, pollStatus]);

  // Loading state - session not found
  if (!session) {
    return (
      <div className="analysis-page loading">
        <div className="loading-state">
          <div className="spinner-large"></div>
          <h2>Loading analysis...</h2>
          <p>Session not found</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/upload')}
          >
            Upload New Document
          </button>
        </div>
      </div>
    );
  }

  // Analysis in progress - show loading state
  if (session.status !== 'complete' && session.status !== 'error') {
    return (
      <div className="analysis-page loading">
        <header className="analysis-header">
          <button
            className="btn btn-secondary back-btn"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h2>{session.document_name}</h2>
          <div className="session-status">
            <span className={`status-indicator ${session.status}`}></span>
            {session.status}
          </div>
        </header>

        <main className="analysis-content">
          <div className="progress-container">
            <div className="progress-info">
              <span>{session.message}</span>
              <span>{session.progress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${session.progress}%` }}
              ></div>
            </div>
          </div>

          {/* Skeleton Viewer */}
          <div className="viewer-skeleton">
            <div className="skeleton" style={{ height: '100%' }}></div>
          </div>
        </main>
      </div>
    );
  }

  // Analysis complete - show full interface
  return (
    <div className="analysis-page">
      {/* Header */}
      <header className="analysis-header">
        <div className="header-left">
          <button
            className="btn btn-secondary back-btn"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h2>{session.document_name}</h2>
          {session.result && (
            <span className="clause-count">
              {session.result.total_clauses} clauses · {session.result.flagged_clauses} flagged
            </span>
          )}
        </div>

        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowVoice(!showVoice)}
          >
            <Volume2 size={16} /> Voice Summary
          </button>
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

      {/* Main Content */}
      <main className="analysis-content">
        {/* Left: Document Viewer */}
        <div className="viewer-panel">
          <DocumentViewer
            sessionId={sessionId}
            clauses={session.result?.clauses || []}
          />
        </div>

        {/* Right: Dashboard or Chat */}
        <div className="side-panel">
          {activeTab === 'dashboard' && session.result && (
            <Dashboard
              result={session.result}
              onClauseSelect={(clauseId) => {
                // Highlight clause in viewer
                console.log('Select clause:', clauseId);
              }}
            />
          )}

          {activeTab === 'chat' && (
            <ChatPanel
              sessionId={sessionId}
              isLoading={chat.isLoading}
              onSendMessage={chat.sendMessage}
            />
          )}
        </div>
      </main>

      {/* Voice Summary Overlay */}
      {showVoice && session.result && (
        <VoiceSummary
          sessionId={sessionId}
          summary={session.result.summary}
          isGenerating={voice.isGenerating}
          audioUrl={voice.audioUrl}
          onGenerate={voice.generate}
          onClose={() => {
            voice.clearAudio();
            setShowVoice(false);
          }}
        />
      )}
    </div>
  );
}
