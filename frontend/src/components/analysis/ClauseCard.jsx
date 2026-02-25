/**
 * Clause Card Component
 * 
 * Displays individual clause details with category, severity, and suggestions.
 */
import React from 'react';

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
    critical: '🔴',
    warning: '🟠',
    info: '🔵',
    safe: '🟢',
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
              🗣️ What This Means
            </div>
            <p className="plain-language">{plain_language}</p>
          </div>

          {/* Typical Comparison */}
          {typical_comparison && (
            <div className="clause-section">
              <div className="section-label">
                📊 What's Typical
              </div>
              <p className="comparison">{typical_comparison}</p>
            </div>
          )}

          {/* Suggestion */}
          {suggestion && (
            <div className="clause-section">
              <div className="section-label">
                💡 Suggested Action
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
              📋 Copy Text
            </button>
            <button 
              className="btn btn-secondary btn-small"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              📍 Jump to Page
            </button>
          </div>
        </div>
      )}

      {/* Expand Indicator */}
      <div className="expand-indicator">
        {isExpanded ? '▲' : '▼'}
      </div>
    </div>
  );
}
