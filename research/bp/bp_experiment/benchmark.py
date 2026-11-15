"""Measure batch-one CPU latency and isolated inference-process RSS."""
from __future__ import annotations

import argparse
import json
import os
import platform
import resource
import time

# Pin BLAS before importing numerical libraries in this isolated process.
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
import numpy as np
import psutil
from .cpu import CPUModel


def benchmark(model_path, sample_path, repeats=300):
    process = psutil.Process()
    imported_rss = process.memory_info().rss
    model = CPUModel(model_path)
    raw = np.load(sample_path, allow_pickle=False)["x"]
    for _ in range(30):
        model.predict(raw)
    warm_rss = process.memory_info().rss
    latency = []
    for _ in range(repeats):
        t0 = time.perf_counter_ns()
        model.predict(raw)
        latency.append((time.perf_counter_ns() - t0) / 1e6)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if platform.system() != "Darwin":
        peak *= 1024
    return {"device": "cpu", "backend": "NumPy/SciPy, no PyTorch import", "requested_blas_threads": 1, "batch_size": 1, "warmup_calls": 30, "measured_calls": repeats,
            "includes": "input quality checks, window filtering/normalization, CNN forward, target inverse scaling; excludes disk IO, imports, acquisition and resampling from 500Hz",
            "latency_ms": {"median": float(np.median(latency)), "p95": float(np.percentile(latency, 95)), "max": float(np.max(latency))},
            "rss_after_imports_bytes": imported_rss, "rss_after_warmup_bytes": warm_rss,
            "peak_process_rss_bytes": peak, "incremental_warm_rss_bytes": max(0, warm_rss - imported_rss),
            "platform": platform.platform(), "processor": platform.processor(), "python": platform.python_version(), "numpy": str(np.__version__),
            "torch_imported": "torch" in __import__("sys").modules,
            "flight_hardware_tested": False, "power_measured": False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", required=True)
    p.add_argument("--sample", required=True)
    args = p.parse_args()
    print(json.dumps(benchmark(args.model, args.sample), indent=2))


if __name__ == "__main__":
    main()
