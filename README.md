# Astronaut Health Co-Pilot (nasa-space-app-2026)

NASA Space Apps 2026, challenge "Create Health Monitoring Software for Astronauts on Space Missions".
A medical co-pilot for astronauts who are not doctors: a 5-minute daily check feeding a color-coded body map
(prevent), and a full-screen emergency mode with step-by-step protocols (respond).
All crew data in the demo is simulated. Project brief: `.claude/CLAUDE.md`.

## Run

**One command** (Python 3.11+ and Node 18+): `./start.sh` on macOS / Linux, or `.\start.ps1` in Windows PowerShell,
from the repository root. It sets up `backend/.venv` and `frontend/node_modules` on the first run, then starts the
backend (:8000) and the frontend (:5173). Ctrl+C stops both.

Or by hand, in two terminals. Backend (Python 3.11+), from `backend/`:

```
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (Node 18+), from `frontend/`:

```
npm install
npm run dev
```

Open http://localhost:5173. The frontend also works with the backend off: it falls back to
`frontend/src/mock/` and shows an "Offline: mock data" badge.

Other commands (from `backend/`):

```
python scripts/make_personas.py   # regenerate simulated personas A, B, C (fixed seed)
python scripts/export_mocks.py    # refresh frontend/src/mock/ from the backend data
python scripts/fake_sensor.py --persona C --start 300 --seconds 20   # pretend to be the sensor (needs the backend running)
python scripts/fetch_donki.py 2024-05-01 2024-05-31 --build-event --sep-id 2024-05-10T13:35:00-SEP-001
                                  # ONCE, with internet: real NASA DONKI solar event -> data/space_weather/ (already done)
