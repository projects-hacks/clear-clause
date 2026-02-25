# ClearClause

> **Every clause, crystal clear.** Upload any complex document. Instantly understand what it really says, what's risky, and what to do about it.

![TerraCode Convergence](https://img.shields.io/badge/TerraCode-Convergence-blue)
![Python](https://img.shields.io/badge/Python-3.11+-green)
![React](https://img.shields.io/badge/React-18-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green)

## Overview

ClearClause is a hackathon project for **TerraCode Convergence** that uses AI to analyze complex documents (contracts, leases, insurance policies, ToS) and explain them in plain language.

### Key Features

- 📤 **Multi-Document Upload** - Concurrent analysis of multiple documents with session-based tracking
- 🔍 **AI-Powered Analysis** - Gemini 3.1 Pro classifies clauses and identifies risks
- 📊 **Visual Dashboard** - Category breakdown, top concerns, and clause-by-clause details
- 📄 **Annotated PDF Viewer** - Apryse WebViewer with colored highlights for each clause
- 💬 **Document Chat** - Ask questions about your document and get AI-powered answers
- 🔊 **Voice Summary** - Deepgram TTS generates audio summaries of key findings

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClearClause System                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (Vercel)          Backend (Akamai LKE)            │
│  ┌─────────────────┐        ┌─────────────────┐             │
│  │  Vite + React   │───────▶│   FastAPI       │             │
│  │                 │        │                 │             │
│  │  • Upload       │        │  • OCR Service  │             │
│  │  • Dashboard    │        │  • Analysis     │             │
│  │  • Viewer       │        │  • Chat         │             │
│  │  • Chat         │        │  • TTS          │             │
│  └─────────────────┘        └─────────────────┘             │
│                                │         │                   │
│                                ▼         ▼                   │
│                         ┌──────────┐ ┌──────────┐           │
│                         │  Apryse  │ │  Gemini  │           │
│                         │   OCR    │ │   3.1    │           │
│                         └──────────┘ └──────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Document Concurrency

ClearClause handles multiple concurrent document analyses:

- **Session-Based Tracking** - Each upload gets a unique session ID
- **Independent Pipelines** - OCR → Analysis runs isolated per document
- **Real-Time Progress** - SSE streaming shows progress for each session
- **Resource Management** - Rate limiting prevents API quota exhaustion
- **Auto-Cleanup** - Expired sessions (30 min TTL) are automatically removed

### Concurrent Flow

```
User A: lease.pdf ──────┬──> Session abc123 ──> OCR → Analysis → Result
                        │
User B: contract.pdf ───┼──> Session xyz789 ──> OCR → Analysis → Result
                        │
User C: policy.pdf ─────┴──> Session def456 ──> OCR → Analysis → Result
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vite + React 18 + React Router |
| **Backend** | Python 3.11 + FastAPI |
| **OCR** | Apryse SDK |
| **AI Analysis** | Gemini 3.1 Pro Preview |
| **AI Chat** | Gemini 3 Flash Preview |
| **TTS** | Deepgram Aura-2 |
| **PDF Viewer** | Apryse WebViewer |
| **Deployment** | Vercel (FE) + Akamai LKE (BE) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- API Keys:
  - [Gemini API Key](https://makersuite.google.com/app/apikey)
  - [Apryse License Key](https://dev.apryse.com)
  - [Deepgram API Key](https://deepgram.com)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment (edit .env with your API keys)
cp .env.example .env

# Run server
python main.py
# or: uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Run dev server
npm run dev
```

Frontend runs at `http://localhost:5173`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Upload PDF and start analysis (returns SSE stream) |
| `/api/analyze/{sessionId}` | GET | Get analysis status for session |
| `/api/chat` | POST | Ask question about analyzed document |
| `/api/voice-summary` | POST | Generate TTS voice summary |
| `/api/sessions` | GET | List all active sessions |
| `/api/session/{sessionId}` | DELETE | Cancel analysis session |
| `/health` | GET | Health check for Kubernetes probes |

## Project Structure

```
clear-clause/
├── backend/
│   ├── main.py                 # FastAPI app entry
│   ├── config.py               # Environment configuration
│   ├── api/
│   │   ├── router.py           # API routes
│   │   ├── schemas.py          # Pydantic models
│   │   └── dependencies.py     # DI setup
│   ├── services/
│   │   ├── ocr_service.py      # Apryse OCR
│   │   ├── analysis_service.py # Gemini analysis
│   │   ├── chat_service.py     # Document chat
│   │   ├── tts_service.py      # Deepgram TTS
│   │   ├── pipeline_service.py # Pipeline orchestration
│   │   └── session_manager.py  # Multi-session management
│   ├── core/
│   │   ├── exceptions.py       # Custom exceptions
│   │   ├── rate_limiter.py     # Token bucket limiter
│   │   └── logger.py           # Structured logging
│   └── prompts/
│       └── analysis_prompt.py  # LLM prompts
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Root component
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── UploadPage.jsx
│   │   │   └── AnalysisPage.jsx
│   │   ├── components/
│   │   │   ├── analysis/
│   │   │   ├── chat/
│   │   │   ├── viewer/
│   │   │   └── voice/
│   │   ├── hooks/
│   │   │   └── useAnalysis.js
│   │   └── context/
│   │       └── AnalysisContext.jsx
│   └── package.json
│
└── deployment/
    ├── k8s/
    │   └── deployment.yaml     # Kubernetes configs
    └── vercel.json             # Vercel config
```

## Design Patterns

### Backend

| Pattern | Usage |
|---------|-------|
| **Strategy** | OCR service (swap Apryse/mock) |
| **Pipeline** | Analysis workflow (OCR → AI → Result) |
| **Observer** | SSE progress streaming |
| **Rate Limiter** | Token bucket for API calls |

### Frontend

| Pattern | Usage |
|---------|-------|
| **Context** | Global analysis state |
| **Custom Hooks** | Encapsulated logic (useAnalysis, useChat) |
| **Compound Components** | Dashboard + Viewer + Chat |

## API Keys Configuration

Create `backend/.env` with:

```env
GEMINI_API_KEY=your_gemini_key
APRYSE_LICENSE_KEY=your_apryse_key
DEEPGRAM_API_KEY=your_deepgram_key

GEMINI_ANALYSIS_MODEL=gemini-3.1-pro-preview
GEMINI_CHAT_MODEL=gemini-3-flash-preview

FRONTEND_URL=http://localhost:5173
MAX_FILE_SIZE_MB=50
MAX_CONCURRENT_ANALYSES=5
```

## Deployment

### Backend (Akamai LKE)

```bash
# Build and push Docker image
docker build -t clearclause-backend ./backend
docker tag clearclause-backend:latest <registry>/clearclause-backend:latest
docker push <registry>/clearclause-backend:latest

# Apply Kubernetes configs
kubectl apply -f deployment/k8s/deployment.yaml

# Create secrets
kubectl create secret generic clearclause-secrets \
  --from-literal=gemini-api-key=$GEMINI_API_KEY \
  --from-literal=apryse-license-key=$APRYSE_KEY \
  --from-literal=deepgram-api-key=$DEEPGRAM_KEY
```

### Frontend (Vercel)

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Testing

### Backend Health Check

```bash
curl http://localhost:8000/health
# Expected: {"status": "ok", "active_sessions": 0}
```

### Upload Test

```bash
curl -X POST http://localhost:8000/api/analyze \
  -F "file=@test_document.pdf" \
  --no-buffer
```

## Troubleshooting

### Apryse SDK Not Found

```bash
# Install with correct index URL
pip install apryse-sdk --extra-index-url=https://pypi.apryse.com
```

### Gemini Rate Limiting

The backend implements automatic rate limiting with exponential backoff. If you hit limits frequently, adjust in `.env`:

```env
GEMINI_REQUESTS_PER_MINUTE=8
MAX_CONCURRENT_ANALYSES=3
```

### Session Expired

Sessions expire after 30 minutes of inactivity. Increase TTL in `.env`:

```env
SESSION_TTL_MINUTES=60
```

## License

MIT License - Built for TerraCode Convergence Hackathon 2026

## Credits

- **Gemini API** - AI analysis and chat
- **Apryse** - PDF text extraction and WebViewer
- **Deepgram** - Voice summary TTS
- **Akamai** - Kubernetes hosting (LKE)
- **Vercel** - Frontend hosting

---

**Every clause, crystal clear.** ⚡
