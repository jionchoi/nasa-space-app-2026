"""Download bounded, reproducible slices from the official public VitalDB API."""
from __future__ import annotations

import argparse
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
from scipy.signal import find_peaks, resample_poly

from .preprocessing import preprocess

API = "https://api.vitaldb.net"
TRACKS = ("SNUADC/ECG_II", "SNUADC/PLETH", "SNUADC/ART")
ROOT = Path(__file__).resolve().parents[3]
PROTOCOL = json.loads((Path(__file__).with_name("protocol.json")).read_text())


def fetch(url: str, path: Path) -> dict:
    if path.exists():
        return json.loads(gzip.decompress(path.read_bytes()))
    for attempt in range(3):
        try:
            req = Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": "CrewSense-CPU-BP-research/0.1"})
            with urlopen(req, timeout=90) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
            parsed = json.loads(body)
            if parsed.get("resourceType") == "OperationOutcome":
                raise ValueError(f"API OperationOutcome: {parsed}")
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(gzip.compress(body, mtime=0))
            temporary.replace(path)
            return parsed
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)
    raise AssertionError("unreachable")


def seconds(value: str) -> float:
    origin = datetime(2100, 1, 1, tzinfo=timezone.utc)
    return (datetime.fromisoformat(value.replace("Z", "+00:00")) - origin).total_seconds()


def iso(value: float) -> str:
    return (datetime(2100, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=value)).isoformat().replace("+00:00", "Z")


def decode_sampled(resource: dict) -> tuple[float, float, np.ndarray]:
    sample = resource["valueSampledData"]
    if sample["dimensions"] != 1:
        raise ValueError("Only single-dimensional waveforms are supported")
    tokens = sample["data"].split()
    values = np.fromiter((float(t) if t not in {"E", "U", "L"} else np.nan for t in tokens), dtype=np.float64)
    values = values * sample.get("factor", 1) + sample["origin"]["value"]
    return seconds(resource["effectivePeriod"]["start"]), sample["period"] / 1000, values


def decode_bundle(bundle: dict, start: int, duration: int, expected_subject: str,
                  expected_channel: str | None = None, expected_unit: str | None = None) -> np.ndarray:
    # Preserve missing samples and absolute recording times; never concatenate gaps.
    output = np.full(duration * 500, np.nan, dtype=np.float64)
    for entry in bundle.get("entry", []):
        r = entry["resource"]
        if r["subject"]["reference"] != expected_subject:
            raise ValueError("Patient changed inside a track")
        if expected_channel is not None and r["code"].get("text") != expected_channel:
            raise ValueError("Unexpected channel in waveform response")
        if expected_unit is not None and r["valueSampledData"]["origin"].get("unit") != expected_unit:
            raise ValueError("Unexpected reference pressure unit")
        t0, dt, values = decode_sampled(r)
        if abs(dt - 1 / 500) > 1e-9:
            raise ValueError(f"Expected source 500Hz, received dt={dt}")
        offset = round((t0 - start) * 500)
        left, right = max(0, offset), min(len(output), offset + len(values))
        if right > left:
            target = output[left:right]
            incoming = values[left - offset:right - offset]
            overlap = np.isfinite(target) & np.isfinite(incoming)
            if overlap.any() and not np.allclose(target[overlap], incoming[overlap]):
                raise ValueError("Inconsistent overlapping waveform chunks")
            output[left:right] = incoming
    if any(link.get("relation") == "next" for link in bundle.get("link", [])):
        raise ValueError("Unexpected pagination: refusing to silently truncate data")
    return output


def bp_label(art: np.ndarray) -> tuple[np.ndarray | None, str | None]:
    if not np.isfinite(art).all():
        return None, "missing_art"
    peaks, _ = find_peaks(art, distance=round(0.3 * 500), prominence=10)
    if not 4 <= len(peaks) <= 26:
        return None, "art_peak_count"
    intervals = np.diff(peaks) / 500
    if np.any((intervals < 0.3) | (intervals > 1.8)):
        return None, "art_beat_interval"
    systolic = art[peaks]
    diastolic = np.array([np.min(art[a:b]) for a, b in zip(peaks[:-1], peaks[1:])])
    sbp, dbp = float(np.median(systolic)), float(np.median(diastolic))
    if not (20 <= dbp <= 150 and 40 <= sbp <= 240 and 15 <= sbp - dbp <= 140):
        return None, "art_broad_physical_bounds"
    if np.std(systolic) > 25 or np.std(diastolic) > 20:
        return None, "art_unstable_reference"
    return np.array([sbp, dbp], dtype=np.float32), None


