"""Download real NASA DONKI space-weather events (run ONCE, with internet, before the demo).

    python scripts/fetch_donki.py 2024-05-01 2024-05-31
    python scripts/fetch_donki.py 2024-05-01 2024-05-31 --build-event      # also (re)build event.json
    python scripts/fetch_donki.py --from-file data/space_weather/donki_2024-05-01_2024-05-31.json \
        --sep-id 2024-05-10T13:35:00-SEP-001                                # rebuild event.json OFFLINE from the saved file

Saves the raw JSON to backend/data/space_weather/donki_<start>_<end>.json. With --build-event it picks the first
solar energetic particle (SEP) event in that file that an instrument measured (or --sep-id) and writes backend/data/space_weather/event.json: the real event id,
times and DONKI link, plus a SIMULATED dose-rate curve for the replay. The app itself never calls the API.

API key: NASA_API_KEY environment variable, or NASA_API_KEY=... in backend/.env, otherwise DEMO_KEY
(DEMO_KEY is rate-limited but enough for one run).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "space_weather"
API = "https://api.nasa.gov/DONKI"


def api_key() -> str:
    if os.environ.get("NASA_API_KEY"):
        return os.environ["NASA_API_KEY"]
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("NASA_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return "DEMO_KEY"


def get(kind: str, start: str, end: str) -> list:
    query = urllib.parse.urlencode({"startDate": start, "endDate": end, "api_key": api_key()})
    with urllib.request.urlopen(f"{API}/{kind}?{query}", timeout=60) as res:
        body = res.read().decode("utf-8")
    return json.loads(body) if body.strip() else []


DOSE_NOTE = "dose simulated; timing from real DONKI event"

# How much stronger the same event is at each location than on the ISS (DRAFT, Yenna reviews). Looked up like the
# advice texts: "rover:mars", then "rover", then the planet's location. The ISS sits inside Earth's magnetic field,
# which turns most solar particles away; deep space has no such shield; a planet's surface blocks part of the sky.
LOCATION_SCALE = {
    "_note": "DRAFT - Yenna reviews. Multiplier on the reference (ISS) dose curve. Simulated, not measured.",
    "iss": 1.0, "moon": 5.0, "rover:moon": 5.0, "mars": 10.0, "rover:mars": 3.0, "default": 1.0,
}
LOCATION_REASON = {
    "iss": "Earth's magnetic field turns most of the particles away from the ISS.",
    "moon": "No magnetic field on the Moon; the ground blocks only the half of the sky below you.",
    "rover:moon": "No magnetic field on the Moon, and the rover cabin is thinner than the base walls.",
    "mars": "Deep space: no magnetic field and no planet to block the particles. The biggest effect.",
    "rover:mars": "The thin Martian air and the planet block part of the particles, but no magnetic field protects you.",
    "default": "Effect depends on the shielding where you are.",
}


def dose_curve(minutes: int, step: int = 1) -> list[dict]:
    """SIMULATED reference dose rate for the ISS (mSv/h): quick rise, peak at ~25 % of the event, slow decay. Shape
    only, not measured. Other locations multiply it by LOCATION_SCALE."""
    baseline, peak = 0.01, 0.15
    points = []
    for m in range(0, minutes + 1, step):
        u = m / minutes
        rise = 1 - math.exp(-u / 0.08)
        decay = math.exp(-max(0.0, u - 0.25) / 0.3)
        points.append({"minute": m, "msv_per_h": round(baseline + (peak - baseline) * rise * decay, 3)})
    return points


def measured(sep: dict) -> bool:
    """True when a spacecraft instrument saw the SEP (not only a model forecast)."""
    names = [i.get("displayName", "") for i in sep.get("instruments") or []]
    return any(not n.startswith("MODEL") for n in names)


def build_event(raw: dict, replay_min: int, sep_id: str | None = None) -> dict:
    seps = raw["sep"]
    if not seps:
        raise SystemExit("No SEP events in this date range; try another range.")
    if sep_id:
        sep = next((s for s in seps if s.get("sepID") == sep_id), None)
        if sep is None:
            raise SystemExit(f"{sep_id} is not in this file")
    else:
        sep = next((s for s in seps if measured(s)), seps[0])
    flares = {f.get("flrID"): f for f in raw["flr"]}
    linked = [e.get("activityID") for e in (sep.get("linkedEvents") or [])]
    flare = next((flares[i] for i in linked if i in flares), None)
    flare_ids = [i for i in linked if "FLR" in (i or "")]
    flare_id = flare_ids[-1] if flare_ids else None  # the flare closest before the particle event
    flare = flares.get(flare_id) if flare_id else flare
    return {
        "_status": "Timing, IDs and links are from a real NASA DONKI event. DOSE RATES ARE SIMULATED (shape only, not measured).",
        "simulated_dose": True,
        "dose_note": DOSE_NOTE,
        "source": {"name": "NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)",
                   "file": raw["_file"], "fetched_at": raw["fetched_at"]},
        "event": {
            "sep_id": sep.get("sepID"),
            "sep_time": sep.get("eventTime"),
            "link": sep.get("link"),
            "instruments": [i.get("displayName") for i in sep.get("instruments") or []],
            "linked_events": linked,
            "flare": ({"flr_id": flare_id, "note": "details not downloaded (FLR endpoint unavailable)"} if flare_id else None)
            if flare is None else {
                "flr_id": flare.get("flrID"), "class": flare.get("classType"), "begin": flare.get("beginTime"),
                "peak": flare.get("peakTime"), "end": flare.get("endTime"), "source_location": flare.get("sourceLocation"),
                "link": flare.get("link"),
            },
        },
        "replay": {
            "duration_min": replay_min,
            "note": f"The demo replays the event compressed into {replay_min} minutes.",
        },
        "dose_curve_note": f"Reference curve for the ISS (mSv/h), {DOSE_NOTE}. Multiplied by location_scale per location.",
        "dose_curve": dose_curve(replay_min),
        "location_scale": LOCATION_SCALE,
        "location_reason": LOCATION_REASON,
        "alert": "Solar particle event: go to the shielded area",
        "advice": {
            "iss": "Go to the most shielded module now and stay there until the event ends. Tell your crew.",
            "moon": "Go to the base shelter now and stay inside until the event ends. Stop surface activity.",
            "mars": "Go to the storm shelter (the water-wall area) now and stay there until the event ends.",
            "rover": "DRAFT: Drive back to the base shelter now. If you cannot reach it in time, stay inside the rover cabin and tell the base crew.",
            "default": "Go to the most shielded area now and stay there until the event ends.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("start", type=date.fromisoformat, nargs="?", help="YYYY-MM-DD (not needed with --from-file)")
    parser.add_argument("end", type=date.fromisoformat, nargs="?", help="YYYY-MM-DD")
    parser.add_argument("--from-file", type=Path, default=None,
                        help="build event.json from an already saved donki_*.json (no internet)")
    parser.add_argument("--build-event", action="store_true", help="also write event.json from the first SEP event")
    parser.add_argument("--replay-min", type=int, default=20, help="length of the demo replay in minutes")
    parser.add_argument("--sep-id", default=None, help="which SEP to use (default: first one measured by an instrument)")
    args = parser.parse_args()
    if args.from_file:
        raw = json.loads(args.from_file.read_text(encoding="utf-8"))
        event = build_event(raw, args.replay_min, args.sep_id)
        (OUT_DIR / "event.json").write_text(json.dumps(event, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {OUT_DIR / 'event.json'} from {event['event']['sep_id']} ({event['event']['sep_time']}), offline")
        return
    if not (args.start and args.end):
        parser.error("start and end are required unless --from-file is given")
    start, end = args.start.isoformat(), args.end.isoformat()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    errors = {}
    try:
        sep = get("SEP", start, end)
    except OSError as exc:
        sys.exit(f"Could not reach NASA DONKI SEP ({exc}). This script needs internet; the app does not.")
    try:  # optional: flare details (the SEP record already names its linked flare)
        flr = get("FLR", start, end)
    except urllib.error.HTTPError as exc:
        flr, errors["FLR"] = [], f"HTTP {exc.code}"
        print(f"FLR endpoint failed ({exc}); continuing with the flare id from the SEP record only")
    name = f"donki_{start}_{end}.json"
    raw = {"_file": name, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "query": {"start": start, "end": end, "endpoints": [f"{API}/SEP", f"{API}/FLR"]}, "errors": errors,
           "sep": sep, "flr": flr}
    (OUT_DIR / name).write_text(json.dumps(raw, indent=1), encoding="utf-8")
    print(f"saved {OUT_DIR / name}: {len(sep)} SEP and {len(flr)} FLR events")
    for s in sep[:10]:
        print(f"  SEP {s.get('sepID')}  {s.get('eventTime')}")

    if args.build_event:
        event = build_event(raw, args.replay_min, args.sep_id)
        (OUT_DIR / "event.json").write_text(json.dumps(event, indent=1), encoding="utf-8")
        print(f"wrote {OUT_DIR / 'event.json'} from {event['event']['sep_id']}")


if __name__ == "__main__":
    main()
