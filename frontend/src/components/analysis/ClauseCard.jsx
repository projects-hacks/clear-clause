/**
 * Clause Card Component
 *
 * Displays individual clause details with category, severity, and suggestions.
 */
import React from 'react';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, MessageCircle, BarChart2, Lightbulb, Copy, MapPin, ChevronUp, ChevronDown } from 'lucide-react';
import { CATEGORIES, SEVERITIES } from '../../utils/constants';

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

  const categoryData = Object.values(CATEGORIES).find(c => c.key === category) || CATEGORIES.STANDARD;
  const severityData = Object.values(SEVERITIES).find(s => s.key === severity) || SEVERITIES.INFO;

  return (
    <div
      className={`clause-card ${category} ${severity} ${isExpanded ? 'expanded' : ''}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`Clause: ${plain_language ? (plain_language.length > 50 ? plain_language.slice(0, 50) + '...' : plain_language) : 'Expand for details'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {/* Card Header */}
      <div className="clause-card-header">
        <div className="clause-badges">
          <span className={`badge`} style={{ backgroundColor: categoryData.bgLight, color: categoryData.color, border: `1px solid ${categoryData.color}40` }}>
            {categoryData.icon} {categoryData.label}
          </span>
          <span className={`badge`} style={{ backgroundColor: `${severityData.color}20`, color: severityData.color, border: `1px solid ${severityData.color}40` }}>
            {severityData.icon} {severityData.label}
          </span>
        </div>
        <span className="clause-page">Page {page_number}</span>
      </div>

      {/* Clause Text (Plain Language by default) */}
      <div className="clause-text">
        <p className="plain-language">{plain_language}</p>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="clause-card-content">
          {/* Original Text */}
          <div className="clause-section">
            <div className="section-label">
              <MessageCircle size={14} /> Original Clause
            </div>
            <p className="original-text">{text}</p>
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
                if (onClick) onClick();
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
