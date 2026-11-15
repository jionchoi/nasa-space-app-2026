# v4 redesign: feature checklist

Built on Nov 15, 2026 from `docs/ui-guide.md`, the current code (`frontend/src`, `backend/app`) and the three v4
designs (`design-handoff/v4/Main-v4.dc.html`, `Routine-v4.dc.html`, `Emergency-v4.dc.html`).

Rule: v4 changes the look and the layout. It does not remove features. Every row below must still work after the
redesign. The **Done** column was ticked in the final pass in the running app (see "Verification" at the end).

**Flags**

- 🟥 **No home**: v4 has no place for it yet. A decision is needed (my proposal is in the row).
- ⚠ **Check**: it has a home, but something changes (semantics, position, wording). Read the note.
- ➕ **New**: v4 adds it. It does not exist in the code today.
- (blank): straight move plus restyle.

---

## 1. Routes

| # | Route | Today | v4 location | Flag | Done |
|---|---|---|---|---|---|
| R1 | `/` Dashboard | 3 columns: Today / body map / area panel | Main-v4: body map left (600 px), right column | | ☑ |
| R2 | `/check` Daily check (8 steps) | Own page, "Start the 5-minute check" on the Today card | Same page, restyled. Entry points: sidebar "Daily check", /routine "Start daily check", 07:30 reminder, routine timeline event | ⚠ The Today card goes away, so the dashboard loses its big "Start check" button. It stays reachable through the sidebar, /routine and the routine button | ☑ |
| R3 | `/emergency` (picker, steps, CPR, summary) | Own page | Emergency-v4 | | ☑ |
| R4 | `/emergency/log/:id` | Only from an "Emergency handled" alert | Inbox "Emergency handled" item **and** sidebar "Emergency logs" | | ☑ |
| R5 | `/emergency/logs` (list) | Does not exist (`GET /api/emergency-logs` exists in the backend) | Sidebar "Emergency logs" | ➕ Small read-only list page. Offline: "No saved logs (backend off)" | ☑ |
| R6 | `/routine` Today's routine | Does not exist (missions are a card on `/`) | Routine-v4 | ➕ | ☑ |
| R7 | `/reaction` | "Take reaction test" in Brain and mood | Same + sidebar "Reaction test" + routine task "Reaction test" | | ☑ |
| R8 | `/sources` | "Sources" link in the header | Sidebar "Sources" + Learn pop-up "See all sources →" | | ☑ |
| R9 | `/admin` | Hidden, typed URL | Hidden, typed URL (sidebar footer only says "Admin is hidden") | | ☑ |
| R10 | `*` → `/` | Redirect | Same | | ☑ |

## 2. URL options (typed by hand)

| # | Option | Effect | v4 | Flag | Done |
|---|---|---|---|---|---|
| U1 | `?persona=A/B/C` | Persona | Same parameter, now called a scenario on screen | | ☑ |
| U2 | `env=iss / moon / mars / rover:moon / rover:mars` | Location | Same | | ☑ |
| U3 | `start=170` | Replay position | Same | | ☑ |
| U4 | `speed=2` | Replay speed | Same | | ☑ |
| U5 | `?demo=1` | Starts demo mode | Same | | ☑ |
| U6 | `/check?demo=summary` | Check summary with demo values (demo step 2) | Same | | ☑ |
| U7 | `/emergency?protocol=…&trigger=…&preanswer=responsive:no&goto=cpr` | Camera / lost-pulse hand-off, demo steps 6b, 8 | Same | | ☑ |

## 3. Global shell (every page)

