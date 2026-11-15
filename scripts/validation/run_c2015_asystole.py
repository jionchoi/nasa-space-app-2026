"""What does the unchanged PPG pipeline output around Challenge 2015 asystole alarms?

There is no pulse_lost / asystole detector in the pipeline, so this does NOT compute a detector's sensitivity.
It records the pipeline's pulse_rate_bpm status per 1 s batch in the 16 s before the alarm (alarm onset = 300 s)
and at the alarm second, for true and false asystole alarms that have a PLETH channel.
Usage: python -I run_c2015_asystole.py <c2015 dir> <out.json>
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.io import loadmat
from crewsense_signals.ppg.pipeline import Pipeline
from crewsense_signals.ppg.schemas import RawBatch

root, out = Path(sys.argv[1]), Path(sys.argv[2])
labels = {}
for line in (root / "ALARMS").read_text().splitlines():
    rec, kind, truth = line.split(",")
    if kind.lower() == "asystole":
        labels[rec] = truth.strip() == "1"

ALARM_S = 300
results = []
for rec, true_alarm in sorted(labels.items()):
    header = (root / f"{rec}.hea").read_text().splitlines()
    fs = float(header[0].split()[2])
    names = [h.split()[-1] for h in header[1:] if h and not h.startswith("#")]
    if "PLETH" not in names:
        results.append({"record": rec, "true_alarm": true_alarm, "pleth": False})
        continue
    x = loadmat(root / f"{rec}.mat")["val"][names.index("PLETH")].astype(float)
    step = int(fs)
    pipeline, seq, statuses = Pipeline(), 0, {}
    invalid_samples = 0
    for start in range(0, min(len(x), int((ALARM_S + 1) * fs)), step):
        chunk = x[start:start + step]
        second = start // step
        if len(chunk) < 8:
            break
        if np.any(chunk == -32768) or not np.all(np.isfinite(chunk)):  # WFDB "invalid sample" marker
            invalid_samples += 1
            statuses[second] = "invalid_samples_skipped"
            continue
        batch = RawBatch(subject_id=rec, session_id=rec, source="public_replay", simulated=False, sequence=seq,
                         t0_s=start / fs, sample_rate_hz=fs, channels={"ppg": chunk.tolist()})
        seq += 1
        snap = pipeline.process(batch)
        m = snap.metrics["pulse_rate_bpm"]
        statuses[second] = m.status if m.status != "poor_quality" else f"poor_quality:{m.reason}"
    before = [statuses.get(s, "missing") for s in range(ALARM_S - 16, ALARM_S)]
    at = statuses.get(ALARM_S - 1, "missing")
    results.append({"record": rec, "true_alarm": true_alarm, "pleth": True, "status_at_alarm": at,
                    "last16s": dict(Counter(before)), "invalid_sample_seconds": invalid_samples})


def bucket(status: str) -> str:
    if status.startswith("poor_quality") and "flatline" in status:
        return "poor signal: flatline/contact loss"
    if status.startswith("poor_quality"):
        return "poor signal: other (noise/clipping)"
    return {"valid": "pulse rate shown", "insufficient_beats": "too few beats (no number)",
            "gap": "gap", "warming_up": "warming up"}.get(status, status)


summary = {}
for truth in (True, False):
    group = [r for r in results if r["true_alarm"] == truth]
    with_pleth = [r for r in group if r["pleth"]]
    summary["true_asystole" if truth else "false_alarm"] = {
        "alarms": len(group), "with_pleth": len(with_pleth),
        "status_at_alarm": dict(Counter(bucket(r["status_at_alarm"]) for r in with_pleth)),
    }
out.write_text(json.dumps({"summary": summary, "records": results}, indent=1))
print(json.dumps(summary, indent=1))
