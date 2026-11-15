"""Daily check: turn recorded frames + questionnaire answers into today's daily entry."""
from __future__ import annotations

from statistics import mean, median

from .judge import bounds, judge
from .status import fmt

MEASURED = ["hr_rest", "hrv_rmssd", "spo2", "rr", "stand_hr_rise", "bp_sys", "bp_dia", "temp_c", "glucose_mmol",
            "pvt_median_ms", "pvt_lapses", "sleep_h", "mood", "stress"]


def summarize(seated: list[dict], stand: list[dict], cfg: dict, min_quality: float | None) -> dict:
    """Vitals for today from the seated and standing recordings."""
    def usable(frames: list[dict]) -> list[dict]:
        good = [f for f in frames if min_quality is None or f["signal_quality"] >= min_quality]
        return good

    seated, stand = usable(seated), usable(stand) if stand else []
    if not seated:
        raise ValueError("No usable seated measurement frames; repeat the measurement")
    rest = seated[-int(cfg.get("rest_window_s", 60)):]
    hr_rest = median(f["hr"] for f in rest)
    frames = seated + stand
    irregular_share = sum(1 for f in frames if f["irregular"]) / len(frames)
    return {
        "hr_rest": round(hr_rest, 1),
        "hrv_rmssd": round(mean(f["hrv_rmssd"] for f in seated), 1),
        "spo2": round(median(f["spo2"] for f in seated), 1),
        "rr": round(median(f["rr"] for f in seated), 1),
        "stand_hr_rise": round(max(f["hr"] for f in stand) - hr_rest, 1) if stand else None,
        "irregular": irregular_share >= cfg.get("irregular_min_fraction", 0.1),
    }


def build_today(persona: dict, vitals: dict, answers: dict, questionnaire: dict,
                extra: dict | None = None) -> tuple[dict, list[str]]:
    """Today's entry. Fields not measured today are carried forward (median of the last 7 days).
    `extra`: temperature, glucose and reaction-test values entered during the check."""
    previous = [d for d in persona["daily"] if not d.get("today")]
    entry: dict = {"day": previous[-1]["day"] + 1, "today": True, "symptoms": []}
    entry.update({k: v for k, v in vitals.items() if v is not None})
    entry.update({k: v for k, v in (extra or {}).items() if v is not None})
    for q in questionnaire["questions"]:
        if q["id"] not in answers:
            continue
        value = answers[q["id"]]
        if q.get("field"):
            entry[q["field"]] = value if q["type"] == "number" else int(value)
        if q.get("symptom") and value >= questionnaire.get("symptom_from", 3):
            entry["symptoms"].append(q["symptom"])
    carried = []
    for field, sample in previous[-1].items():
        if field not in entry and isinstance(sample, (int, float)) and not isinstance(sample, bool):
            entry[field] = median(d[field] for d in previous[-7:] if d.get(field) is not None)
            carried.append(field)
    return entry, carried


def compare(entry: dict, baseline_daily: list[dict], thresholds: dict) -> list[dict]:
    """Each measured number next to the personal baseline (median of the persona's recorded days)."""
    rows = []
    for metric in MEASURED:
        info = thresholds.get(metric)
        if entry.get(metric) is None or not isinstance(info, dict):
            continue
        value = float(entry[metric])
        past = [float(d[metric]) for d in baseline_daily if d.get(metric) is not None]
        base = round(median(past), 1) if past else None
        delta = round(value - base, 1) if base is not None else None
        label, unit = info.get("label", metric), info.get("unit", "")
        text = f"{label} {fmt(value)} {unit}".strip()
        if delta is None:
            text += " (no baseline yet)"
        elif delta == 0:
            text += ", the same as your usual"
        else:
            text += f", {fmt(abs(delta))} {'above' if delta > 0 else 'below'} your usual"
        rows.append({"metric": metric, "label": label, "unit": unit, "value": value, "baseline": base,
                     "delta": delta, "status": judge(value, info), "text": text})
    return rows


def min_quality(thresholds: dict) -> float | None:
    return bounds(thresholds.get("signal_quality"), "red")[0]
