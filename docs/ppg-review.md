# PPG integration review

Nov 15, 2026. Review of Jian's PPG pipeline as merged into `main` (merge `d1a1417`, compared with `58f6fe6`, the
commit before it). **No application code was changed for this review.** Added only: `backend/tests/test_ppg_review.py`
(robustness tests), `scripts/validation/` (the two scripts that produced the numbers below) and this file.

Everything below was run, not estimated. Where something could not be measured, it says so.

## Status after the Nov 15 fixes

Fixed, each with tests (`backend/tests/test_fixes_nov15.py`, `test_ppg_review.py`, `frontend/src/lib/{actNow,plausible,
metrics,signalViewModel}.test.ts`, `cv/pulse.test.ts`):
- Demo lost pulse after 4 s, opening Act now with or without the camera, then emergency mode with the CPR countdown.
- Act now names HEART for persona C.
- "Your usual" frozen to the first 14 days.
- Range limits 25–220 bpm and SpO₂ ≤ 100.
- Motion bursts become poor signal.
- The last value is held greyed for 10 s.
- No breathing card outside Demo; readable source labels.

BIDMC after the motion check (all 53 records, re-run Nov 15; `docs/validation/bidmc_all53_summary.json`). These are
the numbers to quote everywhere:
- Median per-record error 0.86 bpm.
- Pooled MAE 2.59 bpm (was 2.68).
- 91.9% of seconds within ±5 bpm (was 91.7%).
- A value in 97.2% of seconds (was 98.0%).

Still open: bidmc_18 (~150 vs 90 bpm), no pulse_lost in Measurement/Research (by decision), Demo "HR < 38 bpm = pulse lost".
The findings below are the original review, unchanged.

## Summary

- **Measurement/Research mode outputs only two numbers: pulse rate and PPG pulse-rate variability.** SpO₂, breathing
  rate, rhythm and `pulse_lost` are not computed. So in those modes nothing (Act now, crew alarm, emergency hand-off)
  can be triggered by the sensor.
- **Pulse rate is accurate on most BIDMC records:** median per-record error 0.86 bpm, pooled MAE 2.59 bpm, 91.9% of
  seconds within ±5 bpm, a value in 97.2% of seconds (after the motion check; pre-fix: 0.87 bpm and 91.7%).
  But one record (bidmc_18) reads **~150 bpm when the true rate is 90**, and a 4 s motion burst shows ~103 bpm as a valid
  reading. Neither is flagged.
- **The quality check cannot tell "pulse stopped" from "sensor problem".** A pulse that stops with the clip on is
  reported as poor signal. On real asystole alarms (PhysioNet Challenge 2015) the pipeline never once reported "no
  beats": it showed poor signal or still showed a pulse rate.
- **Demo mode works as before** (all three scenarios, mock data with the backend off, no internet needed). But its
  pulse_lost differs from the agreed rule (5 s, not 4 s), and it also fires on any heart rate under 38 bpm.

## 1. Integration map

### Files the merge touched (84)

| Area | Files |
|---|---|
| PPG core package (new) | `packages/crewsense-signals/src/crewsense_signals/ppg/{pipeline,quality,schemas,sources,validation}.py`, its tests and `MIGRATION.json` |
| Optional BP model (new) | `packages/crewsense-bp/*`, `backend/app/signals/bp.py`, `backend/requirements-bp.txt`, `research/bp/*` (offline training tools) |
| Backend runtime (new) | `backend/app/signals/{runtime,models,checks,storage}.py`, `backend/app/routers/signals.py`, `scripts/run_backend.py` |
| Backend, changed | `main.py` (router + shutdown), `routers/status.py` and `rules/check.py` (422 when no usable seated frames), `ppg/__init__.py` (docstring only: `compute_vitals()` is still not implemented), `requirements.txt` |
| Frontend (new) | `state/SignalContext.tsx`, `api/{mode,signals}.ts`, `components/signals/*`, `pages/{SignalDashboard,SignalCheck}.tsx`, `lib/signalViewModel.ts`, `types/signals.ts` |
| Frontend, changed | Demo-only switches in `App.tsx`, `main.tsx`, `AppContext`, `AlertsContext`, `RoutineContext`, `useVitals`, `useStatus`, `usePulseMonitor`, `useEmergency`, `Emergency.tsx`, `DailyCheck.tsx`, `ReactionPage.tsx`; `api/client.ts` (no mock fallback outside Demo), `api/live.ts` (mock after any disconnect), `TopBar`/`VitalsRow` (mode picker and signal vitals, from the merge resolution) |
| Docs | `docs/contracts-v2.md`, `docs/INTEGRATION_STATUS.md`, `docs/NASA_SIGNAL_INTEGRATION_PLAN.md`, `docs/validation/*.json` |

