# Final gap audit

Nov 15, 2026, about 20:30 GMT. Report only: no code was changed for this audit.

**What was tested.** The working tree as of HEAD `731bb62` plus the 72 uncommitted files from the medical merge.

- **Browser runs:** real Chrome (headless, via Playwright), 1440 × 900.
- **Builds:** a frozen production build served with `vite preview`, so team edits made during the audit could not change results mid-run.
- **Backend:** a separate FastAPI on :8021 with a scratch database. The team's :8000 server and `app.db` were not touched.
- **Backend off:** the same build with that backend stopped.
- **PPG:** PhysioNet BIDMC record 01, downloaded for the Measurement-mode replay.

**Not verifiable here:**
- What the sounds actually sound like. The beep was confirmed by counting WebAudio oscillators, not by listening.
- A real finger clip.
- A real Claude call for "Polish wording" (no key).
- The other 52 BIDMC records (only record 01 was downloaded).

## Summary

| Area | Result |
|---|---|
| Tests and build | **Pass.** Backend 317 passed, 1 xfail. Frontend 121 / 121, `tsc` clean, `vite build` OK. |
| Challenge requirements | **Pass** on every item. The disclaimer and the "safe advice" rule have gaps (see Blockers). |
| v4 feature checklist | **Mostly pass.** 3 regressions: top bar wraps again, camera panel covers content, README out of date. |
| Medical integration | **Partial.** Oxygen instruction in the Lungs Act now steps. 9 thresholds have no rule or Team-default label. Disclaimer not on the main screens. |
| PPG | **Pass** in the browser: BIDMC 01 reads 90–94 bpm against the monitor's 89–95. The docs disagree with each other on the validation numbers. |
| 3 demo scenarios × 5 locations | **Mostly pass**, backend on and off. No location breaks anything. Slow drift shows no forward forecast (S13). |
| Robustness | **Pass.** No external requests. Only console error: missing favicon (404). Offline build works. |
| Submission readiness | **Not ready.** The medical merge is uncommitted. The README lacks a one-command run, screenshots, an AI-use statement and a limitations section. |

---

## Blockers (must fix before the demo or submission)

| # | Item | File : line | Fix time |
|---|---|---|---|
| B1 | **The medical merge is not committed.** 72 changed files, including untracked files that committed code imports: `frontend/src/hooks/useMedical.ts`, `frontend/src/components/emergency/routing.ts`, `frontend/src/lib/symptoms.ts`, `backend/data/indicators.json`, `backend/data/references.json`, `backend/app/symptoms.py`, `backend/app/rules/daily_rules.py`, `backend/scripts/import_medical.py`, `data/medical/*.csv` and the mocks. A fresh clone of `main` would not match what was demoed, and the files are only on one laptop. | `git status` (repo root) | 10 min |
| B2 | **The Lungs "Act now" steps tell the astronaut to use oxygen:** "Use the emergency oxygen mask." It shows in the Act now pop-up ("DO THIS NOW") and in What to do. This breaks the medical lead's rule (Integration & Safety: "Never embed medications/doses/devices not actually onboard"; protocol header: "The app prescribes no drugs, doses, oxygen or IV"). The same text is in the mock and in Yenna's source file. | `backend/data/guidance.json:163`, `frontend/src/mock/guidance.json:163`, `docs/medical/guidance.json:86` | 10 min (Yenna words it, then `export_mocks.py`) |
| B3 | **"Research prototype · not clinically validated" is not visible on the main screens.** It appears only inside the closed sidebar and on `/sources`. Missing on the dashboard, in emergency mode, and in Measurement / Research mode (all checked in the browser). The medical lead's sheet requires it: "Do not label clinical validated or safe for operational deployment." | `frontend/src/components/shell/Sidebar.tsx:104` (only place on the main UI); add to the top bar or vitals row, `EmergencyChrome.tsx`, `SignalDashboard.tsx` | 20 min |

## Should fix (visible to judges)

