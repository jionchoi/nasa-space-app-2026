# JSON contracts (do not change without telling the team)

> **Covers:** the Demo-mode app: persona replay and `/ws/vitals`, the `/api/*` endpoints, status, alerts, protocols and the JSON data files. Measured and research PPG signals (`/api/v2/*`, `/ws/v2/*`) are in [contracts-v2.md](contracts-v2.md).

Copied from `.claude/CLAUDE.md`. Types: `frontend/src/types/contracts.ts`, `backend/app/models.py`.

VitalsFrame (WebSocket `/ws/vitals`, about 1 per second):
`{ "t": ISO8601, "hr": 72, "hrv_rmssd": 42, "spo2": 98, "rr": 14, "signal_quality": 0.92, "irregular": false, "source": "replay|sensor" }`
Optional (Nov 13): `"pulse_amplitude": 0.8, "beats_detected": 1, "ppg_baseline": 0.62` (see Changes).

RegionStatus (GET `/api/status`):
`{ "region": "heart", "status": "green|yellow|orange|red", "score": 0-100, "trend": [numbers], "time_to_act_days": 12 | null, "reason": "Resting HR up 9 bpm over 7 days", "advice_level": "self|crew|surgeon_next|surgeon_now" }`

Protocol (`backend/data/protocols/<id>.json`):
`{ "id": "chest_pain", "title": "...", "steps": [{ "n": 1, "text": "...", "check": "optional yes/no question", "red_flag": false, "timer_s": null, "on_yes": "next", "on_no": "cpr" }], "red_flags": ["..."] }`

Thresholds (`thresholds.json`): per metric, `{ "hr_rest": { "yellow": [..], "orange": [..], "red": [..] } }`, plus `"source"` citations.
How to measure, why we check and the equipment are in `measurements.json` (Changes, Nov 14).

Environment (`environments.json`): `{ "id": "mars", "label": "Mars transit", "delay_s": [180, 1320], "advice_note": "..." }`
(the surface rover adds optional `planet`, `planets`, `distance_to_base`, `medical_kit`, `kit_notes`, `estimated_data`: see Changes, Nov 14).

UnresponsiveEvent (frontend → backend POST `/api/events?persona=&env=`; was CollapseEvent):
`{ "t": ISO8601, "type": "unresponsive_suspected|checkin_started|ok_confirmed|alarm|monitoring_resumed", "signals": { "source": "cv", "limb_motion": 0.01, "body_drift": 0.02, "nbp": 0.9, "eyes_closed_s": 24, "score": 0.85, "pulse": "ok|lost|clip_off|no_data", "from": "CHECK_IN", "to": "ALARM", "reason": "...", "text": "..." } }`
Other senders use the same event: `source: "crew_alarm"` (`origin`, `reason`, `text`) and `source: "emergency"`
(`protocol`, `kind`, `text`). An `alarm` with `source: "cv"` also creates an alert (red = Act now, region heart,
source cv) with a drafted message; the response is `{ "ok": true, "alert_id": "..." | null }`.

## Changes

### Nov 15, 2026 (v4 UI redesign; all additions optional, nothing removed)

- **Environment: optional `subtitle`** (also on each `planets` entry), e.g. `"Low Earth orbit · microgravity"`. Shown under
  the location name in the v4 sidebar.
- **regions.json `lungs.context_metrics`** adds `cabin_temp_c` and `cabin_rh_pct` (context only, never used for status).
  thresholds.json gets a label-only `cabin_rh_pct` entry (no bands, PLACEHOLDER) and measurements.json a TODO(Yenna) entry.
- **cpr.json: optional `rate_range_per_min`** `[100, 120]`: limits for the CPR metronome rate stepper.
- **Forms: new validated kind `mood`** `{ "mood": 1-10, "symptoms": ["headache", ...], "notes": "" }` (log drawer
  "Mood and symptoms"). Display and timeline only; it does not change any status.
- **New endpoints (optional "Polish wording" in the Inbox):** `GET /api/assist/status` -> `{ "available": bool }`
  (true only with `ANTHROPIC_API_KEY` set on the backend and the internet reachable; the key is never returned) and
  `POST /api/assist/polish` `{ "text" }` -> `{ "text", "model" }`, or 503 when unavailable. The app never needs it.
- **Frontend only:** the Inbox's message to the flight surgeon is built from a rule-based template
  (`frontend/src/lib/surgeonDraft.ts`) and sent through the existing `POST /api/messages` + `/send`.

