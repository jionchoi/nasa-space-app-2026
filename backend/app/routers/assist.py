"""Optional "Polish wording" for the Inbox message to the flight surgeon.

The app works fully offline: the message is built from a rule-based template in the browser. When this laptop has an
ANTHROPIC_API_KEY and an internet connection, the Inbox can ask Claude to rewrite the draft more clearly. The key is
read here only; the frontend just learns whether the button should be shown (GET /api/assist/status).
"""
from __future__ import annotations

import logging
import os
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/assist")
log = logging.getLogger("copilot.assist")

MODEL = "claude-opus-5-5"
ONLINE_CHECK_URL = "https://api.anthropic.com"
ONLINE_CACHE_S = 60
_online: dict[str, float | bool] = {"at": 0.0, "ok": False}

SYSTEM = (
    "You rewrite short messages from an astronaut to their flight surgeon so they are clear and easy to scan. "
    "Keep every fact, number, unit, time and status word exactly as given. Do not add diagnoses, advice, causes or "
    "any medical claim that is not in the draft. Use plain words and short lines. Keep the bullet structure. "
    "Reply with the rewritten message only, no preamble."
)


class PolishIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


def _key() -> str | None:
    return os.environ.get("ANTHROPIC_API_KEY") or None


def _is_online() -> bool:
    """A cheap reachability check of the API host, cached for a minute (no request is billed)."""
    now = time.monotonic()
    if now - float(_online["at"]) < ONLINE_CACHE_S:
        return bool(_online["ok"])
    try:
        httpx.head(ONLINE_CHECK_URL, timeout=2.0)
        ok = True
    except httpx.HTTPError:
        ok = False
    _online.update(at=now, ok=ok)
    return ok


@router.get("/status")
def status() -> dict:
    """Whether the Inbox should show "Polish wording". Never reveals the key."""
    return {"available": bool(_key()) and _is_online()}


@router.post("/polish")
def polish(body: PolishIn) -> dict:
    if not _key() or not _is_online():
        raise HTTPException(503, "Polish wording is not available (no key or no internet).")
    try:
        import anthropic  # optional dependency, imported only when used
    except ImportError as exc:
        raise HTTPException(503, "The anthropic package is not installed.") from exc

    client = anthropic.Anthropic(timeout=30.0, max_retries=1)
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=2000,
            # Simple rewrite: low effort is enough. On a policy decline the API retries on a fallback model.
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM,
            messages=[{"role": "user", "content": body.text}],
        )
    except anthropic.APIConnectionError as exc:
        _online.update(at=time.monotonic(), ok=False)
        raise HTTPException(503, "No connection to the API.") from exc
    except anthropic.APIStatusError as exc:
        log.warning("Polish wording failed: %s", exc.status_code)
        raise HTTPException(503, "Polish wording failed.") from exc

    if response.stop_reason == "refusal":
        raise HTTPException(503, "Polish wording declined; keep the original text.")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise HTTPException(503, "Empty answer; keep the original text.")
    return {"text": text, "model": response.model}
