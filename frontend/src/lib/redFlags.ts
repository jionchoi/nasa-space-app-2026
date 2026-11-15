// Live red flags for emergency mode. Definitions come from thresholds.json "red_flags" (no numbers in code):
// a flag is active when `metric` stays below/above its limit for `for_s` seconds with a usable signal.
import type { RedFlagDef, Thresholds, VitalsFrame } from '../types/contracts';
import { implausible } from './status';

type LiveKey = 'hr' | 'hrv_rmssd' | 'spo2' | 'rr';
const LIVE_KEYS: LiveKey[] = ['hr', 'hrv_rmssd', 'spo2', 'rr'];

export function redFlagDefs(thresholds: Thresholds | null): Record<string, RedFlagDef> {
  const table = thresholds?.red_flags;
  if (!table || typeof table !== 'object') return {};
  const out: Record<string, RedFlagDef> = {};
  for (const [name, def] of Object.entries(table)) {
    if (!name.startsWith('_') && def && typeof def === 'object' && 'metric' in def) out[name] = def as RedFlagDef;
  }
  return out;
}

function holds(frame: VitalsFrame, def: RedFlagDef, thresholds: Thresholds | null): boolean {
  if (def.min_signal_quality != null && frame.signal_quality < def.min_signal_quality) return false; // can't trust it
  if (!LIVE_KEYS.includes(def.metric as LiveKey)) return false;
  const value = frame[def.metric as LiveKey];
  if (implausible(def.metric, value, thresholds)) return false; // a measuring error is never a red flag
  if (def.below != null) return value < def.below;
  if (def.above != null) return value > def.above;
  return false;
}

/** Flags whose condition has held (without a break) for at least `for_s` seconds, ending at the newest frame. */
export function activeRedFlags(frames: VitalsFrame[], defs: Record<string, RedFlagDef>, thresholds: Thresholds | null = null): string[] {
  const active: string[] = [];
  const newest = frames[frames.length - 1];
  if (!newest) return active;
  for (const [name, def] of Object.entries(defs)) {
    let first = frames.length;
    while (first > 0 && holds(frames[first - 1], def, thresholds)) first--;
    if (first === frames.length) continue;
    const heldS = (Date.parse(newest.t) - Date.parse(frames[first].t)) / 1000;
    if (heldS >= (def.for_s ?? 0)) active.push(name);
  }
  return active;
}

/** Active flags plus the pulse_lost flag when the pulse monitor (cv/pulse.ts) says the pulse is lost: the monitor also
 *  sees a lost pulse from missing beats or a flat wave, which the heart-rate red flag alone can miss. `flag` is
 *  thresholds.json cv.ppg.pulse_lost_red_flag. */
export function withPulseLost(active: string[], pulseStatus: string | undefined, flag: string | undefined): string[] {
  if (pulseStatus !== 'lost' || !flag || active.includes(flag)) return active;
  return [...active, flag];
}

/** Indexes of the protocol's red-flag texts that an active flag lights, by the flag's `keywords` in thresholds.json
 *  (e.g. pulse_lost: "no pulse" lights "No pulse"). */
export function litByFlags(protocolFlags: string[], active: string[], defs: Record<string, RedFlagDef>): number[] {
  const words = active.flatMap((name) => (defs[name]?.keywords ?? []).map((w) => w.toLowerCase()));
  return protocolFlags.flatMap((text, i) => (words.some((w) => text.toLowerCase().includes(w)) ? [i] : []));
}