- **ProtocolStep: added `on_yes` and `on_no`** (optional). They say where a YES / NO answer to `check` goes:
  `"next"`, a step number, or `"cpr"` (opens the CPR guide). Missing means `"next"`.

### Nov 14, 2026 (real NASA OSDR data: RadLab dose rate by location, EDA ISS cabin telemetry)

All additions; no existing field was removed except `estimated_data` on the rover (now unused, still accepted).
- **Environment `radiation_feed`** `{ "file": "space_weather/dose_<loc>.json", "estimate": "<dose_estimates key>" }` on
  `iss`, `moon`, `mars` and on each rover planet (`planets.moon.radiation_feed`, `planets.mars.radiation_feed`). A location
  only reads its own file: ISS readings are never shown under another location.
- **Dose file** (`data/space_weather/dose_iss.json`, `dose_mars_surface.json`; `dose_moon.json` / `dose_mars_transit.json`
  if added), written by `scripts/import_nasa_env.py`: `{ "kind": "real", "location", "place", "badge", "note",
  "instrument", "instrument_id", "spacecraft", "module", "quantity", "units": { "dose_rate": "µGy/h", "accumulated_dose":
  "µGy", "daily_mgy" }, "unit_source", "source", "source_url", "portal", "raw_file", "raw_span", "window": { "start",
  "end", "days" }, "step_s", "filled_bins", "daily_mgy": [..], "points": [{ "t", "dose_rate", "accumulated_dose" }] }`.
- **thresholds.json `dose_estimates`** (DRAFT, Yenna): `{ "unit": "µGy/h", "moon_surface" | "mars_transit" |
  "mars_surface": { "label", "dose_rate", "source" } }`. Not a metric (no bands).
- **Radiation** `GET /api/radiation` adds `"mission_dose_simulated": true` and `"feed": null | { "kind": "real|estimated",
  "badge", "place", "note", "instrument", "source", "source_url", "unit", "unit_source", "quantity", "draft",
  "replay_label", "window", "measured_at", "dose_rate_now", "today_mgy", "daily_mgy": [30], "total_30d_mgy",
  "last_24h": [{ "t", "dose_rate" }] }`. `feed` is null when the location has neither a file nor an estimate (old
  simulated persona dose only). The DONKI `event` is unchanged and applies at every location.
- **Cabin** `data/cabin.json` is now real ISS telemetry `{ "kind": "real", "badge", "mission", "source_urls", "units",
  "window", "replay_note", "location_note", "step_min": 15, "points": [{ "t", "co2_ppm", "temp_c", "rh_pct" }] }`; the
  old simulated profile moved to `data/cabin_simulated.json` (fallback). `GET /api/cabin` adds `kind`, `badge`,
  `mission`, `source_urls`, `units`, `replay_note`, `location_note`, `fields`; points may have `rh_pct` and
  `measured_at`, and `noise_dba` only with the simulated fallback. `status` only has the fields present.
- **Solar event per location**: `event.json` adds `dose_note` ("dose simulated; timing from real DONKI event"),
  `dose_curve_note`, `location_scale` `{ "iss": 1, "moon": 5, "rover:moon": 5, "mars": 10, "rover:mars": 3, "default": 1 }`
  (DRAFT, looked up like the advice texts) and `location_reason` (same keys, plain-words text). The `dose_curve` is now
  the ISS reference (peak about 0.15 mSv/h). `GET /api/radiation` `event` adds `location_scale`, `location_reason`,
  `dose_note`; `dose_rate_msv_h` and `event_dose_msv` are for the `env` asked for. `GET /api/status?env=` uses the same
  dose in the radiation reason. The replay itself is global (all locations at once).
- **Yenna's medical text** (`docs/medical/`, merged by `backend/scripts/merge_medical.py`): regions add
  `space_effect` (with `[REF-xx]` ids; replaces `spaceflight_note` on screen, which is kept as a fallback) and `refs`
  `{ "REF-01": { "status": "ok|pending", "citation" } }`. measurements.json entries may add `equipment` (string) and
  `app_fix` (why the text was changed to match the app); `draft` marks placeholders. guidance.json items no longer
  carry a `draft` key; the DRAFT tag comes from a "DRAFT:" prefix in her text.
