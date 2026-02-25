/**
 * Clause Card Component
 *
 * Displays individual clause details with category, severity, and suggestions.
 */
import React from 'react';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, MessageCircle, BarChart2, Lightbulb, Copy, MapPin, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Clause Card
 */
export default function ClauseCard({ clause, isExpanded, onToggle, onClick }) {
  const {
    clause_id,
    text,
    plain_language,
    category,
    severity,
    typical_comparison,
    suggestion,
    page_number,
  } = clause;

  const categoryLabels = {
    rights_given_up: 'Rights Given Up',
    one_sided: 'One-Sided',
    financial_impact: 'Financial Impact',
    missing_protection: 'Missing Protection',
    standard: 'Standard',
  };

  const severityIcons = {
    critical: <AlertOctagon size={14} />,
    warning: <AlertTriangle size={14} />,
    info: <Info size={14} />,
    safe: <CheckCircle2 size={14} />,
  };

  return (
    <div 
      className={`clause-card ${category} ${severity} ${isExpanded ? 'expanded' : ''}`}
      onClick={onToggle}
    >
      {/* Card Header */}
      <div className="clause-card-header">
        <div className="clause-badges">
          <span className={`badge badge-${category}`}>
            {categoryLabels[category]}
          </span>
          <span className={`badge badge-${severity}`}>
            {severityIcons[severity]} {severity}
          </span>
        </div>
        <span className="clause-page">Page {page_number}</span>
      </div>

      {/* Clause Text */}
      <div className="clause-text">
        <p>{text.length > 200 && !isExpanded ? `${text.slice(0, 200)}...` : text}</p>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="clause-card-content">
          {/* Plain Language Explanation */}
          <div className="clause-section">
            <div className="section-label">
              <MessageCircle size={14} /> What This Means
            </div>
            <p className="plain-language">{plain_language}</p>
          </div>

          {/* Typical Comparison */}
          {typical_comparison && (
            <div className="clause-section">
              <div className="section-label">
                <BarChart2 size={14} /> What's Typical
              </div>
              <p className="comparison">{typical_comparison}</p>
            </div>
          )}

          {/* Suggestion */}
          {suggestion && (
            <div className="clause-section">
              <div className="section-label">
                <Lightbulb size={14} /> Suggested Action
              </div>
              <p className="suggestion">{suggestion}</p>
            </div>
          )}

          {/* Actions */}
          <div className="clause-actions">
            <button
              className="btn btn-secondary btn-small"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(text);
              }}
            >
              <Copy size={14} /> Copy Text
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <MapPin size={14} /> Jump to Page
            </button>
          </div>
        </div>
      )}

      {/* Expand Indicator */}
      <div className="expand-indicator">
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>
    </div>
  );
}
