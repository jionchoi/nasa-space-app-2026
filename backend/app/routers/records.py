"""Stored records (SQLite): alerts, emergency logs, flight-surgeon messages, forms, daily checks, streaks, admin."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from pydantic import ValidationError

from .. import alerts, daily_log, db, messaging, sensor, store
from ..models import FORM_MODELS, Alert, DraftRequest, EmergencyLogIn, FormIn, MessageEdit, MessageIn, MessageSend

router = APIRouter(prefix="/api")


# ---------- alerts ----------

@router.get("/alerts", response_model=list[Alert])
def get_alerts(persona: str | None = None, limit: int = 100) -> list:
    return alerts.list_alerts(persona, limit)


@router.post("/alerts/{alert_id}/ack", response_model=Alert)
def ack_alert(alert_id: str) -> dict:
    alert = alerts.acknowledge(alert_id)
    if alert is None:
        raise HTTPException(404, f"No alert '{alert_id}'")
    return alert


# ---------- emergency logs ----------

@router.post("/emergency-logs")
def post_emergency_log(body: EmergencyLogIn) -> dict:
    row_id = db.insert("emergency_logs", **body.model_dump())
    alert = alerts.emergency_handled(body.persona, body.title, body.ended, body.duration_s, log_id=row_id)
    return {"ok": True, "id": row_id, "alert_id": alert["id"] if alert else None, "link": f"/emergency/log/{row_id}"}


@router.get("/emergency-logs/{log_id}")
def get_emergency_log(log_id: int) -> dict:
    rows = db.query("SELECT * FROM emergency_logs WHERE id = ?", (log_id,))
    if not rows:
        raise HTTPException(404, f"No emergency log {log_id}")
    return rows[0]


@router.get("/emergency-logs")
def get_emergency_logs(persona: str | None = None) -> list:
    if persona:
        return db.query("SELECT * FROM emergency_logs WHERE persona = ? ORDER BY id DESC", (persona,))
    return db.query("SELECT * FROM emergency_logs ORDER BY id DESC")


# ---------- flight-surgeon messages (shared service: app/messaging.py) ----------

@router.post("/messages")
def post_message(body: MessageIn) -> dict:
    message = messaging.create(body.persona, body.text, body.env, body.status, alert_id=body.alert_id,
                               source="emergency" if body.status == "sent" else "manual")
    if body.alert_id:
        alerts.link_message(body.alert_id, message["id"])
    return {"ok": True, **message}


@router.get("/messages")
def get_messages(persona: str | None = None) -> list:
    return messaging.list_messages(persona)


def _found(message: dict | None, message_id: str) -> dict:
    if message is None:
        raise HTTPException(404, f"No message '{message_id}'")
    return message


@router.patch("/messages/{message_id}")
def edit_message(message_id: str, body: MessageEdit) -> dict:
    return _found(messaging.edit(message_id, body.text), message_id)


@router.post("/messages/{message_id}/send")
def send_message(message_id: str, body: MessageSend) -> dict:
    return _found(messaging.send(message_id, body.env, body.text), message_id)


@router.post("/messages/{message_id}/reply")
def reply_message(message_id: str) -> dict:
    """Demo only: simulated reply from the flight surgeon."""
    return _found(messaging.simulate_reply(message_id), message_id)


@router.get("/delivery/{env}")
def get_delivery(env: str) -> dict:
    return messaging.delivery(env)


@router.post("/alerts/{alert_id}/draft")
def draft_for_alert(alert_id: str, body: DraftRequest) -> dict:
    """Draft (or return the existing draft of) a flight-surgeon message for an alert."""
    rows = db.query("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    if not rows:
        raise HTTPException(404, f"No alert '{alert_id}'")
    alert = rows[0]
    if alert.get("message_draft_id"):
        existing = messaging.get(alert["message_draft_id"])
        if existing:
            return existing
    row = None
    if alert.get("region"):
        from .status import _statuses  # local: status imports this module
        row = next((r for r in _statuses(store.persona(alert["persona"]), body.env) if r["region"] == alert["region"]), None)
    return alerts.draft_for_alert(alert, row, body.env)


# ---------- generic forms ----------

@router.post("/forms")
def post_form(body: FormIn) -> dict:
    """Generic forms. Known kinds (meal, exercise, biomarkers, pvt) are checked against their model."""
    data = body.data
    model = FORM_MODELS.get(body.kind)
    if model:
        try:
            data = model.model_validate(data).model_dump()
        except ValidationError as exc:
            raise HTTPException(422, exc.errors(include_url=False, include_context=False)) from exc
    row_id = db.insert("forms", persona=body.persona, t=alerts.now_iso(), kind=body.kind, data=data)
    if body.kind in ("mood", "symptoms"):
        alerts.check_symptoms(body.persona, data.get("symptoms") or [])
    return {"ok": True, "id": row_id, "missions": daily_log.missions(body.persona)}


@router.get("/missions")
def get_missions(persona: str = "A") -> dict:
    """Today's behaviour missions (never health results), the targets and the streak."""
    return {"missions": daily_log.missions(persona), "targets": daily_log.targets(),
            "today": daily_log.today_summary(persona), "streak": get_streak(persona)}


