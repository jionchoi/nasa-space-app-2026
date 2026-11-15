// Pulse checks on the live vitals stream (the finger clip). Works with or without the camera.
//   - Pulse lost: the clip is on with good contact (signal_quality high, light baseline steady) but the pulse
//     wave is flat or no heartbeats are found for no_pulse_s seconds. The most serious case: the detector skips
//     the check-in and goes straight to the alarm and CPR.
//   - Clip off: a removed clip looks like no signal (quality near 0) or a sudden jump of the light baseline. It
//     only shows "Check the sensor" and never raises the alarm.
//   - Still hand: an unusually clean signal for a long time means the hand with the clip is not moving
//     (a supporting signal for the camera score).
// The optional VitalsFrame fields pulse_amplitude, beats_detected and ppg_baseline come from Jian's PPG code;
// without them only the heart-rate red flag (thresholds.json red_flags.pulse_lost) can say "pulse lost".
// PURE functions: the time is passed in.
import { activeRedFlags, redFlagDefs } from '../lib/redFlags';
import type { Thresholds, VitalsFrame } from '../types/contracts';
import type { CvThresholds, PulseReading } from './types';

/** One vitals frame and when it arrived (seconds, our clock: frame times from a replay are old). */
export interface PulseSample {
  at: number;
  frame: VitalsFrame;
}

/** Middle value of a list, or null for an empty list. */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * This person's normal pulse wave height: the median amplitude of the recent samples. The monitor only
 * updates it while the pulse is "ok", so a flat stretch never becomes the new normal.
 */
export function normalAmplitude(samples: PulseSample[]): number | null {
  return median(samples.map((s) => s.frame.pulse_amplitude).filter((a): a is number => typeof a === 'number'));
}

/** Reads the pulse status from the recent samples (oldest first). `reference` = normalAmplitude while things were ok. */
export function pulseReading(samples: PulseSample[], now: number, reference: number | null, all: Thresholds | null, cv: CvThresholds): PulseReading {
  const p = cv.ppg;
  const last = samples[samples.length - 1];
  const defs = redFlagDefs(all);
  const frames = samples.map((s) => s.frame);
  const base = { stillHand: false, vitalsRed: false, quality: null, amplitudeRatio: null, secondsWithoutBeats: 0 };

  // No vitals for a while: no sensor, nothing to say.
  if (!last || now - last.at > p.stale_after_s) return { ...base, status: 'no_data', reason: 'No vitals from the sensor' };
  const quality = last.frame.signal_quality;

  // CLIP OFF: (almost) no signal, or the steady light level jumped (the clip came off and room light got in).
  const earlierBaseline = median(samples.slice(0, -3).map((s) => s.frame.ppg_baseline).filter((b): b is number => typeof b === 'number'));
  const baselineNow = last.frame.ppg_baseline;
  const jumped = typeof baselineNow === 'number' && earlierBaseline !== null && earlierBaseline > 0
    && Math.abs(baselineNow - earlierBaseline) / earlierBaseline > p.baseline_jump_ratio;
  if (quality < p.clip_off_quality || jumped) {
    return { ...base, quality, status: 'clip_off', reason: jumped ? 'Light level jumped: clip off?' : 'No signal: clip off?' };
  }

  // Red flags from thresholds.json (any of them shortens the camera wait).
  const active = activeRedFlags(frames, defs);
  const vitalsRed = active.length > 0;

  // STILL HAND: the quality has stayed at or above clean_quality for still_hand_s seconds (samples cover that long).
  const lastNoisy = [...samples].reverse().find((s) => s.frame.signal_quality < p.clean_quality);
  const cleanSince = lastNoisy ? lastNoisy.at : samples[0].at;
  const stillHand = now - cleanSince >= p.still_hand_s;

  // Amplitude compared with this person's normal pulse wave.
  const amplitude = last.frame.pulse_amplitude;
  const amplitudeRatio = typeof amplitude === 'number' && reference ? amplitude / reference : null;

  // Seconds since the last frame with a heartbeat (only when the sensor reports beats).
  const withBeats = samples.filter((s) => typeof s.frame.beats_detected === 'number');
  const lastBeat = [...withBeats].reverse().find((s) => (s.frame.beats_detected ?? 0) > 0);
  const secondsWithoutBeats = withBeats.length ? now - (lastBeat ? lastBeat.at : withBeats[0].at) : 0;

  const reading = { stillHand, vitalsRed, quality, amplitudeRatio, secondsWithoutBeats };
  // Only trust "no pulse" when the contact is good: otherwise it is a sensor problem, not a heart problem.
  const goodContact = quality >= p.good_quality;

  // PULSE LOST, 1: the heart-rate red flag for a lost pulse (thresholds.json red_flags).
  if (active.includes(p.pulse_lost_red_flag)) return { ...reading, status: 'lost', reason: 'Pulse lost (heart rate red flag)' };
  // PULSE LOST, 2: the pulse wave has been flat for no_pulse_s seconds with good contact.
  if (goodContact && reference) {
    const lastNormal = [...samples].reverse().find((s) => typeof s.frame.pulse_amplitude === 'number' && s.frame.pulse_amplitude >= p.flat_ratio * reference);
    const flatFor = now - (lastNormal ? lastNormal.at : samples[0].at);
    if (amplitudeRatio !== null && amplitudeRatio < p.flat_ratio && flatFor >= p.no_pulse_s) {
      return { ...reading, status: 'lost', reason: `Pulse wave flat for ${Math.round(flatFor)} s with the clip on` };
    }
  }
  // PULSE LOST, 3: no heartbeats found for no_pulse_s seconds with good contact.
  if (goodContact && withBeats.length && secondsWithoutBeats >= p.no_pulse_s) {
    return { ...reading, status: 'lost', reason: `No heartbeats for ${Math.round(secondsWithoutBeats)} s with the clip on` };
  }
  return { ...reading, status: 'ok', reason: goodContact ? 'Pulse detected' : 'Weak signal' };
}
