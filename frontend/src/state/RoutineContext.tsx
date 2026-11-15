// Daily routine state shared by every screen: today's missions, the log forms, and the mission clock that drives
// the reminders (environments.json "schedule"). Missions reward behaviour only, never health results.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMissions, useUsingMock } from '../api/client';
import type { LogKind, MissionsResponse, ScheduleItem } from '../types/contracts';
import { useApp } from './AppContext';

interface RoutineState {
  missions: MissionsResponse | null;
  refreshMissions(): void;
  logOpen: LogKind | null;
  openLog(kind: LogKind): void;
  closeLog(): void;
  /** Demo offset added to real time for the mission clock (ms). */
  clockOffsetMs: number;
  /** Move the mission clock to just before the next reminder in the schedule. Returns that reminder. */
  jumpToNextReminder(): ScheduleItem | null;
  resetClock(): void;
  schedule: ScheduleItem[];
}

const Ctx = createContext<RoutineState | null>(null);
const DAY_MS = 86_400_000;

/** Mission time is GMT (as on the ISS). */
export const missionDate = (offsetMs: number) => new Date(Date.now() + offsetMs);
export const minuteOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const missionHHMM = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

export function RoutineProvider({ children }: { children: ReactNode }) {
  const { persona, envInfo, checkDoneAt } = useApp();
  const usingMock = useUsingMock();
  const [missions, setMissions] = useState<MissionsResponse | null>(null);
  const [logOpen, setLogOpen] = useState<LogKind | null>(null);
  const [clockOffsetMs, setOffset] = useState(0);
  const schedule = useMemo(() => envInfo?.schedule ?? [], [envInfo]);

  const refreshMissions = useCallback(() => { getMissions(persona).then(setMissions); }, [persona]);
  useEffect(() => { refreshMissions(); }, [refreshMissions, checkDoneAt, usingMock]);

  const jumpToNextReminder = useCallback(() => {
    if (!schedule.length) return null;
    const now = missionDate(clockOffsetMs);
    const minute = minuteOfDay(now);
    const sorted = [...schedule].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    const next = sorted.find((s) => toMinutes(s.time) > minute + 0.1) ?? sorted[0];
    let deltaMin = toMinutes(next.time) - minute;
    if (deltaMin <= 0) deltaMin += 24 * 60;
    // Land 3 s before the reminder so the crew sees it fire.
    setOffset((o) => (o + deltaMin * 60_000 - 3000) % DAY_MS);
    return next;
  }, [schedule, clockOffsetMs]);

  const value = useMemo<RoutineState>(() => ({
    missions, refreshMissions, logOpen, openLog: setLogOpen, closeLog: () => setLogOpen(null),
    clockOffsetMs, jumpToNextReminder, resetClock: () => setOffset(0), schedule,
  }), [missions, refreshMissions, logOpen, clockOffsetMs, jumpToNextReminder, schedule]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoutine(): RoutineState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRoutine must be used inside RoutineProvider');
  return ctx;
}

/** The mission clock, re-rendering once per second. */
export function useMissionClock(): Date {
  const { clockOffsetMs } = useRoutine();
  const [now, setNow] = useState(() => missionDate(clockOffsetMs));
  useEffect(() => {
    setNow(missionDate(clockOffsetMs));
    const id = setInterval(() => setNow(missionDate(clockOffsetMs)), 1000);
    return () => clearInterval(id);
  }, [clockOffsetMs]);
  return now;
}
