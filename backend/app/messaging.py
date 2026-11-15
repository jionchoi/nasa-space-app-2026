"""Messages to the flight surgeon: one service for emergency mode and the dashboard escalation queue.

Drafts are created automatically for orange/red regions (see alerts.check_regions) and can be edited, sent and
(for the demo) answered with a simulated reply. Delivery delay = midpoint of the environment's delay range;
status words come from escalation.json "link". Stored in the SQLite `messages` table.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from . import db, sensor, store
from .rules.escalation import advice_text
from .rules.regions import derive_daily, region_list

LIVE_KEYS = ("hr", "hrv_rmssd", "spo2", "rr")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def delivery(env: str) -> dict[str, Any]:
    """How long a message takes to arrive here, and the status text to show after Send."""
    lo, hi = (store.environment(env) or {"delay_s": [0, 0]})["delay_s"]  # the rover: delay of its planet
    entry = store.pick_for_env(store.escalation().get("link", {}), env, default_key="")
    sent_text = entry.get("sent", "Sent") if isinstance(entry, dict) else "Sent"
    return {"env": env, "delay_s": (lo + hi) / 2, "status_text": sent_text}


def get(message_id: str) -> dict | None:
    rows = db.query("SELECT * FROM messages WHERE id = ?", (message_id,))
    return _with_delivery(rows[0]) if rows else None


def list_messages(persona: str | None = None) -> list[dict]:
    if persona:
        rows = db.query("SELECT * FROM messages WHERE persona = ? ORDER BY t DESC", (persona,))
    else:
        rows = db.query("SELECT * FROM messages ORDER BY t DESC")
    return [_with_delivery(r) for r in rows]


def _with_delivery(row: dict) -> dict:
    row["status_text"] = delivery(row["env"] or "iss")["status_text"] if row["status"] != "draft" else None
    return row


def create(persona: str, text: str, env: str, status: str = "draft", alert_id: str | None = None,
           region: str | None = None, source: str = "manual") -> dict:
    t = now_iso()
    message = {"id": uuid.uuid4().hex[:12], "persona": persona, "t": t, "env": env, "text": text, "status": status,
               "delay_s": delivery(env)["delay_s"], "alert_id": alert_id, "region": region, "source": source,
               "sent_at": t if status == "sent" else None, "updated_at": t}
    db.insert("messages", **message)
    return get(message["id"])


def edit(message_id: str, text: str) -> dict | None:
    """Only drafts can be edited; a sent message is a record."""
    db.execute("UPDATE messages SET text = ?, updated_at = ? WHERE id = ? AND status = 'draft'", (text, now_iso(), message_id))
    return get(message_id)


def send(message_id: str, env: str, text: str | None = None) -> dict | None:
    message = get(message_id)
    if message is None:
        return None
    if message["status"] == "draft":
        t = now_iso()
        db.execute("UPDATE messages SET status = 'sent', env = ?, delay_s = ?, sent_at = ?, updated_at = ?, text = ? WHERE id = ?",
                   (env, delivery(env)["delay_s"], t, t, text if text is not None else message["text"], message_id))
    return get(message_id)


def simulate_reply(message_id: str) -> dict | None:
    """Demo only: a placeholder answer from the flight surgeon (escalation.json link.reply_placeholder)."""
    message = get(message_id)
    if message is None or message["status"] == "draft":
        return message
    reply = store.escalation().get("link", {}).get("reply_placeholder", "Reply received (simulated).")
    db.execute("UPDATE messages SET status = 'replied', reply = ?, replied_at = ?, updated_at = ? WHERE id = ?",
               (reply, now_iso(), now_iso(), message_id))
    return get(message_id)


# ---------- automatic drafts ----------

def _fmt(x: float) -> str:
    return f"{x:g}" if abs(x) >= 10 else f"{x:.1f}".rstrip("0").rstrip(".")


def crew_actions(persona: str, limit: int = 4) -> list[str]:
    """What the crew has done recently, from the stored logs (newest first)."""
    actions = []
    for row in db.query("SELECT t FROM daily_checks WHERE persona = ? ORDER BY id DESC LIMIT 1", (persona,)):
        actions.append(f"daily check done ({row['t'][:16].replace('T', ' ')} UTC)")
    for row in db.query("SELECT title, ended FROM emergency_logs WHERE persona = ? ORDER BY id DESC LIMIT 1", (persona,)):
        actions.append(f"emergency protocol \"{row['title']}\" completed ({(row['ended'] or '')[:16].replace('T', ' ')} UTC)")
    for row in db.query("SELECT data FROM events WHERE persona = ? ORDER BY id DESC LIMIT ?", (persona, limit)):
        text = (row["data"].get("signals") or {}).get("text")
        if text:
            actions.append(text)
    for row in db.query("SELECT text FROM messages WHERE persona = ? AND status != 'draft' ORDER BY t DESC LIMIT 1", (persona,)):
        actions.append("an earlier message was sent to the flight surgeon")
    return actions[:limit]


def build_draft(persona: str, region: str | None, row: dict | None, env: str, extra: str | None = None) -> str:
    """Plain-language message: who, region, metric and trend, latest vitals, time to act, crew actions, recommendation."""
    data = store.persona(persona)
    thresholds, regions_cfg, labels = store.thresholds(), store.regions(), store.labels()
    meta = next((r for r in region_list(regions_cfg) if r["id"] == region), None)
    lines = ["Flight surgeon: health update (drafted automatically, please review before sending).",
             f"Crew member: {data['name']}{' (simulated data)' if data.get('simulated') else ''}, mission day {data.get('mission_day')}."]
    if meta and row:
        lines.append(f"Area: {meta['label']}, status {labels.get(row['status'], row['status'])}.")
        lines.append(f"What we see: {row['reason']}")
        key = meta["key_metric"]
        entry = thresholds.get(key) if isinstance(thresholds.get(key), dict) else {}
        series = [d[key] for d in derive_daily(data, regions_cfg)[-7:] if d.get(key) is not None]
        if len(series) >= 2:
            unit = entry.get("unit", "")
            lines.append(f"Trend ({entry.get('label', key)}, last {len(series)} days): {_fmt(series[0])} to {_fmt(series[-1])} {unit}.".replace(" .", "."))
        days = row.get("time_to_act_days")
        lines.append("Time to act: now." if days == 0 else f"Time to act: in about {days} days if the trend continues." if days else
                     "Time to act: no deadline from the trend yet.")
    frame = sensor.last_frames.get(data["id"])
    if frame:
        parts = []
        for k in LIVE_KEYS:
            e = thresholds.get(k) if isinstance(thresholds.get(k), dict) else {}
            parts.append(f"{e.get('label', k)} {_fmt(float(frame[k]))} {e.get('unit', '')}".strip())
        source = "sensor" if frame.get("source") == "sensor" else "simulated replay"
        lines.append(f"Latest vitals ({source}): {', '.join(parts)}{', irregular rhythm' if frame.get('irregular') else ''}.")
    else:
        lines.append("Latest vitals: no live reading yet.")
    actions = crew_actions(data["id"])
    lines.append("Crew actions so far: " + ("; ".join(actions) if actions else "none recorded yet") + ".")
    if extra:
        lines.append(extra)
    if row:
        lines.append(f"Our recommendation: {advice_text(row['advice_level'], env, store.escalation())}")
    lines.append("Please advise.")
    return "\n".join(lines)
