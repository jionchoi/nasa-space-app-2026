// Real crew reference values (NASA OSDR OSD-575, Inspiration4): loaded once, shown as in the file.
// Also the user's glucose unit choice (mmol/L or mg/dL), shared by the daily check and the metabolism region.
import { useEffect, useState } from 'react';
import { getCrewReference } from '../api/client';
import type { CrewReference } from '../types/contracts';

let cache: CrewReference | null = null;

export function useCrewReference(): CrewReference | null {
  const [ref, setRef] = useState<CrewReference | null>(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    getCrewReference().then((r) => { cache = r; if (live) setRef(r); });
    return () => { live = false; };
  }, []);
  return ref;
}

export type GlucoseUnit = 'mmol' | 'mgdl';
const KEY = 'copilot.glucoseUnit';
const EVENT = 'copilot:glucose-unit';

function readUnit(): GlucoseUnit {
  try {
    return localStorage.getItem(KEY) === 'mgdl' ? 'mgdl' : 'mmol';
  } catch {
    return 'mmol';
  }
}

/** The glucose unit toggle, remembered per browser (a convenience only; mmol/L when storage is unavailable). */
export function useGlucoseUnit(): [GlucoseUnit, (unit: GlucoseUnit) => void] {
  const [unit, setUnitState] = useState<GlucoseUnit>(readUnit);
  useEffect(() => {
    const sync = () => setUnitState(readUnit());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const setUnit = (next: GlucoseUnit) => {
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: keep it for this page only */ }
    setUnitState(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [unit, setUnit];
}

/** A glucose value from the file (mg/dL string). mg/dL: the file's string unchanged; mmol/L: converted, 1 decimal. */
export function glucoseText(value: string | undefined, unit: GlucoseUnit, mgdlPerMmol: number): string {
  if (value === undefined || value === '') return '–';
  if (unit === 'mgdl') return value;
  const n = Number(value);
  return Number.isFinite(n) ? (n / mgdlPerMmol).toFixed(1) : value;
}

export const glucoseUnitLabel = (unit: GlucoseUnit) => (unit === 'mmol' ? 'mmol/L' : 'mg/dL');