### Data flow

There are two separate paths. They share no code after the input.

**Demo mode** (unchanged by the merge):

```
persona JSON stream (simulated, 1 frame/s)  ─┐
/ws/sensor: ready-made VitalsFrame          ─┼─> app/ws.py /ws/vitals ──> browser useVitals (60 frames)
/ws/sensor: raw samples -> compute_vitals() ─┘    (sensor wins if a frame came in the last 3 s)
            (raises NotImplementedError: raw samples are dropped, app/ppg/__init__.py:22)

browser: lib/status.ts liveStatus()  ── judges each frame against thresholds.json (fetched from the backend)
         ├─ VitalsRow (numbers, colours, "usual" from the persona's daily data)
         ├─ body map (liveRegionStatus, ignored when the signal is poor)
         ├─ useDanger: a vital red for 10 s ──> Act now pop-up
         └─ cv/usePulseMonitor -> cv/pulse.ts pulseReading() ──> 'lost' ──> detector ──> crew alarm
              ──> /emergency?protocol=unresponsive&preanswer=responsive:no&goto=cpr   (only while detection is ON)
backend: alerts.red_vitals() (same rule) on the replay ──> red alert ──> Act now pop-up
```

**Measurement / Research mode** (new):

```
live device  ──> /ws/v2/ingest (RawBatch, ACK per batch) ─┐
BIDMC CSV / recorded JSONL / synthetic (Research) replay ─┴─> Session.process (runtime.py)
   ──> asyncio.to_thread(Pipeline.process): quality.assess() -> 0.3-5 Hz Butterworth -> find_peaks
   ──> Snapshot {pulse_rate_bpm, ppg_rmssd_ms, spo2_pct (always empty), quality, alerts: [] }
   ──> /ws/v2/vitals (latest session message, queue of 2) ──> SignalContext ──> SignalVitals cards
No thresholds, no statuses, no alerts, no body-map colours ("Not assessed"), no pulse watcher, no Act now,
no crew alarm, camera detection not mounted (App.tsx:42). Emergency mode works only as a manual protocol.
```

### Output metrics

| Metric | Unit | Update rate | Window | Demo mode | Measurement / Research |
|---|---|---|---|---|---|
| Heart rate | bpm | 1/s | persona value per frame | simulated | **pulse rate from PPG peaks**: median beat interval, 8 s window, first value after 10 s (8 s + 2 s settling) and again 10 s after any gap or poor stretch |
| HRV | ms | 1/s | persona value | simulated | **PPG RMSSD** (pulse-rate variability, not ECG HRV), 60 s window, first value after 62 s |
| SpO₂ | % | 1/s | – | simulated | **not computed** (`pipeline.py:87`; needs red + IR channels and calibration) |
| Breathing rate | breaths/min | 1/s | – | simulated | **not computed**; the card asks for `respiration_rate`, which the backend never sends (`signalViewModel.ts:6`) |
| Irregular rhythm | flag | 1/s | – | simulated | **not computed** (`capabilities.rhythm = not_implemented`, `pipeline.py:104`) |
| Signal quality | 0–1 shown as % | 1/s | per frame | simulated number | **no number**: `usable` / `unusable` with reasons per 1 s batch (`quality.py`) |
| pulse_lost | event | ~1/s | HR < 38 for 3 s, or flat wave / no beats for 5 s, with quality ≥ 0.6 (`thresholds.json:444`, `:532`) | from the simulated frames, in the browser | **not computed** (`capabilities.red_flags = disabled_no_reviewed_rules`, `pipeline.py:106`; `alerts` is always `[]`) |

## 2. Correctness

### 2.1 Validation numbers

**Data:** none of it was in the repo or on this laptop. I downloaded PhysioNet BIDMC 1.0.0 (all 53 records) and
the Challenge 2015 training records with an asystole alarm (122). Scripts:
`scripts/validation/run_bidmc_validation.py` and `run_c2015_asystole.py`. How to run them:

```
mkdir -p ~/data/bidmc && cd ~/data/bidmc
for i in $(seq -w 1 53); do for f in Signals Numerics; do
  curl -sfO https://physionet.org/files/bidmc/1.0.0/bidmc_csv/bidmc_${i}_${f}.csv; done; done
mkdir -p ~/data/c2015 && cd ~/data/c2015
curl -sfO https://physionet.org/files/challenge-2015/1.0.0/training/ALARMS
for r in $(grep -i asystole ALARMS | cut -d, -f1); do for e in hea mat; do
  curl -sfO https://physionet.org/files/challenge-2015/1.0.0/training/$r.$e; done; done
cd <repo>/backend && source .venv/bin/activate
python -I ../scripts/validation/run_bidmc_validation.py ~/data/bidmc bidmc.json
python -I ../scripts/validation/run_c2015_asystole.py ~/data/c2015 c2015.json
```

