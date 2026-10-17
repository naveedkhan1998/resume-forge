# Contributing to ResumeForge 🛠️

First off, thank you for considering contributing to **ResumeForge**! Whether you are fixing a bug, proposing a new feature, improving documentation, or refining AI prompts, your help is very welcome.

Please take a moment to review this document before submitting your first pull request.

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## 🚀 Getting Started (Local Development)

### Prerequisites

- **[Node.js](https://nodejs.org/)** (v20+) & **npm**
- **[Docker & Docker Compose](https://www.docker.com/)** (for PostgreSQL + `pgvector` and the containerized API)
- **[Ollama](https://ollama.ai/)** (optional, for running local LLM models)
- **[uv](https://github.com/astral-sh/uv)** & **Python 3.12+** (optional, only needed if running the backend directly on the host instead of Docker)

### Quick Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/naveedkhan1998/resume-forge.git
   cd resume-forge
   ```

2. **Install Node dependencies first:**
   ```bash
   npm i
   ```

3. **Set up environment variables (optional):**
   ```bash
   cp .env.example .env
   ```

4. **Start the development environment:**
   ```bash
   npm run dev
   ```
   This starts both the **React frontend** (`http://localhost:4200`) and the **Django API + PostgreSQL (`pgvector`)** containers (`http://localhost:8000`) concurrently via Nx.

### Running Backend Locally (Without API Docker Container)

If you prefer running the Django server directly on your host machine:

```bash
# 1. Start only the PostgreSQL (pgvector) container
npm run docker:up db

# 2. Create Python virtual environment and install dependencies
uv venv --python 3.12 .venv
uv pip install -e apps/api

# 3. Run migrations
npm run migrate

# 4. Run frontend and local backend in separate terminals
npm run dev:web
npm run dev:api:local
```

---

## 🛠️ Project Structure

```text
resume-forge/
├── apps/
│   ├── web/                    # React 19 + Vite + Tailwind CSS v4 frontend
│   └── api/                    # Django 5 + Django Ninja + pgvector backend
├── docker/
│   ├── Dockerfile.backend      # Backend container definition
│   └── entrypoint.sh           # DB extension setup, migrations & server entrypoint
├── docker-compose.yml          # Local PostgreSQL (pgvector) & API services
└── package.json                # Nx workspace scripts & dependencies
```

---

## 🔄 Pull Request Process

1. **Create a topic branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
2. **Make your changes:**
   - Keep commits focused and atomic.
   - Follow existing code style and conventions (TypeScript/React in `apps/web`, Python/Django Ninja in `apps/api`).
   - Do not commit secrets, `.env` files, or personal resume uploads.
3. **Verify your changes:**
   - Ensure the frontend builds cleanly:
     ```bash
     npm run build:web
     ```
   - If you modified backend models, generate and verify migrations:
     ```bash
     npm run makemigrations
     npm run migrate
     ```
4. **Open a Pull Request:**
   - Fill out the pull request template with a clear summary of what changed and how to test it.
   - Link any related issues (e.g., `Closes #123`).

---

## 🐛 Reporting Bugs & Suggesting Features

- **Bugs**: Open an issue using the [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.md) and include steps to reproduce, expected behavior, and logs/screenshots.
- **Features**: Open an issue using the [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.md) describing the use case and proposed behavior.

Thank you for helping make **ResumeForge** better! 🎉