def prepare_case(caseid: int, cache: Path) -> dict:
    folder = cache / f"case_{caseid:04d}"
    meta_url = API + "/fhir/Observation?" + urlencode({"encounter": caseid, "category": "vital-signs", "_summary": "true", "_count": 200})
    metadata = fetch(meta_url, folder / "vital_tracks_0.json.gz")
    entries = list(metadata.get("entry", []))
    page, seen_urls = metadata, {meta_url}
    while next_url := next((link["url"] for link in page.get("link", []) if link.get("relation") == "next"), None):
        if not next_url.startswith(API + "/fhir/") or next_url in seen_urls:
            raise ValueError("Invalid metadata pagination")
        seen_urls.add(next_url)
        page = fetch(next_url, folder / f"vital_tracks_{len(seen_urls)-1}.json.gz")
        entries.extend(page.get("entry", []))
    if len(entries) < metadata.get("total", len(entries)):
        raise ValueError("Truncated track metadata")
    metadata["entry"] = entries
    tracks = {e["resource"]["code"].get("text"): e["resource"] for e in metadata.get("entry", [])}
    if not all(t in tracks for t in TRACKS):
        return {"caseid": caseid, "excluded": "missing_required_track"}
    subjects = {tracks[t]["subject"]["reference"] for t in TRACKS}
    if len(subjects) != 1:
        raise ValueError("Channels belong to different patients")
    subject = subjects.pop()
    common_start = max(seconds(tracks[t]["effectivePeriod"]["start"]) for t in TRACKS)
    common_end = min(seconds(tracks[t]["effectivePeriod"]["end"]) for t in TRACKS)
    # A fixed middle slice of the common coverage, chosen without BP labels.
    duration = min(PROTOCOL["minutes_per_case"] * 60, int(common_end - common_start))
    duration = duration // 60 * 60
    start = int((common_start + common_end - duration) / 120) * 60
    start = max(int(np.ceil(common_start / 60)) * 60, start)
    if duration < 300:
        return {"caseid": caseid, "excluded": "short_common_coverage"}
    urls, arrays = [], []
    for name, channel in zip(("ecg", "ppg", "art"), TRACKS):
        query = [("encounter", caseid), ("code", channel), ("date", "ge" + iso(start)),
                 ("date", "lt" + iso(start + duration)), ("_count", 200)]
        url = API + "/fhir/Observation?" + urlencode(query)
        bundle = fetch(url, folder / f"{name}.json.gz")
        urls.append(url)
        arrays.append(decode_bundle(bundle, start, duration, subject, channel, "mmHg" if name == "art" else None))
    x, y, times, rejected = [], [], [], {}
    n = PROTOCOL["samples_per_window"] * 4
    for offset in range(0, duration * 500 - n + 1, n):
        ecg, ppg, art = (a[offset:offset + n] for a in arrays)
        if not np.isfinite(ecg).all() or not np.isfinite(ppg).all():
            reason = "missing_input"
        else:
            raw = resample_poly(np.stack([ecg, ppg]), 1, 4, axis=1).astype(np.float32)
            try:
                preprocess(raw)
                label, reason = bp_label(art)
            except ValueError:
                reason = "input_quality"
            if reason is None:
                x.append(raw)
                y.append(label)
                times.append(start + offset / 500)
                continue
        rejected[reason] = rejected.get(reason, 0) + 1
    count_before_cap = len(x)
    if len(x) < PROTOCOL["minimum_windows_per_subject"]:
        return {"caseid": caseid, "subject": subject, "excluded": "too_few_valid_windows", "valid_windows": len(x), "rejected": rejected}
    choose = np.linspace(0, len(x) - 1, min(len(x), PROTOCOL["maximum_windows_per_subject"]), dtype=int)
    out = folder / "windows.npz"
    np.savez_compressed(out, x=np.array(x)[choose], y=np.array(y)[choose], start_s=np.array(times)[choose])
    manifest = {"caseid": caseid, "subject": subject, "start_s": start, "duration_s": duration,
                "window_count": len(choose), "valid_windows_before_cap": count_before_cap,
                "rejected": rejected, "urls": urls, "windows_path": str(out.relative_to(ROOT)),
                "sha256": hashlib.sha256(out.read_bytes()).hexdigest()}
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subjects", type=int, default=PROTOCOL["subjects_target"])
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--max-candidates", type=int, default=400)
    args = parser.parse_args()
    cache = ROOT / "data/raw/vitaldb_bp"
    cache.mkdir(parents=True, exist_ok=True)
    candidates = np.random.default_rng(PROTOCOL["seed"]).permutation(np.arange(1, 6389))[:args.max_candidates]
    selected, excluded, seen = [], [], set()
    def safe(caseid):
        try:
            return prepare_case(caseid, cache)
        except Exception as exc:
            return {"caseid": caseid, "excluded": "download_or_decode_error", "error": str(exc)}
    executor = ThreadPoolExecutor(max_workers=args.workers)
    pending = deque()
    remaining = iter(int(v) for v in candidates)
    try:
        for _ in range(args.workers * 4):
            caseid = next(remaining, None)
            if caseid is not None:
                pending.append(executor.submit(safe, caseid))
        while pending:
            # Consume in fixed candidate order, independently of network completion.
            result = pending.popleft().result()
            if result.get("excluded"):
                excluded.append(result)
                print(f"case {result['caseid']}: excluded {result['excluded']}", flush=True)
            elif result["subject"] in seen:
                excluded.append({"caseid": result["caseid"], "excluded": "repeat_patient"})
            else:
                selected.append(result)
                seen.add(result["subject"])
                print(f"selected {len(selected)}/{args.subjects}: case {result['caseid']}, {result['subject']}, windows={result['window_count']}", flush=True)
            summary = {"source": API, "protocol": PROTOCOL, "selected": selected, "excluded": excluded,
                       "license_note": "Dataset page states CC BY-NC-SA 4.0 and data use terms; newer API spec states CC BY 4.0. Retain both notices; local research only, no raw redistribution or assertion of unrestricted commercial use.",
                       "source_docs": ["https://vitaldb.net/dataset/", API + "/openapi.json", "https://doi.org/10.1038/s41597-022-01411-5"]}
            (cache / "manifest.json").write_text(json.dumps(summary, indent=2) + "\n")
            if len(selected) >= args.subjects:
                break
            caseid = next(remaining, None)
            if caseid is not None:
                pending.append(executor.submit(safe, caseid))
    finally:
        for future in pending:
            future.cancel()
        executor.shutdown(wait=True, cancel_futures=True)
    if len(selected) < args.subjects:
        raise SystemExit(f"Only {len(selected)} usable unique patients; requested {args.subjects}")


if __name__ == "__main__":
    main()
