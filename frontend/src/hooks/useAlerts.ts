import { useMemo, useRef } from 'react';
import { entryOf, type LiveStatus } from '../lib/status';
import { useApp, useStatusLabel } from '../state/AppContext';
import type { Alert, RegionStatus } from '../types/contracts';

/**
 * MOCK FALLBACK ONLY. The backend owns alerts (app/alerts.py, GET /api/alerts, /ws/alerts). This builds the same
 * kind of alerts in the browser so the alerts list still works when the backend is off.
 */
export function useMockAlerts(statuses: RegionStatus[], live: LiveStatus | null): Alert[] {
  const { persona, regions, thresholds, emergencies } = useApp();
  const statusLabel = useStatusLabel();
  const firstSeen = useRef(new Map<string, string>());
  const redKey = live?.red.join(',') ?? '';

  return useMemo(() => {
    const active: Alert[] = [];
    const stamp = (id: string) => {
      if (!firstSeen.current.has(id)) firstSeen.current.set(id, new Date().toISOString());
      return firstSeen.current.get(id)!;
    };
    const base = { acknowledged: false, message_draft_id: null, persona };
    for (const s of statuses) {
      if (s.status === 'green') continue;
      const id = `${persona}:region:${s.region}:${s.status}`;
      const meta = regions.find((r) => r.id === s.region);
      active.push({ ...base, id, t: stamp(id), level: s.status, region: s.region, metric: meta?.key_metric ?? null,
        source: 'rules', message: `${meta?.label ?? s.region} · ${statusLabel(s.status)}: ${s.reason}` });
    }
    for (const key of redKey ? redKey.split(',') : []) {
      const id = `${persona}:vital:${key}`;
      const label = entryOf(thresholds, key)?.label ?? key;
      const region = regions.find((r) => r.live_metrics.includes(key))?.id ?? null;
      const message = key === 'irregular' ? 'Live: irregular heart rhythm' : `Live: ${label} in the danger range`;
      active.push({ ...base, id, t: stamp(id), level: 'red', region, metric: key, source: 'vitals', message });
    }
    const ids = new Set(active.map((a) => a.id));
    for (const id of [...firstSeen.current.keys()]) if (!ids.has(id)) firstSeen.current.delete(id);

    const handled: Alert[] = emergencies.map((e) => ({
      ...base, id: `emergency:${e.endedAt}`, t: e.endedAt, level: 'yellow', region: null, metric: null, source: 'emergency',
      link: e.localId ? `/emergency/log/${e.localId}` : null,
      message: `Emergency handled at ${new Date(e.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} (${e.title})`,
    }));
    return [...active, ...handled].sort((a, b) => b.t.localeCompare(a.t));
  }, [statuses, redKey, persona, regions, thresholds, emergencies, statusLabel]);
}
