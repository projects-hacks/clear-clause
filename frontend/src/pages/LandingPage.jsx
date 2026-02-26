/**
 * Landing Page Component
 * 
 * Premium landing page with animated hero, feature cards, and CTA.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, UploadCloud, PlayCircle, FileText, Upload, Sparkles,
  ShieldCheck, Home, Briefcase, Stethoscope, Smartphone,
  Handshake, PieChart, Brain, MessageSquare, Scale, Mic
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

/**
 * Landing Page
 */
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="nav-brand">
          <Zap className="logo-icon" size={28} color="var(--accent-primary)" />
          <span className="brand-name">ClearClause</span>
        </div>
        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#use-cases">Use Cases</a>
        </div>
        <div className="nav-actions">
          <ThemeToggle />
          <button
            className="btn btn-primary"
            onClick={() => navigate('/upload')}
          >
            Try Now
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero" id="main-content">
        <div className="hero-content">
          <div className="hero-badge">AI-Powered Contract Analysis</div>
          <h1 className="hero-title">
            Every clause,<br />
            <span className="gradient-text">crystal clear.</span>
          </h1>
          <p className="hero-subtitle">
            Upload contracts, leases, insurance policies, or terms of service.
            Instantly understand what it really says, what's risky, and what to do about it.
          </p>
          <p className="hero-trust"><ShieldCheck size={14} /> Your documents are never stored permanently</p>
          <div className="hero-cta">
            <button
              className="btn btn-primary btn-large"
              onClick={() => navigate('/upload')}
            >
              <UploadCloud size={20} />
              Analyze Document
            </button>
            <button
              className="btn btn-secondary btn-large"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <PlayCircle size={20} />
              See Platform
            </button>
          </div>
        </div>

        {/* Animated Document Icon */}
        <div className="hero-visual">
          <div className="document-icon">
            <div className="scan-line"></div>
            <FileText size={120} color="var(--accent-primary)" strokeWidth={1} />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="section-header">
          <span className="section-subtitle">Workflow</span>
          <h2>Three simple steps to peace of mind</h2>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">01</div>
            <div className="step-icon-wrapper blue">
              <Upload size={32} />
            </div>
            <h3>Upload Securely</h3>
            <p>Drag and drop your PDF document. Your data is encrypted in transit and never used to train our core models.</p>
          </div>
          <div className="step-card">
            <div className="step-number">02</div>
            <div className="step-icon-wrapper purple">
              <Sparkles size={32} />
            </div>
            <h3>AI Extraction</h3>
            <p>Our context-aware AI extracts every clause, classifies risks, and compares terms to industry standards instantly.</p>
          </div>
          <div className="step-card">
            <div className="step-number">03</div>
            <div className="step-icon-wrapper green">
              <ShieldCheck size={32} />
            </div>
            <h3>Take Action</h3>
            <p>Get plain-English explanations and actionable negotiation suggestions for every concerning or one-sided clause.</p>
          </div>
        </div>
      </section>

      {/* Supported Documents */}
      <section id="use-cases" className="supported-docs">
        <h2>Supported Document Types</h2>
        <p className="section-desc">Trained on thousands of legal documents across various industries.</p>
        <div className="docs-grid">
          <div className="doc-item">
            <Home size={18} className="doc-icon text-blue" />
            <span>Lease Agreements</span>
          </div>
          <div className="doc-item">
            <Briefcase size={18} className="doc-icon text-purple" />
            <span>Employment Contracts</span>
          </div>
          <div className="doc-item">
            <Stethoscope size={18} className="doc-icon text-green" />
            <span>Insurance Policies</span>
          </div>
          <div className="doc-item">
            <Smartphone size={18} className="doc-icon text-orange" />
            <span>Terms of Service</span>
          </div>
          <div className="doc-item">
            <Handshake size={18} className="doc-icon text-yellow" />
            <span>NDAs & MSAs</span>
          </div>
          <div className="doc-item">
            <PieChart size={18} className="doc-icon text-red" />
            <span>Financial Agreements</span>
          </div>
        </div>
      </section>

      {/* Why ClearClause */}
      <section className="why-clearclause">
        <div className="section-header">
          <span className="section-subtitle">Why ClearClause</span>
          <h2>What sets us apart</h2>
        </div>
        <div className="why-grid">
          <div className="why-card">
            <div className="why-icon"><Brain size={28} /></div>
            <h3>AI Clause Classification</h3>
            <p>Gemini AI categorizes every clause into risk categories — rights given up, one-sided terms, financial impact, and missing protections.</p>
            <span className="why-badge">Powered by Gemini</span>
          </div>
          <div className="why-card">
            <div className="why-icon"><MessageSquare size={28} /></div>
            <h3>Document Chat</h3>
            <p>Ask natural-language questions about your contract. "What are my termination rights?" — get instant, cited answers.</p>
            <span className="why-badge">Context-Aware AI</span>
          </div>
          <div className="why-card">
            <div className="why-icon"><Mic size={28} /></div>
            <h3>Voice Summary</h3>
            <p>Listen to an AI-narrated audio summary of your document's key findings — perfect for on-the-go review.</p>
            <span className="why-badge">Deepgram Aura-2 TTS</span>
          </div>
          <div className="why-card">
            <div className="why-icon"><Scale size={28} /></div>
            <h3>Fairness Comparison</h3>
            <p>Compare every clause against industry standards. See exactly where your contract deviates from what's typical.</p>
            <span className="why-badge">Industry Benchmarks</span>
          </div>
          <div className="why-card">
            <div className="why-icon" style={{ color: 'var(--success)' }}><ShieldCheck size={28} /></div>
            <h3>Privacy-First</h3>
            <p>Your documents are encrypted during transfer and automatically purged after analysis. We never store or train on your data.</p>
            <span className="why-badge" style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.2)', color: 'var(--success)' }}>Auto-Purge in 30 min</span>
          </div>
        </div>
      </section>

      {/* Premium Footer */}
      <footer className="landing-footer-premium">
        <div className="footer-content">
          <div className="footer-brand-col">
            <div className="nav-brand">
              <Zap className="logo-icon" size={24} color="var(--accent-primary)" />
              <span className="brand-name">ClearClause</span>
            </div>
            <p className="footer-desc">
              Empowering individuals and businesses to understand their legal agreements through the power of artificial intelligence. We leverage advanced LLMs for production-quality legal analysis and risk detection.
            </p>
          </div>
          <div className="footer-text-col">
            <p>Every clause, crystal clear.</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} ClearClause Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
