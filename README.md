# ClearClause

> **Every clause, crystal clear.** Upload any complex document. Instantly understand what it really says, what's risky, and what to do about it.

![TerraCode Convergence](https://img.shields.io/badge/TerraCode-Convergence-blue)
![Python](https://img.shields.io/badge/Python-3.11+-green)
![React](https://img.shields.io/badge/React-18-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![AI](https://img.shields.io/badge/Gemini%203.1-Pro-orange)

## 🎯 The Problem

Contracts, leases, and legal documents are designed to be confusing. The average rental lease is 15+ pages of dense legalese. Most people sign without understanding what they're agreeing to — giving up rights, accepting unfair terms, or missing critical protections.

**ClearClause fixes this.** Upload any PDF document and our AI pipeline instantly:
- Extracts every clause using Apryse OCR
- Redacts personal information before AI ever sees it
- Classifies each clause by risk category and severity
- Compares your terms against industry standards
- Lets you ask questions about your document in plain English

## ✨ Features

### � AI Clause Analysis
Gemini 3.1 Pro analyzes every clause in your document, classifying each as:
- **Rights Given Up** — Things you're agreeing to surrender
- **One-Sided Terms** — Clauses heavily favoring the other party
- **Financial Impact** — Hidden costs, penalties, or financial obligations
- **Missing Protections** — Standard protections absent from your document
- **Standard** — Fair, commonly-seen terms

### �️ PII Shield
Personal information (SSNs, emails, phone numbers, credit cards, dates of birth) is **automatically detected and redacted** before the document text ever reaches the AI. The LLM never sees your raw personal data.

### ⚖️ Fairness Comparison
A computed **Fairness Score (0–100)** with side-by-side comparison: "Your Document vs Industry Standard" for every non-standard clause, with negotiation suggestions.

### 📄 Annotated PDF Viewer
Apryse WebViewer displays your original PDF with **color-coded clause highlights**. Click any clause in the dashboard to jump directly to its location in the document.

### 💬 AI Chat with Relevance Retrieval
Ask questions about your document in plain English. The chat service uses **clause relevance scoring** (keyword + severity weighting) to select the most pertinent clauses for each question, with optional **vector-based semantic retrieval** (pgvector) for production deployments.

### 🎙️ Voice Input & Voice Output
- **Deepgram Nova-2 STT** — Speak your questions via microphone
- **Deepgram Aura-2 TTS** — AI reads responses and summaries aloud

### 📊 Real-Time Progress
Server-Sent Events stream granular pipeline progress:  
`Uploading → OCR Extraction → PII Redaction → AI Analysis → Complete`

### 🔄 Multi-Document Concurrency
Each upload gets a unique session. Multiple documents can be analyzed simultaneously with independent pipelines, rate limiting, and auto-cleanup (30-min TTL).

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       ClearClause System                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend (Vercel)              Backend (Akamai LKE)             │
│  ┌──────────────────┐           ┌──────────────────┐             │
│  │  Vite + React 18 │──SSE/API─▶│   FastAPI         │            │
│  │                  │           │                  │             │
│  │  • Landing Page  │           │  Pipeline:       │             │
│  │  • Upload        │           │  1. Apryse OCR   │             │
│  │  • Dashboard     │           │  2. PII Redact   │             │
│  │  • PDF Viewer    │           │  3. Gemini Pro   │             │
│  │  • AI Chat       │           │  4. Clause Match │             │
│  │  • Voice I/O     │           │                  │             │
│  │  • Fairness      │           │  Services:       │             │
│  └──────────────────┘           │  • Chat (Flash)  │             │
│                                 │  • STT (Nova-2)  │             │
│                                 │  • TTS (Aura-2)  │             │
│                                 │  • Vector Store  │             │
│                                 └──────────────────┘             │
│                                   │       │       │              │
│                                   ▼       ▼       ▼              │
│                              ┌────────┐┌──────┐┌────────┐       │
│                              │ Apryse ││Gemini││Deepgram│       │
│                              │  OCR   ││ 3.1  ││Nova/TTS│       │
│                              └────────┘└──────┘└────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 💻 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Vite + React 18 | SPA with routing, context, custom hooks |
| **Backend** | Python 3.11 + FastAPI | Async API with SSE streaming |
| **OCR** | Apryse SDK | PDF text extraction with word-level positions |
| **AI Analysis** | Gemini 3.1 Pro | Clause classification and risk assessment |
| **AI Chat** | Gemini 3 Flash | Fast, conversational document Q&A |
| **PII Detection** | Regex pipeline | SSN, email, phone, CC, DOB redaction |
| **Speech-to-Text** | Deepgram Nova-2 | Voice input transcription |
| **Text-to-Speech** | Deepgram Aura-2 | Audio summary generation |
| **PDF Viewer** | Apryse WebViewer v10 | Annotated PDF display with highlights |
| **Vector Store** | pgvector (optional) | Semantic clause retrieval for chat |
| **Deployment** | Akamai LKE + Vercel | Kubernetes backend, static frontend |
| **CI/CD** | GitHub Actions | Auto-deploy on push to main |

## 📌 Project Status

ClearClause is currently a **hackathon-grade MVP**, not a hardened production service. It is suitable for demos, prototypes, and internal trials, but **should not be exposed to untrusted traffic without additional hardening**, including:

- Authentication and authorization for all `/api/*` routes
- Stronger file validation beyond basic content-type and extension checks (for example, magic-byte validation for PDFs)
- Stricter rate limiting and quotas per user or API key
- Improved cleanup guarantees for temporary files in failure and restart scenarios

These safeguards are called out in the code comments and issue backlog as next steps for a production-ready version.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+, Node.js 18+
- API Keys: [Gemini](https://makersuite.google.com/app/apikey), [Apryse](https://dev.apryse.com), [Deepgram](https://deepgram.com)

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Edit with your API keys
python main.py         # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # Set VITE_API_URL
npm run dev            # http://localhost:5173
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Upload PDF → SSE progress stream |
| `/api/analyze/{id}` | GET | Poll analysis status |
| `/api/documents/{id}` | GET | Serve PDF for WebViewer |
| `/api/chat` | POST | Document Q&A (Gemini Flash) |
| `/api/transcribe` | POST | Voice → text (Deepgram STT) |
| `/api/voice-summary` | POST | Text → audio (Deepgram TTS) |
| `/api/sessions` | GET | List active sessions |
| `/api/session/{id}` | DELETE | Cancel & cleanup |
| `/health` | GET | Kubernetes health probe |

## 🧱 Project Structure

```
clear-clause/
├── backend/
│   ├── main.py                    # FastAPI app + middleware
│   ├── config.py                  # Pydantic Settings
│   ├── api/
│   │   ├── router.py              # All route definitions
│   │   ├── schemas.py             # Pydantic models
│   │   └── dependencies.py        # DI + validation
│   ├── services/
│   │   ├── ocr_service.py         # Apryse OCR extraction
│   │   ├── pii_service.py         # PII detection & redaction
│   │   ├── analysis_service.py    # Gemini clause analysis
│   │   ├── chat_service.py        # Document Q&A + relevance scoring
│   │   ├── stt_service.py         # Deepgram Nova-2 STT
│   │   ├── tts_service.py         # Deepgram Aura-2 TTS
│   │   ├── vector_store.py        # pgvector semantic retrieval
│   │   ├── pipeline_service.py    # Pipeline orchestration
│   │   └── session_manager.py     # Multi-session lifecycle
│   ├── core/
│   │   ├── exceptions.py          # Custom error hierarchy
│   │   ├── rate_limiter.py        # Token bucket + backoff
│   │   └── logger.py              # Structured logging
│   └── prompts/
│       └── analysis_prompt.py     # LLM prompt templates
│
├── frontend/
│   └── src/
│       ├── pages/                 # Landing, Upload, Analysis
│       ├── components/
│       │   ├── analysis/          # Dashboard, ClauseCard, CategoryBar, FairnessCompare
│       │   ├── chat/              # AIAssistantPanel, ChatMessage, VoiceInput
│       │   ├── viewer/            # DocumentViewer (Apryse WebViewer)
│       │   └── common/            # ThemeToggle, OfflineBanner, AnalysisOnboarding
│       ├── hooks/useAnalysis.js   # Upload + polling logic
│       ├── context/               # AnalysisContext, ThemeContext
│       └── services/api.js        # API client
│
├── deployment/
│   ├── k8s/deployment.yaml        # K8s Deployment + Service + Ingress
│   └── vercel.json
│
└── .github/workflows/
    └── deploy-backend.yml         # CI/CD auto-deploy to LKE
```

## 🔐 Privacy & Security

- **PII never reaches the LLM** — Regex-based detection redacts SSNs, emails, phone numbers, credit cards, and dates of birth *before* the text is sent to Gemini
- **Session isolation** — Each document gets an independent session with 30-min TTL and automatic cleanup
- **Rate limiting** — Token bucket middleware prevents API abuse (120 req/min with burst of 30)
- **Secrets management** — Kubernetes secrets for production API keys

## 🏆 Built For

**TerraCode Convergence Hackathon 2026** — Think. Prompt. Build. Present.

## 📜 License

MIT License

## 🙏 Credits

- **Gemini API** — AI analysis and conversational chat
- **Apryse** — PDF text extraction and WebViewer rendering
- **Deepgram** — Voice input (Nova-2 STT) and voice output (Aura-2 TTS)
- **Akamai** — Kubernetes hosting on LKE
- **Vercel** — Frontend deployment

---

**Every clause, crystal clear.** ⚡