| # | Item | File : line | Fix time |
|---|---|---|---|
| S1 | **The status line contradicts itself during the acute event.** Persona C shows "ACT NOW · Heart" next to "Resting heart rate steady at 61.6 bpm over the last 7 days". The status comes from live vitals; the sentence is the daily reason. The "Live vitals: Act now" pill is there, but the main sentence reads as calm. | `frontend/src/components/dashboard/RightColumn.tsx:43` | 20 min |
| S2 | **The top bar wraps to two rows again at 1440 px** in Mars transit (longer "several minutes delay" link text) and during the solar event ("Solar event" in the radiation pill). This regresses the fix noted in the v4 checklist. | `frontend/src/components/shell/TopBar.tsx:254-272` | 20 min |
| S3 | **The camera panel covers the right column.** It sits at a fixed `lg:left-[616px]`, which assumed the old 600 px body-map column. The column is now narrower (it scales to the window height), so the panel covers the metric tabs, the big value and What to do. Caused by the Nov 15 one-page dashboard change. | `frontend/src/components/cv/CameraMonitor.tsx:50` | 15 min |
| S4 | **9 thresholds trace to no `RULE-xx` and are not labelled Team default.** The Learn pop-up then shows "PLACEHOLDER". Affected: `stand_hr_rise` (201), `stress` (463), `symptoms_immune` (480, visible in Immune → Learn as "PLACEHOLDER"), `body_mass_change_pct` (546), `cabin_temp_c` (829), `cabin_noise_dba` (851), the `red_flags` `hr_very_low` / `hr_very_high` / `spo2_critical` (1088, 1096, 1104). `pvt_median_ms` / `pvt_lapse_rate_pct` (992, 1033) cite CSA PRET but have no rule ID and no Team-default label. The top-level `_status` and `source` still say PLACEHOLDER (lines 2, 4). Everything else traces correctly (RULE-01…17, `band_sources` sheet / team-default). | `backend/data/thresholds.json` (lines as listed) | 30 min (Yenna: add a RULE ID or `"team-default, pending Yenna"`) |
| S5 | **5 references show an empty "No link yet:" note instead of "needs verification".** REF-03/04/05/06 have the status "Needs citation/claim verification" (shown only in the "Checked" row). REF-09 has no link and no "needs verification" wording at all. The importer writes `url_note: ""` when the CSV has no URL. | `frontend/src/pages/Sources.tsx:111`, `backend/scripts/import_medical.py:169`, `backend/data/references.json` | 10 min |
| S6 | **`/sources` still shows "TO FILL IN" twice:** BIDMC "Validation result (Jian)" and PhysioNet Challenge 2015. The numbers exist (`docs/validation/`, `docs/ppg-review.md`). | `backend/data/sources.json:252`, `:283` (then `gen_sources_table.py` for the README) | 10 min |
| S7 | **The README is out of date after the merges:** <br>• line 47 "The header's **Mode** selector": it was removed from the Demo top bar; reach it with `?mode=measurement` <br>• line 166 "Red flags move the protocol on by themselves… → oxygen step… → CPR": no longer true; `red_flag_routes` are empty and no sensor auto-routes <br>• line 41 "**On-board · offline**", line 160 "Jump to event button in the header", line 173 "Dashboard Messages button": old header wording; now sidebar footer, vitals row (demo only) and Inbox | `README.md:41,47,160,166,173` | 20 min |
| S8 | **The README is missing submission items:** <br>• **one-command run** (today it is 2 terminals plus a venv) <br>• **screenshots** (none) <br>• **AI-use statement** (Claude / Claude Code: nothing in the README) <br>• **limitations section** (the PPG limits sit inside the PPG section; nothing on simulated personas, unvalidated thresholds or no astronaut data) <br>Team roles (lines 214–220), data sources (92–112) and the MIT licence (222–224) are present. | `README.md` | 45 min |
| S9 | **The PPG validation numbers disagree between docs.** The `ppg-review.md` summary (line 34) still gives the pre-fix 91.7% within ±5 bpm and a 0.87 bpm median, while its top section (lines 20–23) says 91.9% and a 2.59 pooled MAE after the motion check. `INTEGRATION_STATUS.md:15` only gives the MAE for records 01 and 02. The README has none. The latest full run (53 records) could not be repeated here (only BIDMC 01 available). The record 01 replay in the browser agrees with `bidmc_01_development.json`. Pick one set and quote it the same way everywhere. | `docs/ppg-review.md:20-23,34`, `docs/INTEGRATION_STATUS.md:15`, `README.md` | 15 min |
| S10 | **The collapse check-in waits 15 s before the crew alarm.** The medical lead's sheet says "Crew alarm must not wait for response timer in an actual emergency", and "Collapse duration" is still UNDECIDED (Integration & Safety). A lost pulse already skips the wait; the camera path does not. Agree a wording with Yenna, e.g. alert the crew at the start of the check-in. | `frontend/src/cv/useUnresponsiveDetection.ts`, `thresholds.json` `cv` | 15 min to decide + 20 min to change |
| S11 | **Emergency "Something else" says "PLACEHOLDER: these protocols are not written yet"** and "Protocols coming (placeholder)". Honest but rough on screen. Reword to "Not in this prototype: call your crew and the flight surgeon." | `frontend/src/components/emergency/EntryScreen.tsx:34,39` | 5 min |
| S13 | **The slow-drift demo shows no "time to act" forecast.** Persona B on day 45 has already reached Warning (`time_to_act_days: 0` for heart and brain), so the screen says "act today" and the timeline has no forecast diamond. Demo step 3 promises "heart at Warning with the time-to-act forecast". Fix: start step 3 earlier in B's replay (heart at Watch, forecast "Warning in about N days"), or forecast the next level (Warning → Act now) when one exists. | `frontend/src/components/demo/demoSteps.ts:83-90`, `backend/app/rules/` forecast, `frontend/src/components/dashboard/RightColumn.tsx:21` | 30 min |
| S12 | **Missing favicon:** the only console error in the whole click-through (404 on every page). | `frontend/index.html` | 5 min |