**Heart rate, BIDMC, all 53 records.** This uses Jian's own `validate_bidmc()`, unchanged: the causal pulse rate at the
end of each 1 s batch, compared with the monitor's HR value for that second. The script also recomputes the errors to
get the ±5 bpm share, and checks that its MAE equals `validate_bidmc()`'s for every record. Records 01 and 02 reproduce
the numbers in `docs/validation/` exactly (0.9367 and 0.6183 bpm).

| Record | MAE (bpm) | Bias (bpm) | 95th pct abs error | Windows within ±5 bpm | Windows with a value |
|---|---|---|---|---|---|
| bidmc_01 | 0.9367 | -0.4831 | 1.639 | 99.2% | 98.1% (471/480) |
| bidmc_02 | 0.6183 | 0.2026 | 1.539 | 100.0% | 98.1% (471/480) |
| bidmc_03 | 1.0229 | -0.4334 | 3.47 | 95.5% | 98.1% (471/480) |
| bidmc_04 | 1.6467 | -1.2724 | 1.7575 | 97.7% | 98.1% (471/480) |
| bidmc_05 | 0.8284 | -0.3792 | 1.039 | 99.3% | 95.2% (457/480) |
| bidmc_06 | 0.563 | -0.1567 | 0.582 | 98.3% | 98.1% (471/480) |
| bidmc_07 | 0.4566 | 0.0605 | 0.714 | 100.0% | 98.1% (471/480) |
| bidmc_08 | 0.5068 | -0.3463 | 1.316 | 100.0% | 98.1% (471/480) |
| bidmc_09 | 0.5136 | -0.1261 | 1.469 | 100.0% | 98.1% (471/480) |
| bidmc_10 | 0.9983 | -0.4243 | 2.786 | 96.6% | 98.1% (471/480) |
| bidmc_11 | 0.599 | -0.1714 | 1.435 | 100.0% | 98.1% (471/480) |
| bidmc_12 | 0.6104 | -0.0168 | 1.593 | 100.0% | 98.1% (471/480) |
| bidmc_13 | 0.2918 | -0.0635 | 0.628 | 100.0% | 98.1% (471/480) |
| bidmc_14 | 0.6127 | -0.2834 | 2.25 | 98.9% | 98.1% (471/480) |
| bidmc_15 | 0.5246 | -0.034 | 1.294 | 100.0% | 98.1% (471/480) |
| bidmc_16 | 0.5946 | 0.062 | 1.299 | 98.7% | 98.1% (471/480) |
| bidmc_17 | 3.7773 | -2.1787 | 10.0745 | 72.8% | 98.1% (471/480) |
| **bidmc_18** | 56.5894 | 56.5887 | 65.25 | 8.7% | 98.1% (471/480) |
| bidmc_19 | 0.8216 | -0.0552 | 2.1545 | 100.0% | 98.1% (471/480) |
| bidmc_20 | 0.5959 | 0.1511 | 1.286 | 100.0% | 98.1% (471/480) |
| bidmc_21 | 0.8692 | -0.2827 | 1.119 | 99.4% | 98.1% (471/480) |
| bidmc_22 | 0.7212 | -0.1151 | 1.748 | 98.7% | 98.1% (471/480) |
| bidmc_23 | 2.1219 | -0.7731 | 7.8326 | 83.4% | 98.1% (470/480) |
| bidmc_24 | 3.7961 | -0.7636 | 9.472 | 70.7% | 98.1% (471/480) |
| bidmc_25 | 1.645 | 0.729 | 8.951 | 93.0% | 98.1% (471/480) |
| bidmc_26 | 2.9414 | -2.1371 | 7.96 | 83.2% | 98.1% (471/480) |
| bidmc_27 | 1.1333 | -0.6843 | 1.235 | 98.3% | 98.1% (467/480) |
| bidmc_28 | 4.0514 | -2.1365 | 10.0225 | 70.3% | 98.1% (471/480) |
| bidmc_29 | 1.2537 | -0.2306 | 3.2305 | 99.6% | 98.1% (471/480) |
| bidmc_30 | 0.5676 | -0.1506 | 1.765 | 99.8% | 98.1% (471/480) |
| bidmc_31 | 0.7146 | 0.0822 | 1.73 | 98.9% | 98.1% (471/480) |
| bidmc_32 | 0.5522 | -0.091 | 1.418 | 100.0% | 96.0% (461/480) |
| bidmc_33 | 3.3346 | 0.8134 | 8.28 | 76.2% | 98.1% (471/480) |
| bidmc_34 | 0.852 | -0.2593 | 2.213 | 97.5% | 98.1% (471/480) |
| bidmc_35 | 2.1813 | -0.5472 | 3.7705 | 96.6% | 98.1% (471/480) |
| bidmc_36 | 0.9781 | -0.1743 | 2.251 | 100.0% | 98.1% (471/480) |
| bidmc_37 | 0.6198 | -0.1633 | 1.463 | 100.0% | 98.1% (471/480) |
| bidmc_38 | 1.5044 | -1.3523 | 4.3745 | 96.6% | 98.1% (471/480) |
| bidmc_39 | 2.0717 | -1.6724 | 8.9005 | 91.1% | 98.1% (471/480) |
| **bidmc_40** | 7.4379 | -7.0934 | 52.0 | 80.5% | 98.1% (471/480) |
| **bidmc_41** | 9.1298 | 1.3654 | 31.674 | 49.3% | 98.1% (471/480) |
| bidmc_42 | 0.4038 | -0.0482 | 0.746 | 100.0% | 98.1% (471/480) |
| bidmc_43 | 0.8625 | 0.2285 | 2.286 | 99.8% | 98.1% (471/480) |
| bidmc_44 | 2.1141 | -1.6234 | 4.2993 | 95.1% | 97.9% (470/480) |
| **bidmc_45** | 5.3558 | 1.3129 | 12.7555 | 52.0% | 98.1% (471/480) |
| bidmc_46 | 0.5803 | -0.13 | 1.366 | 100.0% | 98.1% (471/480) |
| bidmc_47 | 2.5335 | 2.2007 | 4.7475 | 94.9% | 98.1% (471/480) |
| bidmc_48 | 2.0085 | -1.1821 | 3.422 | 97.2% | 98.1% (471/480) |
| bidmc_49 | 0.5263 | -0.0083 | 1.218 | 100.0% | 98.1% (471/480) |
| bidmc_50 | 0.8655 | -0.328 | 1.32 | 99.2% | 98.1% (471/480) |
| bidmc_51 | 1.0432 | -0.0441 | 2.6765 | 100.0% | 98.1% (471/480) |
| bidmc_52 | 0.4941 | -0.0829 | 0.636 | 100.0% | 98.1% (471/480) |
| bidmc_53 | 3.6956 | -0.1497 | 9.581 | 73.2% | 98.1% (471/480) |

