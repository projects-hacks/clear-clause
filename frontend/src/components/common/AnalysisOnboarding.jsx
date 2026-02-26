/**
 * Analysis Onboarding
 *
 * Optional first-visit tooltip showing "What you can do" on the Analysis page.
 */
import React, { useState, useEffect } from 'react';
import { X, LayoutDashboard, MessageSquare, FileText, MapPin } from 'lucide-react';

const STORAGE_KEY = 'clearclause-analysis-onboarding-seen';

export default function AnalysisOnboarding() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!visible) return null;

  return (
    <div
      className="analysis-onboarding"
      role="dialog"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-desc"
    >
      <div className="onboarding-header">
        <h3 id="onboarding-title">What you can do</h3>
        <button
          type="button"
          className="onboarding-close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
      <div id="onboarding-desc" className="onboarding-content">
        <div className="onboarding-item">
          <LayoutDashboard size={18} />
          <span><strong>Dashboard</strong> — View clause breakdown, top concerns, and fairness score</span>
        </div>
        <div className="onboarding-item">
          <MessageSquare size={18} />
          <span><strong>Chat</strong> — Ask questions about your document in plain language</span>
        </div>
        <div className="onboarding-item">
          <FileText size={18} />
          <span>Click any clause to expand details and see suggestions</span>
        </div>
        <div className="onboarding-item">
          <MapPin size={18} />
          <span>Use <strong>Jump to Page</strong> to locate clauses in the PDF</span>
        </div>
      </div>
      <button className="btn btn-secondary btn-small" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
