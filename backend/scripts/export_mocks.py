"""Write the frontend fallback JSON (frontend/src/mock/) from the backend data and rules.

Run from backend/ after changing data files:  python scripts/export_mocks.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
# Use a throwaway database so exporting never writes demo data into backend/data/app.db.
os.environ["COPILOT_DB"] = str(Path(tempfile.mkdtemp()) / "export.db")

from fastapi.testclient import TestClient  # noqa: E402

from app import store  # noqa: E402
from app.main import app  # noqa: E402

OUT = ROOT.parent / "frontend" / "src" / "mock"


def write(name: str, data) -> None:
    (OUT / name).write_text(json.dumps(data, indent=1), encoding="utf-8")
    print("wrote", OUT / name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    store.reset()
    client = TestClient(app)
    get = lambda path: client.get(path).json()  # noqa: E731
    ids = store.persona_ids()

    write("personas.json", get("/api/personas"))
    write("status.json", {pid: get(f"/api/status?persona={pid}") for pid in ids})
    write("daily.json", {pid: get(f"/api/persona/{pid}/daily") for pid in ids})
    # First minute per persona; persona C's whole recording, so the demo can play its acute event offline.
    write("vitals.json", {pid: store.persona(pid)["stream"][: None if pid == "C" else 60] for pid in ids})
    write("protocols.json", {pid: get(f"/api/protocols/{pid}") for pid in ("chest_pain", "unresponsive")})
    for name in ("environments", "thresholds", "regions", "escalation", "questionnaire", "cpr", "labels", "guidance",
                 "measurements", "sources", "references", "indicators"):
        write(f"{name}.json", get(f"/api/{name}"))
    # Locations with planets (the surface rover) get one entry per planet: "rover:moon", "rover:mars".
    keys = [f"{e['id']}:{p}" if e.get("planets") else e["id"] for e in get("/api/environments") for p in (e.get("planets") or [None])]
    # Radiation per persona, plus the dose feed per location (each location only its own readings).
    write("radiation.json", {pid: get(f"/api/radiation?persona={pid}") for pid in ids})
    write("radiationFeeds.json", {k: get(f"/api/radiation?persona=A&env={k}")["feed"] for k in keys})
    write("cabin.json", get("/api/cabin"))
    write("pvtNorms.json", get("/api/pvt-norms"))
    write("crewReference.json", get("/api/crew-reference"))
    # The DONKI event file, so the demo's "Replay solar event" also works with the backend off (lib/solarOffline.ts).
    write("solarEvent.json", store.space_event())
    write("delivery.json", {k: get(f"/api/delivery/{k}") for k in keys})

    b = store.persona("B")["stream"]
    check = client.post("/api/check", json={
        "persona": "B", "seated_frames": b[:120], "stand_frames": [],
        "answers": {"sleep_h": 5.5, "sleep_quality": 2, "mood": 2, "stress": 4, "headache": 2,
                    "nausea_appetite": 1, "cough_sore_throat_fever": 1, "muscle_back_pain": 2},
        # Reaction test and glucose too, so the offline summary shows the CSA and Inspiration4 references (demo step 2).
        "glucose_mmol": 5.4, "pvt": {"median_ms": 281, "lapses": 3, "false_starts": 0, "n": 27, "duration_s": 180}}).json()
    write("checkResult.json", check)
    store.reset()


if __name__ == "__main__":
    main()
