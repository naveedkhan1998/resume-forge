# ResumeForge 🛠️📄

> **Open-Source AI-Powered Resume Builder & Job Tracker**  
> Tailor targeted ATS-friendly LaTeX resumes and cover letters using local or remote **Ollama** models.

---

## ✨ Features

- **Local & Remote Ollama Models**: Configurable for any local model (`qwen3.5:9b`, `llama3`, `gemma4`, etc.) or remote endpoint.
- **Resume Ingestion & Auto-Parsing**: Upload PDF, DOCX, or TXT resumes. Extracted into structured personal info, experiences, skills, education, and projects via local AI.
- **Master Baseline Context**: Keep an exhaustive, single source-of-truth career history.
- **Section-Level AI Refinement**: Edit each experience or section manually or iterate with chat prompts (*"Add metrics using STAR format"*, *"Emphasize distributed systems architecture"*).
- **Job Tracker & Smart Tailoring**:
  - Track applications with status pipeline (Saved, Applied, Interviewing, Offer, Rejected).
  - Paste job descriptions to calculate candidate match scores.
  - AI intelligently decides what to keep, emphasize, or discard to produce a targeted 1-page resume.
- **ATS LaTeX Generator**: Generates clean, battle-tested LaTeX source code for Resume and Cover Letter.
- **PostgreSQL with `pgvector`**: Single-database architecture powering both relational records and semantic embeddings.

---

## 🏗️ Architecture & Monorepo Layout

Managed with **Nx Monorepo**:

```
resume-builder/
├── apps/
│   ├── web/                    # React + Vite + Tailwind CSS v4 + Lucide
│   └── api/                    # Django 5 + Django Ninja + PostgreSQL (pgvector)
├── docker/
│   └── Dockerfile.backend      # Python 3.12 + uv + Tectonic LaTeX engine
├── docker-compose.yml          # PostgreSQL (pgvector) + Redis services
├── package.json                # Monorepo scripts & dependencies
└── pyproject.toml              # apps/api Python dependencies (managed via uv)
```

---

## 🚀 Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- [Docker & Docker Compose](https://www.docker.com/)
- [Ollama](https://ollama.ai/) running locally or accessible remotely

### 1. Start Database & Redis (Docker Compose)
```bash
npm run docker:up
# Or: docker compose up -d db redis
```

### 2. Set Up Python Environment & Run Migrations
```bash
# Create virtual environment and install dependencies
uv venv --python 3.12 .venv
uv pip install -e apps/api

# Run database migrations
npm run migrate
```

### 3. Start Development Servers
You can run both frontend and backend concurrently with Nx:
```bash
npm run dev
```

Or run them individually:
```bash
# Frontend (http://localhost:4200)
npm run dev:web

# Backend API (http://localhost:8000/api/docs)
npm run dev:api
```

---

## 🤖 Ollama Configuration

Ensure your Ollama service is running:
```bash
ollama run qwen3.5:9b
# Or any model of your choice:
# ollama run llama3:latest
# ollama run qwen2.5-coder:14b
```

Inside the ResumeForge web UI, navigate to **AI Settings** to verify connectivity and select your preferred model.

For lightweight models, start with a temperature between `0.1` and `0.3`. ResumeForge requests
structured JSON, validates required fields, and automatically makes one focused repair attempt when
a model returns malformed JSON. Tailoring also keeps the model context compact and never instructs
the model to invent unsupported skills or metrics.

---

## 🌐 Frontend Cloudflare Pages Deployment

The frontend (`apps/web`) can be deployed to Cloudflare Pages:

```bash
# Preview build locally with Cloudflare Pages simulation
npm run pages:preview
# or: npm run preview:web

# Deploy to Cloudflare Pages
npm run pages:deploy
# or: npm run deploy:web
```

### Cloudflare Dashboard Configuration (Git Integration)
- **Framework preset**: `None` / `Vite`
- **Build command**: `npm run build:web`
- **Build output directory**: `dist/apps/web`
- **Root directory**: `/`

---

## 📜 License
MIT License.