## Fine to leave

| # | Item | File : line | Why it can stay |
|---|---|---|---|
| F1 | Build warning: one 1.5 MB JS chunk | `frontend/vite.config.ts` | Runs locally; load time is fine for a demo. |
| F2 | "Polish wording" makes a HEAD request to `api.anthropic.com` when the Inbox opens | `backend/app/routers/assist.py:47` | Only with `ANTHROPIC_API_KEY` set, cached 60 s, and part of the one allowed online helper. No other external request was seen in any run. |
| F3 | DRAFT / PLACEHOLDER markers inside data files (about 420 lines, Appendix A) | `backend/data/*.json`, mocks | The UI strips `DRAFT:` and shows a badge instead. In the browser only the items in S4, S6, S11 and A1 below reached the screen. |
| F4 | `/sources` notes "Constant DRAFT value…", "DRAFT factor per location", "(DRAFT, Yenna reviews)" | `backend/data/sources.json:91,133,202` | An honest status label for estimates, on the page meant for it. |
| F5 | Measurement mode: PRV still "warming up" 60 s into the BIDMC 01 replay | `packages/crewsense-signals` | The README says it needs 60 s of contiguous usable samples; pulse rate (the demoed value) appears after about 10 s. |
| F6 | Learn "How to measure" (Master Catalog) describes a chest strap and an ISS laptop | `backend/data/indicators.json` | Yenna's catalog text; the "In this app:" line under it describes the finger clip. |
| F7 | `.claude/skills/*` (third-party skill files) and two PDFs in `docs/` are committed | repo | Small, no secrets. Remove before going public if the skill licences are unclear. |
| F8 | `npm run build` copies 41 MB of MediaPipe models into `dist/` | `frontend/public/models` | Needed for the camera; under GitHub limits (largest file 5.8 MB). |

---

## 1. Challenge requirements

