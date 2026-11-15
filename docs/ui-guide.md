# Astronaut Health Co-Pilot: UI guide

A plain guide to every screen, for the team. Updated for the **v4 redesign** (design-handoff/v4) on Nov 15, 2026.
The full row-by-row list of what exists and where it lives now is `docs/v4-feature-checklist.md`.

**How to read the "Data" columns**

- **Real**: real measured data, such as NASA, CSA or Inspiration4 files, or a live sensor.
- **Simulated**: the simulated scenarios (A, B, C), or a simulated curve.
- **Estimated**: a steady published average used where we have no measurements.
- **Text**: content written by the team. "DRAFT" means Yenna still reviews it.

**Markers**

- ⚠ **Not reachable from the crew UI**: built, but you only get there by typing a URL, pressing a shortcut, or through `/admin`.
- ✗ **Not built**: in the brief but not in the app.

**One astronaut, two switches**

- **Astronaut:** always **Alex Moreno**. There is no crew picker any more.
- **Scenario** (the persona file that plays): **Normal day** (A), **Slow drift** (B), **Acute event** (C). Switchable only
  in demo mode (presenter bar, or the sidebar's "DEMO MODE ONLY" box) and on `/admin`. It changes every health number,
  the live vitals, alerts, messages, missions and the streak. Scenario C shows a "Simulated recording" tag.
- **Location** (sidebar): ISS, Moon base, Mars transit, Surface rover · Moon, Surface rover · Mars. The location changes:
  - message delay and the escalation advice;
  - the radiation feed (real at ISS and rover · Mars, estimated elsewhere);
  - the solar event's strength and shelter advice;
  - rover-only steps ("Return to base", limited kit notes);
  - fall detection (Moon base and both rover planets only);
  - the stand-test wording.

  The cabin air is the same real ISS data everywhere.

---

## 1. Pages (routes)

| Route | What it is for | Who uses it | How you get there |
|---|---|---|---|
| `/` Dashboard | Body map, the selected area, timeline, what to do, who to tell | Astronaut, every day | Start page; "CO-PILOT"; sidebar "Dashboard" |
| `/routine` Today's routine | Timed tasks, progress, streak, the daily check steps, quick log | Astronaut, every day | Top bar "Today's routine" button; sidebar |
| `/check` Daily check | The 5-minute check (PPG measurement plus questions) | Astronaut, once a day | Sidebar "Daily check"; `/routine` "Start daily check"; 07:30 reminder; heart "Measure again" |
| `/emergency` Emergency mode | Protocol picker, steps, CPR guide, message to the surgeon | Crew helping a sick crew member | Red **EMERGENCY** (top bar, every page); Act now pop-up; Inbox "Open emergency"; crew alarm "I'm responding"; unresponsive detection |
| `/emergency/logs` | List of saved emergencies (read only) | Crew, flight surgeon | Sidebar "Emergency logs" |
| `/emergency/log/:id` | Read-only record of one emergency | Crew, flight surgeon | `/emergency/logs`; Inbox "Emergency handled" → Open log |
| `/reaction` | Reaction test on its own (3 min, or a 1-minute demo) | Astronaut | Sidebar; Brain and mood "Take reaction test"; routine task |
| `/sources` | Where every number comes from (real / simulated / estimated) | Judges, team | Sidebar "Sources"; Learn pop-up "See all sources →" |
| `/admin` | Reset demo data, scenario, demo mode, solar replay, crew alarm tests, camera debug | Team before and during the demo | ⚠ Not linked: type `/admin` |
| any other URL | Goes back to `/` | | |

**URL options** ⚠ (typed by hand only):

| Option | Effect |
|---|---|
| `?persona=C` | Scenario (A Normal day, B Slow drift, C Acute event) |
| `&env=mars` or `env=rover:mars` | Location |
| `&start=170` | Replay position in seconds |
| `&speed=2` | Replay speed |
| `?demo=1` | Starts demo mode |
| `/check?demo=summary` | Daily check summary with demo values (used by demo step 2) |
| `/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no&goto=cpr` | Camera / lost-pulse hand-off |

**Always present on every page**, mounted in `App.tsx` and `main.tsx`:

- **Sidebar** (☰), **Inbox** drawer, **Act now** pop-up.
- **Reminders:** small cards at the scheduled times.
- **Log drawer:** meal and water, exercise, weekly biomarkers, mood and symptoms.
- **Camera panel:** bottom left (on the dashboard: right of the body map), only while detection is on; collapsible.
- **"Are you OK?" overlay** and the **crew alarm screen** (both above the Act now pop-up).
- **Sensor/replay toast** and the **demo presenter bar**.

---

## 2. Top bar (every page except emergency mode)

Left to right. Emergency mode has its own red bar (section 5).

| Item | What it shows / does | Data | Changes with |
|---|---|---|---|
| ☰ | Opens the sidebar | | |
| "CO-PILOT" | Back to the dashboard | | |
| "Alex Moreno · Day N" | Astronaut and mission day | Persona file `mission_day` | Scenario |
| Location "ISS ▾" | Opens the sidebar | `environments.json` | Location |
| "● Surgeon link · live / ~1.3 s delay / several minutes delay" | Contact quality; dot green / amber / orange | `environments.json` delay, `escalation.json` text | Location |
| **Today's routine** button | done/total and "▲ streak"; amber while tasks are unfinished; opens `/routine` | `/api/missions`, `/api/forms`, streak | Scenario |
| **RADIATION** pill | Dose rate now (µGy/h) with a REAL / EST tag; turns the status colour during a solar event. Click: selects Radiation | `/api/radiation` feed | Location, solar event |
| **CABIN CO₂** pill | ppm, coloured by status, "high for X h". Click: selects Lungs and air → Cabin CO₂ | `/api/cabin` (real ISS telemetry) | |
| Mission clock | HH:MM GMT and the next reminder. Demo mode only: ▶▶ jump to the next reminder, "real time" | Browser clock | |
| **◉ Camera** | Unresponsive detection on/off (camera plus pulse alarm). **Off after every page load** | | |
| 🔊 / 🔇 Muted | Mutes every app sound (Act now beep, alarm, check-in beep, CPR click). Shortcut **M**. Not remembered | | |
| **Inbox** + badge | Badge = number of areas at Watch or worse (same as the body badge); pulses while a red/orange alert is open | Statuses, alerts | Scenario |
| **EMERGENCY** | Opens `/emergency` (protocol picker). Always visible | | |

**Live vitals row** (under the top bar, every page except the daily check): Heart rate, HRV, SpO₂, Breathing, each with
"usual X · signal N%" and a 60 s sparkline; coloured by status with the word (Watch / Warning / Act now); "Irregular
rhythm" under heart rate; greyed with "Poor signal" when the signal is bad. On the left: "LIVE · REPLAY / LIVE SENSOR",
the scenario tag ("Simulated recording" for C) and "Mock data" when the backend is off. Demo mode only: "Jump to event".

**Sidebar**

| Group | Items |
|---|---|
| LOCATION | ISS, Moon base, Mars transit, Surface rover · Moon, Surface rover · Mars; each with a subtitle and "radiation real / estimate" |
| PAGES | Dashboard, Today's routine (N to do), Inbox (N areas), Daily check (done / not done), Reaction test, Sources, Emergency logs |
| DEMO MODE ONLY | Only while demo mode is on: scenario buttons Normal day / Slow drift / Acute event |
| Footer | Vitals source (replay / live sensor); "Runs on board · backend answering" (green) or "Mock data" (amber); "Runs on board · works offline · Mock data where labelled"; "Admin (/admin) is hidden from crew" |

**Keyboard shortcuts**

| Key | Where | Does |
|---|---|---|
| **M** | Anywhere (not while typing) | Mute / unmute all sounds, including the Act now beep |
| **Shift+D** | Anywhere | Demo mode on / off |
| **← → / PageUp PageDown** | In demo mode | Previous / next demo step (presenter clicker) |
| **Escape** | Sidebar, Inbox, Learn, log drawer | Close (not the Act now pop-up: it needs Acknowledge) |
| **Space** | Reaction test | React to the target |
| **1-5, Enter, ↑ ↓ + −** | Daily check questions | Answer, change and confirm a number |
| **Any key** | "Are you OK?" screen | Counts as "I'm OK" (this includes M and the demo arrows) |

---

## 3. Dashboard `/`

Two columns under the vitals row: **left** (about 600 px) the body map; **right** the selected area.

| Panel / item | What it shows / does | Data | Changes with |
|---|---|---|---|
| **Badge** | "N areas need attention" (Watch or worse), or "All areas nominal" | Statuses | Scenario |
| **Body map** | Figure with a glowing zone per area: Nominal faint, Watch brighter, Warning strong with a slow pulse, Act now red with a fast pulse. An aura behind the body takes the worst colour. Live vitals can make an area look worse than the daily status | `/api/status` + live vitals | Scenario |
| **Chips** | Outside the figure with leader lines: area name, status word, key value (the worst metric). Radiation chip near the feet ("whole body"). Click a chip or a zone: selects the area | Statuses, metrics | Scenario |
| **Status line** | Status pill, area, the backend's reason sentence, "Live vitals: …" when the vitals are worse, and the forecast ("At this pace: Act now in about N days", "Warning reached: act today", "Act now: follow the steps below now") | `/api/status` | Scenario |
| **Mission timeline** | 3 days back, today and a forecast zone, NOW line. Routine dots (green done, orange missed / not done, outline upcoming, grey "no record" with the backend off), logged mood and reaction tests (blue), alert diamonds coloured by level (grouped when raised together, "+N"), dashed forecast diamonds. Drag with mouse or touch; ‹ Now ›. Click an event: selects its area | `/api/alerts`, `/api/daily-checks`, `/api/forms`, reminder schedule, `time_to_act_days` | Scenario, location (schedule) |
| **Selected area** | Name, health score /100, **ⓘ Learn** | | |
| **Metric tabs** | One tab per metric of the area with status dot and value (cabin CO₂, temperature and humidity under Lungs and air) | `metric_status` from `/api/status`; cabin from `/api/cabin` | |
| **Big value** | Value, "Your usual" (30-day median, or 24 h average for cabin), change vs usual and the status word; under glucose, the Inspiration4 reference line | Daily data, cabin | |
| **Chart** | 7 / 30 days (24 h for cabin), dashed Watch and Warning lines from `thresholds.json`, a "usual" line, a dotted forecast to the Warning limit for the key metric when the backend forecasts it | | |
| **Radiation block** (Radiation selected) | Now / Today / Last 30 days / Mission so far (simulated); mission dose vs limit bar; 24 h chart (ISS: South Atlantic Anomaly spikes) with the source badge; **Solar event watch (NASA DONKI)** box: "None active" or the live event (dose rate, event dose, ends in, DONKI record link, "dose simulated") | ISS: **real** RadLab DOSTEL1. Rover on Mars: **real** Curiosity RAD. Moon base, rover on Moon, Mars transit: **estimated** (DRAFT). Mission dose: simulated | Location, solar event |
| **What to do** | Yenna's summary for the status, self-care checklist with tick boxes (saved for today), "Today, N of M done", DRAFT tag | `guidance.json` (text) | Status |
| **Area buttons** | Brain and mood: Take reaction test, Log mood. Immune: Log a symptom. Lungs: See cabin details. Heart: Review message to surgeon, Measure again. Metabolism: Log meal and water, Weekly biomarkers. Bones: Log exercise. Radiation: See radiation feed. Any area at Warning or Act now: Review message to surgeon | | |
| **Who to tell** | Self-care → Tell your crew → Flight surgeon next contact → Flight surgeon now → Emergency mode; the rover adds "Return to base" after "Tell your crew". Current step highlighted "← you are here". Below: the advice for this location, the rover step advice once reached, and the "Crew:" / "Flight surgeon:" lines | `escalation.json`, `guidance.json` | Location, status |

**Learn pop-up** (ⓘ Learn, for the selected area and metric)

| Section | Data |
|---|---|
| What this does · Why we check it · How it is measured · Can it be done on board? · Why this happens in space (with "(source pending)" after each REF id) · How to stay healthy | `regions.json`, `measurements.json`, `guidance.json`. Missing text says "TODO(Yenna)" |
| Metabolism: Inspiration4 table (glucose, sodium, potassium) | **Real** OSD-575, reference only |
| Where these numbers come from: each source with a REAL / EST / PLACEHOLDER / ON DEVICE / SIMULATED tag (CSA PRET n=145 for the reaction test; EDA RR-23 / SpaceX-21 for cabin; RadLab / MSL-RAD / estimate for radiation; threshold source or "placeholder, medical review pending"; "your usual" on device), the REF list, "See all sources →" | `pvt_norms.json`, `cabin.json`, radiation feed, `thresholds.json`, `sources.json` |

**Inbox** (drawer from the right; "Inbox" button, sidebar, Act now "Draft message", area "Review message to surgeon")

| Item | Does | Data |
|---|---|---|
| ALERTS | Level, area, text, time (GMT), source. **View** (selects the area), **Acknowledge**, **Open emergency** (red alerts), **Open log** ("Emergency handled") | `/api/alerts`, `/ws/alerts`; offline: built in the browser from the statuses |
| MESSAGE TO FLIGHT SURGEON | "✦ Auto-drafted from your data · check and edit before sending". A rule-based template: areas at Watch or worse with their worst metric vs usual, the live vitals, the self-care steps ticked today, location and day. Editable. **Send to surgeon**, **↻ Rebuild from data**, **Polish wording** (only when the backend has an `ANTHROPIC_API_KEY` and the internet; otherwise hidden). When opened on an alert's draft, Send sends that draft. Delivery: "Delivered" / "after ~1.3 s" / "Arrives in several minutes" with a countdown; **Simulate reply** in demo mode only | `lib/surgeonDraft.ts`, `/api/messages`, `/api/assist/*` |
| Other drafts · Sent earlier | The backend's alert drafts and earlier messages, collapsible | `/api/messages` |

**Act now pop-up** (replaces the old red banner)

| Item | What it does |
|---|---|
| Triggers | An open red alert from the backend rules (any area at Act now, including the solar event) or the live vitals; a live vital in the red range for 10 s (works offline); pulse lost (the crew alarm comes first) |
| Content | "ACT NOW · AREA", a headline, why (the rule with values and the live vitals), DO THIS NOW (numbered, from `guidance.json` and the solar advice) |
| Buttons | **Open emergency mode** (acknowledges and opens `/emergency`), **Draft message to surgeon** (opens the Inbox on the alert's draft), **Acknowledge** |
| Sound | Repeating two-note beep until acknowledged; "Alarm sounding · M to mute". Respects the global mute |
| Priority | Never over "Are you OK?", the crew alarm, an open Inbox, or in emergency mode |

---

## 4. Daily check `/check`

The top bar plus a header with step progress and **Cancel**; one step per screen (unchanged flow, v4 style).

| Step | Purpose | What it measures / records |
|---|---|---|
| 1 Prepare | Measurement coach: put the clip on, sit still, wait for a steady signal. **Skip** (demo shortcut) uses the last 2 minutes of the stream | Signal quality from the PPG |
| 2 Seated rest | 2 minutes at rest, with calm hints if the signal is poor | Resting heart rate, HRV, SpO2, breathing rate, irregular rhythm (finger PPG) |
| 3 Stand | Stand test. In weightlessness: brace in the foot loops and tense the legs. With gravity: stand up. 1 minute | Heart-rate rise on standing |
| 4 Temperature & glucose | Type the values; glucose in mmol/L or mg/dL (the toggle is remembered); "Real crew reference" line (Inspiration4) | `temp_c`, `glucose_mmol` |
| 5 Blood pressure | Type the cuff values, or skip | `bp_sys`, `bp_dia` |
| 6 Reaction test | 3-minute PVT-style test (or a 1-minute demo, "not compared"), or skip | Median reaction time, lapse rate (≥ 355 ms), false starts |
| 7 Questions | Short 1-5 scales (sleep, mood, stress, symptoms) | Questionnaire answers (`questionnaire.json`) |
| 8 Summary | Today vs your baseline, per metric (coloured); regions that changed; advice level; **reaction time vs the CSA reference group** and **glucose next to the Inspiration4 crew** | Backend `POST /api/check` judges everything |

**Afterwards:** today's values become today's daily entry, so statuses, body map, chart, forecast and alerts update; an
area turning Warning or Act now gets a drafted message; the "Daily check" task is done, the streak goes up, and the
sidebar shows "Daily check: done".

---

## 5. How the main features are triggered

| Feature | Triggered by | What it does |
|---|---|---|
| **Emergency mode** | EMERGENCY button, Act now pop-up, Inbox "Open emergency", crew alarm, unresponsive detection | Picker: **Chest pain**, **Not responding** (also opened by the camera with "Responsive: no" answered), **Something else** (Heavy bleeding, Choking, Burn, Seizure: **placeholders, not written** ✗). Then:<br>• red bar: protocol, "Alex Moreno · location", source / mock note, timer, 🔊 sound toggle, **End emergency**;<br>• vitals strip with status badges and the scenario / mock tags;<br>• one step at a time: progress, big text, the yes/no question, step timer (Start / Done), rover limited-kit notes, **‹ Back**, **No / Yes**, **Done, next step**;<br>• right panel: **RED FLAGS · LIVE** (lights up from the vitals), **FLIGHT SURGEON** ("✦ Auto-drafted from vitals + log", **Send now / Send update**, delivery per location, Simulate reply in demo mode), **EVENT LOG · AUTOMATIC**.<br>A red flag with a route shows "RED FLAG: … Jumping to CPR in 5 s" with **Cancel** and **Go now**. **CPR guide**: beating circle and click at 100-120 per minute with a **− / +** rate stepper (`cpr.json` `rate_range_per_min`), compression counter (30, then 2 breaths), switch-rescuer timer every 2 min, Start / Stop, the DRAFT microgravity position text, **‹ Back to steps**, **Pulse is back**. **End emergency**: saved at once; summary with duration, steps done, message status, the log, **Copy log** and **Close**; an "Emergency handled" alert appears in the Inbox and the log in Emergency logs |
| **Unresponsive detection** | Top bar **◉ Camera** (off after every load) | Camera (MediaPipe, in the browser, no video stored) watches hand movement relative to the torso, floating arm posture (arms only), smooth body drift, closed eyes, and a still hand from the clip. Outside sleep hours, a high score for 25 s (10 s with red vitals) shows **"Are you OK?"** for 15 s: a tap, key, voice or hand movement answers it. No answer: crew alarm, an Act now alert (heart, source cv) with a draft, and the unresponsive protocol opens. **Lost pulse** on the clip skips the check-in and goes straight to the alarm and CPR. Falls count only where there is gravity (Moon base, rover on the Moon or Mars). Camera panel: preview, status, posture, limb motion vs body drift, still-for timer, fall check on/off, pulse; hide preview, collapse, off |
| **Crew alarm** | Unresponsive detection, `/admin` "Test crew alarm" | Full-screen flashing red: "CREW ALARM: crew member not responding, <location>", two-tone siren ("Muted" badge if muted). **I'm responding** opens emergency mode; **False alarm** closes it. Shows in every open tab |
| **Act now pop-up** | Backend Act now status, red vitals for 10 s, solar event, pulse lost | See section 3 |
| **Alerts** | Backend:<br>• an area turns Watch / Warning / Act now (rules);<br>• a live vital is red (vitals);<br>• the solar event (rules, radiation);<br>• a camera alarm (cv);<br>• an emergency is finished (emergency).<br>Offline: built from the statuses | Inbox list, Inbox badge, timeline diamonds, Act now pop-up for red; Warning and Act now get a drafted message. Same alert is not repeated while open |
| **Inbox** | Inbox button, sidebar, Act now "Draft message to surgeon", area "Review message to surgeon" | See section 3. The delivery delay depends on the location |
| **Solar event** | `/admin` "Replay solar event" (5 / 10 / 20 min), demo step 5 ⚠ | Real NASA DONKI event 2024-05-10 (timing, id, link), **simulated** dose, stronger away from the ISS (DRAFT: Mars transit 10×, Moon 5×, Mars surface 3×). Radiation goes to **Act now** for the whole crew: Act now pop-up, red RADIATION pill, DONKI box, advice per location. Works offline too |
| **Today's routine** | Top bar button, sidebar | Tasks: daily check, reaction test, meals and water, exercise, wind-down (before the sleep window). Done tasks struck through, unfinished past tasks orange "Not done · overdue", upcoming neutral. **Reminders** pop up at 07:30 / 12:30 / 16:00 / 19:00 mission time (skipped if done) |
| **Log drawer** | `/routine` quick log, task rows, reminders, area buttons | Meal and water (type, size, water L, notes), Exercise (type, minutes), Weekly biomarkers (body mass), **Mood and symptoms** (mood 1-10, symptoms, notes; shown on the timeline, does not change any status) |
| **Drill mode** (practice with scoring) | ✗ **Not built** | In the brief only. The only game elements are the routine and the streak |

---

## 6. Other pages

| Page | Items |
|---|---|
| `/routine` | "N of 5 done", progress bar, streak; timed task rows with Start / Log / Done; side panel: the 8 daily-check steps and **Start daily check**; **Quick log** (Meal, Water, Exercise, Weekly biomarkers, Mood and symptoms); reminders note |
| `/reaction` | Same reaction test as the check: a target after a random 2-10 s gap; press space or tap. Result: median, lapse rate, false starts, "faster than Y% of the CSA reference group" (full version only; "demo only, not compared" for the 1-minute version). **Save result** feeds Brain and mood today and ticks the routine task |
| `/sources` | One card per source:<br>• name, agency, use (Replay / Test / Thresholds / Reference);<br>• Real / Simulated / Estimated;<br>• what it is, used for, app locations, units, licence, owner, file, links, the on-screen badge.<br>"TO FILL IN" and "… to confirm" show in amber. Data: `backend/data/sources.json` |
| `/emergency/logs` | Saved emergencies, newest first (title, date, duration); with the backend off, the ones ended in this session |
| `/emergency/log/:id` | Duration, answers, messages, full event log of a saved emergency, Copy log |
| `/admin` ⚠ | **Database** counts and **Reset demo data**; **Scenario** (Normal day / Slow drift / Acute event); **Demo mode** (Start); **Replay solar event** (length, Start / Restart / Stop); **Crew alarm**: Test crew alarm, open the unresponsive protocol as detection would, or as a lost pulse would; **Camera debug panel**: every signal, state, timers, pulse status, sliders for this session only, skeleton overlay, demo trigger, copy as JSON |

---

## 7. Demo mode (live pitch, about 3 minutes)

**Start**

- **Ways to start:** **Shift+D**, the "Start demo mode" button on `/admin`, or `?demo=1`.
- **Reset first:** on `/admin` press **Reset demo data**, so drafts and alerts from rehearsals are gone.
- **Presenter bar** (bottom right, above everything):
  - step number and title;
  - what to say;
  - **scenario buttons** (Normal day / Slow drift / Acute event);
  - data badges (blue = real, grey = simulated, amber = estimated or DRAFT);
  - **Back**, **Pause** (holds the live vitals still), step buttons, **Next**.

  Arrows or a presenter clicker work too. Each step clears the alarm, solar replay and detection left over from the step
  before. Demo mode also shows the demo-only controls: clock fast-forward, "Jump to event", "Simulate reply", and the
  sidebar's scenario box.

| Step | Screen it sets | What to say |
|---|---|---|
| 1 | Normal day, ISS, dashboard, Radiation selected | "Everything Nominal. This is real ISS radiation: the spikes are the South Atlantic Anomaly. The CO₂ pill is real ISS cabin telemetry." |
| 2 | Normal day, daily check summary (demo values) | "The 5-minute check. Reaction time compared with 145 people tested for the CSA; glucose next to the real Inspiration4 crew." |
| 3 | Slow drift, ISS, Heart selected, Inbox open on the draft | "Slow drift: the heart reaches Warning; the timeline shows how it got here, Yenna's checklist, and a message already drafted from the data." |
| 4a | Slow drift, Mars transit, message sent | "Same message on the way to Mars: it arrives in several minutes, so the advice changes." |
| 4b | Slow drift, rover on Mars, Radiation | "On the Martian surface: real Curiosity radiation, and a 'Return to base' step." |
| 5 | Slow drift, Mars transit, solar event running | "A real NASA solar storm: radiation goes to Act now; the Act now pop-up sounds and tells everyone to shelter." |
| 6a | Acute event, Mars transit, recording just before the event | "An acute event: heart rate climbs, oxygen falls; the Act now pop-up fires." (Simulated recording) |
| 6b | Acute event, chest-pain emergency at 440 s | "Red flags light up; when the pulse is lost it jumps to CPR with the metronome." Backup button: **Jump to CPR** |
| 7 | Normal day, Mars transit, dashboard | "If someone floats still: 'Are you OK?', then the crew alarm and the protocol." Buttons: **Start camera** (go still, arms floating) or **Demo trigger** |
| 8 | Emergency: message sent, then ended | "The message to the flight surgeon is on its way; here is the summary, saved to the Inbox." |

**Leaving:** **Shift+D**, or ✕ on the bar.

**Public build:** it works with the backend off, because the replay, the solar event and the drafts run in the browser
(checked: all steps, all 3 scenarios and all 5 locations with the backend off).

---

## 8. Main dashboard, everything at once, ranked for an astronaut

How v4 answered the ranking from the previous guide.

| Rank | Item | Why it matters | v4 |
|---|---|---|---|
| 1 | Act now pop-up + EMERGENCY button | Life-safety; one tap to act | Pop-up with sound replaces the banner; EMERGENCY always visible |
| 2 | Status line (status, reason, time to act) | Answers "am I OK, what do I do?" | Small line at the top of the right column (replaces the Today card) |
| 3 | Live vitals row | Shows trouble right now | Thin row under the top bar; "Jump to event" is demo-only |
| 4 | Body map with chips | Fast overview of 7 areas | Glow per status, chips with values (replaces the separate area list) |
| 5 | What to do + Who to tell | The action for the selected area | Side by side under the chart |
| 6 | Inbox | Catch-up and contact with the surgeon | Alerts and messages merged into one drawer |
| 7 | Time to act / forecast | Forecast for slow drifts | Status line, dotted chart forecast, dashed timeline diamonds |
| 8 | Mission timeline | What happened and what is next | New: real history plus the schedule and forecasts |
| 9 | Today's routine | Daily habit | One button in the top bar; full page `/routine` |
| 10 | Metric tabs, chart, Learn | Details for the curious | Tabs and chart on the page; Learn in a pop-up |
| 11 | Radiation details | Context, rarely urgent | Radiation pill in the top bar; block when Radiation is selected |
| 12 | Cabin air | Context for headaches and sleep | CO₂ pill in the top bar; cabin metrics inside Lungs and air |
| 13 | Location, link status, clock | Set once per session | Sidebar; link status under the name; fast-forward demo-only |
| 14 | Source, backend status, Sources link | Trust | Sidebar footer and the vitals row tags |
| 15 | Camera and mute | Settings that must stay reachable | Top bar |

---

## 9. Built but not reachable, or not built

| Item | State |
|---|---|
| `/admin` (reset, scenario, solar replay, alarm test, camera debug panel and sliders, skeleton overlay) | ⚠ Type the URL |
| URL options (`?persona`, `env`, `start`, `speed`, `demo=1`, `/check?demo=summary`) | ⚠ Typed by hand |
| Demo mode | ⚠ Shift+D, `/admin` or `?demo=1`; no visible button on the dashboard |
| Scenario switch | ⚠ Demo mode (presenter bar, sidebar box) and `/admin` only |
| Solar event replay | ⚠ `/admin` or demo step 5 only |
| "Simulate reply", "Jump to event", clock fast-forward | Demo mode only |
| "Polish wording" | Only with `ANTHROPIC_API_KEY` on the backend and the internet; otherwise hidden |
| "Something else" protocols (bleeding, choking, burn, seizure) | ✗ Placeholders |
| Drill / practice mode with scoring | ✗ Not built |
| Real PPG from the finger clip (`compute_vitals()`) | ✗ Not built yet (Jian); vitals come from the replay |
| `docs/medical/references.csv` (REF sources) | ✗ Not written yet; the Learn pop-up shows "(source pending)" |
| Lunar RadLab data (LRO CRaTER), BioSentinel | ✗ No file yet; Moon and Mars transit use estimates |
| Cabin humidity limits, mood/symptom text in measurements | ✗ TODO(Yenna): shown without limits |
