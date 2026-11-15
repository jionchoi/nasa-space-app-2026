// Red-flag symptoms the crew logged in this browser (Mood and symptoms log, demo step). Same rule as the backend
// (app/symptoms.py, thresholds.json "symptoms", team default pending Yenna): a red-flag symptom is Act now on its own and
// fulfils the Act-now rules marked requires_symptoms (RULE-05 irregular pulse, RULE-04 extreme BP) for active_minutes.
// Demo mode only: Measurement and Research mode never raise alerts (clinical_auto_alert_enabled = false).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { SymptomsConfig, Thresholds } from '../types/contracts';

export interface LoggedSymptom { id: string; persona: string; at: number }

let logged: LoggedSymptom[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function symptomsConfig(thresholds: Thresholds | null): SymptomsConfig | null {
  const cfg = thresholds?.symptoms as unknown as SymptomsConfig | undefined;
  return cfg && typeof cfg === 'object' && cfg.red_flag ? cfg : null;
}

/** The red-flag symptoms among `ids` (others, like headache, are timeline only). */
export const redFlagOnly = (ids: string[], cfg: SymptomsConfig | null) => ids.filter((id) => !!cfg?.red_flag[id]);

/** Remember red-flag symptoms logged for a crew member (call after the form is saved). */
export function logSymptoms(ids: string[], persona: string, at = Date.now()): void {
  if (!ids.length) return;
  logged = [...logged, ...ids.map((id) => ({ id, persona, at }))];
  emit();
}

export function clearSymptoms(): void {
  logged = [];
  emit();
}

/** Red-flag symptoms logged for `persona` in the last `active_minutes`, oldest first, no repeats. */
export function activeSymptoms(list: LoggedSymptom[], persona: string, cfg: SymptomsConfig | null, now = Date.now()): string[] {
  if (!cfg) return [];
  const since = now - cfg.active_minutes * 60_000;
  const out: string[] = [];
  for (const s of list) if (s.persona === persona && s.at >= since && cfg.red_flag[s.id] && !out.includes(s.id)) out.push(s.id);
  return out;
}

const useLogged = () =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => logged);

/** Active red-flag symptoms for this crew member (re-checked every 30 s so they expire). */
export function useActiveSymptoms(persona: string, thresholds: Thresholds | null): string[] {
  const list = useLogged();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const cfg = symptomsConfig(thresholds);
  const key = activeSymptoms(list, persona, cfg, Math.max(now, list.length ? list[list.length - 1].at : 0)).join(',');
  return useMemo(() => (key ? key.split(',') : []), [key]);
}