| Requirement | Result | Where in the app |
|---|---|---|
| Blood pressure | Pass | Daily check step 5 (cuff entry); Heart → "Blood pressure, top/bottom number" tabs (`bp_sys`, `bp_dia`, RULE-04) |
| Heart rate | Pass | Vitals row (live), Heart → Resting heart rate (RULE-01), Measurement mode PPG pulse rate |
| Blood sugar | Pass | Daily check step 4 (unit toggle, Inspiration4 reference); Metabolism → `glucose_mmol` (RULE-08) |
| Temperature | Pass | Daily check step 4; Immune → `temp_c` (RULE-07) |
| Sleep | Pass | Brain and mood → `sleep_h` (RULE-10), chip shows hours |
| Mood | Pass | Questionnaire, "Mood and symptoms" log tab; Brain and mood → `mood` (RULE-11) |
| SpO₂ | Pass | Vitals row; Lungs → `spo2` (RULE-03). Measurement mode honestly says "not computed" |
| Breathing | Pass | Vitals row; Lungs → `rr` (Team default) |
| Radiation | Pass | Top-bar pill, Radiation area (now / today / 30 days / mission), DONKI box |
| Cabin CO₂ | Pass | Top-bar pill; Lungs and air → Cabin CO₂ (RULE-17) |
| Guidance: What to do / Learn / How to stay healthy | **Partial** | What to do checklist + Who to tell ladder (right column); Learn pop-up (Master Catalog); prevention list in Learn. Partial only because of B2 (oxygen). |
| Clickable human figure | Pass | Body map: zones and chips are buttons that select the area (`BodyMapV4.tsx:136,153`) |
| Locations with their own radiation source and surgeon delay | Pass | ISS 0–2 s, RadLab DOSTEL1 (real); Moon base 1–3 s, estimate; Mars transit 180–1320 s, estimate; rover Moon 1–3 s, estimate; rover Mars, Curiosity RAD (real). Top bar link text and sidebar badges change; rover adds "Return to base". |
| Routine prompts | Pass | Reminders 07:30 / 12:30 / 16:00 / 19:00, `/routine`, top-bar "Today's routine" |
| Gamification (streak) | Pass | `/routine` streak, top-bar "▲ N" (behaviour only, never health results) |
| Dynamic charts | Pass | Metric chart 7 / 30 days with Watch / Warning lines and forecast; radiation 24 h chart; live sparklines |
| Colour coding | Pass | Body zones, chips, vitals row, timeline diamonds |
| Plain-language instructions | Pass | Status words Nominal / Watch / Warning / Act now; "several minutes of delay". Exception: S11. |

## 2. v4 feature checklist (re-run row by row)

Every row in `docs/v4-feature-checklist.md` was re-checked in the browser or, where noted, in the code. Only rows that changed are listed.

| Row | Status now | Note |
|---|---|---|
| G14 / K1 Mute + M key | Pass | M shows and clears "Muted"; the Act now pop-up shows "Alarm sounding · M to mute". |
| G15 Camera toggle | Pass, layout issue | Turns on (fake camera), shows posture / limb motion / still-for / fall check / pulse; turns off. Panel overlaps content: **S3**. |
| G-row "top bar fits at 1440 px" (Verification) | **Regressed** | **S2** (Mars transit, solar event). |
| Mode selector (PPG merge) | Changed | Removed from the Demo top bar on Nov 15; still in the Measurement / Research bar; `?mode=` works. README not updated (**S7**). |
| D25 Mission timeline | Pass, changed | Now collapsed by default with a one-line summary; "Show timeline" expands it; drag moves it (checked: transform changed by 250 px); shows every alert including emergencies. |
| D26–D28 Inbox, auto-drafted message | Pass | Persona B: "✦ Auto-drafted from your data"; also offline. |
| D29 Polish wording | Pass | Hidden without a key (no key on this machine). |
| O4 "Are you OK?" | Pass | Demo step 7, Demo trigger → overlay. |
| O5 Crew alarm | Pass | No answer → crew alarm; `/admin` "Test crew alarm" also opens it. |
| O7 Demo presenter bar, K2 / K3 shortcuts | Pass | All 10 steps (1, 2, 3, 4a, 4b, 5, 6a, 6b, 7, 8) on the right screen and URL, backend on and off; Shift+D exits. |
| O9 / A1–A8 Act now pop-up with beep | Pass | Acute: "ACT NOW · HEART", oscillators started (4), "M to mute". Solar: "ACT NOW · RADIATION" with shelter steps at all 5 locations. |
| O10 / L1–L8 Learn pop-up | Pass | Uses the Master Catalog (indicators.json): data source, how to measure, why in space, normal range, limitations. "PLACEHOLDER" tag on Immune (**S4**). |
| T1–T6 Routine page and streak | Pass | |
| P1 `/check` 8 steps | Pass | Browser run saw steps 1, 4–8 ("Skip measurement" jumps over 2–3 by design); steps 2–3 present in `DailyCheck.tsx:108-118`. |
| P2 `/reaction`, P3 `/sources`, P4 `/emergency/log/:id` | Pass | `/emergency/log/1` opened from `/emergency/logs` after demo step 8, "Copy log" present. `/sources` issues: **S5**, **S6**. |
| AD1–AD6 `/admin` | Pass | Reset demo data, Start demo mode, scenario picker, Replay solar event (start / stop), crew alarm tests, camera debug panel all present; reset and solar replay exercised. |
| E11 camera / lost-pulse hand-off | Changed (by design) | No `preanswer` or `goto=cpr` any more; both open the collapse protocol at CL00 (see §3). |

