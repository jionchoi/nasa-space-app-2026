# CrewSense · Astronaut Health Co-Pilot

The React UI from `nasa-space-app-2026`, with the PPG and research blood-pressure signal core migrated from `NASA`. Integration branch: `codex/ppg-bp-integration`.

## Run locally

Python 3.11+ and Node 18+. From this repository:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
cd backend
python -m pip install -r requirements.txt
cd ..
python scripts/run_backend.py
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open [the local app](http://localhost:5173). The Mode selector separates:

- **Demo:** original A/B/C simulated crew, dashboard, daily check, emergency drills, camera detector and offline mocks.
- **Measurement:** a subject/device-specific signal session. Requires a connected producer or a registered real recording. No automatic simulated fallback.
- **Research:** the same signal pipeline, plus explicitly marked synthetic-waveform scenarios and a gated research BP capability.

The app uses one FastAPI server. Do not also run the old standalone sensing server on port 8000.

## Replay existing BIDMC recordings

Register a directory containing the original downloaded recordings; the app does not download them at startup:

```bash
python scripts/run_backend.py --recordings-dir /path/to/bidmc
```

For the current two-folder local workspace, the recordings directory is `../NASA/data/raw/bidmc`. Select Research or Measurement, enter crew/device identifiers, select a Signals.csv recording, and start the session. Replay speed changes elapsed playback time, not the sample rate or calculation windows.

The first pulse result needs an 8 s usable window plus 2 s settling; PRV needs 60 s plus settling. PPG RMSSD is pulse-rate variability, not ECG HRV. SpO2, respiration, rhythm diagnosis and real clinical alerts remain unavailable. Source loss/EOF invalidates numbers; measured mode does not silently switch to persona data.

Daily checks retain the prepare/measure/manual entry/reaction/questions/summary flow. The backend summarizes its own captured intervals. Cuff readings, questionnaire/manual values, and research BP estimates are recorded separately. Missing values stay empty; health scores and time-to-act are not inferred from placeholder thresholds.

## Live producer

Create a measurement session in the UI, then send atomic RawBatch-compatible messages to `/ws/v2/ingest?session_id=<ID>` including subject_id, server session_id and device_id. Wait for each ACK. The input is documented in [contracts-v2](docs/contracts-v2.md). The legacy `/ws/sensor` endpoint is retained for old demos, not the measured signal path. ESP32 firmware and USB serial ingestion remain separate hardware work.

## Research blood pressure

The BP model is an optional add-on, off by default. Basic PPG processing and cuff entry work without installing or initializing it. The normal dashboard and daily check hide the model estimate card.

To install the add-on (only if needed), from `backend/`:

```bash
python -m pip install -r requirements-bp.txt
```

The NASA model requires **synchronized ECG + PPG**, not PPG alone. Runtime inference uses NumPy/SciPy; PyTorch is unnecessary for the app. Enable the server option explicitly, then select **Optional research features → ECG + PPG blood pressure model** when starting a Research session:

```bash
python scripts/run_backend.py --enable-research-bp --recordings-dir /path/to/bidmc --bp-model /path/to/tiny_bp_cpu.npz --bp-report /path/to/bp_cpu_pilot.json
```

The server can also be enabled with `COPILOT_ENABLE_RESEARCH_BP=1`; model paths alone never enable it. Each selected Research session sends `enable_research_bp=true`. The current pilot failed its accuracy adoption gate, so this model stays unavailable even after opting in. The optional-features panel explains the failure; cuff entry is always available. No new training or threshold tuning was performed during integration. Weights and raw/patient-level data are not committed. Aggregate evidence is in [the BP summary](docs/validation/bp-pilot-summary.json).

Research data preparation and training CLI are preserved under `research/bp/bp_experiment/`; install `research/bp` with its optional research dependencies only when needed. Its CPU inference/preprocessing wrappers use the shared core, avoiding a second calculation implementation. See [the original experimental protocol](research/bp/bp_experiment/README.md).

## Verify

With backend dependencies installed:

```bash
cd backend
python -m pytest -q tests ../packages/crewsense-signals/tests
cd ../frontend
npm test
npm run build
```

Integration evidence: [core parity](docs/validation/integration-core-parity.json), [implementation status](docs/INTEGRATION_STATUS.md), [contracts](docs/contracts-v2.md). The original broader app instructions are retained in `README copy.md`.

## Code ownership

- `frontend/`: original app layout, shared vitals cards/body map; v2 signal session and daily check views.
- `backend/app/signals/`: isolated processing, storage, checks, BP gate.
- `packages/crewsense-signals/`: canonical PPG calculation core and migrated regression tests. Original file hashes are in MIGRATION.json. Make future signal changes here; the sibling NASA folder is a reference snapshot.
- `packages/crewsense-bp/`: separately installed optional BP preprocessing and CPU inference; lazily imported only for explicit research use.
- `research/bp/`: optional offline model research tools.
- `backend/data/`: original simulated demo content. Placeholder thresholds/protocols are not applied to measured signals.

MIT for this app; public recordings and other third-party assets retain their own terms. See `docs/resources.md` and the research data notes. No camera footage is stored.
