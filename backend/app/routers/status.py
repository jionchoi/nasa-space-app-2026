"""Region status, personas and the daily check."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import alerts, cabin, daily_log, db, radiation, store
from ..models import CheckRequest, CheckResult, RegionStatus
from ..rules import check as check_rules
from ..rules.escalation import advice_text, overall_level
from ..rules.regions import derive_daily
from ..rules.status import region_statuses
from .records import record_streak

router = APIRouter(prefix="/api")

PERSONA_META = ["id", "name", "description", "simulated", "mission_day", "event_start_s", "unresponsive_s"]


def _statuses(persona: dict, env: str | None = None) -> list[dict]:
    """Region statuses from the daily data, plus the live radiation event (dose for `env`) and the cabin CO2 context."""
    data = daily_log.overlay(persona)  # today's logs (water, exercise, body mass, reaction test)
    rows = region_statuses(data, store.thresholds(), store.regions(), store.escalation())
    radiation.apply_to_status(rows, env)
    cabin.add_co2_context(rows, data)
    return rows


@router.get("/status", response_model=list[RegionStatus])
def status(persona: str = "A", env: str = "iss") -> list:
    # `env` changes the advice text (GET /api/escalation) and the solar-event dose in the radiation reason, never the level.
    data = store.persona(persona)
    rows = _statuses(data, env)
    alerts.check_regions(data["id"], rows, env)
    return rows


@router.get("/personas")
def personas() -> list:
    out = []
    for pid in store.persona_ids():
        data = store.persona(pid)
        out.append({k: data[k] for k in PERSONA_META if k in data})
    return out


@router.get("/persona/{persona_id}/daily")
def daily(persona_id: str) -> list:
    return derive_daily(daily_log.overlay(store.persona(persona_id)), store.regions())


@router.post("/persona/{persona_id}/reset")
def reset(persona_id: str) -> dict:
    """Drops today's daily check for this persona (database and memory)."""
    db.execute("DELETE FROM daily_checks WHERE persona = ?", (persona_id,))
    store.reset_persona(persona_id)
    return {"ok": True}


@router.post("/check", response_model=CheckResult)
def run_check(req: CheckRequest, env: str = "iss") -> dict:
    persona = store.persona(req.persona)
    thresholds, questionnaire = store.thresholds(), store.questionnaire()

    try:
        vitals = check_rules.summarize(
            [f.model_dump() for f in req.seated_frames], [f.model_dump() for f in req.stand_frames],
            questionnaire["measurement"], check_rules.min_quality(thresholds))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    persona["daily"] = [d for d in persona["daily"] if not d.get("today")]  # redo replaces today's entry
    before = _statuses(persona, env)
    extra = {"temp_c": req.temp_c, "glucose_mmol": req.glucose_mmol, "bp_sys": req.bp_sys, "bp_dia": req.bp_dia}
    if req.pvt and req.pvt.version != "demo":  # the 1-minute demo is not compared
        extra.update(pvt_median_ms=req.pvt.median_ms, pvt_lapse_rate_pct=req.pvt.lapse_rate_pct)
    entry, carried = check_rules.build_today(persona, vitals, req.answers, questionnaire, extra)
    persona["daily"].append(entry)
    after = _statuses(persona, env)

    level = overall_level(after)
    alerts.check_regions(persona["id"], after, env)
    notes = []
    if carried:
        notes.append("Not measured today, carried forward from the last 7 days: " + ", ".join(carried))
    result = {
        "day": entry["day"],
        "summary": {**vitals, **{k: v for k, v in extra.items() if v is not None}, "symptoms": entry["symptoms"],
                    **({"pvt": req.pvt.model_dump(exclude={"reaction_ms"})} if req.pvt else {})},
        "comparison": check_rules.compare(entry, store.persona(req.persona, original=True)["daily"], thresholds),
        "before": before,
        "after": after,
        "changed": [{"region": a["region"], "from": b["status"], "to": a["status"]}
                    for b, a in zip(before, after) if a["status"] != b["status"]],
        "advice": {"level": level, "text": advice_text(level, env, store.escalation())},
        "notes": notes,
    }
    answers = {"questions": req.answers, "temp_c": req.temp_c, "glucose_mmol": req.glucose_mmol,
               "bp_sys": req.bp_sys, "bp_dia": req.bp_dia,
               "pvt": req.pvt.model_dump() if req.pvt else None}
    db.insert("daily_checks", persona=persona["id"], t=alerts.now_iso(), day=entry["day"], entry=entry, result=result,
              answers=answers)
    record_streak(persona["id"])
    return result