## 3. Medical integration

| Check | Result | Note |
|---|---|---|
| Every threshold traces to `thresholds_recommended.csv` or is labelled Team default | **Partial** | 22 metrics trace to RULE-01…17 (all IDs exist in the CSV) with per-band `sheet` / `team-default` sources. 9 do not: **S4**. |
| Every REF ID links to `Scientific_References.csv`; unlinked ones say "needs verification" | **Partial** | All 17 cited REF IDs exist in `references.json` (none missing). 5 have no URL and show an empty "No link yet:" note: **S5**. |
| Learn pop-up uses the Master Catalog | Pass | `LearnDialog.tsx:17,49,66` → `useIndicators()` → `indicators.json` (17 indicators). |
| Emergency mode uses CL00–CL13 and CP00–CP07, with no oxygen or drug instructions | **Partial** | Both protocols have exactly those nodes, start at CL00 / CP00, `red_flag_routes: []`, and every step note says no drugs / oxygen / IV. **But** the Act now pop-up's Lungs steps (which lead into emergency mode) say "Use the emergency oxygen mask": **B2**. |
| A sensor never pre-answers a step or auto-routes to CPR | Pass | Browser: acute event → pulse lost → "Open emergency mode" → `/emergency?protocol=unresponsive&trigger=alarm&flag=pulse_lost` at CL00 "Possible collapse…", not CPR. Code: `crewAlarm.ts:28-33` "Nothing is pre-answered". Camera path → CL00 as well. |
| "Research prototype · not clinically validated" visible | **Partial** | Sidebar and `/sources` only: **B3**. |

## 4. PPG

| Check | Result | Note |
|---|---|---|
| BIDMC 01 replay shows the right pulse rate | Pass | Measurement mode, `bidmc_01_Signals.csv`: 94 → 90 bpm over the first 60 s. Monitor HR for the same stretch: 89–95 bpm (mean 93). |
| Poor signal greys out | Pass | Research synthetic "dropout" and "noise": optical checks "unusable" → value held and greyed with "signal weak", then cleared (`signalViewModel.ts:52-59`). Stop → "Disconnected · source ended", no numbers. |
| No automatic alerts | Pass | No Act now pop-up in Measurement or Research in any run; SpO₂ shows "unsupported channel", no breathing card. |
| README measured vs simulated table | Pass | Matches what the browser showed (pulse rate and PRV measured; SpO₂, breathing, rhythm and pulse_lost not computed outside Demo). |
| Validation numbers match the latest run | **Partial** | **S9.** Records 01 / 02 in `docs/validation/` match `ppg-review.md` (MAE 0.9367 / 0.6183). The headline ±5 bpm and median numbers differ inside `ppg-review.md`. |

## 5. The three demo scenarios

