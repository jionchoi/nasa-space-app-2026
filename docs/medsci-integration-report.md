# Medical sheet integration: report for Yenna

Nov 15, 2026. Source files are in `data/medical/`. To re-import after a new export, run `python backend/scripts/import_medical.py`. Everything here applies to Demo mode only: Measurement and Research mode (real PPG) still raise no automatic alerts (`clinical_auto_alert_enabled = false`).

## What was imported

| Sheet | Goes to | Used for |
|---|---|---|
| Threshold sheet, RULE-01 to RULE-17 | `backend/data/thresholds.json` | Each metric gets `rule_id`, `ref_ids`, `evidence_status`, `validation_status`, `demo_only`, `qa_note`, `actions.watch/act`, `requires_symptoms`, and the sheet's own text. Bands: Watch = yellow, Warning = orange, Act now = red. Each band says where it came from in `band_sources`. |
| Scientific References, REF-01 to REF-17 | `backend/data/references.json` | Linked from the Learn pop-up, the emergency steps and the Sources page. |
| Master Health Indicator Catalog | `backend/data/indicators.json` | The Learn pop-up shows: how to measure (3 steps), what it measures, why it matters in space, how spaceflight affects it, normal range, limitations, citation and URL, and the data source tag. |
| Collapse Protocol CL00–CL13 and Chest Pain Protocol CP00–CP07 | `backend/data/protocols/*.json` | Node IDs, yes/no branches, Next, urgency and cited sources exactly as given. Source codes map AHA_BLS_2025 → REF-10, SPACE_CPR_2020 → REF-16, ER_2011 → REF-15, AHA_FIRST_AID_2024 → REF-11. |
| Integration & Safety | `indicators.json` "safety" | Implemented as follows. "Research prototype · not clinically validated" is in the footer and on the Sources page. Each indicator is tagged Live, Manual, Simulation or Mission device. The 1–10 mood score is labelled as not validated. Sensors never answer a protocol step. |

**Skipped, as agreed:** RULE-06 (stand test), RULE-14 (bone biomarkers) and RULE-15 (immune biomarkers).

## Team defaults for you to approve

These values are not on the sheet and are pending medical review. Each one is marked `team-default` in the data and shown as "Team default" on screen (Learn pop-up).

