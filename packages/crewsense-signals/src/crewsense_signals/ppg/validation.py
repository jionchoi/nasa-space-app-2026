"""Evaluate the causal pulse-rate output against BIDMC monitor HR at 1 Hz.

Not an ECG beat-level HRV evaluation or an independent clinical validation.
Use development/evaluation record lists explicitly, without window shuffling.
"""
import csv
import hashlib
from pathlib import Path

import numpy as np

from .pipeline import Pipeline
from .sources import bidmc_batches


def validate_bidmc(signals: Path, numerics: Path, role="development"):
    if signals.stem.replace("_Signals", "") != numerics.stem.replace("_Numerics", ""):
        raise ValueError("Signals and Numerics must belong to the same BIDMC record")
    refs = {}
    with numerics.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        headers = {name.strip(): name for name in reader.fieldnames or []}
        if not {"Time [s]", "HR"} <= headers.keys():
            raise ValueError("expected BIDMC numerics: Time [s], HR")
        for row in reader:
            try:
                t, value = float(row[headers["Time [s]"]]), float(row[headers["HR"]])
            except (ValueError, TypeError):
                continue
            if np.isfinite(value) and value > 0:
                refs[round(t, 6)] = value
    errors, output_count, all_count, scored_count = [], 0, 0, 0
    failures = {}
    pipeline = Pipeline()
    for batch in bidmc_batches(signals):
        result = pipeline.process(batch)
        metric = result.metrics["pulse_rate_bpm"]
        all_count += 1
        if metric.status != "valid":
            failures[metric.status] = failures.get(metric.status, 0) + 1
            continue
        output_count += 1
        # Causal endpoint comparison. Reference monitor averaging/latency is
        # unknown, so this is a monitor-numeric comparison, not beat truth.
        t = float(np.floor(batch.end_s + 1e-6))
        if t in refs:
            errors.append(metric.value - refs[t])
            scored_count += 1
    e = np.asarray(errors)
    return {
        "record": signals.stem, "role": role, "algorithm": "causal_butterworth_peak_intervals_v1",
        "reference": "BIDMC HR monitor numeric, integer endpoint second, no optimized shift",
        "hr_window_s": pipeline.hr_window_s, "filter_settle_s": pipeline.settle_s,
        "batches": all_count, "valid_output_count": output_count, "scored_count": scored_count,
        "valid_output_fraction": round(output_count / all_count, 5) if all_count else 0,
        "mae_bpm": round(float(np.mean(np.abs(e))), 4) if len(e) else None,
        "rmse_bpm": round(float(np.sqrt(np.mean(e**2))), 4) if len(e) else None,
        "bias_bpm": round(float(np.mean(e)), 4) if len(e) else None,
        "error_p95_abs_bpm": round(float(np.percentile(np.abs(e), 95)), 4) if len(e) else None,
        "error_limits_95_bpm": [round(float(e.mean() - 1.96 * e.std()), 4),
                                round(float(e.mean() + 1.96 * e.std()), 4)] if len(e) else None,
        "status_counts_without_value": failures,
        "signals_sha256": hashlib.sha256(signals.read_bytes()).hexdigest(),
        "numerics_sha256": hashlib.sha256(numerics.read_bytes()).hexdigest(),
        "limitations": ["No astronaut or clinical validation", "Monitor timing/averaging unknown",
                        "Overlapping windows are not independent observations",
                        "Quality checks are heuristic; false acceptance not quantified",
                        "PRV, rhythm and SpO2 accuracy not evaluated by this command"],
    }