| Check | Result |
|---|---|
| Normal day: all Nominal | Pass at all 5 locations ("All areas nominal"). |
| Slow drift: heart at Watch or Warning, forecast shown | **Partial.** Heart is at Warning at all 5 locations ("2 areas need attention"). **No forward forecast:** persona B's heart and brain are already orange with `time_to_act_days: 0`, so the status line says "Warning reached: act today." and the timeline shows no ◇ forecast (its summary reads "1 health concern…", no forecasts). See **S13**. |
| Acute event: "ACT NOW · HEART", the beep, then the collapse protocol at CL00 | Pass (`?persona=C&env=iss&start=420`). Status-line wording: **S1**. |
| Solar replay fires Act now | Pass at ISS, Moon base, Mars transit, rover Moon, rover Mars; also offline (demo step 5). |
| 3 scenarios × 5 locations | All 15 render with the backend on and off. **No location breaks anything.** Only layout issue: Mars transit widens the top bar (**S2**). |

## 6. Robustness

| Check | Result |
|---|---|
| Backend tests | 317 passed, 1 xfailed (`pytest -q tests ../packages/crewsense-signals/tests`) |
| Frontend tests | 121 / 121 (`vitest run`), `tsc --noEmit` clean |
| Build | `vite build` OK (chunk-size warning, F1) |
| Console errors during the full click-through | Only the favicon 404 (**S12**). Errors seen once at `rover:moon` came from the dev server hot-reloading files edited during the audit, and did not occur on the frozen build. |
| Network calls | None outside localhost in any run (all pages, all scenarios, demo, camera). Only the optional `api.anthropic.com` check (F2). |
| Public demo build with the backend off | Pass: 15 dashboards, "Mock data" label, offline auto-draft, all 10 demo steps, solar Act now, no page errors. |

## 7. Submission readiness

| Check | Result |
|---|---|
| README: what it is | Present (lines 1–6) |
| README: run in one command | **Missing** (**S8**) |
| README: screenshots | **Missing** (**S8**) |
| README: team roles | Present (214–220) |
| README: data sources, real vs estimate | Present (92–112), with 2 "TO FILL IN" (**S6**) |
| README: limitations | **Partial**, PPG only (**S8**) |
| README: AI-use statement (Claude, Claude Code) | **Missing** (**S8**) |
| README: licence | Present (MIT, `LICENSE`) |
| Sources page / doc listing every external dataset and URL | Pass: `/sources` and README cover every host used in code (NASA OSDR / visualization, DONKI api.nasa.gov, CSA PRET, open.canada.ca, PhysioNet). "Dose estimates from published papers" has no URL (papers are cited in `thresholds.json:1206-1216`). |
| No secrets or `.env` committed | Pass (no keys found; only `.env.example`) |
| No large files over GitHub limits | Pass (largest 5.8 MB, `.git` 11 MB) |
| `.gitignore` covers env, raw data, db, builds | Pass |
| Uncommitted work | **B1** |

---

## Top 5 fixes, in order

1. **B1:** commit the medical merge (10 min). Nothing else counts until it is in git.
2. **B2:** remove "Use the emergency oxygen mask" from the Lungs Act now steps (Yenna words it, then `export_mocks.py`) (10 min).
3. **B3:** put "Research prototype · not clinically validated" on the dashboard, emergency mode and the Measurement screen (20 min).
4. **S13 + S1 + S2 + S3:** the slow-drift forecast (the "time to act" story), status-line wording in the acute event, top bar on one row at Mars transit, camera panel position (about 1 h 25 min; all on the demo path).
5. **S7 + S8:** README: fix the stale lines, then add one-command run, screenshots, limitations and the AI-use statement (about 65 min).

---

## Appendix A: every TODO / DRAFT / Placeholder / lorem in the repo

Generated by `grep -n -E "TODO|DRAFT|[Pp]laceholder|PLACEHOLDER|lorem|Lorem"` over tracked and untracked files, excluding `node_modules`, binaries and lock files.

**A1. Shown on screen** (checked in the browser across all areas, Learn, emergency, `/sources`, `/check`, `/routine`, `/reaction`):

