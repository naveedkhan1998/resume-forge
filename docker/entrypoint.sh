#!/usr/bin/env sh
set -e

cd /app

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[Entrypoint] Ensuring pgvector extension (if PostgreSQL) and running migrations..."
  python apps/api/manage.py shell -c "
from django.db import connection
if connection.vendor == 'postgresql':
    with connection.cursor() as cursor:
        cursor.execute('CREATE EXTENSION IF NOT EXISTS vector;')
" || echo "[Entrypoint] Warning: Could not auto-create vector extension (continuing to migrate)..."

  python apps/api/manage.py migrate --noinput
fi

# If a custom command was passed (e.g. from docker-compose.yml), execute it
if [ "$#" -gt 0 ]; then
  echo "[Entrypoint] Starting custom command: $*"
  exec "$@"
fi

PORT="${PORT:-8000}"
WORKERS="${GUNICORN_WORKERS:-2}"
THREADS="${GUNICORN_THREADS:-8}"
TIMEOUT="${GUNICORN_TIMEOUT:-600}"
WORKER_CLASS="${GUNICORN_WORKER_CLASS:-gthread}"

echo "[Entrypoint] Starting Gunicorn (${WORKER_CLASS}, workers=${WORKERS}, threads=${THREADS}, timeout=${TIMEOUT}s) on 0.0.0.0:${PORT}..."
exec gunicorn config.wsgi:application \
  --chdir /app/apps/api \
  --bind "0.0.0.0:${PORT}" \
  --worker-class "${WORKER_CLASS}" \
  --workers "${WORKERS}" \
  --threads "${THREADS}" \
  --timeout "${TIMEOUT}" \
  --graceful-timeout 60 \
  --keep-alive 65 \
  --worker-tmp-dir /dev/shm \
  --access-logfile - \
  --error-logfile - \
  --log-level "${LOG_LEVEL:-info}"