@router.get("/forms")
def get_forms(persona: str | None = None, kind: str | None = None) -> list:
    where, params = [], []
    if persona:
        where.append("persona = ?"), params.append(persona)
    if kind:
        where.append("kind = ?"), params.append(kind)
    sql = "SELECT * FROM forms" + (f" WHERE {' AND '.join(where)}" if where else "") + " ORDER BY id DESC"
    return db.query(sql, tuple(params))


# ---------- daily checks and streaks ----------

@router.get("/daily-checks")
def get_daily_checks(persona: str | None = None) -> list:
    if persona:
        return db.query("SELECT * FROM daily_checks WHERE persona = ? ORDER BY id DESC", (persona,))
    return db.query("SELECT * FROM daily_checks ORDER BY id DESC")


def record_streak(persona: str, today: date | None = None) -> dict:
    """A check today keeps the streak; one yesterday extends it; a gap starts again at 1."""
    today = today or date.today()
    rows = db.query("SELECT * FROM streaks WHERE persona = ?", (persona,))
    if rows:
        last = date.fromisoformat(rows[0]["last_date"])
        current = rows[0]["current"] if last == today else rows[0]["current"] + 1 if last == today - timedelta(days=1) else 1
        best = max(rows[0]["best"], current)
        db.execute("UPDATE streaks SET current = ?, best = ?, last_date = ? WHERE persona = ?",
                   (current, best, today.isoformat(), persona))
    else:
        current = best = 1
        db.insert("streaks", persona=persona, current=1, best=1, last_date=today.isoformat())
    return {"persona": persona, "current": current, "best": best, "last_date": today.isoformat()}


@router.get("/streaks/{persona}")
def get_streak(persona: str) -> dict:
    rows = db.query("SELECT * FROM streaks WHERE persona = ?", (persona,))
    if not rows:
        return {"persona": persona, "current": 0, "best": 0, "last_date": None}
    row = rows[0]
    if date.fromisoformat(row["last_date"]) < date.today() - timedelta(days=1):
        row["current"] = 0  # missed a day
    return row


# ---------- admin ----------

@router.get("/admin/summary")
def admin_summary() -> dict:
    return {"db": str(db.path()), "counts": db.counts(), "sensor_live": sensor.hub.fresh()}


@router.post("/admin/reset")
def admin_reset() -> dict:
    """Clears the database and in-memory state. JSON files in backend/data/ are not touched."""
    from .. import radiation  # local: avoid import cycle at start-up

    db.reset()
    alerts.reset()
    radiation.stop()
    store.reset()
    return {"ok": True, "counts": db.counts()}
