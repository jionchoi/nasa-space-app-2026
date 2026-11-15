import { Check, Fire } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useRoutine } from '../../state/RoutineContext';
import type { LogKind } from '../../types/contracts';

/** "Today's routine": progress bar and the daily missions (behaviour only, never health results). Each row opens what it asks for. */
export function MissionsCard() {
  const { missions, openLog } = useRoutine();
  const navigate = useNavigate();
  if (!missions) return null;
  const list = missions.missions;
  const done = list.filter((m) => m.done).length;
  const act = (action: string) => (action.startsWith('log:') ? openLog(action.slice(4) as LogKind) : navigate(action));

  return (
    <section aria-label="Today's routine" className="flex flex-col gap-3 rounded-panel border border-line bg-panel px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Today's routine</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {missions.streak.current > 0 && (
            <span className="flex items-center gap-1" title="Days in a row with the daily check done">
              <Fire className="h-3.5 w-3.5 text-warn" weight="fill" aria-hidden />{missions.streak.current}-day streak ·
            </span>
          )}
          {done} of {list.length} done
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full bg-info transition-[width] duration-500" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
      </div>
      <div className="flex flex-col">
        {list.map((m) => (
          <button key={m.id} type="button" aria-pressed={m.done} onClick={() => act(m.action)}
            className="flex min-h-touch items-center gap-3 rounded-control px-1 text-left transition hover:bg-raised/60">
            <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-2 ${m.done ? 'border-info bg-info' : 'border-line-strong'}`}>
              {m.done && <Check className="h-3 w-3 text-bg" weight="bold" aria-hidden />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{m.label}</span>
              <span className="truncate text-xs text-muted">{m.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
