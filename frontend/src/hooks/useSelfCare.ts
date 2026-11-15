// Self-care items ticked today on a region's "What to do" card. Saved as a "self_care" form (SQLite) so they survive a
// restart; also kept in this browser so ticking works with the backend off. Only today's ticks count.
import { useCallback, useEffect, useState } from 'react';
import { getForms, postForm } from '../api/client';
import type { Status } from '../types/contracts';

interface SelfCareData { region: string; status: Status; ticked: string[] }

const today = () => new Date().toDateString();
const storageKey = (persona: string, region: string, status: Status) => `selfcare:${persona}:${region}:${status}:${today()}`;

function readLocal(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, ticked: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(ticked)); } catch { /* private window: keep in memory only */ }
}

export function useSelfCare(persona: string, region: string, status: Status) {
  const key = storageKey(persona, region, status);
  const [ticked, setTicked] = useState<string[]>(() => readLocal(key));

  useEffect(() => {
    let live = true;
    setTicked(readLocal(key));
    getForms<SelfCareData>(persona, 'self_care').then((rows) => {
      if (!live || !rows) return;
      const latest = rows.find((r) => new Date(r.t).toDateString() === today() && r.data.region === region && r.data.status === status);
      if (latest) {
        setTicked(latest.data.ticked);
        writeLocal(key, latest.data.ticked);
      }
    });
    return () => { live = false; };
  }, [persona, region, status, key]);

  const toggle = useCallback((item: string) => {
    setTicked((list) => {
      const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
      writeLocal(key, next);
      void postForm(persona, 'self_care', { region, status, ticked: next });
      return next;
    });
  }, [key, persona, region, status]);

  return { ticked, toggle };
}
