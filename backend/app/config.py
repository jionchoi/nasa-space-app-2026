"""Local settings from backend/.env (git-ignored; see backend/.env.example). Real environment variables win.

Only addresses on this laptop are allowed by default. COPILOT_ALLOWED_ORIGINS adds browser origins (scheme, host and
port, comma separated) for both the REST API (CORS) and the PPG signal websockets.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_FILE, override=False)

DEFAULT_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def allowed_origins() -> list[str]:
    """The localhost defaults plus any extra origins from COPILOT_ALLOWED_ORIGINS (read on every call)."""
    extra = [o.strip().rstrip("/") for o in os.environ.get("COPILOT_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    return list(dict.fromkeys([*DEFAULT_ORIGINS, *extra]))