- **Sources** entries add `name`, `agency`, `use` (`replay|test|thresholds|reference`), `status_note`, `owner`,
  `licence`, `validation` `{ "label", "value" }` and `url_note`; the file adds `uses` (what each use means). "TO FILL IN"
  marks a value a team member still has to add. The README "Data" table is generated from this file (between the
  `<!-- sources-table -->` markers).
- **UnresponsiveEvent signals match what the frontend sends** (backend `EventSignals`): `source` (`cv` |
  `crew_alarm` | `emergency`), `limb_motion`, `body_drift`, `nbp`, `eyes_closed_s`, `score`, `pulse` (`ok` | `lost` |
  `clip_off` | `no_data`), `from`, `to`, `reason`, `text`, `origin`, `protocol`, `kind`. The old `motion` and
  `posture` fields are gone (nothing sent them). Unknown extra fields are still accepted. `POST /api/events` takes
  `env` too; a camera `alarm` (`source: "cv"`) creates an Act now alert (region heart, source `cv`, link to the
  unresponsive protocol) and a drafted flight-surgeon message for that location.
- **Fall detection where there is gravity**: `thresholds.json` `cv.fall.environments` is `["moon", "rover:moon",
  "rover:mars"]` (was `["moon"]`); ISS and Mars transit stay microgravity-only.
- **Crew reference** `GET /api/crew-reference` -> `backend/data/crew_reference_osd575.json` `{ "source", "dataset",
  "licence": "CC0", "url", "file", "crew": [{ "id", "sex" }], "timepoints", "timepoint_note", "display": { "pre_flight",
  "post_flight" }, "mgdl_per_mmol", "analytes": { "glucose" | "sodium" | "potassium": { "name", "label", "units",
  "range": [min, max], "values": { "<crew id>": { "<timepoint>": "<value as in the file>" } } } } }`. Reference only;
  not read by any status rule.
- **RegionStatus adds `metric_status`** `{ "<metric>": "green|yellow|orange|red" }` (additive): the status of each of the
  region's metrics that has a value today, judged by the backend (bands plus the personal reaction-time rule). The
  dashboard's "All metrics" list colours its dots from this (cabin rows from `GET /api/cabin` `status`); the browser no
  longer judges daily metrics against thresholds.json itself.
- **Reaction test (PRET norms)**: new metric `pvt_lapse_rate_pct` (%) replaces `pvt_lapses` in regions, thresholds,
  measurements and persona daily entries. `PvtResult` adds `lapse_rate_pct` (filled from lapses / n if missing);
  `median_ms` is the median of hits. A `version: "demo"` result is stored but never feeds the daily values or status.
  questionnaire.json `pvt`: `lapse_ms` 355 (was 500), new `hit_max_ms` 500 and `false_start_ms` 100. thresholds.json:
  bands on `pvt_median_ms` / `pvt_lapse_rate_pct` = PRET 90th (yellow) / 97.5th (orange) percentiles, no red; new
  `"pvt"` rules table `{ "norms_file", "baseline_slower_pct": 15, "min_baseline_days": 7, "watch_above_percentile",
  "warning_above_percentile", "act_now": null, "act_now_note" }`. `GET /api/pvt-norms` -> `backend/data/pvt_norms.json`
  `{ "source", "licence", "licence_url", "url", "test", "lapse_rule", "lapse_ms", "metrics", "exclusion_rule",
  "excluded": [{ "subject", "reason" }], "n", "n_sessions", "percentiles": { "median_rt_ms" | "lapse_rate_pct":
  { "p50", "p90", "p97_5" } }, "distribution": { "median_rt_ms": [...], "lapse_rate_pct": [...] } }`.
- **Sources** `GET /api/sources` -> `data/sources.json` `{ "sources": [{ "id", "status": "real|estimated|simulated",
  "title", "badge", "provider", "what", "used_for", "locations", "units", "unit_source", "location_note", "file",
  "converter", "draft", "urls" }] }`. Frontend page `/sources`.

### Nov 15, 2026 (fixes after the PPG review, docs/ppg-review.md)

- **thresholds.json `plausible`** (new table, not a metric) `{ "hr": [25, 220], "spo2": [null, 100] }`: values outside are a
  measuring error: shown as "Invalid", never judged, never a red flag, an alert or part of the daily check.
- **thresholds.json** `cv.ppg.no_pulse_s` 5 -> **4**; `red_flags.pulse_lost` gains `keywords` (`["no pulse", "pulse lost"]`):
  an active red flag lights the matching protocol red-flag text.
