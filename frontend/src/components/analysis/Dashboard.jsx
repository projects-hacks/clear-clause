/**
 * Dashboard Component
 * 
 * Shows analysis summary, category breakdown, and top concerns.
 */
import React, { useState } from 'react';
import ClauseCard from './ClauseCard';
import CategoryBar from './CategoryBar';
import FairnessCompare from './FairnessCompare';
import { AlertTriangle, ClipboardList, Scale, FileSearch } from 'lucide-react';

/**
 * Dashboard
 */
export default function Dashboard({ result, onClauseSelect }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedClause, setExpandedClause] = useState(null);
  const [activeTab, setActiveTab] = useState('clauses'); // 'clauses' | 'fairness'

  // Filter clauses by selected category
  const filteredClauses = selectedCategory
    ? result.clauses.filter(c => c.category === selectedCategory)
    : result.clauses;

  // Sort clauses by severity
  const severityOrder = { critical: 0, warning: 1, info: 2, safe: 3 };
  const sortedClauses = [...filteredClauses].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="dashboard">
      {/* Summary Card */}
      <div className="dashboard-section summary-card">
        <h3>What This Means</h3>
        <p className="summary-text">{result.summary}</p>
      </div>

      {/* Category Breakdown */}
      <div className="dashboard-section">
        <h3>Category Breakdown</h3>
        <CategoryBar
          categoryCounts={result.category_counts}
          totalClauses={result.total_clauses}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </div>

      {/* Top Concerns */}
      {result.top_concerns.length > 0 && (
        <div className="dashboard-section">
          <h3>Top Concerns</h3>
          <div className="top-concerns">
            {result.top_concerns.map((concern, index) => (
              <div key={index} className="concern-item">
                <span className="concern-icon"><AlertTriangle size={16} className="text-warning" /></span>
                <span className="concern-text">{concern}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="dashboard-section stats">
        <div className="stat-item">
          <span className="stat-value">{result.total_clauses}</span>
          <span className="stat-label">Total Clauses</span>
        </div>
        <div className="stat-item flagged">
          <span className="stat-value">{result.flagged_clauses}</span>
          <span className="stat-label">Flagged</span>
        </div>
        <div className="stat-item safe">
          <span className="stat-value">
            {result.total_clauses - result.flagged_clauses}
          </span>
          <span className="stat-label">Standard</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === 'clauses' ? 'active' : ''}`}
          onClick={() => setActiveTab('clauses')}
        >
          <ClipboardList size={16} /> Clauses
        </button>
        <button
          className={`tab-btn ${activeTab === 'fairness' ? 'active' : ''}`}
          onClick={() => setActiveTab('fairness')}
        >
          <Scale size={16} /> Fairness Compare
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'clauses' ? (
        <div className="dashboard-section">
          <div className="clauses-header">
            <h3>Clauses ({filteredClauses.length})</h3>
            {selectedCategory && (
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setSelectedCategory(null)}
              >
                Clear Filter
              </button>
            )}
          </div>

          <div className="clauses-list">
            {sortedClauses.length === 0 ? (
              <div className="clauses-empty-state">
                <FileSearch size={40} className="empty-icon" />
                <p className="empty-title">
                  {selectedCategory ? 'No clauses in this category' : 'No clauses found'}
                </p>
                <p className="empty-desc">
                  {selectedCategory
                    ? 'Try selecting a different category from the breakdown above.'
                    : 'This document may not have extracted clauses.'}
                </p>
                {selectedCategory && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            ) : (
              sortedClauses.map((clause) => (
                <ClauseCard
                  key={clause.clause_id}
                  clause={clause}
                  isExpanded={expandedClause === clause.clause_id}
                  onToggle={() => setExpandedClause(
                    expandedClause === clause.clause_id ? null : clause.clause_id
                  )}
                  onClick={() => onClauseSelect(clause.clause_id)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <FairnessCompare result={result} />
      )}
    </div>
  );
}
