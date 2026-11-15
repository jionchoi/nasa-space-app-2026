"""Run Jian's validate_bidmc() on every BIDMC record and add the share of windows within +-5 bpm.

Usage: python -I run_bidmc_validation.py <bidmc dir> <out.json>
The per-window errors are recomputed with exactly the same matching rule as validate_bidmc (causal pulse-rate output at
the batch end, compared with the monitor HR at that integer second); the MAE must match validate_bidmc's own MAE.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
from crewsense_signals.ppg.pipeline import Pipeline
from crewsense_signals.ppg.sources import bidmc_batches
from crewsense_signals.ppg.validation import validate_bidmc

root, out = Path(sys.argv[1]), Path(sys.argv[2])


def refs(numerics: Path) -> dict:
    table = {}
    with numerics.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        headers = {name.strip(): name for name in reader.fieldnames or []}
        for row in reader:
            try:
                t, value = float(row[headers["Time [s]"]]), float(row[headers["HR"]])
            except (ValueError, TypeError):
                continue
            if np.isfinite(value) and value > 0:
                table[round(t, 6)] = value
    return table


rows, all_errors = [], []
for signals in sorted(root.glob("bidmc_*_Signals.csv")):
    numerics = signals.with_name(signals.name.replace("_Signals", "_Numerics"))
    official = validate_bidmc(signals, numerics, role="review")
    ref = refs(numerics)
    errors, pipeline = [], Pipeline()
    for batch in bidmc_batches(signals):
        metric = pipeline.process(batch).metrics["pulse_rate_bpm"]
        if metric.status == "valid":
            t = float(np.floor(batch.end_s + 1e-6))
            if t in ref:
                errors.append(metric.value - ref[t])
    e = np.abs(np.asarray(errors))
    mae = round(float(e.mean()), 4) if len(e) else None
    assert mae == official["mae_bpm"], (signals.name, mae, official["mae_bpm"])  # same rule as Jian's function
    all_errors.extend(errors)
    rows.append({"record": signals.stem.replace("_Signals", ""), "mae_bpm": official["mae_bpm"],
                 "bias_bpm": official["bias_bpm"], "p95_abs_bpm": official["error_p95_abs_bpm"],
                 "within_5_bpm_pct": round(float((e <= 5).mean() * 100), 1) if len(e) else None,
                 "scored": official["scored_count"], "batches": official["batches"],
                 "valid_output_pct": round(official["valid_output_fraction"] * 100, 1),
                 "no_value": official["status_counts_without_value"]})
    print(rows[-1]["record"], rows[-1]["mae_bpm"], rows[-1]["within_5_bpm_pct"], rows[-1]["valid_output_pct"], flush=True)

e = np.abs(np.asarray(all_errors))
maes = [r["mae_bpm"] for r in rows if r["mae_bpm"] is not None]
overall = {"records": len(rows), "scored_windows": int(len(e)),
           "pooled_mae_bpm": round(float(e.mean()), 3), "median_record_mae_bpm": round(float(np.median(maes)), 3),
           "within_5_bpm_pct": round(float((e <= 5).mean() * 100), 1),
           "valid_output_pct": round(sum(r["scored"] for r in rows) / sum(r["batches"] for r in rows) * 100, 1),
           "records_mae_over_5": [r["record"] for r in rows if r["mae_bpm"] is not None and r["mae_bpm"] > 5]}
out.write_text(json.dumps({"overall": overall, "records": rows}, indent=1))
print(json.dumps(overall))