- **regions.json `baseline`** `{ "first_days": 14 }`: "your usual" (vitals row, metric list, daily-check comparison) is the
  median of the first 14 daily entries (pre-flight baseline), frozen. The reaction-time status rule keeps its own baseline.
- **Lost pulse (Demo mode)**: the Act now pop-up opens on its own, camera or not; the camera detector still skips "Are you
  OK?" but no longer raises the crew alarm or jumps to CPR for a lost pulse. "Open emergency mode" goes to
  `/emergency?protocol=unresponsive&trigger=alarm&preanswer=responsive:no` (no `goto=cpr`); emergency mode treats the
  monitor's lost pulse as the `pulse_lost` red flag, whose route offers CPR after the 5 s countdown (Cancel possible).
- **UnresponsiveEvent**: an `alarm` with `signals.pulse = "lost"` is also logged when the Act now pop-up opens for a lost
  pulse with detection off.

### Nov 14, 2026 (challenge gaps: blood pressure, guidance, measurements, surface rover)

All new texts are DRAFT placeholders (Yenna reviews). No medical text or number is in a component.

- **Blood pressure in the daily check.** `POST /api/check` accepts optional `bp_sys` (60-250) and `bp_dia` (30-150), mmHg,
  both or neither, bottom lower than top (else 422). They go into today's daily entry as `bp_sys` / `bp_dia` and into
  `daily_checks.answers`. Skipped: carried forward like other fields. Typing-mistake limits are in questionnaire.json
  `entry_limits.bp_sys` / `entry_limits.bp_dia`.
- **thresholds.json**: new metrics `bp_sys`, `bp_dia` (PLACEHOLDER ranges). **`how_to_measure` is removed from every
  metric**: thresholds.json now keeps only `label`, `unit`, bands, `keywords` and `source` (`unit` still required).
- **regions.json**: the heart region's `metrics` add `bp_sys`, `bp_dia` (not in `daily_fields`, so the "unusual for you"
  check is unchanged). Every region adds `function`: one plain sentence on what the body part or system does (DRAFT).
- **Persona daily entries** add `bp_sys`, `bp_dia` (persona B drifts slightly upward; no other value changed).
- **Weekly biomarkers form**: `bp_sys` / `bp_dia` removed (`{ "body_mass_kg", "notes" }`); old bp fields are ignored.
- **measurements.json (new)**, `GET /api/measurements`: `{ "metrics": { "<metric>": { "how_to_measure": ["..."],
  "why_check": "...", "can_do_in_space": { "possible": true, "note": "..." }, "draft": "..." } } }`, one entry for every
  metric in thresholds.json (same key; a test fails if one is missing).
- **guidance.json (new)**, `GET /api/guidance`: `{ "status_keys": { "green": "nominal", "yellow": "watch", "orange":
  "warning", "red": "act" }, "regions": { "<region>": { "<nominal|watch|warning|act>": { "summary", "self_care": [..],
  "tell_crew", "contact_surgeon", "prevention": [..], "draft" } } } }`. Shown on the region Overview ("What to do",
  "How to stay healthy"). The escalation ladder and its advice per environment stay in escalation.json.
- **Form kind `self_care`** (validated): `{ "region", "status": "green|yellow|orange|red", "ticked": ["..."] }`, the
  self-care items ticked today; the latest one per region and status counts.
- **Environment: surface rover** (`id: "rover"`). New optional fields: `planet` (default planet), `planets`
  `{ "moon" | "mars": { "label", "delay_s", "advice_as", "advice_note" } }`, `distance_to_base` `{ "km", "drive_min", "note" }`,
  `medical_kit: "full" | "limited"`, `kit_notes` `{ "<equipment>" | "default": "..." }`, `estimated_data` (`["radiation",
  "cabin"]`: shown as "Estimated"), `draft`. `GET /api/environments` leaves out fields that are not set.
- **Env key `rover:<planet>`.** Wherever an `env` is passed (`/api/status`, `/api/check`, messages, `/api/delivery/{env}`,
  `/api/radiation`), `"rover:moon"` / `"rover:mars"` picks the planet (`"rover"` alone uses the default). The delay comes
  from the planet; per-environment texts are looked up as `rover:mars`, then `rover`, then the planet's `advice_as`
  (`mars`), so the escalation advice text per environment is unchanged. `GET /api/environments/{env}` returns one
  location resolved (with `key`, `planet`, `planet_label`, `advice_as`).
