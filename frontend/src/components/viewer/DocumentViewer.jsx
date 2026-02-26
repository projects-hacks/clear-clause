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
export default function DocumentViewer({ sessionId, clauses = [], selectedClauseId }) {
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
   * Add highlight annotations for clauses
   */
  const addAnnotations = async (instance, clauseList) => {
    try {
      // WebViewer v10+: access via Core namespace
      const { annotationManager, Annotations } = instance.Core;

      // Clear existing ClearClause annotations
      const existingAnnots = annotationManager.getAnnotationsList();
      for (const annot of existingAnnots) {
        if (annot.getCustomData('isClearClause') === 'true') {
          annotationManager.deleteAnnotation(annot);
        }
      }

      // Add highlight for each clause
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

        // Set position from Apryse OCR bounding box
        if (clause.position && clause.position.x1 !== undefined) {
          const { x1, y1, x2, y2 } = clause.position;
          // TextHighlightAnnotation expects Quads
          highlight.Quads = [
            new Annotations.Quad(
              x1, y2,  // top-left (x1, y2 because PDF coords are bottom-up)
              x2, y2,  // top-right
              x2, y1,  // bottom-right
              x1, y1   // bottom-left
            ),
          ];
        }

        // Add to viewer
        annotationManager.addAnnotation(highlight);
      }

      // Redraw annotations
      annotationManager.drawAnnotationsFromList(
        annotationManager.getAnnotationsList()
      );

      console.log(`Added ${clauseList.length} clause annotations`);
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
