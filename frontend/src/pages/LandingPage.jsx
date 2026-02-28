/**
 * Landing Page Component
 *
 * Premium landing page with animated hero, bento feature grid,
 * pipeline visualization, stats, and CTA banner.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, UploadCloud, FileText, Upload, Sparkles,
  ShieldCheck, Home, Briefcase, Stethoscope, Smartphone,
  Handshake, PieChart, Brain, MessageSquare, Scale, Mic,
  ArrowRight, Eye, Volume2, ChevronRight, Search, Lock, Clock
} from 'lucide-react';
import ThemeToggle from '../components/common/ThemeToggle';

/* Animated counter hook */
function useCounter(target, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return [count, ref];
}

export default function LandingPage() {
  const navigate = useNavigate();

  const [clauseCount, clauseRef] = useCounter(100, 1800);
  const [categoryCount, categoryRef] = useCounter(5, 1200);
  const [privacyCount, privacyRef] = useCounter(100, 2000);

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="landing-nav" aria-label="Main navigation">
        <div className="nav-brand">
          <Zap className="logo-icon" size={20} color="var(--accent-primary)" />
          <span className="brand-name">ClearClause</span>
        </div>
        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
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
        <div className="hero-bg-effects">
          <div className="hero-glow hero-glow-1" />
          <div className="hero-glow hero-glow-2" />
          <div className="hero-grid-overlay" />
        </div>

        <div className="hero-content">
          <div className="hero-badge">AI-Powered Contract Copilot</div>
          <h1 className="hero-title">
            Know what you're signing.<br />
            <span className="gradient-text">Before you sign it.</span>
          </h1>
          <p className="hero-subtitle">
            Upload a lease, NDA, terms of service or any document : ClearClause flags every risky clause,
            scores it for fairness, and lets you ask questions in plain language.
          </p>
          <div className="hero-trust-row">
            <span className="trust-item"><ShieldCheck size={14} /> PII auto-redacted</span>
            <span className="trust-divider">·</span>
            <span className="trust-item"><Lock size={14} /> Encrypted in transit</span>
            <span className="trust-divider">·</span>
            <span className="trust-item"><Clock size={14} /> Auto-deleted in 30 min</span>
          </div>
          <div className="hero-cta">
            <button
              className="btn btn-primary btn-large"
              onClick={() => navigate('/upload')}
            >
              <UploadCloud size={20} />
              Analyze a Document
            </button>
            <button
              className="btn btn-secondary btn-large"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              See How It Works
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="document-mockup">
            <div className="mockup-header">
              <div className="mockup-dots">
                <span /><span /><span />
              </div>
              <span className="mockup-title">contract_review.pdf</span>
            </div>
            <div className="mockup-body">
              <div className="mockup-line normal" style={{ width: '90%' }} />
              <div className="mockup-line normal" style={{ width: '85%' }} />
              <div className="mockup-line flagged critical" style={{ width: '92%' }}>
                <span className="flag-label">⚠ Rights Given Up</span>
              </div>
              <div className="mockup-line normal" style={{ width: '78%' }} />
              <div className="mockup-line flagged warning" style={{ width: '88%' }}>
                <span className="flag-label">💰 Financial Impact</span>
              </div>
              <div className="mockup-line normal" style={{ width: '82%' }} />
              <div className="mockup-line normal" style={{ width: '70%' }} />
              <div className="mockup-line flagged info" style={{ width: '86%' }}>
                <span className="flag-label">⚖ One-Sided Terms</span>
              </div>
              <div className="mockup-line normal" style={{ width: '75%' }} />
              <div className="mockup-line normal" style={{ width: '60%' }} />
            </div>
            <div className="mockup-scan-line" />
          </div>

          {/* Stats strip under the mockup */}
          <div className="hero-stats-strip">
            <div className="hero-stat" ref={clauseRef}>
              <span className="hero-stat-value">{'<'} {clauseCount === 100 ? '60' : Math.round(clauseCount * 0.6)}<span className="hero-stat-unit">s</span></span>
              <span className="hero-stat-label">Analysis Time</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat" ref={categoryRef}>
              <span className="hero-stat-value">{categoryCount}</span>
              <span className="hero-stat-label">Risk Categories</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat" ref={privacyRef}>
              <span className="hero-stat-value">{privacyCount}<span className="hero-stat-unit">%</span></span>
              <span className="hero-stat-label">Private</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works — Pipeline */}
      <section id="how-it-works" className="how-it-works">
        <div className="section-header">
          <span className="section-subtitle">Workflow</span>
          <h2>From upload to insight in seconds</h2>
        </div>

        <div className="pipeline-flow">
          <div className="pipeline-step">
            <div className="pipeline-icon blue"><Upload size={20} /></div>
            <h3>Upload</h3>
            <p>Drag & drop any PDF. Encrypted in transit, auto-deleted after analysis.</p>
          </div>
          <div className="pipeline-connector"><ArrowRight size={20} /></div>
          <div className="pipeline-step">
            <div className="pipeline-icon purple"><Eye size={20} /></div>
            <h3>OCR & Redact</h3>
            <p>Apryse extracts text. Presidio NER redacts all personal data from the document.</p>
          </div>
          <div className="pipeline-connector"><ArrowRight size={20} /></div>
          <div className="pipeline-step">
            <div className="pipeline-icon green"><Brain size={20} /></div>
            <h3>AI Analysis</h3>
            <p>Gemini 3.1 Pro classifies every clause by risk category and severity level.</p>
          </div>
          <div className="pipeline-connector"><ArrowRight size={20} /></div>
          <div className="pipeline-step">
            <div className="pipeline-icon orange"><MessageSquare size={20} /></div>
            <h3>Chat & Explore</h3>
            <p>Ask questions, compare fairness, listen to summaries, and view annotated PDFs.</p>
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="features-section">
        <div className="section-header">
          <span className="section-subtitle">Capabilities</span>
          <h2>Everything you need to understand a contract</h2>
        </div>

        <div className="bento-grid">
          <div className="bento-card">
            <div className="bento-icon-wrap purple"><Brain size={20} /></div>
            <h3>AI Clause Classification</h3>
            <p>Gemini AI categorizes every clause — rights given up, one-sided terms, financial impact, missing protections — with severity ratings and plain-language explanations.</p>
            <span className="bento-tag">Gemini 3.1 Pro Preview</span>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrap teal"><ShieldCheck size={20} /></div>
            <h3>PII Shield</h3>
            <p>Dual-engine detection (Presidio NER + regex) redacts personal data before the LLM ever sees your document.</p>
            <span className="bento-tag green">Privacy First</span>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrap blue"><Scale size={20} /></div>
            <h3>Fairness Score</h3>
            <p>Compare every clause against industry standards. See exactly where your contract deviates from what's typical.</p>
            <span className="bento-tag">0–100 Score</span>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrap orange"><FileText size={20} /></div>
            <h3>Annotated PDF Viewer</h3>
            <p>Apryse WebViewer highlights clauses with color-coded risk levels. Click any clause to jump directly to it.</p>
            <span className="bento-tag">Apryse WebViewer</span>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrap green"><MessageSquare size={20} /></div>
            <h3>Document Chat</h3>
            <p>Ask natural-language questions about your contract. Keyword scoring + pgvector semantic search for best-in-class retrieval.</p>
            <span className="bento-tag">Gemini Flash · pgvector</span>
          </div>

          <div className="bento-card">
            <div className="bento-icon-wrap pink"><Mic size={20} /></div>
            <h3>Voice &amp; Audio</h3>
            <p>Speak your questions via Deepgram speech-to-text, and listen to AI-narrated summaries of your document's key findings.</p>
            <span className="bento-tag">Deepgram Nova-3 · Aura-2</span>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="supported-docs">
        <div className="section-header">
          <span className="section-subtitle">Use Cases</span>
          <h2>Built for the documents that matter</h2>
        </div>
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

      {/* CTA Banner */}
      <section className="cta-banner">
        <div className="cta-glow" />
        <h2>Ready to understand your next contract?</h2>
        <p>Upload a document and get a full AI-powered analysis — clause by clause, risk by risk.</p>
        <button
          className="btn btn-primary btn-large"
          onClick={() => navigate('/upload')}
        >
          <Search size={20} />
          Start Free Analysis
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer-premium">
        <div className="footer-content">
          <div className="footer-brand-col">
            <div className="nav-brand">
              <Zap className="logo-icon" size={24} color="var(--accent-primary)" />
              <span className="brand-name">ClearClause</span>
            </div>
            <p className="footer-desc">
              Empowering individuals and businesses to understand their legal agreements through the power of AI. Built with Gemini, Apryse, and Deepgram.
            </p>
          </div>
          <div className="footer-text-col">
            <p>Every clause, crystal clear.</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} ClearClause. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
