/**
 * Document Viewer Component
 * 
 * Apryse WebViewer wrapper for displaying annotated PDFs.
 * Shows colored highlights for each clause category.
 */
import React, { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../../utils/constants';
import { AlertTriangle } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Get highlight color for category from shared constants
 */
function getCategoryColor(category) {
  const cat = Object.values(CATEGORIES).find(c => c.key === category);
  return cat ? cat.colorRgb : CATEGORIES.STANDARD.colorRgb;
}

/**
 * Document Viewer
 */
export default function DocumentViewer({ sessionId, clauses = [] }) {
  const viewerRef = useRef(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [error, setError] = useState(null);
  const [instance, setInstance] = useState(null);

  // Initialize WebViewer
  useEffect(() => {
    let isMounted = true;

    async function initViewer() {
      try {
        // Dynamically import WebViewer
        const WebViewer = await import('@pdftron/webviewer');

        if (!viewerRef.current || !isMounted) return;

        const webViewerInstance = await WebViewer.default(
          {
            path: '/webviewer',
            initialDoc: `${API_BASE_URL}/documents/${sessionId}`,
            licenseKey: import.meta.env.VITE_APRYSE_KEY || '',
            disableWebsockets: true,
            cache: undefined,
          },
          viewerRef.current
        );

        setInstance(webViewerInstance);
        setIsViewerReady(true);

        // Wait for document to load
        webViewerInstance.docViewer.on('documentLoaded', async () => {
          console.log('Document loaded, adding annotations...');
          await addAnnotations(webViewerInstance, clauses);
        });

      } catch (err) {
        console.error('Failed to initialize WebViewer:', err);
        setError('Failed to load document viewer. Please ensure @pdftron/webviewer is installed.');
        setIsViewerReady(true); // Mark as ready to show error
      }
    }

    initViewer();

    return () => {
      isMounted = false;
      // Cleanup WebViewer instance
      if (instance) {
        instance.close();
      }
    };
  }, [sessionId]);

  // Add/update clause annotations when clauses change
  useEffect(() => {
    if (!isViewerReady || !instance || clauses.length === 0) return;

    addAnnotations(instance, clauses);
  }, [isViewerReady, instance, clauses]);

  /**
   * Add highlight annotations for clauses
   */
  const addAnnotations = async (instance, clauses) => {
    const { annotationManager, Annotations } = instance;

    try {
      // Clear existing ClearClause annotations
      const existingAnnots = annotationManager.getAnnotationsList();
      for (const annot of existingAnnots) {
        if (annot.getCustomData('isClearClause') === 'true') {
          await annotationManager.deleteAnnotation(annot);
        }
      }

      // Add highlight for each clause
      clauses.forEach(async (clause) => {
        const highlight = new Annotations.TextHighlightAnnotation();
        highlight.PageNumber = clause.page_number;

        // Set color based on category
        const color = getCategoryColor(clause.category);
        highlight.Color = new Annotations.Color(color.r, color.g, color.b);
        highlight.Opacity = 0.4;

        // Store clause ID for click handling
        highlight.setCustomData('clauseId', clause.clause_id);
        highlight.setCustomData('isClearClause', 'true');

        // Set position if available
        if (clause.position && clause.position.x1) {
          const { x1, y1, x2, y2 } = clause.position;
          try {
            const page = instance.docViewer.getPage(clause.page_number);
            if (page) {
              // Convert to quads for proper highlighting
              const rect = new Annotations.Rect(x1, y1, x2, y2);
              highlight.Quads = [rect.toQuad()];
            }
          } catch (e) {
            console.warn('Could not set annotation position:', e);
          }
        }

        // Add to viewer
        await annotationManager.addAnnotation(highlight);

        // Handle annotation clicks
        annotationManager.addEventListener('annotationSelected', (annotations, action) => {
          if (action === 'selected' && annotations.length > 0) {
            const clauseId = annotations[0].getCustomData('clauseId');
            if (clauseId) {
              console.log('Clause selected:', clauseId);
              // Could emit event or callback here
            }
          }
        });
      });

      console.log(`Added ${clauses.length} annotations`);
    } catch (err) {
      console.error('Failed to add annotations:', err);
    }
  };

  // Loading state
  if (!isViewerReady) {
    return (
      <div className="document-viewer loading">
        <div className="skeleton" style={{ height: '100%' }}></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="document-viewer error">
        <span className="error-icon"><AlertTriangle size={24} className="text-warning" /></span>
        <p>{error}</p>
        <p className="error-hint">
          Make sure to run: npm install @pdftron/webviewer
        </p>
      </div>
    );
  }

  // WebViewer container
  return (
    <div className="document-viewer">
      <div
        ref={viewerRef}
        className="webviewer-container"
        data-testid="webviewer"
      />
    </div>
  );
}
