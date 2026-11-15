import csv
import hashlib
import json
from pathlib import Path

import numpy as np

from .schemas import RawBatch


def synthetic_batches(duration_s=90, sample_rate_hz=125, bpm=72, scenario="clean", seed=42):
    """Test waveform only; not a physiological or optical sensor simulator."""
    if duration_s <= 0 or not 25 <= sample_rate_hz <= 1000 or not 30 <= bpm <= 240:
        raise ValueError("invalid synthetic duration, rate, or bpm")
    if scenario not in {"clean", "dropout", "noise", "irregular"}:
        raise ValueError("unsupported scenario")
    rng = np.random.default_rng(seed)
    fs = sample_rate_hz
    t = np.arange(int(duration_s * fs)) / fs
    phase = 2 * np.pi * bpm / 60 * t
    if scenario == "irregular":
        phase += 0.65 * np.sin(2 * np.pi * 0.13 * t)
    x = 1 + 0.12 * (np.sin(phase) + 0.22 * np.sin(2 * phase - 0.7))
    x += rng.normal(0, 0.0007, len(t))
    bad = (t >= 25) & (t < 30)
    if scenario == "dropout":
        x[bad] = 1
    elif scenario == "noise":
        x[bad] += rng.normal(0, 0.2, int(bad.sum()))
    for sequence, start in enumerate(range(0, len(x), fs)):
        values = x[start:start + fs]
        if len(values) < 8:
            break
        yield RawBatch(subject_id="synthetic-crew", session_id=f"demo-{scenario}",
                       source="synthetic", simulated=True, sequence=sequence,
                       t0_s=start / fs, sample_rate_hz=fs, channels={"ppg": values.tolist()})


def bidmc_batches(path: Path, subject_id=None, session_id=None):
    """Read original BIDMC CSV using its documented 125 Hz sampling grid.

    CSV timestamps are rounded to ~5 significant digits (duplicated past 100s).
    Verify every printed timestamp against the sample-index grid, rather than
    inferring a fictitious 100 Hz rate or dropping duplicate timestamps.
    """
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV has no header")
        headers = {name.strip(): name for name in reader.fieldnames}
        if not {"Time [s]", "PLETH"} <= headers.keys():
            raise ValueError("expected original BIDMC columns: Time [s], PLETH")
        rows = [(float(row[headers["Time [s]"]]), float(row[headers["PLETH"]])) for row in reader]
    if len(rows) < 25:
        raise ValueError("not enough CSV samples")
    t, x = np.asarray(rows).T
    if not np.isfinite(t).all() or not np.isfinite(x).all():
        raise ValueError("non-finite CSV samples")
    fs = 125
    grid = t[0] + np.arange(len(t)) / fs
    if np.any(np.diff(t) < 0) or np.max(np.abs(t - grid)) > 0.0051:
        raise ValueError("BIDMC timestamps do not match the documented 125 Hz grid; possible missing rows")
    for sequence, offset in enumerate(range(0, len(t), fs)):
        stop = min(offset + fs, len(t))
        if stop - offset < 8:
            continue
        yield RawBatch(subject_id=subject_id or path.stem.split("_Signals")[0],
                       session_id=session_id or path.stem, source="public_replay", simulated=False,
                       sequence=sequence, t0_s=float(grid[offset]), sample_rate_hz=fs,
                       channels={"ppg": x[offset:stop].tolist()})


def jsonl_batches(path: Path):
    """Read the RawBatch contract; suitable for future recorded sensor output."""
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if line.strip():
                try:
                    batch = RawBatch.model_validate_json(line)
                    # A saved live session is a recording when read from disk.
                    if batch.source == "live":
                        batch = batch.model_copy(update={"source": "recorded_live"})
                    yield batch
                except ValueError as exc:
                    raise ValueError(f"invalid RawBatch at line {line_no}: {exc}") from exc


def write_manifest(path: Path, source_url: str, record: str):
    return {
        "dataset": "BIDMC PPG and Respiration", "version": "1.0.0", "record": record,
        "source_url": source_url, "dataset_url": "https://physionet.org/content/bidmc/1.0.0/",
        "license": "Open Data Commons Attribution License v1.0",
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
        "source": "public_replay", "simulated": False,
        "limitations": ["ICU population, not astronaut validation", "single PLETH is not raw red/IR",
                        "finger site / optical hardware equivalence not established"],
        "citation": "Pimentel et al., IEEE TBME 64(8), 1914-1923; doi:10.1109/TBME.2016.2613124",
    }


def download_bidmc(record: str, directory: Path):
    import urllib.request
    import os
    import tempfile

    if not record.isdigit() or not 1 <= int(record) <= 53:
        raise ValueError("record must be 01..53")
    record = f"{int(record):02d}"
    directory.mkdir(parents=True, exist_ok=True)
    manifest_files = []
    for suffix in ["Signals.csv", "Numerics.csv"]:
        name = f"bidmc_{record}_{suffix}"
        url = f"https://physionet.org/files/bidmc/1.0.0/bidmc_csv/{name}"
        target = directory / name
        if not target.exists():
            temp_name = None
            try:
                with urllib.request.urlopen(url, timeout=30) as response, tempfile.NamedTemporaryFile(
                    dir=directory, delete=False
                ) as output:
                    temp_name = output.name
                    while chunk := response.read(65536):
                        output.write(chunk)
                os.replace(temp_name, target)
            finally:
                if temp_name and Path(temp_name).exists():
                    Path(temp_name).unlink()
        # Validate at least the format; HTML errors must not become PPG files.
        with target.open() as handle:
            header = handle.readline()
        if "Time [s]" not in header or (suffix == "Signals.csv" and "PLETH" not in header):
            raise ValueError(f"unexpected BIDMC file: {target}")
        manifest = write_manifest(target, url, record)
        manifest_path = target.with_suffix(target.suffix + ".manifest.json")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        manifest_files.append(str(manifest_path))
    return manifest_files