python scripts/make_cabin.py      # regenerate the simulated cabin fallback (cabin_simulated.json)
pytest                            # tests
```

Everything runs on this laptop with no internet. The sidebar footer (menu button) shows **Runs on board · backend
answering** or **Mock data** when the backend is off, and the live vitals row shows **LIVE SENSOR** / **REPLAY** for
where the vitals come from (the app switches back to the replay 3 s after the sensor stops).

## PPG and blood pressure signals (Measurement and Research modes)

From the `ppg-bp-integration` branch (Jian). Three modes; the Demo top bar has no mode selector, so open
`?mode=measurement` or `?mode=research` (the Measurement / Research top bar has the **Mode** selector to switch,
including back to Demo):

- **Demo:** the simulated crew A, B, C, dashboard, daily check, emergency drills, camera detector and offline mocks.
- **Measurement:** a subject/device-specific signal session. Needs a connected producer or a registered real recording.
  No automatic fallback to simulated data.
- **Research:** the same signal pipeline, plus clearly marked synthetic-waveform scenarios and a gated research BP model.

`pip install -r requirements.txt` also installs the PPG core (`packages/crewsense-signals`, editable). To replay
recorded waveforms (e.g. PhysioNet BIDMC), start the backend with the launcher instead of plain uvicorn:

```
python scripts/run_backend.py --recordings-dir /path/to/bidmc       # from the repository root
```

Then pick Research or Measurement, enter crew/device ids, choose a `Signals.csv` recording and start the session.
The first pulse value needs an 8 s usable window plus 2 s settling; pulse-rate variability needs 60 s. PPG RMSSD is
pulse-rate variability, not ECG HRV. SpO2, breathing rate, rhythm diagnosis and real clinical alerts are not computed
from measured signals yet, and source loss or end of file clears the numbers (no silent switch to persona data).

A live producer (sensor) creates a session in the UI, then sends RawBatch messages to
`/ws/v2/ingest?session_id=<ID>`; see [contracts-v2](docs/contracts-v2.md). The old `/ws/sensor` stays for the demo.

**What is measured from a sensor and what is simulated, per mode** (checked in the code on Nov 15; "not computed"
means the app shows no number at all):

| Vital | Demo | Measurement | Research |
|---|---|---|---|
| Heart rate | Simulated (persona replay). From a device only if it sends ready-made VitalsFrames to `/ws/sensor`; raw samples sent there are ignored (`compute_vitals()` is not implemented) | Measured: pulse rate from PPG peaks, 8 s window (live device, recorded JSONL or BIDMC replay). Shown, not judged against thresholds | As Measurement; with the synthetic input, computed from a synthetic waveform (labelled) |
| HRV | Simulated, as above | Measured as PPG RMSSD over 60 s (pulse-rate variability, not ECG HRV). Not judged | As Measurement |
| SpO₂ | Simulated, as above | Not computed (needs red + IR channels and a validated calibration) | Not computed |
| Breathing | Simulated, as above | Not computed (no card shown) | Not computed |
| Rhythm (irregular) | Simulated, as above | Not computed | Not computed |
| pulse_lost | Worked out in the browser (`cv/pulse.ts`) from the simulated frames: heart-rate red flag, flat pulse wave or no beats for 4 s with good contact. Opens the Act now pop-up, camera on or off | Not computed: no output, no alarm | Not computed |

**Research blood pressure (optional, off by default).** The model needs synchronized ECG + PPG, and its pilot failed
its accuracy gate, so it stays unavailable even when switched on. Cuff entry in the daily check always works.
To try it: `pip install -r backend/requirements-bp.txt`, then
`python scripts/run_backend.py --enable-research-bp --bp-model <tiny_bp_cpu.npz> --bp-report <bp_cpu_pilot.json>`
(or `COPILOT_ENABLE_RESEARCH_BP=1`). Weights and patient-level data are not committed.
Evidence: [BP summary](docs/validation/bp-pilot-summary.json), [core parity](docs/validation/integration-core-parity.json),
[integration status](docs/INTEGRATION_STATUS.md). Signal tests: `python -m pytest -q tests ../packages/crewsense-signals/tests`
from `backend/`.

## Data

<!-- sources-table -->
Data sources (also on the in-app `/sources` page; generated from `backend/data/sources.json` by `backend/scripts/gen_sources_table.py`). Uses: replay = played on screen; test = checks our code; thresholds = sets status limits; reference = shown or cited, not judged. TO FILL IN = still to be added by the owner.

| Source | Agency | Used for | App locations | Real / simulated / estimated |
|---|---|---|---|---|
| NASA RadLab: DOSTEL1 (ISS) | NASA (with DLR, DOSTEL1 instrument) | replay: Radiation card at the ISS: dose-rate chart with South Atlantic Anomaly spikes, today's dose, 30-day dose. | ISS | real |
| NASA RadLab: Curiosity RAD (Mars surface) | NASA | replay: Radiation card for the surface rover on Mars. | Surface rover (Mars) | real |
| Dose estimates from published papers | Published papers (CNSA Chang'e-4 LND, NASA Curiosity RAD cruise) | replay: Radiation card at the Moon base, surface rover (Moon) and Mars transit. | Moon base, Surface rover (Moon), Mars transit | estimated (Constant DRAFT value where we have no RadLab file. No lunar RadLab file (LRO CRaTER) yet.) |
| NASA Environmental Data App (EDA): ISS cabin telemetry | NASA | replay: Cabin air card; Lungs region (cabin CO2); CO2 note on headache and poor sleep. | ISS, Moon base, Mars transit, Surface rover | real |
| NASA DONKI: solar particle event | NASA (CCMC) | replay: 'Replay solar event' demo control (/admin); Solar event alert and 'go to shelter' advice; Radiation region turns Act now during the event. | ISS, Moon base, Mars transit, Surface rover | real (Event id, time and link are real; the dose curve during the event is simulated.) |
| NASA OSDR OSD-575: Inspiration4 blood panel | NASA (OSDR); SpaceX Inspiration4 crew | reference: Daily check glucose step: 'Real crew reference' line; Metabolism region: 'Real crew reference' line and a Learn-tab table (glucose, sodium, potassium). | ISS, Moon base, Mars transit, Surface rover | real |
| CSA PRET: reaction test reference group | Canadian Space Agency (CSA) | thresholds, reference: Reaction test result: 'faster than Y% of the CSA reference group'; Brain and mood region: Watch above the 90th percentile, Warning above the 97.5th (DRAFT, Yenna reviews); Personas A and B reaction-test values. | ISS, Moon base, Mars transit, Surface rover | real |
| PhysioNet BIDMC PPG and Respiration Dataset | PhysioNet (MIT LCP); recordings from Beth Israel Deaconess Medical Center | test: Testing compute_vitals(): heart rate and breathing rate from PPG. (Jian to confirm) Validation result (Jian): All 53 records (re-run Nov 15, docs/validation/bidmc_all53_summary.json): median per-record pulse-rate error 0.86 bpm, pooled MAE 2.59 bpm, 91.9% of seconds within ±5 bpm, a value in 97.2% of seconds. 4 records over 5 bpm MAE (bidmc_18, 40, 41, 45). Pulse rate only; breathing rate is not computed from PPG.. | ISS, Moon base, Mars transit, Surface rover | real |
| PhysioNet/CinC Challenge 2015 (false ICU alarms) | PhysioNet and Computing in Cardiology | test: Testing the irregular rhythm flag and the lost-pulse alarm. (Jian to confirm) Validation result (Jian): Asystole alarms (122; 17 true and 89 false with a PPG channel, docs/ppg-review.md): no lost-pulse detector to score. At the alarm second the pipeline never reported 'no beats': true asystole showed a pulse rate in 6/17 and poor signal in 10/17. So Measurement mode raises no alerts.. | ISS, Moon base, Mars transit, Surface rover | real |
| NASA Human Research Program: hazards and risks pages | NASA (Human Research Program) | reference: Learn tab: why each body area changes in space. (Yenna to confirm) | ISS, Moon base, Mars transit, Surface rover | real |
| NASA Spaceflight Standard Measures paper | NASA | reference: Choosing the daily check measurements. (Yenna to confirm) | ISS, Moon base, Mars transit, Surface rover | real |
| CSA report: Canadian Healthcare in Deep Space | Canadian Space Agency (CSA) | reference: Escalation advice with communication delay; Why the app guides non-doctors. (Yenna to confirm) | ISS, Moon base, Mars transit, Surface rover | real |
| Simulated crew members A, B, C | Our team (simulated) | replay: Body map, trends, live vitals replay, emergency demo. | ISS, Moon base, Mars transit, Surface rover | simulated |
| Simulated cabin profile (fallback) | Our team (simulated) | replay: Cabin air card (fallback only). | ISS, Moon base, Mars transit, Surface rover | simulated |

<!-- sources-table -->

- `backend/data/*.json`: medical content and personas, read-only at runtime (Yenna edits these; a change shows on
  every screen with no code change). Status words are in `labels.json`.
- `backend/data/app.db`: SQLite file with everything recorded at runtime (alerts, daily checks, emergency logs,
  messages, forms, streaks, events). Created on start, git-ignored. Reset it before a demo on the hidden
  `/admin` page or with `POST /api/admin/reset`.
- `data/raw/`: large raw recordings (PPG, ECG, video). Git-ignored; keep converters in `backend/scripts/`.

## Rebuilding the data

The converted JSON in `backend/data/` is committed, so the app never needs these steps or the internet. To rebuild
it from the raw sources, install the data tools first (separate from the app's `requirements.txt`), from `backend/`:

```
pip install -r scripts/requirements-data.txt    # requests, truststore, pyreadstat
```

```
python scripts/import_nasa_env.py   # data/raw/nasa/*.csv (NASA OSDR RadLab, EDA) -> dose_*.json, cabin.json
python scripts/merge_medical.py     # docs/medical/*.json (Yenna) -> regions.json, measurements.json, guidance.json
python scripts/fetch_donki.py --from-file data/space_weather/donki_2024-05-01_2024-05-31.json \
    --sep-id 2024-05-10T13:35:00-SEP-001          # rebuild the solar event, offline
python scripts/fetch_pret.py        # list the CSA PRET open data (Open Government Licence - Canada)
python scripts/fetch_pret.py --download   # PRET v4.0 PVT files -> data/raw/pret/ (needs internet, ~2.6 MB)
python scripts/export_mocks.py      # then refresh the frontend's offline copies
python scripts/import_osd575.py     # data/raw/nasa/osd575/ (Inspiration4 blood panel) -> crew_reference_osd575.json
python scripts/gen_sources_table.py # README "Data" table from backend/data/sources.json
```

`fetch_pret.py` uses `truststore` because the CSA server's certificate checks out against the Windows certificate
store but not Python's default bundle; verification stays on. Read the PVT `.sav` with
`pyreadstat.read_sav(path, output_format="dict")` (no pandas needed).

## Demo shortcuts

- **Demo mode for the live pitch** (about 3 minutes, 8 parts): **Shift+D**, the "Start demo mode" button on `/admin`,
  or `?demo=1`. A presenter bar (bottom right) shows the step, what to say, and the data badges (real / simulated),
  with Back, Pause (holds the live vitals still) and Next; arrow keys or a presenter clicker work too. Each step sets
  the crew member, location, replay position and screen: 1 ISS healthy (real RadLab and cabin data), 2 daily check
  summary (CSA PRET and Inspiration4 references), 3 persona B heart Warning with the drafted message, 4a Mars transit
  (message arrives in several minutes), 4b rover on Mars (Curiosity radiation, "Return to base"), 5 DONKI solar
  event, 6a persona C vitals worsen, 6b pulse lost and CPR, 7 unresponsive detection (camera or "Demo trigger"),
  8 end of emergency with the delayed message. Works with the backend off (public build): the DONKI replay, persona
  C's full recording and the drafts then run in the browser. Reset the demo data on `/admin` first for a clean run.
- **Sound**: the speaker button in the header or **M** mutes every app sound (a "Muted" badge shows). In `npm run dev`
  the crew alarm siren stops after 60 s; the red alarm screen stays until answered.
- `http://localhost:5173/?persona=C&env=mars&start=170&speed=2` : persona C, Mars, replay jumps to
  just before the event, at double speed. In demo mode, the "Jump to event (demo)" button at the end of the live vitals
  row does the same jump.
- Unresponsive crew member detection: the "◉ Camera" button in the top bar (off by default). Needs the two model files
  once, see `docs/cv-explained.md` (Setup). The crew alarm sounds as soon as "Are you OK?" appears (it never waits for
  the 15 s timer); no answer opens `/emergency?protocol=unresponsive&trigger=cv` at CL00, with nothing pre-answered.
  A lost pulse on the clip (camera not needed) opens the Act now pop-up; "Open emergency mode" goes to the collapse
  protocol at CL00 with the pulse-lost red flag shown: try `?persona=C&start=500`. Tune it on `/admin` (debug panel).
- Frontend unit tests: `npm test` in `frontend/` (body-relative signals, pulse checks, state machine).
- Red flags are shown, never acted on by themselves: in `?persona=C&protocol=chest_pain&start=495` the red-flag panel
  lights up (SpO2 critical, then pulse lost), but the protocol only moves on when the crew answers each step (medical
  lead: human assessment over sensors). No step gives oxygen, drugs or doses.
- Mission clock (header, GMT): the fast-forward button jumps to the next reminder (07:30 daily check, 12:30 lunch,
  16:00 exercise, 19:00 water; from environments.json). "real time" puts it back.
- `/reaction`: the reaction test on its own (also from the brain and mood panel), with a 1-minute demo version.
- `/admin` (not linked): database counts, "Reset demo data", "Test crew alarm", and "Replay solar event" (real NASA DONKI event,
  simulated dose: the radiation area turns Act now for the whole crew, with a shelter alert and a drafted message).
- **Inbox** (top bar): alerts and the flight-surgeon messages. Warning / Act now areas get a drafted message to edit
  and send.
- Daily check: "Skip measurement" uses the last 2 minutes of the live stream.

## Limitations

This is a research prototype, **not clinically validated** (the app says so on every screen).

- **Simulated crew.** Personas A (healthy), B (slow drift) and C (acute event) are generated; persona C's emergency is a
  simulated recording and is labelled as such. No in-flight astronaut data (raw PPG or vitals) was available to us.
- **Thresholds are proposed, not validated.** Limits come from the medical lead's sheet (RULE-01 to RULE-17, marked
  "proposed, not clinically validated") plus team defaults labelled "Team default" and pending medical review.
- **Real PPG raises no alerts.** Measurement and Research modes compute pulse rate and PPG pulse-rate variability only
  (BIDMC, all 53 records: median per-record error 0.86 bpm, pooled MAE 2.59 bpm, 91.9% of seconds within ±5 bpm, a
  value in 97.2% of seconds). SpO₂, breathing, rhythm and lost pulse are not computed from measured signals, so no
  Act now, crew alarm or emergency hand-off comes from a real sensor.
- **Blood-pressure model is off.** The research model failed its accuracy gate and stays unavailable; cuff entry works.
- **Protocols are educational.** Emergency steps are adapted from terrestrial guidance, pending crew medical authority.
  The app prescribes no drugs, doses, oxygen or IV.

## AI use

Claude and Claude Code (Anthropic) helped write code, tests and documentation; the team reviewed and owns the
result. The app itself makes no AI decisions: every status, forecast and alert comes from fixed rules in
`backend/data/thresholds.json` and simple statistics (straight-line trend, Isolation Forest for "unusual for you").
The one optional AI feature is the Inbox's **Polish wording** button, which asks Claude to reword a drafted message;
it only appears when `ANTHROPIC_API_KEY` is set and the internet is reachable, and the crew still reviews the text
before sending.

## Screenshots

| Dashboard | Learn |
|---|---|
| ![Dashboard: body map and selected area](docs/screenshots/dashboard.png) | ![Learn pop-up](docs/screenshots/learn.png) |
| **Act now** | **Emergency mode** |
| ![Act now pop-up](docs/screenshots/act-now.png) | ![Emergency mode protocol](docs/screenshots/emergency.png) |

## Folder layout

```
frontend/                 React + Vite + TypeScript + Tailwind + Recharts
  src/api/                API client (falls back to mock data, exposes usingMock)
  src/mock/               fallback JSON, generated by backend/scripts/export_mocks.py
  src/types/contracts.ts  TypeScript types for the JSON contracts
  src/state/ hooks/ lib/  app state, useVitals / useStatus, status helpers
  src/components/         dashboard/, check/, emergency/, common/ (Card = nested card surface)
  src/components/dashboard/anatomy/  body map: full-length body image + status dots; plate.ts = image and dot positions
  src/assets/body/        the anatomy image (swap here; see plate.ts)
  src/pages/              Dashboard (/), DailyCheck (/check), Emergency (/emergency), ReactionPage (/reaction), Admin (/admin)
  src/cv/                 unresponsive detection: camera, MediaPipe, torso coordinates, signals, pulse, state machine (see docs/cv-explained.md)
  src/components/cv/      camera panel and header toggle, "Are you OK?" overlay, debug panel
  public/models/          MediaPipe model files (.task, downloaded once) and wasm/ (copied by npm install)
  src/components/routine/ missions card, log forms (meal, exercise, weekly biomarkers), mission clock, reminders
backend/
  app/main.py ws.py       FastAPI app; WebSockets /ws/vitals, /ws/sensor, /ws/alerts
  app/db.py alerts.py sensor.py   SQLite storage, alert rules, live sensor / replay switch
  app/messaging.py        flight-surgeon messages (drafts, send, delivery delay) for emergency mode and the dashboard
  app/radiation.py cabin.py   DONKI solar-event replay, simulated cabin feed
  app/daily_log.py        today's logs into the regions, daily missions
  app/routers/            REST endpoints
  app/models.py           pydantic models for the contracts
  app/ppg/                Jian: compute_vitals(); adapter.py turns a recording into a persona stream
  app/rules/              status, forecast, escalation, daily check (read thresholds.json)
  data/                   personas/, protocols/, space_weather/, thresholds.json, regions.json, escalation.json,
                          environments.json, questionnaire.json, cpr.json, labels.json, cabin.json
  scripts/                make_personas.py, export_mocks.py, fake_sensor.py, fetch_donki.py, make_cabin.py
  tests/                  pytest
ml/                       Jian: forecasting and anomaly models (see ml/README.md)
firmware/                 Jian: ESP32 + MAX30102 code (see firmware/README.md)
data/raw/                 large raw recordings, git-ignored
docs/
  contracts.md            JSON contracts (source of truth)
  resources.md            data sources and their status
```

## Who owns what

- Yenna: every number and text in `backend/data/` (`thresholds.json`, `protocols/`, `regions.json`,
  `escalation.json`, `questionnaire.json`, `cpr.json`) and the physiology dict at the top of
  `scripts/make_personas.py`. Everything marked DRAFT or "Team default, pending medical review" needs review.
- Jian: `backend/app/ppg/compute_vitals()`.
- Jion: the rest.

## License

MIT, see `LICENSE`. Third-party assets (body image, fonts, icons) keep their own licenses, see `docs/resources.md`.
