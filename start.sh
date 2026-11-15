#!/usr/bin/env bash
# One-command run (macOS / Linux): backend on :8000 and frontend on :5173. Ctrl+C stops both.
# First run creates backend/.venv and installs dependencies; later runs start straight away.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then
  echo "Setting up backend/.venv (first run)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null || true' EXIT INT TERM

cd "$ROOT/frontend"
[ -d node_modules ] || { echo "Installing frontend packages (first run)..."; npm install; }
echo "Open http://localhost:5173"
npm run dev
