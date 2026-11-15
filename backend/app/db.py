"""Local SQLite storage (backend/data/app.db). Fully offline, no ORM.

Everything the app records at runtime lives here and survives a restart. The JSON files in backend/data/ stay
the read-only source of medical content; POST /api/admin/reset clears only this database.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from . import store

TABLES = ["events", "daily_checks", "emergency_logs", "alerts", "messages", "forms", "streaks"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT, t TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS daily_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT NOT NULL, t TEXT NOT NULL, day INTEGER NOT NULL,
  entry TEXT NOT NULL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS emergency_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT, protocol TEXT, title TEXT, started TEXT, ended TEXT,
  duration_s REAL, log TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, persona TEXT, t TEXT NOT NULL, level TEXT NOT NULL, region TEXT, metric TEXT,
  message TEXT NOT NULL, source TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, message_draft_id TEXT);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, persona TEXT, t TEXT NOT NULL, env TEXT, text TEXT NOT NULL, status TEXT NOT NULL,
  delay_s REAL, alert_id TEXT);
CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT, t TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS streaks (
  persona TEXT PRIMARY KEY, current INTEGER NOT NULL, best INTEGER NOT NULL, last_date TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS alerts_persona ON alerts (persona, t);
CREATE INDEX IF NOT EXISTS checks_persona ON daily_checks (persona, id);
"""

# Columns added after the first release: added in place, so existing app.db files keep their rows.
MIGRATIONS = {
    "messages": [("region", "TEXT"), ("source", "TEXT"), ("sent_at", "TEXT"), ("reply", "TEXT"),
                 ("replied_at", "TEXT"), ("updated_at", "TEXT")],
    "alerts": [("link", "TEXT")],
    "emergency_logs": [("answers", "TEXT"), ("messages", "TEXT"), ("trigger", "TEXT")],
    "daily_checks": [("answers", "TEXT")],
}

JSON_COLUMNS = {"data", "entry", "result", "log", "answers", "messages"}
_lock = threading.Lock()
_ready: set[str] = set()


def path() -> Path:
    """COPILOT_DB overrides the location (tests use a temporary file)."""
    return Path(os.environ.get("COPILOT_DB") or store.DATA_DIR / "app.db")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    p = path()
    with _lock:
        conn = sqlite3.connect(p, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            if str(p) not in _ready:
                conn.executescript(SCHEMA)
                _migrate(conn)
                _ready.add(str(p))
            yield conn
            conn.commit()
        finally:
            conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    for table, columns in MIGRATIONS.items():
        have = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for name, kind in columns:
            if name not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")


def _decode(row: sqlite3.Row) -> dict[str, Any]:
    out = dict(row)
    for key in JSON_COLUMNS & out.keys():
        out[key] = json.loads(out[key]) if out[key] is not None else None
    if "acknowledged" in out:
        out["acknowledged"] = bool(out["acknowledged"])
    return out


def insert(table: str, **cols: Any) -> int:
    assert table in TABLES
    values = [json.dumps(v) if k in JSON_COLUMNS else v for k, v in cols.items()]
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
    with connect() as conn:
        return conn.execute(sql, values).lastrowid


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connect() as conn:
        return [_decode(r) for r in conn.execute(sql, params).fetchall()]


def execute(sql: str, params: tuple = ()) -> int:
    with connect() as conn:
        return conn.execute(sql, params).rowcount


def counts() -> dict[str, int]:
    with connect() as conn:
        return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}


def reset() -> None:
    with connect() as conn:
        for t in TABLES:
            conn.execute(f"DELETE FROM {t}")


def forget_schema_cache() -> None:
    _ready.clear()
