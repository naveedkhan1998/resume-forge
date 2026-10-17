# Security Policy 🔒

## Supported Versions

ResumeForge is actively developed on the `main` branch. Security updates are applied to the latest release/commit on `main`.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |

## Reporting a Vulnerability

We take the security of ResumeForge seriously. If you discover a security vulnerability, **please do not report it via a public GitHub issue.**

Instead, please report it privately using one of the following methods:

1. **GitHub Private Vulnerability Reporting**: Navigate to the repository's **Security** tab and click **"Report a vulnerability"**.
2. **Contact the Maintainer**: Reach out directly via the maintainer's GitHub profile ([@naveedkhan1998](https://github.com/naveedkhan1998)).

### What to Include

Please provide as much of the following information as possible to help us reproduce and resolve the issue quickly:

- Type of issue (e.g., SSRF, SQL injection, XSS, authentication/authorization bypass, prompt injection, file upload vulnerability)
- Full paths of the source file(s) related to the manifestation of the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Potential impact of the vulnerability

## Security Best Practices for Self-Hosting

- **Change `SECRET_KEY`**: Always override the default Django `SECRET_KEY` in production environments.
- **Set `DEBUG=False`**: Never run `DEBUG=True` in publicly exposed environments.
- **Protect API Keys**: Keep `.env` files out of version control. System fallback LLM keys (`SYSTEM_LLM_API_KEY`) must only reside on the server.
- **Secure Ollama Endpoints**: If exposing an Ollama server over a network, restrict access via firewall rules, reverse proxy authentication, or private networking.
