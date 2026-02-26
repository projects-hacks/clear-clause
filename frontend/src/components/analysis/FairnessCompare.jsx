/**
 * FairnessCompare Component
 * 
 * Compares document clauses to industry standards.
 * Shows "Your doc vs typical" comparison.
 */
import React, { useState } from 'react';
import { CATEGORIES, getCategoryByKey } from '../../utils/constants';
import { BarChart2, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

/**
 * Fairness Compare
 */
export default function FairnessCompare({ result }) {
  const [expandedSection, setExpandedSection] = useState(null);

  if (!result) return null;

  // Calculate fairness score
  const fairnessScore = calculateFairnessScore(result);

  // Get comparisons by category
  const comparisonsByCategory = groupComparisonsByCategory(result.clauses);

  return (
    <div className="fairness-compare">
      {/* Fairness Score */}
      <div className="fairness-score-card">
        <h3>Fairness Score</h3>
        <div className="score-display">
          <div
            className={`score-circle ${getScoreClass(fairnessScore)}`}
          >
            <span className="score-value">{fairnessScore}</span>
          </div>
          <p className="score-label">
            {getScoreLabel(fairnessScore)}
          </p>
        </div>

        <div className="score-breakdown">
          <div className="breakdown-item">
            <span className="breakdown-label">Standard clauses</span>
            <span className="breakdown-value">
              {result.total_clauses - result.flagged_clauses} / {result.total_clauses}
            </span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Flagged issues</span>
            <span className="breakdown-value">{result.flagged_clauses}</span>
          </div>
        </div>
      </div>

      {/* Category Comparisons */}
      <div className="comparisons-section">
        <h3>Your Document vs Industry Standard</h3>

        {Object.entries(comparisonsByCategory).map(([category, clauses]) => {
          if (clauses.length === 0) return null;

          const categoryInfo = getCategoryByKey(category) || {};
          const isExpanded = expandedSection === category;

          return (
            <div
              key={category}
              className={`comparison-card ${category} ${isExpanded ? 'expanded' : ''}`}
            >
              <div
                className="comparison-header"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${categoryInfo.label || category}: ${clauses.length} clauses`}
                onClick={() => setExpandedSection(isExpanded ? null : category)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedSection(isExpanded ? null : category);
                  }
                }}
              >
                <div className="comparison-title">
                  <span className="category-icon">{categoryInfo.icon || <BarChart2 size={16} />}</span>
                  <span className="category-label">{categoryInfo.label || category}</span>
                  <span className="clause-count">{clauses.length} clauses</span>
                </div>
                <span className="expand-icon">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </div>

              {isExpanded && (
                <div className="comparison-content">
                  {clauses.map((clause, index) => (
                    <div key={index} className="clause-comparison">
                      <div className="comparison-row">
                        <div className="row-label">Your document:</div>
                        <div className="row-value yours">{clause.text}</div>
                      </div>

                      {clause.typical_comparison && (
                        <div className="comparison-row">
                          <div className="row-label">Industry standard:</div>
                          <div className="row-value typical">
                            {clause.typical_comparison}
                          </div>
                        </div>
                      )}

                      {clause.suggestion && (
                        <div className="comparison-row">
                          <div className="row-label">Suggested:</div>
                          <div className="row-value suggestion flex items-start gap-2">
                            <Lightbulb size={16} className="text-warning shrink-0 mt-1" />
                            <span>{clause.suggestion}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="compare-summary">
        <h4>What This Means</h4>
        <p>{result.summary}</p>

        {result.top_concerns.length > 0 && (
          <div className="top-concerns">
            <h5>Top Concerns</h5>
            <ul>
              {result.top_concerns.map((concern, index) => (
                <li key={index}>{concern}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Calculate fairness score (0-100)
 */
function calculateFairnessScore(result) {
  if (!result || result.total_clauses === 0) return 0;

  // Weight by severity
  const severityWeights = {
    critical: 0.3,
    warning: 0.5,
    info: 0.7,
    safe: 1.0,
  };

  let totalWeight = 0;

  result.clauses.forEach(clause => {
    const weight = severityWeights[clause.severity] || 0.5;
    totalWeight += weight;
  });

  const averageWeight = totalWeight / result.total_clauses;
  const score = Math.round(averageWeight * 100);

  return Math.min(100, Math.max(0, score));
}

/**
 * Get score class for styling
 */
function getScoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

/**
 * Get score label
 */
function getScoreLabel(score) {
  if (score >= 80) return 'Very Fair';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Unfair';
  return 'Very Unfair';
}

/**
 * Group clauses with comparisons by category
 */
function groupComparisonsByCategory(clauses) {
  const grouped = {};

  clauses.forEach(clause => {
    // Only include clauses with comparisons or suggestions
    if (clause.typical_comparison || clause.suggestion) {
      const category = clause.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(clause);
    }
  });

  return grouped;
}