- **escalation.json `extra_steps`** `{ "rover": [{ "id": "return_base", "label": "Return to base", "after": "crew",
  "advice": "..." }] }`: an extra ladder step for one location. Display only; `advice_level` values are unchanged.
- **ProtocolStep: optional `equipment`** (e.g. `["oxygen"]`). With a limited kit the step shows the location's
  `kit_notes` ("Limited kit on the rover: ...").
- **space_weather/event.json `advice`** adds a `rover` text (also in scripts/fetch_donki.py).

### Nov 13, 2026 (app foundation)

- **Status words are data.** `backend/data/labels.json` `{ "green": "Nominal", "yellow": "Watch", "orange": "Warning",
  "red": "Act now" }`, served at `GET /api/labels`. Every screen uses these words; no status word is hard-coded.
- **Indicator (thresholds.json): `unit` and `how_to_measure` are required for every metric.** (Nov 14: `how_to_measure`
  moved to measurements.json.)
  `{ "hr_rest": { "label": "...", "unit": "bpm", "how_to_measure": ["step 1", "step 2"], "yellow": [..], ... } }`.
  Steps are plain language, marked DRAFT until Yenna reviews them.
- **Alert (new, owned by the backend).** `GET /api/alerts?persona=A`, `POST /api/alerts/{id}/ack`, pushed on `WS /ws/alerts`:
  `{ "id": "a1b2c3", "t": ISO8601, "level": "yellow|orange|red", "region": "heart" | null, "metric": "hr" | null,
  "message": "...", "source": "rules|vitals|emergency|cv", "acknowledged": false, "message_draft_id": null, "persona": "A" }`.
  `persona` is an addition to the agreed shape (alerts belong to a crew member). Created when a region turns
  yellow/orange/red or gets worse (`rules`), when a live vital enters the red range (`vitals`, ignored when the signal
  is poor), and when an emergency log is saved (`emergency`). `cv` is reserved for collapse detection.
  `/ws/alerts` messages: `{ "type": "snapshot", "alerts": [...] }` on connect, then `{ "type": "alert" | "ack" | "update", "alert": {...} }`.
- **`/ws/vitals` control message.** Besides VitalsFrames it now sends `{ "type": "source_changed", "source": "sensor" | "replay" }`
  when it switches (and once on connect). Frames never have a `type` field.
- **`WS /ws/sensor` (new input).** Send a VitalsFrame (`t` and `source` optional) or raw samples `{ "samples": [...], "fs": 100 }`.
  Raw samples are buffered in 10 s windows for `compute_vitals(signal, fs)`. Sensor frames win while one arrived in the last 3 s.
- **Local storage (SQLite `backend/data/app.db`).** Tables: events, daily_checks, emergency_logs, alerts, messages, forms,
  streaks. New endpoints: `POST/GET /api/emergency-logs`, `POST/GET /api/messages`, `POST/GET /api/forms` (generic
  `{ "persona", "kind", "data": {...} }`), `GET /api/daily-checks`, `GET /api/streaks/{persona}`, `GET /api/admin/summary`,
  `POST /api/admin/reset` (clears the database only, never the JSON files). `POST /api/events` accepts `?persona=`.

### Nov 13, 2026 (escalation queue, radiation replay, cabin)

