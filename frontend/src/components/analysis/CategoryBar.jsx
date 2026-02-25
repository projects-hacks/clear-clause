/**
 * Category Bar Component
 *
 * Visual breakdown of clauses by category.
 * Click to filter by category.
 */
import React from 'react';
import { CATEGORIES, CATEGORY_ORDER } from '../../utils/constants';

/**
 * Category Bar
 */
export default function CategoryBar({
  categoryCounts,
  totalClauses,
  selectedCategory,
  onSelectCategory
}) {
  // Use shared constants for category definitions
  const categories = CATEGORY_ORDER.map(cat => ({
    key: cat.key,
    label: cat.label,
    color: cat.color,
    icon: cat.icon,
  }));

  // Calculate percentages
  const categoriesWithPct = categories.map(cat => ({
    ...cat,
    count: categoryCounts[cat.key] || 0,
    percentage: totalClauses > 0
      ? ((categoryCounts[cat.key] || 0) / totalClauses) * 100
      : 0,
  }));

  return (
    <div className="category-bar">
      {/* Visual Bar */}
      <div className="category-bar-visual">
        {categoriesWithPct.map(cat => (
          <div
            key={cat.key}
            className={`category-segment ${cat.key} ${selectedCategory === cat.key ? 'selected' : ''}`}
            style={{
              width: `${cat.percentage}%`,
              backgroundColor: selectedCategory === cat.key ? cat.color : `${cat.color}66`,
            }}
            onClick={() => onSelectCategory(selectedCategory === cat.key ? null : cat.key)}
            title={`${cat.label}: ${cat.count} clauses (${cat.percentage.toFixed(1)}%)`}
          >
            {cat.percentage > 5 && (
              <span className="segment-count">{cat.count}</span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="category-legend">
        {categoriesWithPct.map(cat => (
          <button
            key={cat.key}
            className={`legend-item ${selectedCategory === cat.key ? 'selected' : ''}`}
            onClick={() => onSelectCategory(selectedCategory === cat.key ? null : cat.key)}
          >
            <span
              className="legend-color"
              style={{ backgroundColor: cat.color }}
            ></span>
            <span className="legend-label">{cat.label}</span>
            <span className="legend-count">{cat.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
