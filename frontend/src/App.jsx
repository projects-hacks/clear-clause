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
import { ThemeProvider } from './context/ThemeContext';
import { AnalysisProvider } from './context/AnalysisContext';
import OfflineBanner from './components/common/OfflineBanner';

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
    <ThemeProvider>
      <AnalysisProvider>
        <BrowserRouter>
        <div className="app">
          <OfflineBanner />
          {/* Skip link for keyboard accessibility */}
          <a href="#main-content" className="skip-link">Skip to main content</a>
          
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/analysis/:sessionId" element={<AnalysisPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AnalysisProvider>
    </ThemeProvider>
  );
}

export default App;
