# Signal API v2

The legacy `/api/*` persona and `/ws/vitals` services are demo-only. Real and research signals use this contract. Python schemas live in `app/signals/models.py` and `crewsense_signals.ppg.schemas`; browser types live in `frontend/src/types/signals.ts`.

## Sessions

`POST /api/v2/signal-sessions` returns HTTP 201 and a server-generated session ID.

```json
{"subject_id":"crew-001","device_id":"ppg-001","mode":"measurement","input":"ingest","source":"live"}
```

Modes are `measurement` and `research`. Session option `enable_research_bp` defaults to false and is accepted only in research mode. Without it, no BP buffer or model is initialized, and `blood_pressure`/check `blood_pressure_research` are null. The UI also has a separate `demo` mode for legacy scenarios. Input/source pairs are enforced: `ingest/live`, `bidmc/public_replay`, `recording/recorded_live`, `synthetic/synthetic`. Synthetic inputs require research mode. Replay options: `speed` (0 < speed <= 20), `duration_s` (synthetic, 15–3600), `scenario` (clean/dropout/noise/irregular), and `recording` (relative registered filename).

`GET /api/v2/recordings` lists eligible files inside server-configured `COPILOT_RECORDINGS_DIR`. CSV needs original BIDMC Time [s] and PLETH columns. RawBatch JSONL recordings must identify recorded or live acquisition; disk live is converted to recorded_live. Paths outside that directory and files over 100 MiB are rejected. Existing raw recordings are not copied or published.

`GET /api/v2/signal-sessions/{id}` returns status, identity, source, latest Snapshot and separate research BP. `POST /api/v2/signal-sessions/{id}/stop` ends it. Up to 8 active sessions are allowed; a device can belong to only one active session. Pipelines never restart on viewer connection. Expired sessions cannot resume a previous process's in-memory pipeline; create a new session after restart. Stored checks remain queryable.

## Input and output WebSockets

`/ws/v2/ingest?session_id=...` accepts one producer per ingest session. Each message is an atomic synchronized batch:

```json
{"subject_id":"crew-001","session_id":"<server ID>","device_id":"ppg-001","source":"live","simulated":false,"sequence":0,"t0_s":0,"sample_rate_hz":125,"unit":"arbitrary","channels":{"ppg":["125 finite samples here"]}}
```

The example channels array describes its contents; actual entries must be numbers. Optional channels are ir, red, ecg. A ppg or ir channel is required. ECG uses the same sample clock and length, and is excluded before projection into the PPG core. Input messages are limited to 1 MB and arrays to 10,000 samples/channel. Positive ACK includes sequence; invalid messages receive `{ok:false,error:...}` without accepting the samples. Device format changes require a new session. Duplicate, overlapping and out-of-order batches are rejected; gaps reset history. The socket ACK provides backpressure: producers wait for ACK before sending the next batch.

`/ws/v2/vitals?session_id=...` publishes `{message_type:"signal_session", ...sessionInfo}`. Subscriber queues hold at most two messages. All viewers share one processing history. WebSocket browser origins are restricted to the local UI origins.

Snapshot metrics preserve the NASA contract: nullable value, unit, status, reason, method, measured start/end, window, contiguous valid window, computed time, expiry. Sources remain synthetic/public_replay/recorded_live/live. Quality is categorical with reasons, not an invented confidence percentage. Keys are pulse_rate_bpm, ppg_rmssd_ms (PRV, not ECG HRV), and spo2_pct (not implemented). Rhythm, respiratory rate and clinical red flags are not implemented. No absent metric becomes 0 or regular/normal.

States: starting, running, stale, ended, error. No input for over 3 wall-clock seconds or producer disconnect invalidates current metrics and BP. Resumed input rewarms the processor. EOF/stop/error also invalidates values. Browsers additionally hide metrics after their own valid_until_utc and on disconnection; no persona fallback occurs. Replay source time controls windows; speed only changes scheduling. Raw waveform output is bounded by the NASA core and is not persisted in SQLite.

## Checks and manual observations

`POST /api/v2/checks` requires check_id, session_id, seated_start_s, seated_end_s; optional standing start/end, paired bp_sys/bp_dia, answers, temperature, glucose and pvt reaction-test result. The server selects its own measured snapshots, excludes windows crossing posture boundaries, and summarizes the latest contiguous eligible run. Missing or poor-quality data stays not_measured. No historical persona values are carried forward. Stand change is the difference between measured interval medians; it is not assigned a diagnostic interpretation.

Requests are idempotent by check_id. Same body returns the original saved result; reuse with a different body returns HTTP 409. Partial checks may be saved, explicitly marked by per-metric availability. No actual measurement health score or forecast is assigned. `GET /api/v2/checks?subject_id=...` returns at most 100 saved checks, including after restart.

Cuff manual readings are separate from model estimates, with `method=cuff_manual_entry`. Research BP uses `method=ecg_ppg_model`, model version and artifact hash; it never writes bp_sys/bp_dia or drives alerts. `POST /api/v2/reaction-tests` records a browser reaction test against an active session without using a simulated personal baseline. `POST /api/v2/emergency-logs` saves manual protocol logs with matching subject and session, separately from demo logs.

SQLite signal_sessions, signal_checks, signal_observations and signal_emergencies are additive to existing tables. Signal history is bounded in memory (20,000 snapshots/session, no stored waveform). Demo reset does not erase signal records.

## Research BP gate

`GET /api/v2/bp-capability` reports `enabled`, `available` and a reason. The add-on is disabled by default (`feature_disabled`), requires separate installation of crewsense-bp, and is only imported lazily. Server configuration requires COPILOT_ENABLE_RESEARCH_BP=1 (or launcher --enable-research-bp), plus both COPILOT_BP_MODEL and COPILOT_BP_REPORT. Session opt-in cannot bypass server configuration or the accuracy gate. Normal measurement sessions never initialize BP. An explicit but unavailable model request returns HTTP 422; the caller can start PPG without the option. A model loads only when the report's adoption gate and every named condition pass, the artifact is <=4 MiB, its SHA-256 matches, and its architecture/preprocessing/input metadata is supported. Current NASA pilot fails adoption and is disabled.

The model consumes completed, nonoverlapping 8.192 s synchronized ECG+PPG windows at 125 Hz/1024 points. Its original window-local filters and z-score preprocessing are preserved. It does not use the causal pulse-rate filter output. ECG absence, gaps, poor PPG quality, incompatible sample rates and invalid predictions yield unavailable. Passing the engineering gate does not enable clinical assessment or emergency routing: results remain research_unvalidated with assessment_enabled=false.
