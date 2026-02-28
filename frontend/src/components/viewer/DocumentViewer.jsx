/**
 * Document Viewer Component
 * 
 * Apryse WebViewer v10 wrapper for displaying annotated PDFs.
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
export default function DocumentViewer({ sessionId, clauses = [], selectedClauseId, onAnnotationClick }) {
  const viewerRef = useRef(null);
  const instanceRef = useRef(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [error, setError] = useState(null);

  // Initialize WebViewer
  useEffect(() => {
    let isMounted = true;

    async function initViewer() {
      try {
        // Dynamically import WebViewer
        const WebViewer = await import('@pdftron/webviewer');

        if (!viewerRef.current || !isMounted) return;

        const instance = await WebViewer.default(
          {
            path: '/webviewer',
            initialDoc: `${API_BASE_URL}/documents/${sessionId}`,
            licenseKey: import.meta.env.VITE_APRYSE_KEY || '',
            disableWebsockets: true,
            isReadOnly: true,
          },
          viewerRef.current
        );

        if (!isMounted) return;

        instanceRef.current = instance;

        // Disable all editing functionality - viewer only
        const { UI } = instance;

        // Use disableElements API to hide editing toolbar groups
        // This is the correct WebViewer v10+ API for hiding elements
        UI.disableElements([
          'toolbarGroup-Insert',
          'toolbarGroup-Edit',
          'toolbarGroup-Annotate',
          'annotationPopup',
          'annotationNotePopup',
          'textPopup',
          'clipboardPopup',
          'redactionPopup',
          'viewControlsOverlay',
          'printModal',
          'passwordModal',
          'annotationCreateConnector',
          'leftPanel', // Specifically hide the left panel since we show data on the right
        ]);

        // WebViewer v10+ API: use Core namespace
        const { documentViewer } = instance.Core;

        documentViewer.addEventListener('documentLoaded', () => {
          console.log('Document loaded in WebViewer');
          if (isMounted) {
            setIsViewerReady(true);
          }
        });

        // Handle document load errors (e.g., session expired / 404)
        documentViewer.addEventListener('loaderror', (err) => {
          console.error('Document load error:', err);
          if (isMounted) {
            setError('Document session expired or not found. Please re-upload your document.');
          }
        });

        // Listen for user clicks on annotations
        const { annotationManager } = instance.Core;
        annotationManager.addEventListener('annotationSelected', (annotations, action) => {
          if (action === 'selected' && annotations.length > 0 && onAnnotationClick) {
            const annot = annotations[0];
            const clauseId = annot.getCustomData('clauseId');
            if (clauseId) {
              onAnnotationClick(clauseId);
            }
          }
        });

      } catch (err) {
        console.error('Failed to initialize WebViewer:', err);
        if (isMounted) {
          setError('Failed to load document viewer. Check that @pdftron/webviewer is installed.');
          setIsViewerReady(true); // Show error state
        }
      }
    }

    initViewer();

    return () => {
      isMounted = false;
      if (instanceRef.current) {
        instanceRef.current.UI.dispose();
        instanceRef.current = null;
      }
    };
  }, [sessionId]);

  // Add/update clause annotations when clauses change or viewer becomes ready
  useEffect(() => {
    if (!isViewerReady || !instanceRef.current || clauses.length === 0) return;

    addAnnotations(instanceRef.current, clauses);
  }, [isViewerReady, clauses]);

  /**
   * Add highlight annotations for clauses using Apryse text search
   * for pixel-perfect positioning.
   */
  const addAnnotations = async (instance, clauseList) => {
    try {
      const { documentViewer, annotationManager, Annotations } = instance.Core;
      const doc = documentViewer.getDocument();

      // Clear existing ClearClause annotations
      const existingAnnots = annotationManager.getAnnotationsList();
      for (const annot of existingAnnots) {
        if (annot.getCustomData('isClearClause') === 'true') {
          annotationManager.deleteAnnotation(annot);
        }
      }

      let addedCount = 0;

      for (const clause of clauseList) {
        const highlight = new Annotations.TextHighlightAnnotation();
        highlight.PageNumber = clause.page_number;

        // Set color based on category
        const color = getCategoryColor(clause.category);
        highlight.Color = new Annotations.Color(color.r, color.g, color.b);
        highlight.Opacity = 0.4;

        // Store clause metadata for click handling
        highlight.setCustomData('clauseId', clause.clause_id);
        highlight.setCustomData('isClearClause', 'true');

        let foundText = false;

        // --- Production approach: use Apryse text search ---
        // Search for the clause text within the PDF page to get exact quads
        try {
          const pageNum = clause.page_number;
          if (pageNum && doc) {
            // Load the text content for this page
            const pageText = await doc.loadPageText(pageNum);

            if (pageText) {
              // Helper to build a regex pattern that ignores whitespace discrepancies
              const buildRegexPattern = (textSnippet) => {
                const words = textSnippet.trim().split(/\s+/);
                return words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
              };

              const words = clause.text.trim().split(/\s+/);
              let startIdx = -1;
              let endIdx = -1;

              // 1. Try matching the entire clause first (most exact)
              const fullMatch = pageText.match(new RegExp(buildRegexPattern(clause.text), 'i'));

              if (fullMatch) {
                startIdx = fullMatch.index;
                endIdx = startIdx + fullMatch[0].length;
              } else if (words.length >= 6) {
                // 2. If full match fails (e.g. LLM hallucinates a word), try just the first/last few words
                const startRegex = new RegExp(buildRegexPattern(words.slice(0, 6).join(' ')), 'i');
                const startMatch = pageText.match(startRegex);

                if (startMatch) {
                  startIdx = startMatch.index;

                  const endRegex = new RegExp(buildRegexPattern(words.slice(-6).join(' ')), 'i');
                  const endMatch = pageText.match(endRegex);

                  if (endMatch && endMatch.index > startIdx) {
                    endIdx = endMatch.index + endMatch[0].length;
                  } else {
                    // Estimate end if we can't find the exact end words
                    endIdx = Math.min(startIdx + clause.text.length + (words.length * 0.5), pageText.length);
                  }
                }
              }

              if (startIdx !== -1 && endIdx > startIdx) {
                // Found EXACT start and end character indices in the PDF text stream
                const quads = await doc.getTextPosition(pageNum, Math.floor(startIdx), Math.floor(endIdx));

                if (quads && quads.length > 0) {
                  highlight.Quads = quads.map(
                    (q) => new Annotations.Quad(q.x1, q.y1, q.x2, q.y2, q.x3, q.y3, q.x4, q.y4)
                  );
                  foundText = true;
                }
              }
            }
          }
        } catch (searchErr) {
          // Text search failed for this clause — fall back to backend position
          console.warn(`Apryse text search failed for ${clause.clause_id}:`, searchErr);
        }

        // --- Fallback: use backend-computed bounding box ---
        if (!foundText && clause.position && clause.position.x1 !== undefined) {
          const { x1, y1, x2, y2 } = clause.position;
          highlight.Quads = [
            new Annotations.Quad(
              x1, y2,  // top-left
              x2, y2,  // top-right
              x2, y1,  // bottom-right
              x1, y1   // bottom-left
            ),
          ];
        }

        annotationManager.addAnnotation(highlight);
        addedCount++;
      }

      // Redraw annotations
      annotationManager.drawAnnotationsFromList(
        annotationManager.getAnnotationsList()
      );

      console.log(`Added ${addedCount} clause annotations`);
    } catch (err) {
      console.error('Failed to add annotations:', err);
    }
  };

  // Jump to selected clause annotation
  useEffect(() => {
    if (!isViewerReady || !instanceRef.current || !selectedClauseId) return;

    try {
      const { annotationManager } = instanceRef.current.Core;
      const annots = annotationManager.getAnnotationsList();
      const targetAnnot = annots.find(a => a.getCustomData('clauseId') === selectedClauseId);

      if (targetAnnot) {
        annotationManager.jumpToAnnotation(targetAnnot);
        annotationManager.selectAnnotation(targetAnnot);
      }
    } catch (err) {
      console.error('Failed to jump to annotation:', err);
    }
  }, [isViewerReady, selectedClauseId]);

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
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
}
