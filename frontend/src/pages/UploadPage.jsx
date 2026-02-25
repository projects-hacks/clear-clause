/**
 * Upload Page Component
 * 
 * Drag-and-drop file upload with validation.
 * Supports multiple concurrent document uploads.
 */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentAnalysis } from '../hooks/useAnalysis';
import { useAnalysis } from '../context/AnalysisContext';
import { FileUp, CheckCircle2, AlertTriangle, FileText, Smartphone, Home, Handshake, Search, Loader2, ArrowLeft, Zap } from 'lucide-react';

/**
 * Upload Page
 */
export default function UploadPage() {
  const navigate = useNavigate();
  const { startAnalysis, isUploading, error, clearError } = useDocumentAnalysis();
  const { addSession, setActiveSession } = useAnalysis();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((file) => {
    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    clearError();
  }, [clearError]);

  /**
   * Handle drag events
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  /**
   * Start analysis
   */
  const handleAnalyze = async () => {
    if (!selectedFile) return;

    try {
      const sessionId = await startAnalysis(selectedFile);

      // Navigate to analysis page
      navigate(`/analysis/${sessionId}`);
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  /**
   * Load sample document (for demo)
   */
  const handleSampleDocument = async (docName) => {
    const fileMap = {
      'Airbnb ToS': 'airbnb_tos.pdf',
      'Sample Lease': 'sample_lease.pdf',
      'NDA Template': 'nda_template.pdf'
    };

    const fileName = fileMap[docName];
    if (!fileName) return;

    try {
      const response = await fetch(`/samples/${fileName}`);
      if (!response.ok) throw new Error('Sample not found');

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      handleFileSelect(file);
    } catch (err) {
      alert(`Could not load sample document: ${docName}`);
    }
  };

  return (
    <div className="upload-page">
      {/* Navigation */}
      <nav className="landing-nav" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
          <span className="brand-name">ClearClause</span>
        </div>
        <div className="nav-links">
        </div>
        <button
          className="btn btn-secondary back-btn"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </nav>

      {/* Main Content */}
      <main className="upload-content">
        {/* Drop Zone */}
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!selectedFile ? (
            <>
              <div className="drop-zone-icon"><FileUp size={48} color="var(--accent-primary)" /></div>
              <h2>Drag & drop your document</h2>
              <p>or click to browse</p>
              <p className="drop-zone-hint">Supports: PDF (up to 50MB)</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleInputChange}
                className="file-input"
                id="file-input"
              />
              <label htmlFor="file-input" className="btn btn-secondary">
                Browse Files
              </label>
            </>
          ) : (
            <>
              <div className="drop-zone-icon"><CheckCircle2 size={48} color="var(--success)" /></div>
              <h2>Selected: {selectedFile.name}</h2>
              <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedFile(null)}
              >
                Choose Different File
              </button>
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span className="error-icon"><AlertTriangle size={18} /></span>
            {error}
          </div>
        )}

        {/* Analyze Button */}
        {selectedFile && (
          <button
            className="btn btn-primary btn-large analyze-btn"
            onClick={handleAnalyze}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="spinner" />
                Uploading...
              </>
            ) : (
              <>
                <Search size={18} /> Analyze Document
              </>
            )}
          </button>
        )}

        {/* Sample Documents */}
        <div className="sample-documents">
          <p className="sample-label">Or try a sample document:</p>
          <div className="sample-grid">
            <button
              className="btn btn-secondary sample-btn"
              onClick={() => handleSampleDocument('Airbnb ToS')}
            >
              <Smartphone size={16} /> Airbnb ToS
            </button>
            <button
              className="btn btn-secondary sample-btn"
              onClick={() => handleSampleDocument('Sample Lease')}
            >
              <Home size={16} /> Sample Lease
            </button>
            <button
              className="btn btn-secondary sample-btn"
              onClick={() => handleSampleDocument('NDA Template')}
            >
              <Handshake size={16} /> NDA Template
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
