import { useEffect, useState } from 'react';
import { getDaily, getStatus } from '../api/client';
import type { DailyEntry, RegionStatus } from '../types/contracts';

const REFRESH_MS = 10_000;

/** Region statuses: on load, on persona/env change, and every 10 s. */
export function useStatus(persona: string, env: string) {
  const [statuses, setStatuses] = useState<RegionStatus[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => getStatus(persona, env).then((rows) => { if (live) setStatuses(rows); });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [persona, env]);
  return statuses;
}

/** Daily entries for the trend chart. `refreshKey` reloads them (e.g. after a daily check). */
export function useDaily(persona: string, refreshKey?: unknown) {
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  useEffect(() => {
    let live = true;
    getDaily(persona).then((rows) => { if (live) setDaily(rows); });
    return () => { live = false; };
  }, [persona, refreshKey]);
  return daily;
}