| Metric | Team default |
|---|---|
| Resting heart rate | Warning 41–49 or 101–120 bpm, or Watch for 3 days in a row. Watch also starts **more than 10 bpm above usual** (the sheet says 15), so the slow-drift persona shows. |
| Live heart rate | 50–59 bpm counts as normal (live, not morning resting). Act now needs 10 s in a row with a good signal. |
| HRV | Warning when the drop holds for 3 or more days. Never Act now. |
| SpO₂ | Warning 90–91%. Act now needs 10 s in a row ("repeated"). |
| Blood pressure | Watch needs 2 readings in a row ("repeated"). 121–129 / 81–84 count as normal. 140–159 / 90–99 count as Watch. Low BP is not judged. |
| Rhythm (PPG) | A separate Warning for "irregular flag repeated" is **not built**: the daily data has no rhythm field. |
| Temperature | 36.0–36.5 °C is Watch. Normal goes up to 37.4 °C (the sheet's normal range is 36.5–37.2). |
| Glucose | 140–180 mg/dL is Watch. "Repeated high" means 2 readings above 180. Fasting is not recorded. |
| Sleep | 6–7 h counts as normal. One short night is not enough to trigger anything. |
| Mood | The daily check uses 1–5; the rules double it onto your 1–10 scale. 6/10 is Watch. Warning needs 3 days. |
| Water | 2.0–2.5 L counts as normal. |
| Calories | Warning below 65% for 3 days. The app has no calorie log, so this is shown in Learn only. |
| Exercise | Planned volume is 30 min/day, so Watch is below 25.5 min/day. Missing 2 days in a row gives Warning ("plan review"). |
| Breathing rate | Watch above 20, Warning above 24, Act now above 30 or below 8 /min. |
| Red-flag symptoms | Chest pain, fainting, severe breathlessness and confusion are Act now. They also satisfy every "WITH symptoms" rule for 60 minutes. |
| pulse_lost | No beats for 4 s or more with a good signal gives Act now. Heart rate below 38 bpm still counts as a lost pulse. |
| Radiation | Quality factor 1.0 converts the µGy/h chart to mSv. |
| Rover kit | New DRAFT note for the AED. The oxygen note is removed. |

## Repaired characters and text

- **No broken characters.** The file arrived as clean UTF-8 (±, –, ≥, ≤, °C, SpO₂, CO₂, TNF-α all fine). RULE-01 already reads "(or ±15 bpm baseline)"; I read it as ±15 bpm from baseline. **Please confirm.**
- **RULE-08 fix.** The Physiological Rationale was a copy of the HRV text. It now reads "Differentiates Level 1 hypoglycemia (<70 mg/dL) from clinically significant hypoglycemia (<54 mg/dL)." (`REPAIRS` in the import script).

## Conflicts

- **Reaction time.** The sheet's normal "Mean RT 200–250 ms" conflicts with CSA PRET (median about 264 ms), which the app uses. I kept PRET (Watch above 318 ms, Warning above 346 ms) and attached the RULE-12 text to it.
- **Catalog vs the existing JSON.** The catalog wins in the Learn pop-up. `regions.json` and `measurements.json` are unchanged, and the daily-check coach still uses the app's own steps.
  - How to measure: the catalog describes a chest strap, ECG, cuff, B-CAT and similar. The app measures heart rate, HRV and SpO₂ with a finger PPG clip, so Learn shows "In this app: …" under the catalog steps.
  - Mood: the catalog says 1–10; the daily check is 1–5.
  - Temperature: the catalog's normal range is 36.5–37.2 °C (see the team default above).
  - Glucose: the catalog uses mg/dL; the app stores mmol/L (÷ 18).
  - CO₂: the catalog uses mmHg; the cabin feed is ppm.

## Unit choices

- **CO₂.** The bands are stored in mmHg (`co2_mmhg`: Watch ≥ 2.0, Warning > 3.0, never Act now from a number). The ppm bands are derived as ppm = mmHg ÷ 760 × 10⁶, which gives 2,632 and 3,947 ppm. Moon base and rover cabin pressure stay a setting (`cabin_pressure_mmhg`).
- **Radiation.** 1 mSv/day is a Watch line labelled DEMO ONLY. The chart shows absorbed dose (µGy/h), converted with `quality_factor` (1.0 for now). Act now comes only from a DONKI solar event or shelter alarm, never from a dose.

## REF ID clashes

`regions.json` uses REF-01 to REF-14 (all marked `"status": "pending"`, no titles). Against Scientific_References.csv, most look like a different numbering:

| ID | regions.json cites it for | Scientific_References.csv says |
|---|---|---|
| REF-01, REF-02 | brain and mood (sleep, fluid shift) | NASA-STD-3001 Vol 1 and Vol 2 (plausible) |
| REF-03 | heart deconditioning | HRP cardiorespiratory evidence book (match) |
| REF-04 | dizziness on return to gravity | Stahn 2017, core temperature (clash) |
| REF-05, REF-06 | lungs (dust, CO₂, fluid shift) | Barger 2014 sleep; Basner 2020 cognition and CO₂ (clash, partial) |
| REF-07 | immune | Lang 2004, bone loss (clash) |
| REF-08 | immune | Crucian 2018, immune (match) |
| REF-09, REF-10 | metabolism | NCRP 153 radiation; AHA BLS 2025 (clash) |
| REF-11, REF-12 | bones and muscles | AHA First Aid 2024; AHA high blood pressure (clash) |
| REF-13, REF-14 | radiation | ADA diabetes 2026; NASA-STD-3001 Vol 2 (clash) |

To avoid wrong links, the Learn pop-up no longer shows the `regions.json` REF IDs when a catalog entry exists. No REF ID is missing from Scientific_References.csv. REF-03 to REF-06 and REF-09 have no URL in the sheet, so they show "No link yet".

## Behaviour changes

- **Emergency protocols.** The Collapse and Chest Pain protocols replace the old steps; "Give oxygen" is gone. Each step shows its node ID, urgency and cited sources. The CPR guide (metronome and timers) opens on CL07 and CL13. CP01/CP02 NO → CL00 and CL10 → CP00 switch protocol.
- **Pulse lost or camera event.**
  - Both open CL00 with the red flag lit. Nothing is pre-answered: the crew answers CL01, CL03 and CL05 themselves.
  - The 5 s auto-route to CPR is removed.
  - With the camera, the crew alarm sounds as soon as "Possible collapse. Are you okay? Please respond." appears; it no longer waits for the 15 s timer.
- **Demo scenarios.**
  - Normal day: all nominal.
  - Slow drift: heart rate 75 vs a usual of 63 is Watch. HRV, sleep and mood give Watch or Warning.
  - Acute event: the demo logs chest pain while heart rate is above 120 with an irregular pulse. Act now says "Why: RULE-01 + RULE-05 + chest pain or pressure logged."
- **Charts.** Every chart line is coloured by status (green, Watch, Warning, Act now) and the danger zones are tinted.

## Test results

- **Backend:** 290 passed, 1 expected xfail. That xfail is pulse_lost in Measurement mode, which is not wanted. New: `tests/test_medsci_rules.py`, covering:
  - both sides of every band edge;
  - poor signal never escalates;
  - no Act now from HRV, reaction test, exercise or dose alone;
  - symptom-gated rules fire only with a symptom.
- **PPG package:** 27 passed.
- **Frontend:** 121 passed (new: `src/lib/medsci.test.ts`). Typecheck and build OK.
- **Browser** (scratch servers): the three scenarios, the pulse-lost → CL00 → CL01/CL03/CL05 NO → CL07 CPR path, the Learn tags and the Sources page all checked. The camera check-in alarm is unit-wired but was not clicked through in the browser.
