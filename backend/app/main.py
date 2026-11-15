"""Astronaut Health Co-Pilot backend. Run: uvicorn app.main:app --reload"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, ws
from .config import allowed_origins
from .routers import assist, core, environment, records, signals, status
from .signals.runtime import registry

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.getLogger("copilot").info("Local database: %s %s", db.path(), db.counts())
    try:
        yield
    finally:
        await registry.close()


app = FastAPI(title="Astronaut Health Co-Pilot", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),  # localhost only, plus COPILOT_ALLOWED_ORIGINS from backend/.env
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(core.router)
app.include_router(status.router)
app.include_router(records.router)
app.include_router(environment.router)
app.include_router(assist.router)
app.include_router(signals.router)
app.include_router(ws.router)
