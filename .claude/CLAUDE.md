# Astronaut Health Co-Pilot (NASA Space Apps 2026)

Challenge: "Create Health Monitoring Software for Astronauts on Space Missions" (Brazilian Space Agency).
Hackathon: Nov 14–15, 2026. Team: Jion (dashboard, CV, backend), Jian (PPG), Yenna (medical science).

## What we are building
A medical co-pilot for astronauts who are not doctors. It does two jobs:
1. **Prevent**: a 5-minute daily check (sit and stand PPG measurement plus a short questionnaire) feeds a color-coded body map with 7 regions: brain and mood, heart, lungs, immune, metabolism, bones and muscles, radiation. Each region shows a status (green, yellow, orange, red), a trend and a "time to act" forecast. A measurement coach guides the check, and an escalation ladder tells the astronaut what to do: self-care / tell crew / flight surgeon next window / flight surgeon now.
2. **Respond**: a full-screen emergency mode with step-by-step protocols (chest pain, crew member not responding), a live vitals strip, red flags, an event log, a CPR rhythm guide (100–120 per minute, microgravity CPR positions) and a delayed message to the flight surgeon.

Other features:
- **Unresponsive crew member detection (CV + PPG)**: in microgravity an unconscious astronaut does not collapse, they float into the neutral body posture. The webcam runs MediaPipe Pose and Face Mesh in the browser and measures everything relative to the torso: no purposeful hand movement, arms drifting into the neutral body posture, slow smooth body drift, eyes closed, outside sleep hours, combined with PPG red flags. The app then shows "Are you OK? Tap, speak or move your hand." with a 15 s countdown, alerts the crew and opens emergency mode. A lost pulse on the finger clip (works without the camera) skips the check-in and goes straight to the alarm and CPR. Falls only where there is gravity (Moon base, Surface rover on the Moon or Mars; list in `thresholds.json` `cv.fall.environments`). Processing is on-device only and no video is stored. Details: `docs/cv-explained.md`.
- **Environment selector**: ISS (near real-time contact), Moon base (about 1.3 s delay), Mars transit (several minutes of delay each way). The delay changes the escalation advice and the message status.
- **Gamification**: rewards behavior, never health results. It has an emergency drill practice mode with scoring and daily health missions (complete the check, hydrate, exercise log).

## Data rule
**Check the challenge Resources tab first.** If it includes astronaut PPG or vitals data, that becomes the main data source. Write a small converter into our JSON shapes and keep the personas below only as backup and for the emergency demo.

Otherwise: we have no raw PPG waveforms from astronauts. The closest real data is the Inspiration4 crew's Apple Watch HR, HRV and SpO₂ (summary values, not waveforms). If it can be downloaded from NASA OSDR, we use it to set how persona B's numbers shift in flight and cite it. Everything else comes from replaying Earth PPG recordings (PhysioNet and similar) through our pipeline and generating personas:
- Persona A: healthy baseline
- Persona B: slow drift (rising resting HR, falling HRV, poor sleep). This feeds the "time to act" demo.
- Persona C: an acute event (simulated recording of tachycardia, low SpO₂, then unresponsive with the pulse lost). This is the emergency demo, and we say openly that it is simulated.

**All data is loaded from JSON files in `backend/data/`.** Swapping in real or challenge-resource data later must only be a file change. Never hard-code medical thresholds in components. They live in `backend/data/thresholds.json`, which Yenna owns.

## If the Resources tab releases data (all data types)
Same rule for everything: write a converter into our JSON shapes, put the source in `docs/resources.md`, change the on-screen badge from "Simulated" to the real source, and keep the fallback so the demo never breaks.

