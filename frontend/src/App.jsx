/**
 * ClearClause Frontend - Main Application Entry Point
 * 
 * Multi-document analysis dashboard with:
 * - Concurrent session management
 * - Real-time progress tracking
 * - Document viewer + dashboard + chat
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnalysisProvider } from './context/AnalysisContext';

// Pages
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/UploadPage';
import AnalysisPage from './pages/AnalysisPage';

// Styles
import './index.css';

/**
 * Main App Component
 */
function App() {
  return (
    <AnalysisProvider>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/analysis/:sessionId" element={<AnalysisPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AnalysisProvider>
  );
}

export default App;