- `frontend/src/components/emergency/EntryScreen.tsx:34`: "Protocols coming (placeholder)" (S11)
- `frontend/src/components/emergency/EntryScreen.tsx:39`: "PLACEHOLDER: these protocols are not written yet…" (S11)
- `backend/data/thresholds.json:495` (`symptoms_immune` source PLACEHOLDER): Immune → Learn shows "PLACEHOLDER" and "Limits for Infection-type symptoms: placeholder (Team default)" (S4)
- `backend/data/sources.json:252, 283`: "TO FILL IN" on `/sources` (S6)
- `backend/data/sources.json:91, 133, 202`: DRAFT notes on `/sources` (F4)
- `frontend/src/components/emergency/CprGuide.tsx:107`: "Microgravity position (DRAFT, medical lead to confirm)" (CPR screen; honest, F3)
- `backend/data/escalation.json:60`: "PLACEHOLDER REPLY (simulated)…" (shown after "Simulate reply", demo only)

**A2. Full list by file** (line numbers). Mocks in `frontend/src/mock/` mirror `backend/data/`.


**App code and data (backend/app, backend/data, frontend/src)** (158 lines)

- `backend/app/messaging.py`: 78, 82
- `backend/app/models.py`: 166
- `backend/app/radiation.py`: 59, 122
- `backend/app/radiation_feed.py`: 1, 100
- `backend/app/routers/core.py`: 78, 86
- `backend/app/rules/pvt.py`: 1
- `backend/data/cabin_simulated.json`: 2
- `backend/data/cpr.json`: 2, 10, 11, 12
- `backend/data/environments.json`: 152, 157, 168, 182, 192, 197, 198, 199, 200, 201
- `backend/data/escalation.json`: 2, 60, 68, 69
- `backend/data/guidance.json`: 39, 94, 147, 201, 254, 308, 358
- `backend/data/measurements.json`: 2, 62, 135, 137, 138, 140, 143, 194, 196, 198, 201, 205, 207, 209, 212, 216, 218, 220, 223, 238, 240, 242, 245, 249, 251, 253, 256, 260, 262, 264, 267
- `backend/data/questionnaire.json`: 2, 160, 206
- `backend/data/regions.json`: 15, 37, 74, 102, 136, 161, 187, 210
- `backend/data/sources.json`: 69, 91, 133, 202
- `backend/data/space_weather/event.json`: 130, 151
- `backend/data/thresholds.json`: 2, 4, 216, 478, 495, 561, 734, 776, 844, 849, 866, 1004, 1045, 1075, 1094, 1102, 1110, 1123, 1126, 1130, 1133, 1188, 1198, 1201, 1206, 1211, 1216, 1220
- `frontend/src/components/check/BloodPressureStep.tsx`: 51, 57
- `frontend/src/components/check/TempGlucoseStep.tsx`: 54, 73
- `frontend/src/components/dashboard/LearnDialog.tsx`: 5, 22, 24, 32, 65, 69, 104, 121, 142, 144, 146, 150, 153
- `frontend/src/components/dashboard/MetricInfo.tsx`: 49, 51, 93, 95
- `frontend/src/components/demo/demoSteps.ts`: 85
- `frontend/src/components/emergency/CprGuide.tsx`: 107, 108
- `frontend/src/components/emergency/EntryScreen.tsx`: 12, 15, 34, 39
- `frontend/src/components/emergency/SurgeonMessage.tsx`: 48, 49
- `frontend/src/hooks/useMessages.ts`: 50, 51
- `frontend/src/lib/env.ts`: 40, 41, 42
- `frontend/src/lib/solarOffline.ts`: 3
- `frontend/src/lib/surgeonDraft.ts`: 46
- `frontend/src/pages/SignalDashboard.tsx`: 49
- `frontend/src/state/AppContext.tsx`: 36, 38
- `frontend/src/types/contracts.ts`: 315, 340, 453, 460, 481, 496

**Offline mocks (mirror backend/data)** (105 lines)

