// Today's routine (v4 /routine page, the top bar button and the sidebar count). Five timed tasks built from what the
// app already tracks: the backend missions (daily check, meals, water, exercise), the reaction test (a saved "pvt" form
// or a reaction result in today's daily check) and wind-down (ticked by hand, kept in this browser for today).
// Behaviour only, never health results. The streak and the reminders keep their own logic (backend, Reminders.tsx).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getForms } from '../api/client';
import { useApp } from '../state/AppContext';
import { useHealth } from '../state/HealthContext';
import { minuteOfDay, toMinutes, useMissionClock, useRoutine } from '../state/RoutineContext';

export interface RoutineTask {
  id: 'daily_check' | 'reaction' | 'meals_water' | 'exercise' | 'wind_down';
  time: string;
  title: string;
  detail: string;
  done: boolean;
  /** Time has passed and it is not done. */
  overdue: boolean;
  /** "/check", "/reaction", "log:meal", "log:exercise" or "tick" (wind-down). */
  action: string;
  cta: string;
}

/** Times for the two display tasks that are not in the reminder schedule (not medical values). */
const REACTION_TIME = '10:00';
const WIND_DOWN_BEFORE_SLEEP_MIN = 30;

const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const todayKey = (persona: string) => `winddown:${persona}:${new Date().toDateString()}`;
const readTick = (key: string) => { try { return window.localStorage.getItem(key) === '1'; } catch { return false; } };

export function useRoutineTasks() {
  const { persona, envInfo } = useApp();
  const { missions, schedule } = useRoutine();
  const { daily } = useHealth();
  const now = useMissionClock();
  const [pvtToday, setPvtToday] = useState(false);
  const [windDown, setWindDown] = useState(() => readTick(todayKey(persona)));

  useEffect(() => { setWindDown(readTick(todayKey(persona))); }, [persona]);
  useEffect(() => {
    let live = true;
    const load = () => getForms(persona, 'pvt').then((rows) => {
      if (live) setPvtToday(!!rows?.some((r) => new Date(r.t).toDateString() === new Date().toDateString()));
    });
    load();
    const id = setInterval(load, 30_000);
    return () => { live = false; clearInterval(id); };
  }, [persona, missions]);

  const toggleWindDown = useCallback(() => {
    setWindDown((on) => {
      try { window.localStorage.setItem(todayKey(persona), on ? '0' : '1'); } catch { /* private window */ }
      return !on;
    });
  }, [persona]);

  const minute = minuteOfDay(now);
  const tasks = useMemo<RoutineTask[]>(() => {
    const m = (id: string) => missions?.missions.find((x) => x.id === id);
    const at = (mission: string, fallback: string) => schedule.find((s) => s.mission === mission)?.time ?? fallback;
    const todayEntry = daily.find((d) => d.today);
    const reactionInCheck = typeof todayEntry?.pvt_median_ms === 'number';
    const sleepStart = envInfo?.sleep?.start ?? '22:00';
    const meals = m('meals');
    const water = m('water');
    const list: Omit<RoutineTask, 'overdue'>[] = [
      { id: 'daily_check', time: at('daily_check', '07:30'), title: 'Daily check', detail: m('daily_check')?.detail ?? '8 steps · about 6 min',
        done: !!m('daily_check')?.done, action: '/check', cta: 'Start' },
      { id: 'reaction', time: REACTION_TIME, title: 'Reaction test', detail: reactionInCheck ? 'Done in the daily check' : '3-minute tap test (PVT)',
        done: pvtToday || reactionInCheck, action: '/reaction', cta: 'Start' },
      { id: 'meals_water', time: at('meals', '12:30'), title: 'Meals and water',
        detail: [meals?.detail, water?.detail].filter(Boolean).join(' · ') || 'Log what you ate and drank',
        done: !!meals?.done && !!water?.done, action: 'log:meal', cta: 'Log' },
      { id: 'exercise', time: at('exercise', '16:00'), title: 'Exercise', detail: m('exercise')?.detail ?? 'Log your session',
        done: !!m('exercise')?.done, action: 'log:exercise', cta: 'Log' },
      { id: 'wind_down', time: hhmm(toMinutes(sleepStart) - WIND_DOWN_BEFORE_SLEEP_MIN), title: `Wind down · sleep window ${sleepStart}`,
        detail: 'Eye mask, dim screens', done: windDown, action: 'tick', cta: 'Done' },
    ];
    return list
      .map((t) => ({ ...t, overdue: !t.done && toMinutes(t.time) < minute }))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }, [missions, schedule, daily, envInfo, pvtToday, windDown, minute]);

  const done = tasks.filter((t) => t.done).length;
  return { tasks, done, total: tasks.length, todo: tasks.length - done, overdue: tasks.filter((t) => t.overdue).length,
    streak: missions?.streak.current ?? 0, toggleWindDown };
}