| # | Item | Today | v4 location | Flag | Done |
|---|---|---|---|---|---|
| G1 | Logo / back to dashboard | "Health Co-Pilot" logo | "CO-PILOT" wordmark (links to `/`) + sidebar "Dashboard" | | ☑ |
| G2 | Crew picker (A/B/C) | Header, everyone | **Removed from the normal UI.** Astronaut is "Alex Moreno". Scenarios Normal day / Slow drift / Acute event: demo presenter bar, sidebar "DEMO MODE ONLY" box (only in demo mode), `/admin` | ⚠ `/admin` has no persona picker today: add one | ☑ |
| G3 | "Mission day N" | Crew picker | Top bar "Alex Moreno · Day N" (N still from the persona file) | | ☑ |
| G4 | "Simulated data" / "Simulated recording" badge (persona C) | Crew picker, presenter bar | ⚠ CLAUDE.md requires it on screen. Proposal: vitals row label "LIVE · Replay (simulated)" and a "Simulated recording" tag in the vitals row and the emergency vitals strip while scenario C runs | ⚠ | ☑ |
| G5 | Location switch (+ Moon/Mars toggle for the rover) | Header segmented control | Sidebar LOCATION group: 5 entries (ISS, Moon base, Mars transit, Surface rover · Moon, Surface rover · Mars) with subtitle and "radiation real/estimate". Opened by ☰ or "ISS ▾" | | ☑ |
| G6 | Location side effects: delay and escalation advice, radiation feed, solar scale, rover-only steps, fall detection (moon, rover:moon, rover:mars), stand-test wording | Logic in context and backend | Unchanged | | ☑ |
| G7 | Flight surgeon link status (dot + text) | Header | Top bar "● Surgeon link live · {delay}" (dot colour from the delay, text from `escalation.json`) | | ☑ |
| G8 | Mission clock HH:MM GMT | Header | Top bar right, plus "next HH:MM" reminder | | ☑ |
| G9 | Fast-forward ▶▶ to the next reminder + "real time" reset | Header, everyone | Next to the clock, **demo mode only** | ⚠ Hidden outside demo mode | ☑ |
| G10 | Streak (flame) | Header | Top bar "Today's routine" button: done/total + "▲ N-day streak", amber when tasks are unfinished. Also on /routine | | ☑ |
| G11 | Source chip "Live sensor" / "Replay" | Header | Sidebar footer + vitals row label "LIVE · Replay / Live sensor" | | ☑ |
| G12 | "Runs on board" (backend up) / "Mock data" (backend down) | Header, from `/api/health` | Sidebar footer "Runs on board · works offline · Mock data where labelled" | ⚠ The design text is static. Proposal: keep a live dot in that footer line (green = backend answering, amber = mock data) so the backend state is not lost | ☑ |
| G13 | "Sources" link | Header | Sidebar PAGES "Sources" | | ☑ |
| G14 | Mute button + "Muted" badge (not remembered) | Header | Top bar 🔊 / 🔇 Muted | | ☑ |
| G15 | Camera toggle "Unresponsive detection" (off after every load) | Header | Top bar "◉ Camera" (real on/off, not demo-only) | | ☑ |
| G16 | "Messages (N drafts)" button | Header, dashboard only | Inbox button (every page) | ⚠ See I1 for the badge count | ☑ |
| G17 | Alerts bell (flashing open red/orange alerts) | Header | Inbox button (badge glows while an open red/orange alert is unacknowledged) | | ☑ |
| G18 | EMERGENCY button | Header, every page | Top bar right, every page, always visible | | ☑ |
| G19 | Radiation pill (µGy/h, REAL/EST) | Does not exist | Top bar centre; click selects Radiation | ➕ | ☑ |
| G20 | Cabin CO₂ pill (ppm, colour, "high for X h") | Cabin air card | Top bar centre; click selects Lungs and air → Cabin CO₂ | ➕ | ☑ |
| G21 | Sidebar PAGES with counts | Does not exist | Dashboard, Today's routine (to do), Inbox (count), Daily check (done / not done), Reaction test, Sources, Emergency logs | ➕ | ☑ |
| G22 | Compact header on the emergency screen (mission day, link status, mute, source chip, "Runs on board") | Emergency page | Emergency-v4 red bar: protocol, "Alex Moreno · location", timer, sound toggle, End emergency | ⚠ Source chip and backend status are not in the design. Proposal: small text in the red bar ("Replay · Mock data") | ☑ |
| G23 | Fonts | Inter and JetBrains Mono (fontsource, offline) | + Space Grotesk headings, self-hosted (`@fontsource/space-grotesk`) | ➕ | ☑ |

## 4. Overlays (mounted on every page)

