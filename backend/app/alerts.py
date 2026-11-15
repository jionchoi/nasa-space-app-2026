"""Alerts: created by the backend from region status changes, red live vitals and emergencies.

Stored in SQLite (table `alerts`), served at GET /api/alerts, acknowledged with POST /api/alerts/{id}/ack and
pushed to subscribers of /ws/alerts. Thresholds and words come from JSON; nothing medical is hard-coded here.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from . import db, store
from .rules.judge import judge
from .rules.regions import region_list

log = logging.getLogger("copilot")

LIVE_VITALS = ("hr", "hrv_rmssd", "spo2", "rr")
LEVELS = ("yellow", "orange", "red")

_subscribers: set[tuple[asyncio.Queue, asyncio.AbstractEventLoop]] = set()
_region_seen: dict[str, dict[str, str]] = {}  # persona -> region -> last status seen
_live_red: dict[str, set[str]] = {}  # persona -> metrics currently red


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# ---------- pub/sub for /ws/alerts ----------

def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.add((queue, asyncio.get_running_loop()))
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    for item in list(_subscribers):
        if item[0] is queue:
            _subscribers.discard(item)


def publish(message: dict[str, Any]) -> None:
    """Safe to call from request threads and from the event loop."""
    for queue, loop in list(_subscribers):
        try:
            loop.call_soon_threadsafe(queue.put_nowait, message)
        except RuntimeError:  # loop closed
            _subscribers.discard((queue, loop))


# ---------- storage ----------

def list_alerts(persona: str | None = None, limit: int = 100) -> list[dict]:
    if persona:
        return db.query("SELECT * FROM alerts WHERE persona = ? ORDER BY t DESC, rowid DESC LIMIT ?", (persona, limit))
    return db.query("SELECT * FROM alerts ORDER BY t DESC, rowid DESC LIMIT ?", (limit,))


def create(persona: str, level: str, message: str, source: str, region: str | None = None,
           metric: str | None = None, dedupe: bool = True, link: str | None = None) -> dict | None:
    """Store and publish a new alert. Skips it if the same open (unacknowledged) alert already exists."""
    if level not in LEVELS:
        return None
    open_same = dedupe and db.query(
        "SELECT id FROM alerts WHERE persona = ? AND source = ? AND level = ? AND region IS ? AND metric IS ? "
        "AND acknowledged = 0", (persona, source, level, region, metric))
    if open_same:
        return None
    alert = {"id": uuid.uuid4().hex[:12], "t": now_iso(), "level": level, "region": region, "metric": metric,
             "message": message, "source": source, "acknowledged": False, "message_draft_id": None, "persona": persona,
             "link": link}
    db.insert("alerts", **{**alert, "acknowledged": 0})
    publish({"type": "alert", "alert": alert})
    log.info("alert %s %s %s", persona, level, message)
    return alert


def acknowledge(alert_id: str) -> dict | None:
    if not db.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,)):
        return None
    alert = db.query("SELECT * FROM alerts WHERE id = ?", (alert_id,))[0]
    publish({"type": "ack", "alert": alert})
    return alert


def link_message(alert_id: str, message_id: str) -> None:
    if db.execute("UPDATE alerts SET message_draft_id = ? WHERE id = ?", (message_id, alert_id)):
        publish({"type": "update", "alert": db.query("SELECT * FROM alerts WHERE id = ?", (alert_id,))[0]})


# ---------- sources ----------

def open_alert(persona: str, source: str, level: str, region: str | None, metric: str | None) -> dict | None:
    rows = db.query("SELECT * FROM alerts WHERE persona = ? AND source = ? AND level = ? AND region IS ? AND metric IS ? "
                    "AND acknowledged = 0 ORDER BY t DESC LIMIT 1", (persona, source, level, region, metric))
    return rows[0] if rows else None


def draft_for_alert(alert: dict, row: dict | None = None, env: str = "iss") -> dict:
    """Draft a flight-surgeon message for this alert (escalation queue) and link it to the alert."""
    from . import messaging, radiation  # local: both import this module

    extra = None
    if alert.get("region") == "radiation" and radiation.active():
        extra = f"Shelter advice given to the crew: {radiation.advice(env)}"
    if alert["source"] != "rules" and row is not None:
        # Live vitals / emergency alerts: the alert is the news; the daily trend is background.
        level = "surgeon_now" if alert["level"] == "red" else "surgeon_next" if alert["level"] == "orange" else row["advice_level"]
        row = {**row, "status": alert["level"], "advice_level": level, "time_to_act_days": 0 if alert["level"] == "red" else row["time_to_act_days"],
               "reason": f"{alert['message']}. Daily trend: {row['reason']}"}
    text = messaging.build_draft(alert["persona"], alert.get("region"), row, env, extra=extra)
    if alert["source"] != "rules" or row is None:
        text = text.replace("Flight surgeon: health update", f"Flight surgeon: ALERT. {alert['message']}", 1)
    message = messaging.create(alert["persona"], text, env, "draft", alert_id=alert["id"], region=alert.get("region"), source="alert")
    link_message(alert["id"], message["id"])
    return message


def check_regions(persona: str, statuses: list[dict], env: str = "iss") -> list[dict]:
    """Alert when a region turns yellow/orange/red or gets worse. Staying the same does not repeat it.
    Orange and red also get a draft message to the flight surgeon (escalation queue)."""
    labels, regions_cfg = store.labels(), store.regions()
    names = {r["id"]: r for r in region_list(regions_cfg)}
    seen = _region_seen.setdefault(persona, {})
    created = []
    for row in statuses:
        region, status = row["region"], row["status"]
        before = seen.get(region)
        seen[region] = status
        if status == "green" or before == status:
            continue
        meta = names.get(region, {})
        already = False
        if before is None:  # first look since start: don't repeat an alert that is already on record
            last = db.query("SELECT level FROM alerts WHERE persona = ? AND source = 'rules' AND region = ? "
                            "ORDER BY t DESC, rowid DESC LIMIT 1", (persona, region))
            already = bool(last) and last[0]["level"] == status
        alert = None
        if not already:
            message = f"{meta.get('label', region)} · {labels.get(status, status)}: {row['reason']}"
            alert = create(persona, status, message, "rules", region=region, metric=meta.get("key_metric"))
            if alert:
                created.append(alert)
        if alert is None:  # the same alert is already open (e.g. the solar-event alert): still make sure it has a draft
            alert = open_alert(persona, "rules", status, region, meta.get("key_metric"))
        if alert and status in ("orange", "red") and not alert.get("message_draft_id"):
            draft_for_alert(alert, row, env)
    return created


def red_vitals(frame: dict, thresholds: dict) -> list[str]:
    """Same rule as the frontend's liveStatus(): vitals in the red range, ignored when the signal is poor."""
    if judge(float(frame["signal_quality"]), thresholds.get("signal_quality")) == "red":
        return []
    red = [k for k in LIVE_VITALS if frame.get(k) is not None and judge(float(frame[k]), thresholds.get(k)) == "red"]
    if judge(1.0 if frame.get("irregular") else 0.0, thresholds.get("irregular")) == "red":
        red.append("irregular")
    return red