- `frontend/src/mock/cpr.json`: 2, 10, 11, 12
- `frontend/src/mock/environments.json`: 159, 205, 219, 229, 234, 235, 236, 237, 238, 241
- `frontend/src/mock/escalation.json`: 2, 60, 68, 69
- `frontend/src/mock/guidance.json`: 39, 94, 147, 201, 254, 308, 358
- `frontend/src/mock/measurements.json`: 2, 62, 135, 137, 138, 140, 143, 194, 196, 198, 201, 205, 207, 209, 212, 216, 218, 220, 223, 238, 240, 242, 245, 249, 251, 253, 256, 260, 262, 264, 267
- `frontend/src/mock/missions.json`: 1
- `frontend/src/mock/questionnaire.json`: 2, 160, 206
- `frontend/src/mock/radiationFeeds.json`: 1216, 1264, 1312
- `frontend/src/mock/regions.json`: 15, 37, 74, 102, 136, 161, 187, 210
- `frontend/src/mock/solarEvent.json`: 130, 151
- `frontend/src/mock/sources.json`: 69, 91, 133, 202
- `frontend/src/mock/thresholds.json`: 2, 4, 216, 478, 495, 561, 734, 776, 844, 849, 866, 1004, 1045, 1075, 1094, 1102, 1110, 1123, 1126, 1130, 1133, 1188, 1198, 1201, 1206, 1211, 1216, 1220

**Scripts and tests** (31 lines)

- `backend/scripts/import_medical.py`: 141
- `backend/scripts/fetch_donki.py`: 53, 57, 137
- `backend/scripts/make_cabin.py`: 5, 39
- `backend/scripts/make_personas.py`: 5, 48
- `backend/scripts/merge_medical.py`: 10, 12, 13, 166, 167, 179, 184, 185, 186, 187, 189, 190, 191, 195, 208
- `backend/tests/test_escalation.py`: 38, 100
- `backend/tests/test_medical_text.py`: 47, 48, 49
- `backend/tests/test_nasa_env.py`: 155
- `backend/tests/test_pvt_norms.py`: 1, 25

**Docs, design files and README** (127 lines)

- `docs/medsci-integration-report.md`: 40
- `README.md`: 99, 103, 218
- `design-handoff/v4/Emergency-v4.dc.html`: 35, 48, 51, 58, 61, 63, 73, 76, 83, 87, 93, 110, 118, 138, 150, 193
- `design-handoff/v4/Main-v4.dc.html`: 69, 92, 97, 100, 135, 141, 164, 185, 201, 203, 223, 229, 236, 245, 261, 267, 273, 280, 296, 301, 323, 328, 335, 344, 356, 632, 634, 635, 637
- `design-handoff/v4/Routine-v4.dc.html`: 34, 48, 56
- `docs/NASA_SIGNAL_INTEGRATION_PLAN.md`: 168
- `docs/contracts.md`: 43, 67, 81, 88, 89, 142, 148, 151, 185, 222, 234, 236, 255, 256, 276, 290, 299, 312
- `docs/cv-explained.md`: 155, 198
- `docs/design/dashboard-v1.dc.html`: 38, 73, 105, 119, 122, 140, 154, 176, 179, 212, 217, 224, 264, 266, 279, 291
- `docs/medical/guidance.json`: 18, 48, 78, 108, 138, 168, 198
- `docs/medical/measurements.json`: 27
- `docs/resources.md`: 8, 9, 10, 11, 15, 19, 20, 26
- `docs/todo.md`: 27, 47, 79, 81, 113, 124
- `docs/ui-guide.md`: 11, 137, 138, 146, 148, 195, 201, 231, 293, 298
- `docs/v4-feature-checklist.md`: 120, 153, 155, 160, 187, 195

**Other (.claude skills, firmware, ml)** (8 lines)

- `.claude/skills/output-skill/SKILL.md`: 3, 16
- `.claude/skills/redesign-skill/SKILL.md`: 43, 81, 88
- `.claude/skills/taste-skill/SKILL.md`: 118, 124, 185

Total: 429 lines in 71 files (this report excluded).
