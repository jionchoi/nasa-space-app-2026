# Jion: To-Do

Status as of Nov 13, 2026 (updated after the app-foundation work). Ordered by priority, as in the original list.
`[x]` done · `[~]` partly done (what's missing is listed under it) · `[ ]` not started.

## Summary: what's left

**Biggest gaps (core features not started):**
1. Unresponsive detection tuning on real people (the code is done: download the two model files, then tune on `/admin`).
2. Push the repo to GitHub so Jian and Yenna can clone (folders, LICENSE and README are ready; run the git commands).
3. Test with Wi-Fi off on the demo laptop.

**Quick wins:**

---

## App foundation (core)

- [~] **Repo and structure.** Done when: Jian and Yenna can clone and push.
  - [x] `frontend/`, `backend/`, `docs/`, `ml/`, `firmware/` (each with a README naming the owner), README with how to run
  - [x] Runtime data in `backend/data/`; large raw recordings in `data/raw/` (git-ignored); MIT `LICENSE`
  - [ ] `git init`, first commit, shared remote (GitHub), invite Jian and Yenna
- [~] **Data schema.** Done when: Jian and Yenna agree with it.
  - [x] Contracts in `docs/contracts.md`, matching pydantic models and TypeScript types
  - [x] Protocol step (with `on_yes` / `on_no` routing), environment, event log entry
  - [x] Indicator: region, unit, ranges (`thresholds.json`), escalation (`escalation.json`)
  - [x] Indicator: `unit` and `how_to_measure` for every metric (DRAFT text for Yenna)
  - [x] Alert as its own schema, owned by the backend (`app/alerts.py`, `/api/alerts`, `/ws/alerts`)
  - [ ] Review with Jian and Yenna (changes listed in `docs/contracts.md` under "Changes")
- [~] **FastAPI backend, fully offline.** Done when: the app runs with Wi-Fi off.
  - [x] Runs locally; fonts and icons bundled (no CDN); every screen works with the backend off (mock data)
  - [x] WebSocket channel `/ws/vitals` (replay of persona streams; speed and jump controls)
  - [x] Live/replay switch: `/ws/sensor` input (frames or raw samples), automatic fall-back to replay after 3 s, source chip and toast; `scripts/fake_sensor.py` to test without hardware
  - [x] Local storage: SQLite `backend/data/app.db` (events, daily checks, emergency logs, alerts, messages, forms, streaks); survives restart; reset on the hidden `/admin` page
  - [ ] Test with Wi-Fi off on the demo laptop
- [x] **Load medical content from JSON.** Changing a value in Yenna's file changes the app with no code change (covered by a test).

## Body map dashboard (core)

- [x] **Figure with 7 clickable regions.** Every region opens its panel.
  - [x] Full-body figure with a status dot per region; SVG figure as fallback
  - [x] Status as color plus word; region list buttons for keyboard users
  - [x] Status words from `backend/data/labels.json`: Nominal / Watch / Warning / Act now (change the file, every screen changes)
- [~] **Region panel.** Done when: each panel shows real persona data.
  - [x] What to do, who to tell (escalation ladder), what's happening, time to act, trend chart (30 days), what spaceflight does
  - [x] "All metrics" list (value, status, change vs 30-day baseline, sparkline; click to chart), 7 / 30 days toggle
  - [x] "How to measure" and "Source:" for the selected metric; PLACEHOLDER sources get an amber "Placeholder value" tag
- [x] **Live vitals on the map.** Heart and lungs update every second from the replay. Re-test once Jian's sensor feed is connected.
- [x] **Header.** One `AppHeader` on every screen: mission day, environment and Earth delay, persona, source chip, "On-board · offline", EMERGENCY button (compact version in emergency mode).

## Unresponsive crew member detection, CV + PPG (core; was "collapse detection")

- [~] **Body and face tracking.** Done when: pose and face landmarks run live from the webcam on the demo laptop.
  - [x] MediaPipe Pose (lite) and Face Landmarker (eye blink scores) in the browser, `@mediapipe/tasks-vision`, wasm copied by `npm install`
  - [x] Process on the device; store no video (privacy badge on the camera panel)
  - [ ] Download the two model files (commands in `docs/cv-explained.md`) and run it live on the demo laptop
- [x] **Unresponsive signals (microgravity).** Body-relative coordinates (`src/cv/torso.ts`): limb motion relative to the torso, smooth body drift, neutral body posture vs the person's working posture, eyes closed, staring, still hand from the PPG; weighted 0-1 (`signals.ts`, `posture.ts`, unit tests incl. 90/180 degree camera rotation).
  - [x] No gravity anywhere except the Moon-base fall signal
  - [ ] Check the neutral-body-posture numbers on real people floating / relaxed (Yenna; NASA TM-2003-104805 shows big differences between people)
- [x] **Three-step confirmation.** Never during sleep hours (`environments.json` sleep) or with nobody present (unit tests).
  - [x] Camera: unresponsive score high for `suspect_after_s` (25 s) outside sleep time
  - [x] Sensor: red flags in the live vitals shorten the wait to 10 s
  - [x] Check-in: "Are you OK? Tap, speak or move your hand." with a 15 s countdown; tap, key, voice, "I'm OK" or a purposeful hand movement (not body drift) cancels
  - [x] Pulse lost with the clip on (flat wave / no beats / HR red flag) skips the check-in: alarm + CPR, camera not needed
  - [x] Clip off only says "check the sensor"
  - [ ] Jian: send `pulse_amplitude`, `beats_detected`, `ppg_baseline` (see docs/cv-explained.md)
  - [x] Post `UnresponsiveEvent`s to `/api/events` on every state change
- [x] **Hand-off to emergency mode.** (Ready; the camera side calls it.) Done when: no response triggers the crew alarm and opens emergency mode at "Is the patient responsive?" already answered "no", with the event log started.
  - [x] `/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no` (old `collapse` id redirects) opens the microgravity protocol with "Does the crew member respond?" answered NO; `&goto=cpr` for a lost pulse
  - [x] Crew alarm: `triggerCrewAlarm(reason)` shows a flashing full-screen alarm with a Web Audio tone; "I'm responding" / "False alarm" (logged); test button on `/admin`
- [ ] **Tuning.** All three of you, two lighting setups, two camera angles, no false alarms during 10 minutes of normal sitting. Debug panel on `/admin` (sliders, Copy as JSON, demo trigger); start with `limb_motion_low`.
- [x] **Privacy note.** "On-device · no video stored · work modules only" on the camera panel.
- [ ] **Timings and wording.** Agree with Yenna.

## Emergency mode (core)

- [x] **Full-screen guided steps.** Chest pain (8 steps) and crew member not responding (8 steps, microgravity order) run end to end from JSON.
  - [x] One instruction at a time, big YES / NO buttons, readable from a distance
  - [x] CPR branch: 110 per minute metronome with sound, 30:2 counter, switch-rescuer timer, microgravity tips (DRAFT for Yenna)
- [x] **Live vitals strip, elapsed timer, time-stamped event log.** All three update during a run; the log also posts to `/api/events`.
- [x] **Red flags drive the protocol.** `red_flag_routes` in the protocols (DRAFT: pulse lost -> CPR, SpO2 critical -> oxygen step), flags defined in `thresholds.json`; 5 s countdown banner with Cancel, logged, never twice in 60 s.
  - [x] Emergency logs saved to SQLite with answers, messages and trigger; "Emergency handled" alert opens a read-only log view

## Escalation, environment and routine

- [~] **Escalation queue.** Done when: an urgent alert drafts the flight-surgeon message (vitals plus event log) and shows its arrival time.
  - [x] In emergency mode: draft built from the log, Send, arrival countdown per environment, simulated reply
  - [x] Messages saved to the database (`/api/messages`); alerts can link to a message draft (`message_draft_id`)
  - [x] Queue on the dashboard: orange/red areas get an automatic draft; "Messages" drawer to edit, send, simulated reply; red alerts get a banner with "Draft message"
- [x] **Environment switch.** ISS, Moon base and Mars transit change the delay, the advice text and the message status.
- [x] **Radiation replay.** Real DONKI event `2024-05-10T13:35:00-SEP-001` (dose simulated) replayed from `/admin`: radiation Act now, shelter alert and advice per environment, countdown; the old spike day is kept only as a fallback.
- [x] **Daily routine screen.** Prepare, seated PPG (2 min), stand test (1 min), temperature and glucose (°C, mmol/L or mg/dL, skippable), reaction test, questions (incl. optional SANS eyesight question), summary vs personal baseline.
- [x] **Reaction-time test.** 3 minutes (plus a labelled 1-minute demo), random 2-10 s gaps, median, lapses over 500 ms, false starts, vs personal baseline; feeds brain and mood; also standalone at `/reaction`.
- [ ] **Forms, reminders, streak.** Check-in, meal log and weekly biomarker forms save; a streak counter shows.
  - [x] Check-in questionnaire (part of the daily check, saved to the database)
  - [x] Generic forms storage (`/api/forms`) and a streak counter (Today card, missions card, header)
  - [x] Meal log (water feeds hydration), exercise log, weekly biomarkers (body mass change feeds metabolism), all in SQLite
  - [x] Daily missions card (check, meals, water vs target, exercise) and reminders from the mission schedule, with a demo clock jump
- [x] **Cabin CO2 feed.** Simulated 24 h profile (`/api/cabin`), Cabin panel, CO2 in the lungs metrics, CO2 note on headache / poor-sleep reasons.

## Demo readiness

- [ ] Everything runs on the demo laptop with Wi-Fi off
- [~] Fallbacks
  - [x] No backend → mock data with "Offline: mock data" badge
  - [x] No sensor → persona replay (replay is the only source today)
  - [x] Switch automatically from sensor to replay when the sensor is unplugged
  - [ ] Recorded runs (screen recordings) of every scenario, including unresponsive detection and a lost pulse
- [ ] Pack: laptop, chargers, webcam, sensors and spares, ESP32, cables, thermometer and glucometer props, backup USB
- [~] Clean repo and README
  - [x] How to run, folder layout, data sources (`docs/resources.md`)
  - [x] LICENSE file (MIT)
  - [ ] Replace PLACEHOLDER thresholds and DRAFT protocols with Yenna's reviewed versions

## Stretch

- [ ] CPR feedback: count compressions per minute from wrist motion
- [ ] Camera reads a glucometer or BP cuff display
- [ ] Animated how-to-measure guides
- [ ] ZK-verified summary to the flight surgeon

## Waiting on teammates

- **Yenna:** real values for `thresholds.json` (all PLACEHOLDER), review of both protocols, `cpr.json` microgravity CPR details, `questionnaire.json`, the "what spaceflight does" text in `regions.json`, persona physiology in `backend/scripts/make_personas.py`.
- **Jian:** `compute_vitals()` in `backend/app/ppg/` (the adapter that turns a recording into a stream is ready), and the live sensor feed into `/ws/vitals`.