def check_frame(persona: str, frame: dict) -> list[dict]:
    """Alert once when a live vital enters the red range (again after it has left it)."""
    thresholds = store.thresholds()
    red = set(red_vitals(frame, thresholds))
    before = _live_red.get(persona, set())
    _live_red[persona] = red
    created = []
    regions_cfg = store.regions()
    for metric in sorted(red - before):
        entry = thresholds.get(metric) if isinstance(thresholds.get(metric), dict) else {}
        region = next((r["id"] for r in region_list(regions_cfg) if metric in r.get("live_metrics", [])), None)
        if metric == "irregular":
            message = "Live: irregular heart rhythm"
        else:
            message = f"Live: {entry.get('label', metric)} in the danger range ({frame[metric]:g} {entry.get('unit', '')})".rstrip()
            message = message.replace(" )", ")")
        alert = create(persona, "red", message, "vitals", region=region, metric=metric)
        if alert:
            created.append(alert)
    return created


def emergency_handled(persona: str, title: str, ended: str, duration_s: float, log_id: int | None = None) -> dict | None:
    minutes = max(1, round(duration_s / 60))
    try:
        at = datetime.fromisoformat(ended.replace("Z", "+00:00")).astimezone().strftime("%H:%M")
    except ValueError:
        at = ended
    return create(persona, "yellow", f"Emergency handled at {at} ({title}, about {minutes} min)", "emergency",
                  dedupe=False, link=f"/emergency/log/{log_id}" if log_id else None)


def reset() -> None:
    _region_seen.clear()
    _live_red.clear()