| # | Overlay | Trigger | v4 location | Flag | Done |
|---|---|---|---|---|---|
| O1 | Reminder cards 07:30 / 12:30 / 16:00 / 19:00 (skipped if done, dismiss ✕, action button) | Mission clock | Same logic, restyled | ⚠ Routine-v4 text says "Snooze 15 min or Done". Snooze does not exist today. Proposal: keep current buttons, do not add snooze unless you want it | ☑ (logic unchanged; not waited for in the browser run) |
| O2 | Log drawer (Meal, Exercise, Weekly biomarkers tabs; Escape closes) | Missions, reminders, area buttons | Same, restyled. Opened from /routine Quick log and area buttons | | ☑ |
| O3 | Camera panel (preview, status words, hide preview, off, "Try again") | Detection on | v4 panel: posture, limb motion vs body drift, still-for timer, fall check on/off | ⚠ Design puts it bottom-right, where the demo presenter bar sits. Proposal: bottom-left (as today) | ☑ |
| O4 | "Are you OK?" check-in (15 s, tap / any key / voice / hand) | Detection | Restyle only. Keeps priority over the Act now pop-up | | ☑ |
| O5 | Crew alarm screen (siren, I'm responding, False alarm, all tabs, "Muted" badge) | Detection no answer, admin test | Restyle only. Keeps priority over the Act now pop-up | | ☑ |
| O6 | Sensor/replay toast | Sensor plugged in / out | Restyle | | ☑ (unchanged; no sensor attached) |
| O7 | Demo presenter bar (step, note, badges, Back, Pause, actions, Next, ✕) | Demo mode | Restyle. Adds scenario buttons | ⚠ | ☑ |
| O8 | Red alert banner (newest red alert, or "Vitals in the danger range" after 10 s) with Open emergency, Draft message, Acknowledge | Dashboard | **Replaced by the Act now pop-up** (A1–A8) | ⚠ | ☑ |
| O9 | Act now pop-up | Does not exist | Main-v4 "open = Act now" | ➕ See section 7 | ☑ |
| O10 | Learn pop-up | Does not exist (was the Learn tab) | Main-v4 "open = Learn" | ➕ See section 8 | ☑ |
| O11 | Sidebar | Does not exist | Main-v4 "open = Sidebar" | ➕ | ☑ |
| O12 | Inbox drawer | Messages drawer + alerts dropdown | Main-v4 "open = Inbox" | ⚠ Merges two | ☑ |

## 5. Keyboard shortcuts

| # | Key | Where | Does | v4 | Done |
|---|---|---|---|---|---|
| K1 | M | Anywhere, not typing | Mute / unmute (also silences the Act now beep) | Same | ☑ |
| K2 | Shift+D | Anywhere | Demo mode on / off | Same | ☑ |
| K3 | ← → / PageUp PageDown | Demo mode | Previous / next step | Same | ☑ |
| K4 | Space | Reaction test | React | Same | ☑ (code unchanged; not driven in the browser run) |
| K5 | 1–5, Enter, ↑ ↓ + − | Daily check questions | Answer, change and confirm a number | Same | ☑ (code unchanged; not driven in the browser run) |
| K6 | Any key | "Are you OK?" | Counts as "I'm OK" | Same | ☑ |
| K7 | Escape | Messages drawer, log drawer | Close | Same, plus sidebar, Inbox and Learn pop-up. **Not** the Act now pop-up (it needs Acknowledge) | ☑ |

## 6. Dashboard `/`

| # | Item | Today | v4 location | Flag | Done |
|---|---|---|---|---|---|
| D1 | Live vitals: HR, HRV, SpO₂, breathing; status colour from thresholds; "Your usual"; signal %; 60 s sparkline | 4 cards | Thin vitals row under the top bar: value, "usual X · signal N%", colour by status, greyed on poor signal | ⚠ The sparklines are not in the design. Proposal: keep a small sparkline in each cell | ☑ |
| D2 | "Irregular rhythm" pill | Vitals | Vitals row flag | | ☑ |
| D3 | "Jump to event (demo)" (persona C) | Vitals, everyone | Vitals row, **demo mode only** | ⚠ | ☑ |
| D4 | Today card (status, reason, who to tell, Start/Repeat check, Review area, Open draft message, "Daily check done at HH:MM") | Left column | Split: status → status line (D13); check → sidebar badge + /routine; draft → Inbox; "done at HH:MM" → sidebar "Daily check" badge | ⚠ No single "Today" card any more | ☑ |
| D5 | Today's routine card (4 missions, progress) | Left column | Top bar routine button + `/routine` page | | ☑ |
| D6 | Cabin air card (CO₂, temp, humidity, "CO₂ high for X h", NASA OSDR badge) | Left column | CO₂ pill in the top bar; temperature and humidity as metric tabs in Lungs and air; source in Learn | | ☑ |
| D7 | Body areas list (7, most urgent first) | Left column | Chips around the body | | ☑ |
| D8 | Body map dots coloured by status; radiation ring; live vitals can raise a dot | Middle | Glowing zones (faint / brighter / strong slow pulse / red fast pulse), aura in the worst colour, chips with leader lines, radiation chip near the feet | | ☑ |
| D9 | "N areas need attention" badge | Does not exist | On top of the body map; "All areas nominal" at 0 | ➕ | ☑ |
| D10 | Area name, what it does, status pill, "Live: …" pill, health score | Area panel | Area name + score /100 + ⓘ Learn. "What it does" goes to Learn | ⚠ "Live: …" pill: proposal, put it in the status line | ☑ |
| D11 | Tabs Overview / All metrics / Learn | Area panel | Metric tabs (one per metric, dot + value) + Learn pop-up. Overview content spreads over the right column | | ☑ |
| D12 | All metrics rows: value, change vs "30-day usual" / "24 h average", status from the backend (incl. personal 15% reaction-time rule), cabin rows "real ISS telemetry" | Tab | Metric tabs + big value, "Your usual", delta line | | ☑ |
| D13 | Reason sentence + time to act ("About N days", "Now", "Nothing to do") | Overview | Status line at the top of the right column | | ☑ |
| D14 | Trend chart 7 / 30 days (24 h for cabin), Watch / Warning lines, dashed forecast | Overview | Chart with 7/30 toggle, dashed Watch and Warning lines from `thresholds.json`, "usual" line, dotted forecast when heading worse | | ☑ |
| D15 | What to do: Yenna's summary, self-care checklist (saved for today), "Today, N of M done", DRAFT tags | Overview | WHAT TO DO checklist | | ☑ |
| D16 | "Crew:" and "Flight surgeon:" guidance lines | Overview | ⚠ Not in the design. Proposal: small text under the Who to tell ladder | ⚠ | ☑ |
| D17 | Who to tell ladder (self → crew → surgeon next window → surgeon now; rover adds "Return to base") | Overview | Ladder beside What to do: Handle it yourself → Tell your crew → Message flight surgeon → (rover) Return to base → Emergency mode | | ☑ |
| D18 | How to stay healthy (prevention list) | Overview | Learn pop-up | | ☑ |
| D19 | Area buttons: Take reaction test, Log meal and water, Weekly biomarkers, Log exercise | Overview | Area action buttons | | ☑ |
| D20 | Area buttons: Log a symptom, Review message to surgeon, See radiation feed, See cabin details, Measure again, Log mood | Do not exist | Area action buttons | ➕ 🟥 "Log a symptom" and "Log mood" have no form and no backend kind. Proposal: "Log a symptom" = new tab in the log drawer saved through `POST /api/forms` (kind `symptom`, display only, no status logic). "Log mood" → drop (mood comes from the check questions). "Measure again" → `/check` | ☑ |
| D21 | Radiation card: dose rate now / today / 30 days, 24 h chart (SAA spikes on ISS), source badge per location | Overview, radiation | Radiation block: Now / Today / Last 30 days / Mission so far (simulated), 24 h chart, source label | | ☑ |
| D22 | Solar event box (dose rate, from event, expected end; DONKI id and link) | Radiation card | DONKI box in the radiation block. "None active" when idle | | ☑ |
| D23 | Mission dose bar (mSv, limit, "Simulated") | Radiation card | "Mission so far (simulated)" stat | ⚠ The limit bar is not in the design. Proposal: keep a thin limit bar under that stat | ☑ |
| D24 | Real crew reference (Inspiration4 glucose L-3 / R+1) + glucose unit toggle | Overview, metabolism | Learn pop-up (Metabolism) **and** a one-line reference under the chart when Blood glucose is selected | ⚠ | ☑ |
| D25 | Mission timeline (draggable, days, NOW, routine dots, alert diamonds, forecast) | Does not exist | Right column under the status line. Data from `/api/alerts`, `/api/daily-checks`, `/api/forms`, reminders schedule, `time_to_act_days`; offline from mock alerts and `daily.json` | ➕ | ☑ |
| D26 | Messages drawer: Drafts (several, editable, Send) and Sent (delivery status, countdown, Simulate reply) | Drawer | Inbox "Message to flight surgeon" | ⚠ The design shows one draft. Proposal: keep the list of drafts and a "Sent" section below it | ☑ |
| D27 | Simulate reply | Everyone | **Demo mode only** | ⚠ | ☑ |
| D28 | Auto-drafted message text | Backend draft (per alert) | ➕ Rule-based template built from the current state (areas at Watch or above, worst metric vs usual, vitals, ticked steps, location, day). Label "✦ Auto-drafted from your data · check and edit before sending" | ➕ | ☑ |
| D29 | "Polish wording" (Claude, only with `ANTHROPIC_API_KEY` and online) | Does not exist | Inbox, next to Send. Falls back to the template | ➕ Needs a new backend route | ☑ (hidden without key verified; a real call needs a key and was not made) |

## 7. Act now pop-up (replaces the red banner)

| # | Trigger / item | Today | v4 | Done |
|---|---|---|---|---|
| A1 | Backend region status `red` (Act now) | Red alert banner | Pop-up | ☑ |
| A2 | Live vital red for 10 s (`useDanger`) | Banner "Vitals in the danger range" | Pop-up | ☑ |
| A3 | Solar event → radiation Act now | Banner via alert | Pop-up (shelter steps) | ☑ |
| A4 | Pulse lost | Crew alarm + CPR | Crew alarm keeps priority; pop-up only if no alarm / check-in is open | ☑ |
| A5 | "ACT NOW · {AREA}", headline, why (rule + values), DO THIS NOW steps | Alert message only | Pop-up content from the alert / status reason and `guidance.json` steps | ☑ |
| A6 | Open emergency mode / Draft message to surgeon (opens Inbox on the draft) / Acknowledge (acks the backend alert) | Banner buttons | Pop-up buttons | ☑ |
| A7 | Beep (WebAudio), repeats until acknowledged or muted; global mute + M; "Alarm sounding · M to mute" | No beep for the banner | ➕ | ☑ |
| A8 | Priority: "Are you OK?" and crew alarm on top; the pop-up waits | n/a | ➕ | ☑ |

## 8. Learn pop-up (replaces the Learn tab)

| # | Section | Source | Flag | Done |
|---|---|---|---|---|
| L1 | What this does / Why we check it / How it is measured / Can it be done on board? / Why this happens in space / How to stay healthy | `measurements.json`, `regions.json`, `guidance.json` | ⚠ Missing fields get `TODO(Yenna)` text, no invented medical claims | ☑ |
| L2 | "(source pending)" after REF ids | `measurements.json` | | ☑ |
| L3 | Where these numbers come from: tags REAL / EST / PLACEHOLDER / ON DEVICE, REF links, "See all sources →" `/sources` | `sources.json`, `thresholds.json` | | ☑ |
| L4 | CSA PRET n=145 explanation (reaction test) | `pvt_norms.json` | | ☑ |
| L5 | Cabin data EDA RR-23 / SpaceX-21 | `cabin.json` | | ☑ |
| L6 | RadLab DOSTEL1 / MSL-RAD / estimates per location | `radiationFeeds.json` | | ☑ |
| L7 | Inspiration4 OSD-575 table (glucose, sodium, potassium), Metabolism | `crew_reference_osd575.json` | | ☑ |
| L8 | Threshold source or "Placeholder, medical review pending" | `thresholds.json` | | ☑ |

## 9. Inbox (drawer from the right)

| # | Item | Today | v4 | Flag | Done |
|---|---|---|---|---|---|
| I1 | Badge count | Messages: unsent drafts. Bell: open alerts | Inbox badge = N areas at Watch or worse (same number as the body badge) | ⚠ The draft count would vanish from the top bar. Proposal: badge = N areas (as asked); the "Message" section header shows "N drafts" | ☑ |
| I2 | Alert row: level, title, text, time; View (selects area), Acknowledge, Open (link) | Bell dropdown | Inbox ALERTS; "Open emergency" for Act now alerts | | ☑ |
| I3 | "Emergency handled" → `/emergency/log/:id` | Bell "Open" | Inbox item | | ☑ |
| I4 | Same alert not repeated while open; offline alerts built from statuses | `useMockAlerts`, backend dedupe | Unchanged | | ☑ |
| I5 | Message to surgeon (see D26–D29) | Messages drawer | Inbox | | ☑ |

## 10. Today's routine `/routine` (new page)

| # | Item | Source | Flag | Done |
|---|---|---|---|---|
| T1 | Done/total, progress bar, streak | `/api/missions`, `/api/streaks` | ➕ | ☑ |
| T2 | Timed tasks: daily check 07:30, meals + water, reaction test, exercise, wind-down | `missions.json` + reminders schedule | ➕ ⚠ "Reaction test" and "Wind down" are not missions today. Proposal: add them to `missions.json` as display tasks (reaction: done when a reaction result is saved today; wind-down: manual tick kept in the browser for today). Streak logic unchanged (daily check only) | ☑ |
| T3 | Overdue = orange "Not done · overdue"; done = struck through; upcoming neutral | Mission clock | ➕ | ☑ |
| T4 | Side panel: the 8 daily-check steps + "Start daily check" (→ `/check`, unchanged) | `CheckShell` steps | ➕ | ☑ |
| T5 | Quick log: Meal, Water, Exercise, Weekly biomarkers (→ log drawer) | Log drawer | ➕ | ☑ |
| T6 | Reminders note | Static text | ➕ | ☑ |

## 11. Emergency mode `/emergency`

| # | Item | Today | v4 | Flag | Done |
|---|---|---|---|---|---|
| E1 | Picker: Chest pain or pressure, Crew member not responding, Something else (Heavy bleeding, Choking, Burn, Seizure placeholders), Back to dashboard | EntryScreen | 3 big cards; "Something else" expands to the placeholders | | ☑ |
| E2 | Red header: protocol name, timer, End emergency | Header | Red bar + location + sound toggle | | ☑ |
| E3 | Compact live vitals with Simulated / Mock badges | Strip | Vitals strip with status badges | ⚠ Keep the Simulated / Mock badges (G4) | ☑ |
| E4 | One step per screen: Yes/No checks, timers (Start / Done / "Timer done"), Back / Next, "This is a danger sign", rover limited-kit notes | StepView | Step view with progress dots, help line, timer chip, rover note, "Done, next step" | | ☑ |
| E5 | Red flags list lit by live vitals | RedFlags | Right panel "RED FLAGS · LIVE" | | ☑ |
| E6 | Red flag route "Going to … in 5 s" with Cancel | AutoAdvanceBanner | Banner with Cancel **and Go now** | ➕ Go now | ☑ |
| E7 | Event log (automatic) | EventLog | Right panel | | ☑ |
| E8 | Message to the flight surgeon (auto-built, Send / Send update, delivery per location) | SurgeonMessage | Right panel | | ☑ |
| E9 | CPR: metronome 100–120 (pulsing circle + click), compression counter, 30 + 2 breaths, switch-rescuer every 2 min, Start/Stop, live HR, DRAFT microgravity text | CprGuide | Same + rate stepper (clamped 100–120 from `cpr.json`), "Back to steps", **"Pulse is back"** | ➕ Rate stepper, Pulse is back (logs it and returns to the steps) | ☑ |
| E10 | End summary: duration, steps, log, sent message + delivery, Copy log, saved automatically, "Emergency handled" alert, Back to dashboard | EndSummary | Summary: duration, steps done, message status, Copy log, "Save and close" | ⚠ Today the log is saved when the emergency ends (demo step 8 relies on it). Proposal: keep the automatic save; the button reads "Close" and the line says "Saved · added to Inbox" | ☑ |
| E11 | Camera hand-off: "Not responding" with "Responsive: no" answered; lost pulse → CPR | `preanswer`, `goto` | Same | | ☑ |
| E12 | Demo commands `sendSurgeonMessage`, `endEmergency` | Demo | Same | | ☑ |

## 12. Other pages (restyle only)

| # | Page | Items | Done |
|---|---|---|---|
| P1 | `/check` | Header with progress + Cancel (confirm); 1 Prepare (3 ticks, signal, Start, Skip); 2 Seated rest; 3 Stand (weightless vs gravity wording); 4 Temp & glucose (unit toggle remembered, Inspiration4 line, Skip); 5 BP (Skip); 6 Reaction (3 min / 1-min demo / Skip); 7 Questions (1–5, numbers, Back, Skip question); 8 Summary (vs baseline, regions changed, advice, CSA + Inspiration4, Back to dashboard) | ☑ |
| P2 | `/reaction` | Start full / demo, target, result, CSA comparison, Save result, Take it again, Back to dashboard | ☑ |
| P3 | `/sources` | Cards per source, Real / Simulated / Estimated, amber "TO FILL IN" | ☑ |
| P4 | `/emergency/log/:id` | Duration, answers, messages, full log, Copy log, Back | ☑ |

## 13. Admin `/admin` (hidden)

| # | Control | Done |
|---|---|---|
| AD1 | Database counts, "Live sensor right now", **Reset demo data** (confirm) | ☑ |
| AD2 | **Start demo mode** | ☑ |
| AD3 | Scenario picker Normal day / Slow drift / Acute event ➕ (replaces the header crew picker for the team) | ☑ |
| AD4 | **Replay solar event**: length 5 / 10 / 20 min, Start / Restart, Stop, running status and location scale | ☑ |
| AD5 | **Crew alarm**: Test crew alarm; open the unresponsive protocol as detection would; as a lost pulse would | ☑ |
| AD6 | **Camera debug panel**: turn camera on, every signal, state, timers, pulse status, sliders (this session), reset sliders, skeleton overlay, Demo trigger, Copy as JSON | ☑ |

## 14. Demo mode (8 steps)

| # | Step | Must still do | v4 note | Done |
|---|---|---|---|---|
| S1 | 1 | A, ISS, dashboard, Radiation selected, real RadLab + cabin | Radiation block in the right column, CO₂ pill | ☑ |
| S2 | 2 | A, `/check?demo=summary` | | ☑ |
| S3 | 3 | B, ISS, Heart, draft opened | Opens the Inbox on the draft | ☑ |
| S4 | 4a | B, Mars transit, draft sent, "several minutes" | Inbox delivery countdown | ☑ |
| S5 | 4b | B, rover:mars, Radiation, Curiosity RAD, "Return to base" | | ☑ |
| S6 | 5 | B, Mars transit, solar replay | Act now pop-up fires (shelter) | ☑ |
| S7 | 6a | C, Mars transit, start 170 | Act now pop-up may fire (heart/lungs) | ☑ |
| S8 | 6b | C, chest pain at 440 s, Jump to CPR | Go now / auto route to CPR | ☑ |
| S9 | 7 | A, Mars transit, Start camera / Demo trigger | Camera panel, check-in, crew alarm | ☑ |
| S10 | 8 | Message sent, emergency ended, summary | | ☑ |
| S11 | Presenter bar: Back, Pause (vitals still), actions, Next, ✕; each step resets alarm, solar replay, detection | | Scenario buttons added | ☑ |
| S12 | Public build works with the backend off (replay, solar, drafts in the browser) | | | ☑ |

## 15. Backend-triggered UI events

| # | Event | Source | UI today | v4 | Done |
|---|---|---|---|---|---|
| B1 | Area turns Watch / Warning / Act now | `alerts.check_regions` (source `rules`) via `/ws/alerts` | Bell, banner (red), auto-draft for orange/red | Inbox, Act now pop-up (red), timeline diamond, draft | ☑ |
| B2 | Live vital red | `alerts.check_frame` (source `vitals`) | Bell, banner | Inbox, Act now pop-up | ☑ |
| B3 | Solar event (radiation Act now, shelter) | `radiation.py` (source `rules`) | Bell, banner | Inbox, Act now pop-up, DONKI box | ☑ |
| B4 | Camera alarm "Crew member not responding" | `POST /api/events` (source `cv`) + draft | Bell, crew alarm | Inbox, crew alarm | ☑ |
| B5 | Emergency handled | `POST /api/emergency-logs` (source `emergency`) | Bell "Open" link | Inbox item → log | ☑ |
| B6 | Vitals frames ~1/s | `/ws/vitals` | Vitals cards | Vitals row | ☑ |
| B7 | Sensor plugged in / out | `/ws/sensor` | Source chip + toast | Vitals row label, sidebar footer, toast | ☑ (no sensor attached; replay path verified) |
| B8 | Message delivery and reply | `/api/messages/*`, `/api/delivery/{env}` | Drawer status | Inbox | ☑ |
| B9 | Daily check result | `POST /api/check` | Statuses, missions, streak, Today card | Statuses, routine button, sidebar badge, timeline | ☑ |
| B10 | Backend up / down | `/api/health` | "Runs on board" / "Mock data" | Sidebar footer (G12) | ☑ |
| B11 | Crew alarm + check-in shown in every open tab | BroadcastChannel (`crewAlarm`, `checkInSync`) | Same | Same | ☑ (unchanged; single tab tested) |

---

## Decisions (agreed Nov 15, 2026)

1. **G4**: yes, "Simulated recording" / "Replay (simulated)" tag in the vitals row and the emergency strip for scenario C.
2. **G12**: yes, live green/amber dot for "Runs on board / Mock data" in the sidebar footer.
3. **I1**: yes, Inbox badge = areas at Watch or worse; the drafts count shows inside the Inbox.
4. **D20**: new log drawer tab **"Mood and symptoms"** (mood 1-10 plus symptoms, `POST /api/forms`). Mood is a required
   challenge indicator, so it is not dropped. Brain and mood → "Log mood" opens that tab; Immune → "Log a symptom" opens
   the same tab. "Measure again" → `/check`.
5. **T2**: yes, "Reaction test" and "Wind down" as display tasks; streak logic unchanged.
6. **E10**: automatic save kept; the summary shows **"Copy log"** next to **"Close"**.
7. **O3**: camera panel bottom-left. It must never cover the body-map chips or the "areas need attention" badge; it is
   collapsible to a small pill.
8. **R5**: yes, read-only `/emergency/logs`.
9. **D29**: the API key stays on the backend only (the frontend never sees it). With no key or no internet the
   "Polish wording" button is hidden, not shown as an error.

---

## Verification (Nov 15, 2026)

Run in the real app (Vite dev server + FastAPI backend with a scratch database, Microsoft Edge headless via Playwright),
1440 x 1000:

- **Every page** (`/`, `/routine`, `/check`, `/check?demo=summary`, `/reaction`, `/sources`, `/admin`, `/emergency`
  picker / steps / CPR / summary, `/emergency/logs`, the log drawer "Mood and symptoms", the sidebar, the Inbox, the Learn
  pop-up, the Act now pop-up, the crew alarm): rendered, screenshot reviewed, **no page or console errors**.
- **Interactions:** M mutes and unmutes; Escape closes the sidebar and Inbox; location switch from the sidebar; CO₂ pill
  selects Lungs and air → Cabin CO₂; Radiation pill selects Radiation; timeline drags and Now recentres; camera on shows
  the panel right of the body map (never over the chips or badge), collapses to a pill; demo trigger → "Are you OK?" (the
  Act now pop-up stays hidden under it) → no answer → crew alarm → "I'm responding" opens the unresponsive protocol with
  `preanswer=responsive:no`; "Polish wording" is hidden without a key.
- **Act now:** fires in scenario C (backend red vitals alert) with the steps from guidance.json and "Alarm sounding · M to
  mute"; fires for the solar event in demo step 5.
- **Demo steps 1-8 (all 10 incl. 4a/4b, 6a/6b) with the backend OFF** (frontend pointed at a dead address): every step
  shows what it should, the "Mock data" tag is visible, Shift+D leaves demo mode, no page errors.
- **3 scenarios x 5 locations with the backend OFF:** all 15 dashboards render (body map, timeline, pills, Inbox); the
  rover adds "Return to base" at both planets.
- **Tests:** frontend `tsc` clean and 56 / 56 vitest tests pass; backend 105 / 105 pytest tests pass (4 new: assist status
  and polish without a key, the key never returned, the mood form validation).

**Found and fixed during the pass:** top bar wrapped at 1440 px (merged name, location and surgeon link into one block);
alerts raised at the same time overlapped on the timeline (now grouped: "Heart: Warning +2"); sidebar showed Moon base and
Mars transit radiation as "real" (now from the exported feed snapshot, so only ISS and rover:Mars are real); Inbox times
were local while the mission clock is GMT (now GMT); the offline "Mock data" label was only in the closed sidebar (now
also in the vitals row).

**Not verifiable here:** sounds (headless browser; the beep, siren and metronome all go through the shared muted output,
unchanged), a real finger-clip sensor, a real Claude call for "Polish wording" (no key on this machine).
