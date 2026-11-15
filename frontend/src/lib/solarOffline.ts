// "Replay solar event" with the backend off (public demo build). Same rules as backend/app/radiation.py, reading the
// same DONKI event file (frontend/src/mock/solarEvent.json, exported from backend/data/space_weather/event.json):
// real event id, time and link; SIMULATED dose curve (ISS reference) x the location's DRAFT scale.
import mockEnvironments from '../mock/environments.json';
import event from '../mock/solarEvent.json';
import type { Environment, RadiationEvent, RegionStatus } from '../types/contracts';
import { envKeys, pickForEnv, resolveEnv } from './env';

interface CurvePoint { minute: number; msv_per_h: number }
interface EventFile {
  event: { sep_id: string; sep_time: string; link: string; instruments?: string[]; flare?: RadiationEvent['flare'] };
  replay: { duration_min: number };
  dose_curve: CurvePoint[];
  alert: string;
  advice: Record<string, string>;
  dose_note?: string;
  _status?: string;
  location_scale?: Record<string, number | string>;
  location_reason?: Record<string, string>;
}
const cfg = event as unknown as EventFile;

let running: { startedAt: number; minutes: number } | null = null;

export function startOfflineSolar(minutes?: number): void {
  running = { startedAt: Date.now(), minutes: minutes ?? cfg.replay.duration_min };
}
export function stopOfflineSolar(): void {
  running = null;
}

function curveAt(minute: number): number {
  const c = cfg.dose_curve;
  for (let i = 0; i + 1 < c.length; i++) {
    const a = c[i];
    const b = c[i + 1];
    if (a.minute <= minute && minute <= b.minute) {
      const u = (minute - a.minute) / Math.max(b.minute - a.minute, 1e-9);
      return a.msv_per_h + u * (b.msv_per_h - a.msv_per_h);
    }
  }
  return c.length ? c[c.length - 1].msv_per_h : 0;
}

function doseUntil(minute: number, step = 0.25): number {
  let total = 0;
  for (let m = 0; m < minute; m += step) {
    const next = Math.min(minute, m + step);
    total += ((curveAt(m) + curveAt(next)) / 2) * (next - m) / 60;
  }
  return total;
}

function keysFor(env: string): string[] {
  return envKeys(env, resolveEnv(mockEnvironments as unknown as Environment[], env));
}

/** The running offline event for this location, or null (ends by itself). */
export function offlineSolarEvent(env: string, now = Date.now()): RadiationEvent | null {
  if (!running) return null;
  const elapsedMin = (now - running.startedAt) / 60000;
  if (elapsedMin >= running.minutes) {
    running = null;
    return null;
  }
  const keys = keysFor(env);
  const scaleValue = pickForEnv(cfg.location_scale, keys);
  const scale = typeof scaleValue === 'number' ? scaleValue : 1;
  const curveLen = cfg.dose_curve[cfg.dose_curve.length - 1].minute;
  const curveMin = (elapsedMin * curveLen) / running.minutes;
  return {
    sep_id: cfg.event.sep_id, sep_time: cfg.event.sep_time, link: cfg.event.link, instruments: cfg.event.instruments ?? [],
    flare: cfg.event.flare ?? null,
    started_at: new Date(running.startedAt).toISOString(),
    ends_at: new Date(running.startedAt + running.minutes * 60000).toISOString(),
    remaining_s: Math.round((running.minutes - elapsedMin) * 60),
    dose_rate_msv_h: Math.round(curveAt(curveMin) * scale * 1000) / 1000,
    event_dose_msv: Math.round(((doseUntil(curveMin) * curveLen) / running.minutes) * scale * 1000) / 1000,
    location_scale: scale,
    location_reason: pickForEnv(cfg.location_reason, keys) ?? '',
    dose_note: cfg.dose_note ?? 'dose simulated; timing from real DONKI event',
    alert: cfg.alert,
    advice: pickForEnv(cfg.advice, keys) ?? 'Go to the most shielded area now.',
    simulated_dose: true,
    note: cfg._status ?? '',
  };
}

/** Offline status: while the event runs, the radiation region is Act now (as the backend does). */
export function withOfflineSolar(rows: RegionStatus[], env: string): RegionStatus[] {
  const ev = offlineSolarEvent(env);
  if (!ev) return rows;
  const stronger = ev.location_scale && ev.location_scale !== 1 ? `, about ${ev.location_scale} times the ISS` : '';
  return rows.map((row) => (row.region !== 'radiation' ? row : {
    ...row, status: 'red', score: Math.min(row.score, 10), time_to_act_days: 0, advice_level: 'surgeon_now',
    reason: `Solar particle event in progress (real NASA DONKI event ${ev.sep_id}; dose simulated${stronger}): `
      + `${ev.dose_rate_msv_h.toFixed(2)} mSv/h now. Go to the shielded area.`,
  }));
}
