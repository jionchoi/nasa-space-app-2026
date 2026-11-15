import { Clock, FastForward, Fire } from '@phosphor-icons/react';
import { missionHHMM, useMissionClock, useRoutine } from '../../state/RoutineContext';

/** Mission time (GMT) in the header, the check streak, and a demo control to jump to the next reminder. */
export function MissionClock() {
  const now = useMissionClock();
  const { jumpToNextReminder, clockOffsetMs, resetClock, missions } = useRoutine();
  const streak = missions?.streak.current ?? 0;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className="flex items-center gap-1 text-muted" title="Mission time (GMT). Reminders follow this clock.">
        <Clock className="h-3.5 w-3.5" aria-hidden /><span className="font-mono text-text">{missionHHMM(now)}</span> GMT
      </span>
      <button className="grid h-6 w-6 place-items-center rounded-full text-muted transition hover:bg-white/[0.06] hover:text-text"
        onClick={() => jumpToNextReminder()} title="Demo: jump the mission clock to the next reminder" aria-label="Jump to the next reminder (demo)">
        <FastForward className="h-3.5 w-3.5" aria-hidden />
      </button>
      {clockOffsetMs !== 0 && (
        <button className="text-[10px] text-muted underline-offset-2 hover:text-text hover:underline" onClick={resetClock} title="Back to real time">
          real time
        </button>
      )}
      {streak > 0 && (
        <span className="ml-1 flex items-center gap-0.5 text-muted" title={`${streak}-day daily check streak`}>
          <Fire className="h-3.5 w-3.5 text-warn" weight="fill" aria-hidden /><span className="font-mono text-text">{streak}</span>
        </span>
      )}
    </div>
  );
}
