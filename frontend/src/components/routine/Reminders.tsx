import { Alarm, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { minuteOfDay, toMinutes, useMissionClock, useRoutine } from '../../state/RoutineContext';
import type { LogKind, ScheduleItem } from '../../types/contracts';

const SHOW_MS = 20_000;

/** In-app reminders at the times in environments.json "schedule", driven by the mission clock.
 *  A reminder is skipped when its mission is already done; each fires once per mission day. */
export function Reminders() {
  const now = useMissionClock();
  const { schedule, missions, openLog } = useRoutine();
  const navigate = useNavigate();
  const [shown, setShown] = useState<ScheduleItem[]>([]);
  const last = useRef<number | null>(null);
  const fired = useRef(new Set<string>());

  useEffect(() => {
    const minute = minuteOfDay(now);
    const before = last.current;
    last.current = minute;
    if (before === null || minute === before) return;
    const day = now.toISOString().slice(0, 10);
    for (const item of schedule) {
      const at = toMinutes(item.time);
      const crossed = before <= minute ? before < at && at <= minute : at > before || at <= minute; // wraps at midnight
      const key = `${day}-${item.id}`;
      if (!crossed || fired.current.has(key)) continue;
      fired.current.add(key);
      if (missions?.missions.find((m) => m.id === item.mission)?.done) continue;
      setShown((list) => [...list.filter((s) => s.id !== item.id), item]);
      setTimeout(() => setShown((list) => list.filter((s) => s.id !== item.id)), SHOW_MS);
    }
  }, [now, schedule, missions]);

  if (!shown.length) return null;
  const act = (item: ScheduleItem) => {
    setShown((list) => list.filter((s) => s.id !== item.id));
    if (item.action.startsWith('log:')) openLog(item.action.slice(4) as LogKind); else navigate(item.action);
  };

  return (
    <div className="fixed right-4 top-20 z-50 flex w-[360px] flex-col gap-2" aria-live="polite">
      {shown.map((item) => (
        <div key={item.id} role="status" className="flex animate-rise items-start gap-3 rounded-2xl bg-raised p-4 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-info/30">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-info/15 text-info"><Alarm className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Reminder · {item.time} GMT</p>
            <p className="text-sm font-medium leading-snug">{item.text}</p>
            <button className="btn btn-primary mt-2 px-3 py-1 text-xs" onClick={() => act(item)}>
              {item.action === '/check' ? 'Start the check' : 'Log it now'}
            </button>
          </div>
          <button className="text-muted hover:text-text" onClick={() => setShown((l) => l.filter((s) => s.id !== item.id))} aria-label="Dismiss reminder">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
