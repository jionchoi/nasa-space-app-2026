"""Generate simulated personas A, B, C into backend/data/personas/. Re-runnable (fixed seed).

Run from backend/:  python scripts/make_personas.py

PLACEHOLDER physiology: Yenna reviews every number in PHYSIOLOGY below.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

SEED = 2026
DAYS = 30
STREAM_S = 600
OUT = Path(__file__).resolve().parents[1] / "data" / "personas"
T0 = datetime(2026, 11, 14, 8, 0, 0, tzinfo=timezone.utc)

# daily: field -> (value on day 1, value on day 30, day-to-day noise, min, max, decimals)
HEALTHY_DAILY = {
    "hr_rest": (62, 62, 1.5, 58, 66, 1),
    "hrv_rmssd": (52, 52, 3.0, 45, 60, 1),
    "spo2": (98, 98, 0.5, 97, 99, 0),
    "rr": (14, 14, 0.8, 12, 16, 0),
    "stand_hr_rise": (14, 14, 2.0, 10, 18, 1),
    "sleep_h": (7.0, 7.0, 0.25, 6.5, 7.5, 1),
    "mood": (4, 4, 0.3, 4, 5, 0),
    "stress": (2, 2, 0.4, 1, 2, 0),
    "hydration_l": (2.5, 2.5, 0.15, 2.2, 2.9, 1),
    "exercise_min": (125, 125, 8.0, 110, 140, 0),
    "radiation_msv": (0.6, 0.6, 0.05, 0.45, 0.75, 2),
}
# Reaction test (psychomotor vigilance style). Drawn with a separate random stream so adding them does not
# change the other daily values. Same tuple format as above. PLACEHOLDER: Yenna reviews.
HEALTHY_PVT = {
    "pvt_median_ms": (255, 255, 12, 225, 290, 0),
    "pvt_lapses": (0.6, 0.6, 0.6, 0, 2, 0),
}
# Blood pressure from the daily check (added Nov 14), mmHg. Own random stream, same reason as above. PLACEHOLDER.
HEALTHY_BP = {
    "bp_sys": (116, 116, 3.0, 108, 124, 0),
    "bp_dia": (74, 74, 2.0, 68, 80, 0),
}
# stream phases: targets reached at "until" seconds (straight line from the previous phase)
STEADY = {"until": STREAM_S, "hr": 62, "rmssd": 52, "spo2": 98, "rr": 14}

PHYSIOLOGY = {
    "A": {
        "name": "Alex Moreno",
        "description": "Healthy baseline. All values stay in the usual range.",
        "daily": HEALTHY_DAILY,
        "solar_event": {"day": 12, "msv": 4.8},
        "pvt": HEALTHY_PVT,
        "bp": HEALTHY_BP,
        "body_mass_start_kg": 72.4,
        "phases": [STEADY],
    },
    "B": {
        "name": "Sam Idowu",
        "description": "Slow drift over 30 days: resting heart rate rises, heart rate variability and sleep fall.",
        "daily": {
            **HEALTHY_DAILY,
            "hr_rest": (60.0, 72.5, 0.25, 55, 80, 1),
            "hrv_rmssd": (50.5, 29.5, 0.4, 25, 60, 1),
            "stand_hr_rise": (14.0, 32.5, 0.4, 10, 38, 1),
            "sleep_h": (7.1, 5.45, 0.03, 5.0, 7.5, 2),
            "mood": (4, 2, 0.0, 1, 5, 0),
            "stress": (2, 4, 0.0, 1, 5, 0),
            "spo2": (98, 97, 0.4, 96, 99, 0),
            "rr": (14, 15, 0.6, 12, 17, 0),
            "exercise_min": (125, 70, 4.0, 50, 140, 0),
        },
        "solar_event": {"day": 18, "msv": 5.2},
        "pvt": {"pvt_median_ms": (250, 345, 6, 230, 380, 0), "pvt_lapses": (0.3, 6.0, 0.5, 0, 9, 0)},  # slower over time
        "bp": {"bp_sys": (117, 126, 2.0, 108, 134, 0), "bp_dia": (75, 81, 1.5, 68, 88, 0)},  # drifts slightly upward
        "body_mass_start_kg": 81.2,
        "phases": [{"until": STREAM_S, "hr": 74, "rmssd": 30, "spo2": 97, "rr": 15}],
    },
    "C": {
        "name": "Jordan Lee",
        "description": "Acute event in the live recording (simulated): fast heart rate, low oxygen, then unresponsive with the pulse lost.",
        "daily": HEALTHY_DAILY,
        "solar_event": {"day": 7, "msv": 4.5},
        "pvt": HEALTHY_PVT,
        "bp": HEALTHY_BP,
        "body_mass_start_kg": 66.8,
        "event_start_s": 180,
        "unresponsive_s": 480,
        "irregular_from_s": 240,
        "phases": [
            {"until": 180, "hr": 64, "rmssd": 50, "spo2": 98, "rr": 14},
            {"until": 360, "hr": 130, "rmssd": 15, "spo2": 91, "rr": 24, "ease_out": True},
            {"until": 480, "hr": 145, "rmssd": 10, "spo2": 87, "rr": 28},
            {"until": 600, "hr": 36, "rmssd": 8, "spo2": 82, "rr": 5, "ramp_s": 40, "amp": 0.03},
        ],
    },
}
STREAM_NOISE = {"hr": 1.2, "rmssd": 2.0, "spo2": 0.35, "rr": 0.5}
FIELD_ORDER = ["day", "hr_rest", "hrv_rmssd", "spo2", "rr", "stand_hr_rise", "sleep_h", "mood", "stress",
               "symptoms", "hydration_l", "exercise_min", "radiation_msv", "pvt_median_ms", "pvt_lapses",
               "bp_sys", "bp_dia"]


def make_daily(cfg: dict, rng: np.random.Generator, pvt_rng: np.random.Generator,
               bp_rng: np.random.Generator) -> list[dict]:
    days = []
    for day in range(1, DAYS + 1):
        entry: dict = {"day": day, "symptoms": []}
        draws = ([(f, spec, rng) for f, spec in cfg["daily"].items()] + [(f, spec, pvt_rng) for f, spec in cfg["pvt"].items()]
                 + [(f, spec, bp_rng) for f, spec in cfg["bp"].items()])
        for field, (first, last, noise, lo, hi, decimals), gen in draws:
            value = first + (last - first) * (day - 1) / (DAYS - 1) + (gen.normal(0, noise) if noise else 0)
            value = round(min(hi, max(lo, value)), decimals)
            entry[field] = int(value) if decimals == 0 else value
        days.append({k: entry[k] for k in FIELD_ORDER})
    return days


def make_stream(cfg: dict, rng: np.random.Generator) -> list[dict]:
    phases = cfg["phases"]
    noise = {k: 0.0 for k in STREAM_NOISE}
    frames = []
    for s in range(STREAM_S):
        i = next(idx for idx, ph in enumerate(phases) if s < ph["until"])
        phase, prev = phases[i], phases[max(0, i - 1)]
        begin = prev["until"] if i else 0
        u = min(1.0, (s - begin) / phase.get("ramp_s", phase["until"] - begin))
        if phase.get("ease_out"):
            u = 1 - (1 - u) ** 2
        value = {}
        for key, sigma in STREAM_NOISE.items():
            noise[key] = 0.8 * noise[key] + rng.normal(0, sigma * 0.6)
            value[key] = prev[key] + (phase[key] - prev[key]) * u + noise[key]
        # Optional PPG waveform fields, worked out without the random generator (so no other value changes):
        # pulse wave height relative to normal (1.0), heartbeats found this second, steady light level.
        amp = prev.get("amp", 1.0) + (phase.get("amp", 1.0) - prev.get("amp", 1.0)) * u
        frames.append({
            "t": (T0 + timedelta(seconds=s)).isoformat().replace("+00:00", "Z"),
            "hr": int(round(value["hr"])),
            "hrv_rmssd": int(round(max(3, value["rmssd"]))),
            "spo2": int(round(min(100, value["spo2"]))),
            "rr": int(round(max(2, value["rr"]))),
            "signal_quality": round(float(np.clip(0.93 + rng.normal(0, 0.02), 0.85, 0.99)), 2),
            "irregular": s >= cfg.get("irregular_from_s", STREAM_S + 1),
            "source": "replay",
            "pulse_amplitude": round(amp, 3),
            "beats_detected": 0 if amp < 0.1 else int(round(value["hr"] / 60)),
            "ppg_baseline": 0.62,
        })
    return frames


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (pid, cfg) in enumerate(PHYSIOLOGY.items()):
        rng = np.random.default_rng(SEED + i)
        persona = {"id": pid, "name": cfg["name"], "description": cfg["description"], "simulated": True,
                   "mission_day": 45, "radiation_prior_msv": 9.0}
        # Old simulated solar spike: kept only as a fallback, used when data/space_weather/event.json is missing.
        persona["solar_spike_fallback"] = cfg["solar_event"]
        for key in ("event_start_s", "unresponsive_s"):
            if key in cfg:
                persona[key] = cfg[key]
        persona["body_mass_start_kg"] = cfg["body_mass_start_kg"]
        persona["daily"] = make_daily(cfg, rng, np.random.default_rng(SEED + 100 + i),
                                      np.random.default_rng(SEED + 200 + i))
        persona["stream"] = make_stream(cfg, rng)
        (OUT / f"{pid}.json").write_text(json.dumps(persona, indent=1), encoding="utf-8")
        print(f"wrote {OUT / (pid + '.json')}")


if __name__ == "__main__":
    main()