| If they release… | Where it goes | Fallback until then |
|---|---|---|
| Raw PPG waveforms | Jian's `compute_vitals()` → persona stream files | Earth PPG recordings (PhysioNet) |
| HR / HRV / SpO₂ values only | Daily summaries and trend charts (heart region), skip signal processing | Persona values; Inspiration4 Apple Watch data if downloadable |
| ECG | Check our PPG-derived HR and rhythm against it; irregular-rhythm flag | PPG irregular flag only |
| Blood pressure | Stand-test result and BP class in the heart region | Jian's BP class model on Earth data |
| Respiration rate / breathing | Lungs region, vitals strip | RR estimated from PPG |
| Sleep (duration, actigraphy) | Brain and mood region, daily missions | Questionnaire answers |
| Mood, stress, cognition tests | Brain and mood region | Questionnaire (Yenna's 1–5 scales) |
| Radiation dose (crew or cabin) | Radiation region: daily dose, mission total, limit bar | NASA DONKI solar events and Curiosity RAD values from published papers |
| Space weather / solar events | Radiation alert and "go to shelter" advice | DONKI public API |
| Blood tests, immune markers, cytokines | Immune region and metabolism region (glucose, insulin) | Persona values in published spaceflight ranges (Inspiration4, NASA Twins Study papers) |
| Bone and muscle (density, mass, strength) | Bones and muscles region, exercise missions | Published loss rates per month in flight |
| Body mass, fluids, hydration | Metabolism region, hydration mission | Questionnaire and persona values |
| Exercise logs | Bones and muscles region, daily missions | Manual log in the app |
| Cabin environment (CO₂, temperature, noise) | Context panel; explains headaches and poor sleep | Typical ISS values from NASA docs |
| Medical guidelines and protocols | Yenna updates `protocols/*.json` and `thresholds.json` | NASA-STD-3001, NASA HRP, published papers |
| Video or pose data of crew | Tune unresponsive detection thresholds | Our own webcam tests |
| Mission timeline (sleep and work schedule) | Unresponsive detection "sleep hours", daily check reminder | Fixed schedule in `environments.json` |

When something arrives, the owner is whoever owns that region: Jian for signals (PPG, ECG, BP, RR), Yenna for medical meaning and thresholds, Jion for converters and the UI.

## Stack
- Frontend: React + Vite + TypeScript, Tailwind, Recharts, `@mediapipe/tasks-vision` (in the browser)
- Backend: Python 3.11, FastAPI, WebSockets, uvicorn
- PPG: NumPy, SciPy, NeuroKit2 or HeartPy (Jian's module `backend/app/ppg/`)
- ML: scikit-learn (Isolation Forest for anomalies, simple regression for "time to act")

## Repo layout
```
frontend/            React app
backend/app/         FastAPI app (main.py, ws.py, routers/)
backend/app/ppg/     Jian: signal processing, returns VitalsFrame
backend/app/rules/   status and escalation logic that reads thresholds.json
backend/data/        personas/, protocols/, thresholds.json, environments.json
docs/contracts.md    the JSON shapes below (source of truth)
```

## JSON contracts (do not change without telling the team)
VitalsFrame (WebSocket `/ws/vitals`, about 1 per second):
`{ "t": ISO8601, "hr": 72, "hrv_rmssd": 42, "spo2": 98, "rr": 14, "signal_quality": 0.92, "irregular": false, "source": "replay|sensor" }`

RegionStatus (GET `/api/status`):
`{ "region": "heart", "status": "green|yellow|orange|red", "score": 0-100, "trend": [numbers], "time_to_act_days": 12 | null, "reason": "Resting HR up 9 bpm over 7 days", "advice_level": "self|crew|surgeon_next|surgeon_now" }`

Protocol (`backend/data/protocols/<id>.json`):
`{ "id": "chest_pain", "title": "...", "steps": [{ "n": 1, "text": "...", "check": "optional yes/no question", "red_flag": false, "timer_s": null }], "red_flags": ["..."] }`

Thresholds (`thresholds.json`): per metric, `{ "hr_rest": { "yellow": [..], "orange": [..], "red": [..] } }`, plus `"source"` citations.

Environment (`environments.json`): `{ "id": "mars", "label": "Mars transit", "delay_s": [180, 1320], "advice_note": "..." }`

UnresponsiveEvent (frontend → backend POST `/api/events`; was CollapseEvent):
`{ "t": ISO8601, "type": "unresponsive_suspected|ok_confirmed|alarm", "signals": { "limb_motion": 0.01, "nbp": 0.9, "eyes_closed_s": 24, "pulse": "ok" } }` (also `checkin_started`, `monitoring_resumed`; see docs/contracts.md)

## Coding rules
- Keep components small. Make everything work with mock data before adding real logic.
- Every screen must render with the backend off, using fallback JSON in `frontend/src/mock/`.
- Show units and the data source on screen ("Simulated recording" badge for persona C).
- Language on screen: plain words for non-doctors. Say "several minutes of delay", not exact claims.
- Commit small and often with clear messages.