**Overall:** 53 records, 24933 scored 1 s windows. Pooled MAE **2.683 bpm**; median per-record MAE **0.869 bpm**; **91.7%** of windows within ±5 bpm; a value was produced in 98.0% of windows. Records with MAE over 5 bpm: bidmc_18, bidmc_40, bidmc_41, bidmc_45.

What the outliers are, checked against both monitor references (ECG HR and the monitor's own PPG PULSE):

- **bidmc_18:** we read a median of **150 bpm**; ECG HR and pleth PULSE are both 90. This is a pipeline error, not a
  reference problem. A ratio of about 1.67 points to extra peaks being counted in part of the beats (for example a
  strong dicrotic wave). Not yet confirmed beat by beat.
- **bidmc_40, 41, 45:** the median is right (110, 80, 63 bpm) but the readings are noisy: only 49–81% of windows
  within ±5 bpm.

**Breathing rate and SpO₂:** BIDMC has reference RESP and SpO₂ values, but the pipeline computes neither, so there is
nothing to score.

**Asystole, Challenge 2015:** sensitivity, false alarms and detection delay **cannot be reported**, because there is
no asystole / pulse_lost detector to score. Instead, I recorded what the unchanged pipeline outputs on these alarms
(the alarm sits at 300 s). Of 122 asystole alarms, 22 are true and 100 false; 17 and 89 of them have a PPG channel.

| Pipeline status at the alarm second | True asystole (17) | False alarm (89) |
|---|---|---|
| still shows a pulse rate | 6 | 81 |
| poor signal: flatline / contact loss | 4 | 2 |
| poor signal: noise | 6 | 4 |
| warming up | 1 | 2 |
| too few beats (no number) | **0** | 0 |

True asystole alarms with a PPG channel, per record:

| Record | Pipeline status at the alarm second | Last 16 s before the alarm |
|---|---|---|
| a142s | poor: flatline_or_contact_loss | valid ×11, poor: flatline_or_contact_loss ×5 |
| a161l | valid | valid ×16 |
| a167l | poor: high_frequency_noise | poor: high_frequency_noise ×16 |
| a172s | poor: high_frequency_noise | poor: high_frequency_noise ×16 |
| a185l | poor: flatline_or_contact_loss | poor: flatline_or_contact_loss ×16 |
| a203l | poor: high_frequency_noise | poor: high_frequency_noise ×16 |
| a345l | poor: flatline_or_contact_loss | poor: flatline_or_contact_loss ×16 |
| a372s | poor: flatline_or_contact_loss | poor: flatline_or_contact_loss ×16 |
| a385l | warming_up | warming_up ×15, poor: high_frequency_noise ×1 |
| a386s | valid | valid ×16 |
| a442s | poor: high_frequency_noise | poor: high_frequency_noise ×15, warming_up ×1 |
| a443l | poor: high_frequency_noise | poor: high_frequency_noise ×16 |
| a446s | poor: high_frequency_noise | poor: high_frequency_noise ×15, warming_up ×1 |
| a449l | valid | valid ×16 |
| a604s | valid | valid ×16 |
| a639l | no PPG channel | – |
| a653l | no PPG channel | – |
| a654s | valid | valid ×16 |
| a670s | no PPG channel | – |
| a754s | no PPG channel | – |
| a776s | no PPG channel | – |
| a796s | valid | valid ×16 |

Caveat: Challenge 2015 labels asystole from the ECG in ICU patients, so a PPG that still pulses can be artefact (CPR,
movement). The point is narrower and solid: **when the PPG really goes flat, this pipeline calls it poor signal.**

### 2.2 Asystole rule: "no beats ≥ 4 s with good quality" vs "sensor off / flat / saturated = poor signal"

**Measurement/Research mode: missing.** The only quality logic is `quality.py`:

```python
amplitude = float(np.ptp(x))
if amplitude <= max(1e-10, float(np.max(np.abs(x))) * 1e-8):      # quality.py:16
    reasons.append(f"{name}:flatline_or_contact_loss")
...
if total > 0 and high / total > 0.60:                               # quality.py:35
    reasons.append(f"{name}:high_frequency_noise")
```

There is no distinction to make, because there is no pulse_lost. Worse, the quality check puts a stopped pulse
**into** the sensor-problem bucket:
- An exactly flat line is "flatline_or_contact_loss".
- A flat line with normal sensor noise (clip on, heart stopped) is "high_frequency_noise".
- Both are `poor_quality`, which empties the values (`pipeline.py`, `_metric`).

Telling the two apart needs something this pipeline doesn't read: the steady light level (DC). When a clip falls off,
the light level jumps; when the heart stops with the clip on, it stays the same. Also, clipping is only detected for
`unit: "adc"` input with `adc_max` set (`quality.py:19-27`); an "arbitrary" unit stream is never checked.

**Demo mode: present, but not to the agreed rule** (`frontend/src/cv/pulse.ts`):
- "Sensor off" (quality < 0.2, or a light-level jump) returns `clip_off`, never lost (`pulse.ts:55`).
- "No beats / flat wave" counts as lost only with quality ≥ 0.6 (`pulse.ts:79`, `:91`), after **5 s**
  (`no_pulse_s`, `thresholds.json:532`), not 4 s.
- Also, `pulse.ts:81` declares a lost pulse whenever the `pulse_lost` red flag holds: heart rate **below 38 bpm for
  3 s** (`thresholds.json:444`). A slow but present pulse (e.g. 36 bpm) would go straight to CPR.

### 2.3 Poor signal: greyed, no alerts

- **Demo: yes.** `liveStatus()` drops red vitals when the signal is poor (`lib/status.ts:84`). `liveRegionStatus()`
  ignores poor frames (`lib/status.ts:92`), `useDanger` uses the same red list, and the backend's `red_vitals()`
  applies the same rule (`alerts.py:155`). VitalsRow greys the numbers and shows "Poor signal: check the sensor".
  Note that `liveStatus()` still computes Watch/Warning colours for each vital on a poor frame; they are just greyed.
- **Measurement: yes, trivially.** Values become "—" with the reason text (`signalViewModel.ts`), and there are no
  alerts at all.

### 2.4 Units and ranges

- Units are correct and labelled: pulse rate in bpm, PRV in ms, SpO₂ in % (`pipeline.py`). Demo frames are
  bpm/ms/%/breaths per min.
- **No clamping.** The pipeline returns any rate its peaks imply (`pipeline.py:146`). Peak spacing caps it at about
  240 bpm (`pipeline.py:133`), but nothing stops values under 25 bpm: 3 peaks in an 8 s window allow about 15 bpm.
  Tested: 241.9 bpm accepted as valid.
- Demo's `VitalsFrame` has no bounds on `hr`, `spo2`, `rr`, `hrv_rmssd` (`backend/app/models.py:16-23`). A sensor
  frame with `spo2: 150` or `hr: -5` is accepted and judged.

### 2.5 Thresholds

- **No PPG thresholds in the frontend.** Every number used for a status comes from `thresholds.json` (fetched from
  the backend): bands, red flags and the `cv.ppg` block.
- One nuance: **live** statuses in Demo are worked out in the browser (`liveStatus`, `lib/status.ts:79-87`). The
  numbers come from `thresholds.json`, and the backend mirrors the same rule for alerts, so it isn't "backend only".
- One timing constant is hard-coded: Act now after 10 s red (`hooks/useDanger.ts:5`, `DANGER_AFTER_S = 10`).
- Measurement mode uses no thresholds at all, by design (values are "not assessed").

### 2.6 Personal baseline ("your usual")

- **Demo:** computed, not hard-coded. It's the median of the last 30 daily entries for each field
  (`lib/metrics.ts:89`, used by `VitalsRow.tsx:45`). For persona B it drifts with B, so "usual" is 66.6 bpm (not 61)
  against today's 73.1.
- **Measurement:** there is no baseline. The card's "usual" slot shows the metric's status reason instead
  (`SignalVitals.tsx:22`).

### 2.7 Camera link and pulse_lost hand-off

- **Demo:** pulse_lost reaches the camera detector directly in the browser, not through the backend
  (`usePulseMonitor` → `pulseReading` → `detector.update({ pulse })`). In any state, a lost pulse goes straight to
  ALARM with CPR and skips "Are you OK?" (`cv/detector.ts:63`). It is logged to the backend in
  `UnresponsiveEvent.signals.pulse` (`useUnresponsiveDetection.ts:148`).
  - **But only while detection is switched on** (Camera button; it is OFF after every page load,
    `useUnresponsiveDetection.ts:98`). With it off, a lost pulse gives the Act now pop-up only, once the heart rate
    has been red for 10 s.
- **Measurement/Research:** no. Nothing produces pulse_lost (above). The frontend also switches off every consumer:
  `usePulseMonitor.ts:28`, `useVitals.ts:16`, `AlertsContext.tsx:31`, and the camera, check-in, crew alarm and Act
  now are mounted only in Demo (`App.tsx:42`). The emergency page ignores the hand-off parameters outside Demo
  (`Emergency.tsx:43`) and shows no vitals there (`Emergency.tsx:41` uses `useVitals`, empty outside Demo). So red-flag
  auto-advance to CPR can't fire either.

## 3. Robustness

All in `backend/tests/test_ppg_review.py` (25 pass, 3 marked `xfail(strict=True)` for missing requirements).
Synthetic 72 bpm waveform, 1 s batches.

| Input | What happens |
|---|---|
| Clean | Warm-up 10 s, then 72.1 bpm every second. PRV after 62 s. |
| Noise only, 125 Hz | `poor_quality: high_frequency_noise` every batch. No value. ✓ |
| Noise only, 25 Hz | Noise check fires on only some batches (little spectrum above 8 Hz); the rest count as usable. No value appeared in 20 s, only because each rejected batch restarts the warm-up. |
| Flat line | `poor_quality: flatline_or_contact_loss`. No value, no pulse_lost. ✓ |
| Flat with sensor noise (clip on, no pulse) | `poor_quality: high_frequency_noise`. **Reported as a sensor problem.** |
| Clipped, unit "arbitrary" | Not detected; value still 72 bpm. |
| Clipped, unit "adc" + `adc_max` | `poor_quality: adc_clipping`. ✓ |
| Motion burst (4 s, 1.7 Hz) | **102.7 bpm shown as valid for ~9 s**, quality "usable". `xfail` test documents the requirement. |
| 4 s with no pulse, clip on | Poor signal for 4 s, then 10 s warm-up with no number. **No pulse_lost** (`xfail`). |
| 3 s with no pulse | Same; nothing triggers ✓ (but nothing triggers at 4 s either). |
| 4 s timestamp gap | `gap` → history reset → 10 s with no number → valid. Nothing triggers. |
| 3 s timestamp gap | Same as 4 s. Nothing triggers ✓. |
| NaN samples | Batch rejected by validation (`samples must be finite`); live ingest gets an error ACK, a replay ends the session in `error`. |
| 25 / 50 / 100 / 125 / 250 Hz | 71.4 / 71.4 / 72.3 / 72.1 / 72.1 bpm ✓. Below 25 Hz rejected. |
| Very short buffer | < 8 samples rejected; 8 accepted. |
| Disconnect / reconnect | 3 s without data → watchdog marks `stale` and clears values; websocket close → `stale`; reconnect accepted, fresh pipeline, 10 s warm-up, then valid ✓. |
| Rates outside 25–250 bpm | Not rejected (`xfail`): 20 bpm input produced a value; 242 bpm accepted. |

**Event loop:** the pipeline, the BP model and file reading for replays run in a worker thread (`asyncio.to_thread`,
checked by a test). Two small blocking spots remain in async code:
- Hashing the whole recording (up to 100 MiB) when a session is created (`runtime.py:69`).
- Synchronous SQLite writes on start/stop/stale (`runtime.py:138`, `:176`).

**Latency:** processing takes 2.3 ms per 1 s batch (p99 2.6 ms). Sample to screen is therefore about one batch length
(1 s for replays; whatever the device sends live) plus a few ms, so under 2 s. But the first value needs 10 s, and
any gap or poor second costs another 10 s.

**Memory over a 10-minute replay:** the pipeline buffer is capped at the PRV window (8,000 samples); traced memory
grew 52 KiB between minute 2 and minute 10. The session also keeps one snapshot per batch (`runtime.py:58`, max
20,000, about 5.5 h at 1/s), so it grows linearly during a 10-minute run and stops at the cap.

## 4. Modes

Checked in a real browser (headless Chrome) on a scratch backend, not your running servers.

| Check | Result |
|---|---|
| Replay, no hardware (Demo) | ✓ chip "LIVE · REPLAY", label "Simulated scenario: Normal day" |
| Replay, no hardware (Measurement, BIDMC 01) | ✓ 94 bpm, chip reads `public_replay · running · connected` (raw ids, not plain words) |
| Live sensor | **Not tested: no hardware here.** The ingest path is covered by the websocket test above. |
| Backend off (public build) | ✓ Demo shows mock vitals and "Mock data". Measurement mode shows no vitals and no fallback (by design: `client.ts` throws instead of using mocks outside Demo). |
| Wi-Fi off | ✓ by inspection: the frontend makes no internet requests (fonts are bundled). The only outbound call is the optional AI wording helper (`assist.py`, 2 s timeout, only with an API key). I could not switch Wi-Fi off from here. |
| Normal day (A) | ✓ all 7 regions Nominal |
| Slow drift (B) | ✓ heart Warning. Resting HR 73.1 vs usual 66.6 (not ~70 vs 61: the "usual" is a rolling 30-day median that drifts with B) |
| Acute event (C, from 440 s) | ✓ Act now pop-up with alarm beep within 25 s; HR 140, irregular, SpO₂ 89. Stream: HR > 140 for 36 s (446–481 s), irregular from 240 s, pulse wave flat from 518 s. The pop-up title says "ACT NOW · LUNGS" (first open backend alert), not heart. |

## 5. Findings

### Blockers (wrong results, false pulse_lost, crashes)

1. **Pulse rate 60 bpm too high on bidmc_18, shown as valid.**
   - Where: `packages/crewsense-signals/src/crewsense_signals/ppg/pipeline.py:132-146` (peak picking: `distance` 0.25 s,
     `prominence` 0.6 × std).
   - Fix: reject peaks closer than ~0.6 × the previous median interval, or detect on the first derivative / use a
     dicrotic-aware detector. Then re-run `run_bidmc_validation.py` and require no record above 5 bpm MAE.
2. **Motion bursts produce confident wrong pulse rates** (102.7 vs 72 bpm, quality "usable").
   - Where: `quality.py:31-36` (only high-frequency noise is checked); `pipeline.py:141-146`.
   - Fix: add a motion check (amplitude jump vs the running median, or an accelerometer channel if the device has one).
     Also mark a value "unstable" when beat intervals inside the window disagree by more than ~25%.
3. **No pulse_lost in Measurement/Research mode, so a real cardiac arrest on the sensor triggers nothing.**
   - Where: `pipeline.py:104-106` (red flags disabled); `App.tsx:42`, `usePulseMonitor.ts:28`, `useVitals.ts:16`,
     `AlertsContext.tsx:31`, `Emergency.tsx:41-43` (all Demo-only).
   - Fix, in this order:
     - (a) Pipeline emits `pulse_lost` = no beats ≥ 4 s while contact is good. Contact needs the DC light level per
       batch, compared with the level while beats were present (stable DC + no beats = pulse_lost; DC jump or rail =
       sensor off).
     - (b) Send it in the Snapshot `alerts`.
     - (c) Frontend: feed the measured snapshot into the same pulse watcher and alert path as Demo (or map it to a
       `VitalsFrame` with `beats_detected` / `ppg_baseline`), and mount the alarm, check-in and Act now in every mode.
     - (d) Let the emergency page accept the hand-off parameters outside Demo.
4. **The quality check classifies a stopped pulse as a sensor problem** (`quality.py:16` and `:35`), so (3) can't be
   built on it as is.
   - Fix: part of (3a). Keep "flatline" for a truly constant signal (a disconnected ADC), but judge "noise only" by DC
     stability before calling it poor signal.
5. **Demo: any heart rate under 38 bpm for 3 s counts as a lost pulse** and goes straight to CPR.
   - Where: `frontend/src/cv/pulse.ts:81`; `backend/data/thresholds.json:444` (`pulse_lost` red flag).
   - Fix: drop path 1 or require `beats_detected == 0` as well. Keep "HR < 38" as a separate bradycardia red flag
     (Act now, not CPR). Yenna to confirm.

### Should fix (would show up in the demo)

1. **Demo pulse_lost waits 5 s, not the agreed 4 s.**
   - Where: `backend/data/thresholds.json:532` (`no_pulse_s: 5`).
   - Fix: set 4 (Yenna owns the file).
2. **Pulse_lost alarm works only after the Camera button was pressed** (detection is off after every page load).
   - Where: `frontend/src/cv/useUnresponsiveDetection.ts:98`.
   - Fix: let the pulse-only path run even when the camera detector is off, or turn detection on as part of the demo
     script. Say it in the demo either way.
3. **Breathing-rate card asks for a metric that is never sent;** it always reads "Not supported".
   - Where: `frontend/src/lib/signalViewModel.ts:6`.
   - Fix: hide the card, or add a breathing-rate estimate (respiratory modulation of the PPG; BIDMC has RESP for
     validation).
4. **No range limits on vitals.**
   - Where: `pipeline.py:146`; `backend/app/models.py:16-23`.
   - Fix: clamp or reject HR < 25 or > 250 (status `out_of_range`, no value) and SpO₂ > 100. Add `Field(ge=, le=)`
     to `VitalsFrame` for `/ws/sensor`.
5. **Measurement chip shows raw ids** ("public_replay · running").
   - Where: `frontend/src/components/signals/SignalVitals.tsx:12`.
   - Fix: plain words ("Recorded patient data (BIDMC) · running").
6. **Act now title names the wrong area for persona C** ("LUNGS", while the heart is also red).
   - Where: `frontend/src/components/shell/ActNowAlert.tsx:69`.
   - Fix: pick the area with the worst live vital, or the heart when pulse/HR is red.
7. **10 s with no number after any gap or poor second, including a 1 s motion blip.**
   - Where: `pipeline.py:56` and `:61` (reset on gap or poor quality).
   - Fix: after a short dropout (< 3 s), keep the last value as "held" (greyed) instead of blanking it.
8. **Clipping isn't checked for "arbitrary"-unit streams.**
   - Where: `quality.py:19`.
   - Fix: detect flat tops (runs of identical max/min samples) for any unit.
9. **Measurement mode has no personal baseline.**
   - Where: `SignalVitals.tsx:22`.
   - Fix: median of the saved signal daily checks for this crew id (`/api/v2/checks`).
10. **Demo raw-sample input is dropped silently** (`compute_vitals()` not implemented), so a device sending raw samples
    to `/ws/sensor` shows nothing.
    - Where: `backend/app/ppg/__init__.py:22`.
    - Fix: implement `compute_vitals()` by calling the new `Pipeline`, or point the device at `/ws/v2/ingest` and
      say so in the README.

### Nice to have

1. Hash the recording in a thread, and write SQLite off the event loop (`runtime.py:69`, `:138`, `:176`).
2. Lower the session snapshot cap, or store only one snapshot per 5 s (`runtime.py:58`; 20,000 snapshots ≈ 5.5 h).
3. Add `run_bidmc_validation.py` to CI with the per-record table as an artifact, and fail if any record's MAE > 5 bpm.
4. `api/live.ts:100` now switches to mock data after **any** disconnect of the Demo vitals socket (before the merge,
   only if it never connected). A backend restart briefly shows mock vitals; consider a short grace period.
5. The 10 s Act now delay is a code constant (`hooks/useDanger.ts:5`); move it to `thresholds.json`.

## Test and build results (Nov 15)

- Backend: `python -m pytest -q tests ../packages/crewsense-signals/tests` → **172 passed, 3 xfailed** (the 3 xfails are
  review requirements not met yet: motion burst, pulse_lost after 4 s, rate limits).
- Frontend: `npm test` → **70 passed** (10 files). `tsc --noEmit` clean. `npm run build` OK (existing "chunk larger than
  500 kB" warning).
