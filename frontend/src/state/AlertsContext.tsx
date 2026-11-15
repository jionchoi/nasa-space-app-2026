// One alerts feed for the whole app (header bell, red-alert banner, messages drawer).
// The backend owns alerts: GET /api/alerts + /ws/alerts. With the backend off, a page can provide alerts built in
// the browser (setFallback) and acknowledgements are kept locally.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ackAlert, connectAlerts, getAlerts, useUsingMock } from '../api/client';
import type { Alert } from '../types/contracts';
import { useApp } from './AppContext';

interface AlertsState {
  alerts: Alert[];
  ack(id: string): void;
  /** Mock-mode alerts from the current page (null to clear). */
  setFallback(alerts: Alert[] | null): void;
}

const Ctx = createContext<AlertsState | null>(null);

const upsert = (list: Alert[], alert: Alert) =>
  list.some((a) => a.id === alert.id) ? list.map((a) => (a.id === alert.id ? alert : a)) : [alert, ...list];

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { persona } = useApp();
  const usingMock = useUsingMock();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [fallback, setFallback] = useState<Alert[] | null>(null);
  const [localAcks, setLocalAcks] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (usingMock) return;
    let live = true;
    setAlerts([]);
    getAlerts(persona).then((rows) => { if (live && rows) setAlerts(rows); });
    const close = connectAlerts(persona, (message) => {
      setAlerts((prev) => (message.type === 'snapshot' ? message.alerts : upsert(prev, message.alert)));
    });
    return () => { live = false; close(); };
  }, [persona, usingMock]);

  const ack = useCallback((id: string) => {
    if (usingMock) {
      setLocalAcks((s) => new Set(s).add(id));
      return;
    }
    void ackAlert(id).then((alert) => { if (alert) setAlerts((prev) => upsert(prev, alert)); });
  }, [usingMock]);

  const value = useMemo<AlertsState>(() => {
    const source = usingMock ? (fallback ?? []).map((a) => (localAcks.has(a.id) ? { ...a, acknowledged: true } : a)) : alerts;
    return { alerts: [...source].sort((a, b) => b.t.localeCompare(a.t)), ack, setFallback };
  }, [usingMock, fallback, localAcks, alerts, ack]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts(): AlertsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAlerts must be used inside AlertsProvider');
  return ctx;
}
