"""Convert real NASA OSDR exports (data/raw/nasa/) into the app's JSON files. Offline, stdlib only. Re-runnable.

Run from backend/:  python scripts/import_nasa_env.py [--raw ../data/raw/nasa] [--days 30]

RadLab dose-rate CSVs (https://visualization.osdr.nasa.gov/radlab/) -> backend/data/space_weather/dose_<location>.json
    Each CSV is routed by its CONTENT (instrument_id / instrument / spacecraft), never by its file name, so a file can
    never end up under another location's label. Example: data/raw/nasa/radlab_moon.csv holds Curiosity MSL-RAD rows
    (Mars surface), so it becomes dose_mars_surface.json, not dose_moon.json.
        DosTel1 (ISS Columbus)          -> dose_iss.json
        MSL-RAD-Surface (Curiosity)     -> dose_mars_surface.json
        CRaTER (LRO, lunar orbit)       -> dose_moon.json          (only if such a file is added)
        BioSentinel (deep space)        -> dose_mars_transit.json  (only if such a file is added)
    Unit: the CSV header does not state one. RadLab API docs use "2 uGy/hour" for absorbed_dose_rate>2, so uGy/h.
    If a header ever states a different unit, the script stops instead of guessing.

EDA cabin telemetry CSV (https://visualization.osdr.nasa.gov/eda) -> backend/data/cabin.json
    Only the *_ISS columns (the *_Ground columns are the ground control unit). Units come from the header.

The app falls back to the simulated feeds when a file is missing (see app/radiation_feed.py and app/cabin.py).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW_DEFAULT = ROOT.parent / "data" / "raw" / "nasa"

RADLAB_PORTAL = "https://visualization.osdr.nasa.gov/radlab/"
RADLAB_API = "https://visualization.osdr.nasa.gov/radlab/api/"
UNIT = "µGy/h"
UNIT_SOURCE = ("Not stated in the CSV header. RadLab API docs use '2 uGy/hour' for the filter absorbed_dose_rate>2 "
               f"({RADLAB_API}), so absorbed_dose_rate is in µGy/h.")
MAX_GAP_S = 2 * 3600  # gaps up to this long are filled by straight-line interpolation; longer gaps break a day

# Where each instrument goes. `match` is searched (lowercase) in "instrument_id instrument spacecraft".
LOCATIONS = [
    {"id": "iss", "match": ["dostel"], "out": "dose_iss.json",
     "badge": "NASA OSDR RadLab: ISS module (DOSTEL1)", "place": "ISS, Columbus module (low Earth orbit)",
     "source_url": "https://visualization.osdr.nasa.gov/radlab/api/?spacecraft=&module=&instrument=&timestamp=&format=csv"
                   "&timestamp%3E=2024-02-27T04:35&timestamp%3C=2024-11-02T00:01&instrument_id=DosTel1&absorbed_dose_rate=&",
     "note": "Spikes are passes through the South Atlantic Anomaly, where Earth's radiation belt dips close to the ISS orbit."},
    {"id": "mars_surface", "match": ["msl-rad", "curiosity"], "out": "dose_mars_surface.json",
     "badge": "NASA OSDR RadLab: Mars surface (Curiosity RAD)", "place": "Gale crater, Mars surface",
     "source_url": "https://visualization.osdr.nasa.gov/radlab/api/?spacecraft=&module=&instrument=&timestamp=&format=csv"
                   "&timestamp%3E=2017-01-27T02:49&timestamp%3C=2021-07-24T13:01&instrument_id=MSL-RAD-Surface&absorbed_dose_rate=&",
     "note": "The thin Martian air and the planet itself block part of the radiation, so the surface gets less than deep space."},
    {"id": "moon", "match": ["crater", "lro"], "out": "dose_moon.json",
     "badge": "NASA OSDR RadLab: lunar orbit (LRO CRaTER) - surface dose is lower, about half", "place": "Lunar orbit",
     "source_url": RADLAB_PORTAL,
     "note": "Measured in orbit around the Moon. On the surface the Moon blocks half the sky, so the dose is lower, about half."},
    {"id": "mars_transit", "match": ["biosentinel"], "out": "dose_mars_transit.json",
     "badge": "NASA OSDR RadLab: deep space (BioSentinel)", "place": "Deep space, orbit around the Sun",
     "source_url": RADLAB_PORTAL,
     "note": "Measured in deep space, outside Earth's magnetic field, like a ship on the way to Mars."},
]

CABIN_FIELDS = {  # output field -> (CSV column, unit the header must state)
    "co2_ppm": ("CO2_ppm_ISS", "ppm"),
    "temp_c": ("Temp_degC_ISS", "degC"),
    "rh_pct": ("RH_percent_ISS", "percent"),
}
CABIN_STEP_MIN = 15


class Stop(Exception):
    """A problem a person must look at (unclear unit, unknown instrument). Nothing is written for that file."""


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def num(text: str | None) -> float | None:
    try:
        v = float(text)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


# ---------- shared: resample to a fixed grid, fill short gaps, pick whole days ----------

def resample(samples: list[tuple[datetime, float]], step_s: int) -> dict[int, float]:
    """Mean per bin (bin = epoch seconds // step_s). Bins without a sample are absent."""
    sums: dict[int, list[float]] = {}
    for t, v in samples:
        sums.setdefault(int(t.timestamp()) // step_s, []).append(v)
    return {b: sum(vs) / len(vs) for b, vs in sums.items()}


def fill_gaps(bins: dict[int, float], step_s: int) -> tuple[dict[int, float], int]:
    """Interpolate missing bins between two real ones when the gap is at most MAX_GAP_S. Returns (bins, filled)."""
    keys = sorted(bins)
    out, filled = dict(bins), 0
    for a, b in zip(keys, keys[1:]):
        if 1 < b - a and (b - a) * step_s <= MAX_GAP_S:
            for k in range(a + 1, b):
                u = (k - a) / (b - a)
                out[k] = bins[a] + u * (bins[b] - bins[a])
                filled += 1
    return out, filled


def complete_days(bins: dict[int, float], step_s: int) -> list[datetime]:
    """UTC days where every bin has a value (after filling short gaps), oldest first."""
    per_day = 86400 // step_s
    counts: dict[int, int] = {}
    for b in bins:
        counts[b // per_day] = counts.get(b // per_day, 0) + 1
    return [datetime.fromtimestamp(d * 86400, timezone.utc) for d in sorted(counts) if counts[d] == per_day]


def latest_run(days: list[datetime], limit: int) -> list[datetime]:
    """The most recent run of consecutive days, at most `limit` long."""
    if not days:
        return []
    run = [days[-1]]
    for d in reversed(days[:-1]):
        if len(run) >= limit or run[0] - d != timedelta(days=1):
            break
        run.insert(0, d)
    return run


# ---------- RadLab ----------

def check_unit(header: list[str]) -> None:
    """Stop if the header states a dose-rate unit other than uGy/h."""
    for col in header:
        low = col.lower()
        if "dose" in low or "unit" in low:
            found = re.search(r"(n|u|µ|m)?gy[_/ ]?(per[_ ]?)?(h|hr|hour|min|s|d|day)\b", low)
            if found and not re.fullmatch(r"(u|µ)gy[_/ ]?(per[_ ]?)?(h|hr|hour)", found.group(0)):
                raise Stop(f"Header column {col!r} states a unit other than µGy/h. Check before converting.")


def import_radlab(path: Path, days: int) -> dict | None:
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        check_unit(header)
        if "absorbed_dose_rate" not in header or "timestamp" not in header:
            raise Stop(f"{path.name}: not a RadLab export (columns: {header}).")
        rows = list(reader)
    if not rows:
        raise Stop(f"{path.name}: no rows.")
    if any("unit" in k.lower() for k in header):  # a unit column, if a future export adds one
        units = {r[k] for r in rows for k in header if "unit" in k.lower()}
        if not units <= {"uGy/h", "µGy/h", "uGy/hr", "uGy/hour"}:
            raise Stop(f"{path.name}: unit column says {sorted(units)}. Check before converting.")

    ids = {(r.get("instrument_id", ""), r.get("instrument", ""), r.get("spacecraft", ""), r.get("module", "")) for r in rows}
    if len(ids) != 1:
        raise Stop(f"{path.name}: more than one instrument in one file: {sorted(ids)}. Export one instrument per file.")
    instrument_id, instrument, spacecraft, module = ids.pop()
    key = f"{instrument_id} {instrument} {spacecraft}".lower()
    loc = next((loc for loc in LOCATIONS if any(m in key for m in loc["match"])), None)
    if loc is None:
        raise Stop(f"{path.name}: instrument {instrument_id!r} on {spacecraft!r} is not mapped to a location in LOCATIONS.")

    samples = []
    for r in rows:
        v = num(r["absorbed_dose_rate"])
        if v is None or v < 0:
            continue
        t = datetime.fromisoformat(r["timestamp"].replace("Z", "")).replace(tzinfo=timezone.utc)
        samples.append((t, v))
    samples.sort()
    gaps = [(b[0] - a[0]).total_seconds() for a, b in zip(samples, samples[1:])]
    cadence = statistics.median(gaps) if gaps else 300
    step_s = min(3600, max(300, math.ceil(cadence / 300) * 300))  # >= one sample per bin, 5 min resolution at best
    bins, _ = fill_gaps(resample(samples, step_s), step_s)
    run = latest_run(complete_days(bins, step_s), days)
    if not run:
        raise Stop(f"{path.name}: no complete day of data (gaps longer than {MAX_GAP_S // 3600} h every day).")

    start = run[0]
    first, count = int(start.timestamp()) // step_s, len(run) * 86400 // step_s
    real = resample(samples, step_s)
    filled = sum(1 for b in range(first, first + count) if b not in real)
    points, acc, day_start, daily = [], 0.0, 0.0, []
    for i in range(count):
        rate = bins[first + i]
        acc += rate * step_s / 3600  # µGy/h * h = µGy
        points.append({"t": iso(datetime.fromtimestamp((first + i) * step_s, timezone.utc)),
                       "dose_rate": round(rate, 3), "accumulated_dose": round(acc, 2)})
        if (i + 1) % (86400 // step_s) == 0:
            daily.append(round((acc - day_start) / 1000, 4))  # mGy that day
            day_start = acc
    n = len(run)
    return {
        "_status": "REAL data, converted by scripts/import_nasa_env.py. Do not edit by hand; re-run the script.",
        "kind": "real",
        "location": loc["id"],
        "place": loc["place"],
        "badge": loc["badge"],
        "note": loc["note"],
        "instrument": instrument,
        "instrument_id": instrument_id,
        "spacecraft": spacecraft,
        "module": module or None,
        "quantity": "Absorbed dose rate (dose in the detector, not the body's effective dose)",
        "units": {"dose_rate": UNIT, "accumulated_dose": "µGy", "daily_mgy": "mGy per day"},
        "unit_source": UNIT_SOURCE,
        "source": "NASA OSDR RadLab",
        "source_url": loc["source_url"],
        "portal": RADLAB_PORTAL,
        "raw_file": f"data/raw/nasa/{path.name}",
        "raw_span": {"start": iso(samples[0][0]), "end": iso(samples[-1][0]), "readings": len(samples)},
        "window": {"start": iso(start), "end": iso(start + timedelta(days=n)), "days": n},
        "step_s": step_s,
        "filled_bins": filled,
        "filled_note": f"{filled} of {count} {step_s // 60}-minute steps had no reading and were filled by a straight line "
                       f"(gaps up to {MAX_GAP_S // 3600} h).",
        "daily_mgy": daily,
        "points": points,
    }


# ---------- EDA cabin ----------

def import_cabin(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        for col, unit in CABIN_FIELDS.values():
            if col not in header:
                raise Stop(f"{path.name}: column {col!r} missing (columns: {header}).")
            if unit not in col:
                raise Stop(f"{path.name}: column {col!r} does not state the expected unit {unit!r}.")
        rows = list(reader)
    step_s = CABIN_STEP_MIN * 60
    per_field = {}
    for field, (col, _) in CABIN_FIELDS.items():
        samples = []
        for r in rows:
            v = num(r[col])
            if v is not None:
                t = datetime.strptime(r["Controller_Time_GMT"], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
                samples.append((t, v))
        per_field[field] = fill_gaps(resample(samples, step_s), step_s)[0]
    # Keep the longest stretch where every field has a value in every 15-minute step.
    common = sorted(set.intersection(*(set(b) for b in per_field.values())))
    best, cur = [], []
    for b in common:
        cur = cur + [b] if cur and b == cur[-1] + 1 else [b]
        if len(cur) > len(best):
            best = cur
    if len(best) < 96:
        raise Stop(f"{path.name}: less than 24 h with CO2, temperature and humidity all present.")
    points = [{"t": iso(datetime.fromtimestamp(b * step_s, timezone.utc)),
               "co2_ppm": int(round(per_field["co2_ppm"][b])),
               "temp_c": round(per_field["temp_c"][b], 1),
               "rh_pct": round(per_field["rh_pct"][b], 1)} for b in best]
    days = round(len(points) * CABIN_STEP_MIN / 1440, 1)
    return {
        "_status": "REAL data, converted by scripts/import_nasa_env.py. Do not edit by hand; re-run the script. "
                   "If this file is missing the app uses cabin_simulated.json.",
        "simulated": False,
        "kind": "real",
        "source": "NASA OSDR: ISS cabin telemetry (RR-23 / SpaceX-21)",
        "badge": "NASA OSDR: ISS cabin telemetry (RR-23 / SpaceX-21)",
        "mission": "RR-23 (Rodent Research-23), flown on SpaceX-21",
        "instrument": "Environmental Data App (EDA) cabin telemetry, ISS-side sensor",
        "source_urls": ["https://visualization.osdr.nasa.gov/eda",
                        "https://osdr.nasa.gov/bio/repo/data/missions/SpaceX-21"],
        "raw_file": f"data/raw/nasa/{path.name}",
        "units": {"co2_ppm": "ppm", "temp_c": "°C", "rh_pct": "% relative humidity"},
        "unit_source": "CSV header (CO2_ppm_ISS, Temp_degC_ISS, RH_percent_ISS)",
        "window": {"start": points[0]["t"], "end": points[-1]["t"], "days": days},
        "replay_note": f"{days} days of real ISS readings, played in a loop.",
        "location_note": "Measured on the ISS. A Moon base, a rover or a ship to Mars keeps its cabin air at similar "
                         "CO2 and temperature levels, so the same readings are shown at every location.",
        "step_min": CABIN_STEP_MIN,
        "points": points,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--raw", type=Path, default=RAW_DEFAULT)
    ap.add_argument("--days", type=int, default=30, help="days of dose data to keep (latest complete run)")
    args = ap.parse_args()
    raw: Path = args.raw
    if not raw.is_dir():
        print(f"No folder {raw}. Nothing converted; the app keeps its simulated feeds.")
        return 1

    problems, done = [], set()
    for path in sorted(raw.glob("radlab_*.csv")):
        try:
            data = import_radlab(path, args.days)
        except Stop as exc:
            problems.append(str(exc))
            continue
        if data["location"] in done:
            problems.append(f"{path.name}: a second file for {data['location']}; skipped (keep one per location).")
            continue
        done.add(data["location"])
        out = DATA / "space_weather" / next(loc["out"] for loc in LOCATIONS if loc["id"] == data["location"])
        write(out, data)
        print(f"  {path.name}: {data['instrument_id']} on {data['spacecraft']} -> {data['location']}; "
              f"{data['window']['days']} days from {data['window']['start'][:10]}, step {data['step_s']} s, "
              f"mean {statistics.mean(data['daily_mgy']):.3f} mGy/day, {data['filled_bins']} filled steps")
    for loc in LOCATIONS:
        if loc["id"] not in done:
            print(f"  no RadLab file for {loc['id']}: the app uses thresholds.json dose_estimates (or the simulated feed)")

    cabin_csv = raw / "eda_cabin.csv"
    if cabin_csv.exists():
        try:
            data = import_cabin(cabin_csv)
            write(DATA / "cabin.json", data)
            print(f"  eda_cabin.csv: {len(data['points'])} points, {data['window']['start']} to {data['window']['end']}")
        except Stop as exc:
            problems.append(str(exc))
    else:
        print("  no eda_cabin.csv: the app uses cabin_simulated.json")

    for p in problems:
        print("STOP:", p, file=sys.stderr)
    return 2 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