- **Message** (table `messages`, shared service `app/messaging.py`): `{ "id", "persona", "t", "env", "text",
  "status": "draft|sent|delivered|replied", "delay_s", "alert_id", "region", "source": "alert|emergency|manual",
  "sent_at", "reply", "replied_at", "updated_at", "status_text" }`. When a region turns orange or red the backend
  creates the alert AND a draft (`alert.message_draft_id` points to it). Endpoints: `GET /api/messages?persona=`,
  `POST /api/messages`, `PATCH /api/messages/{id}` (drafts only), `POST /api/messages/{id}/send` `{ "env" }`,
  `POST /api/messages/{id}/reply` (demo: simulated reply), `POST /api/alerts/{id}/draft` `{ "env" }`,
  `GET /api/delivery/{env}` -> `{ "env", "delay_s", "status_text" }` (delay = midpoint of the environment's range).
- **Radiation** `GET /api/radiation?persona=&env=` -> `{ "daily": [{ "day", "msv" }], "today_msv", "mission_total_msv",
  "limit_msv", "status", "unit", "event": null | { "sep_id", "sep_time", "link", "instruments", "flare", "started_at",
  "ends_at", "remaining_s", "dose_rate_msv_h", "event_dose_msv", "alert", "advice", "simulated_dose": true, "note" },
  "event_available", "fallback_spike_used" }`. Demo control `POST /api/radiation/replay` `{ "action": "start|stop", "minutes" }`.
  The event comes from `data/space_weather/event.json` (real DONKI ids, times and link; simulated dose curve).
- **Cabin** `GET /api/cabin` -> `{ "simulated": true, "source", "now": { "t", "minute", "co2_ppm", "temp_c", "noise_dba" },
  "status": { "co2_ppm", "temp_c", "noise_dba" }, "last_24h": [...], "co2_high_hours_24h", "co2_watch_ppm" }`.
  VitalsFrame is unchanged.
- **regions.json**: optional `context_metrics` per region (cabin values shown with the region, not used for its status)
  and `co2_context` (when CO2 was above the watch level for `min_hours_high` hours, its `text` is added to the reason of
  the listed regions that are not green or report a listed symptom).
- **thresholds.json**: new metrics `co2_ppm`, `cabin_temp_c`, `cabin_noise_dba` (all PLACEHOLDER).
- **Persona files**: the simulated solar-spike day is no longer in `daily`; it is kept as `solar_spike_fallback`
  `{ "day", "msv" }` and applied only when `event.json` is missing.

### Nov 13, 2026 (emergency mode: red-flag routes, collapse-detection hand-off, saved logs)

- **Protocol: optional `red_flag_routes`** `[{ "flag": "pulse_lost|hr_very_low|hr_very_high|spo2_critical", "goto": <step n> | "cpr",
  "message": "Pulse lost", "countdown_s": 5 }]`. When a routed flag fires during the protocol, a full-width banner counts
  down ("Pulse lost: going to CPR in 5 s") with a Cancel button; if not cancelled, the protocol jumps and the log says
  "auto-advanced by red flag <flag>". The same flag never auto-advances (or asks again) within 60 s.
- **thresholds.json `red_flags` table** defines the flags (no numbers in code): `{ "pulse_lost": { "label", "metric": "hr",
  "below": 38, "for_s": 3, "min_signal_quality": 0.6, "source" } }` (`below` or `above`). A flag is active when the
  condition held for `for_s` seconds with a usable signal. All PLACEHOLDER (Yenna reviews).
- **ProtocolStep: optional `key`**, a stable name for a step (e.g. `"responsive"`, `"oxygen"`). Collapse step 1 is now
  "Does the crew member respond?" (`key: "responsive"`); both protocols gained a DRAFT oxygen step (chest pain renumbered to 9 steps).
- **Collapse-detection hand-off URL**: `/emergency?protocol=collapse&trigger=cv&preanswer=responsive:no` starts the
  protocol with that step answered NO, logged "(answered by collapse detection)", and moves on to the next step.
  `trigger` is `crew` (default), `cv` or `alarm`.
- **Crew alarm (frontend)**: `triggerCrewAlarm(reason, { location?, emergencyUrl?, source? })` in `src/lib/crewAlarm.ts`
  (also `window.triggerCrewAlarm`). Logs `POST /api/events` type `alarm`; "False alarm" logs type `ok_confirmed`.
- **EmergencyLogIn** adds `answers` `{ "<n>": { "question", "answer", "by": "crew|collapse detection" } }`, `messages`
  (flight-surgeon messages sent during the emergency) and `trigger`. `GET /api/emergency-logs/{id}` returns one log.
- **Alert: optional `link`** (app page with details). "Emergency handled at HH:MM" alerts link to `/emergency/log/<id>`,
  a read-only log view.

### Nov 13, 2026 (daily routine: temperature, glucose, reaction test, forms, missions, reminders)

- **Daily check** (`POST /api/check`) accepts optional `temp_c` (30-43), `glucose_mmol` (1-33.3, the app converts mg/dL)
  and `pvt` `{ "median_ms", "lapses", "false_starts", "n", "duration_s", "version": "full|demo", "reaction_ms": [...] }`.
  They go into today's entry as `temp_c`, `glucose_mmol`, `pvt_median_ms`, `pvt_lapses`. The check's answers are saved
  in `daily_checks.answers`.
- **Persona daily entries** add `pvt_median_ms` and `pvt_lapses`; persona files add `body_mass_start_kg`.
- **thresholds.json**: new metrics `temp_c` (immune), `glucose_mmol` (metabolism), `pvt_median_ms` and `pvt_lapses`
  (brain and mood), and a `daily_targets` table `{ "water_l", "meals", "exercise_min" }` for the missions (all PLACEHOLDER).
- **questionnaire.json**: optional SANS question `vision` (brain and mood, DRAFT; questions may have `"optional": true`),
  `entry_limits` (typing-mistake limits, not medical ranges) and `pvt` timings.
- **Forms** (`POST /api/forms`): known kinds are validated: `meal` `{ "meal_type", "size", "water_l", "notes" }`,
  `exercise` `{ "minutes", "type", "notes" }`, `biomarkers` (weekly) `{ "body_mass_kg", "bp_sys", "bp_dia", "notes" }`,
  `pvt` (a standalone reaction test). Today's water feeds hydration, exercise minutes feed exercise, body mass feeds
  body-mass change (vs `body_mass_start_kg`) and a standalone reaction test feeds brain and mood
  (`app/daily_log.py` puts them into the latest daily entry).
- **Missions** `GET /api/missions?persona=` -> `{ "missions": [{ "id": "daily_check|meals|water|exercise", "label", "done",
  "detail", "action" }], "targets", "today", "streak" }`. Behaviour only, never health results.
- **environments.json** adds `schedule` (reminders at mission time GMT: `{ "id", "time": "HH:MM", "text", "action", "mission" }`),
  `sleep` `{ "start", "end" }` (for collapse detection later) and `clock`.

### Nov 13, 2026 (collapse detection -> unresponsive crew member detection)

Microgravity rework: an unconscious astronaut floats instead of collapsing, so the feature and every name changed.

- **CollapseEvent -> UnresponsiveEvent.** `type`: `unresponsive_suspected` (was `collapse_suspected`), `checkin_started`,
  `ok_confirmed`, `alarm`, `monitoring_resumed`. The backend rejects the old `collapse_suspected` (422). `signals` now
  carries `source: "cv"`, `limb_motion`, `body_drift`, `nbp`, `eyes_closed_s`, `score`, `pulse`, `from`, `to`, `reason`, `text`.
- **Protocol id `collapse` -> `unresponsive`** (`backend/data/protocols/unresponsive.json`, title "Crew member not
  responding", 8 DRAFT microgravity steps: stop the drift and restrain first, then airway, breathing, pulse, CPR).
  `GET /api/protocols/collapse` still returns it, and `/emergency?protocol=collapse` redirects in the app.
- **Emergency URL** adds `goto=cpr` (or a step number): opens CPR right after the pre-answer. ~~A lost pulse uses
  `/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no&goto=cpr`.~~ (Nov 15: a lost pulse no longer jumps
  straight to CPR; see the Nov 15 entry.)
- **VitalsFrame, optional fields** (old senders may leave them out): `pulse_amplitude` (pulse wave height, AC part, same
  unit every frame), `beats_detected` (heartbeats found in this frame's second), `ppg_baseline` (steady light level,
  DC part). The persona replay now includes them; persona C's pulse goes flat about 515 s into the recording.
- **Persona field** `collapse_s` -> `unresponsive_s`.
- **thresholds.json "cv"** replaced (gravity keys `motion_low`, `motion_spike`, `head_drop_ratio`, `limp_threshold` and the
  stillness/eyes/head weights are gone): `limb_motion_low`, `limb_motion_spike`, `motion_step_s`, `landmark_visibility`,
  `eyes_closed_score`, `stare_after_s`, `nbp {...}`, `drift {...}`, `unresponsive_threshold`, `suspect_after_s`,
  `suspect_after_s_with_red_vitals`, `checkin_countdown_s`, `voice_level`, `voice_min_s`, `cooldown_s`, `window_s`,
  `calibration_s`, `weights {limb_stillness, nbp, eyes, drift, stare, still_hand}`, `ppg {...}`, `fall {...}` (Moon only).
  All PLACEHOLDER; explained in `docs/cv-explained.md`.

### Nov 13, 2026 (collapse detection with the camera) (superseded by the entry above)

- **CollapseEvent `type`** adds `checkin_started` and `monitoring_resumed`: collapse detection posts one event per state
  change (`collapse_suspected`, `checkin_started`, `ok_confirmed`, `alarm`, `monitoring_resumed`). `signals` adds
  `source: "cv"`, `head_drop`, `limpness`, `from`, `to`, `reason`, `text` (numbers only, never images).
- **thresholds.json** adds a `"cv"` block: `motion_low`, `motion_spike`, `eyes_closed_score`, `head_drop_ratio`,
  `limp_threshold`, `suspect_after_s`, `suspect_after_s_with_red_vitals`, `checkin_countdown_s`, `cooldown_s`, `window_s`,
  `calibration_s`, `weights {stillness, eyes, head}`, `fall {environments, hip_drop_speed, still_after_s}` (all PLACEHOLDER).
  Explained in `docs/cv-explained.md`.

## How the contracts are filled in (no shape changes)

- **Threshold bands** are `[low, high]`: a value below `low` or above `high` is at least that status; `null` means
  no limit on that side; the worst status wins. Each metric may also carry `label`, `unit`, `source`, and
  `keywords` (words that link a live vital to a protocol red-flag text).
- **RegionStatus.time_to_act_days** is `0` when the region is already orange or red ("act now").
- **RegionStatus.reason** ends with "Unusual for you today." when the anomaly check flags the day (kept in the
  text so the contract has no new field).
- **Emergency log entries** are posted to `/api/events` as `type: "alarm"` with the details in `signals`:
  `{ "source": "emergency", "protocol": "chest_pain", "kind": "step|answer|timer|vital|cpr|message|start|end", "text": "..." }`.
- **Protocol files** may carry `"draft": "DRAFT - Yenna reviews"`, shown as a badge.

## Persona (`backend/data/personas/<id>.json`)

```
{ "id": "A", "name": "...", "description": "...", "simulated": true, "mission_day": 45,
  "event_start_s": 180, "collapse_s": 480,          // persona C only
  "daily":  [ 30 x { "day": 1, "hr_rest", "hrv_rmssd", "spo2", "rr", "stand_hr_rise", "sleep_h",
                     "mood": 1-5, "stress": 1-5, "symptoms": [], "hydration_l", "exercise_min", "radiation_msv",
                     "pvt_median_ms", "pvt_lapses", "bp_sys", "bp_dia" } ],
  "stream": [ 600 x VitalsFrame at 1 Hz ] }
```

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{"ok": true}` |
| GET | `/api/status?persona=A&env=iss` | 7 RegionStatus |
| GET | `/api/personas` | persona list without `daily` and `stream` |
| GET | `/api/persona/{id}/daily` | daily entries plus derived `exercise_min_7d`, `radiation_total_msv`, `symptoms_immune` |
| POST | `/api/persona/{id}/reset` | drops today's daily check (database and memory) |
| GET | `/api/protocols/{id}` | Protocol |
| GET | `/api/environments`, `/api/thresholds`, `/api/regions`, `/api/escalation`, `/api/questionnaire`, `/api/cpr`, `/api/guidance`, `/api/measurements` | the JSON file |
| GET | `/api/environments/{env}` | one location, resolved (`rover:mars` gets the Mars delay and note) |
| POST | `/api/events?persona=` | accepts CollapseEvent, stores it, `{"ok": true}` |
| GET | `/api/events?persona=` | the stored event log (SQLite) |
| POST | `/api/check?env=iss` | body `{persona, seated_frames, stand_frames, answers}`; returns `{day, summary, comparison, before, after, changed, advice, notes}` |
| WS | `/ws/vitals?persona=A&speed=1&start=0` | VitalsFrame about once per second, plus `source_changed` messages. Client may send `{"posture": "stand"\|"sit"}` (replay simulation only) |
| WS | `/ws/sensor` | input from the sensor (VitalsFrame or raw samples) |
| WS | `/ws/alerts?persona=A` | alert snapshot, then new / acknowledged alerts |
| GET | `/api/labels` | status words |
| GET / POST | `/api/alerts`, `/api/alerts/{id}/ack` | alerts |
| GET / POST | `/api/emergency-logs`, `/api/messages`, `/api/forms` | stored records |
| GET | `/api/daily-checks`, `/api/streaks/{persona}` | stored records |
| GET / POST | `/api/admin/summary`, `/api/admin/reset` | admin (hidden `/admin` page) |
| GET / POST | `/api/assist/status`, `/api/assist/polish` | optional "Polish wording" (backend key only; hidden when unavailable) |
