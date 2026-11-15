import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/common/AppHeader';
import { useRoutineTasks } from '../hooks/useRoutineTasks';
import { useApp } from '../state/AppContext';
import { useRoutine } from '../state/RoutineContext';
import type { LogKind } from '../types/contracts';

/** The 8 steps of the daily check (same order as /check), and what each one uses. */
const CHECK_STEPS: [string, string][] = [
  ['Prepare: clip on, sit still', 'coach'], ['Seated rest: heart rate, HRV, SpO₂, breathing', 'PPG sensor'], ['Stand test', 'PPG sensor'],
  ['Temperature and glucose', 'you type it'], ['Blood pressure', 'cuff'], ['Reaction test', 'vs CSA PRET'], ['Questions: sleep, mood, stress, symptoms', 'you'],
  ['Summary', 'vs your usual + Inspiration4'],
];

/** Today's routine (/routine, design Routine-v4): timed tasks, progress and streak, the daily check steps and a quick log.
 *  Behaviour only, never health results; the streak and reminders keep their own logic. */
export default function Routine() {
  const { tasks, done, total, streak, toggleWindDown } = useRoutineTasks();
  const { openLog, schedule } = useRoutine();
  const { checkDoneAt } = useApp();
  const navigate = useNavigate();
  const run = (action: string) => {
    if (action === 'tick') toggleWindDown();
    else if (action.startsWith('log:')) openLog(action.slice(4) as LogKind);
    else navigate(action);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-label="Today's tasks" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <span className="block text-[13px] text-muted">Today's routine</span>
              <h1 className="font-display text-[40px] font-bold leading-tight">{done} of {total} done</h1>
            </div>
            <div className="flex flex-col rounded-card border border-watch/30 bg-watch/5 px-3.5 py-2">
              <span className="text-xs text-watch">Streak</span>
              <span className="font-mono text-[22px]">▲ {streak} {streak === 1 ? 'day' : 'days'}</span>
            </div>
            <span className="text-[13px] text-muted">The streak counts days with the daily check done.</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Tasks done today">
            <div className="h-full bg-ok transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <ul className="flex flex-col gap-2.5">
            {tasks.map((t) => {
              const tone = t.done ? 'text-ok' : t.overdue ? 'text-warn' : 'text-muted';
              return (
                <li key={t.id} className={`flex flex-wrap items-center gap-3.5 rounded-card border px-4 py-3.5 ${t.overdue ? 'border-warn bg-warn/5' : t.done ? 'border-line' : 'border-line bg-panel'}`}>
                  <button type="button" role="checkbox" aria-checked={t.done} aria-label={`${t.title}: ${t.done ? 'done' : 'not done'}`}
                    disabled={t.action !== 'tick'} onClick={() => run('tick')} title={t.action !== 'tick' ? 'Ticks itself when the task is done' : 'Tick when done'}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 font-extrabold text-bg ${t.done ? 'border-ok bg-ok' : t.overdue ? 'border-warn' : 'border-muted'} disabled:cursor-default`}>
                    {t.done ? '✓' : ''}
                  </button>
                  <span className="w-[52px] font-mono text-sm text-muted">{t.time}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[17px] font-semibold ${t.done ? 'text-muted line-through' : ''}`}>{t.title}</span>
                    <span className="text-[13px] text-muted">{t.detail}</span>
                  </span>
                  <span className={`whitespace-nowrap text-xs font-bold ${tone}`}>{t.done ? 'Done' : t.overdue ? 'Not done · overdue' : 'Upcoming'}</span>
                  {!t.done && (
                    <button type="button" onClick={() => run(t.action)} className={`btn h-10 min-h-0 ${t.overdue ? 'border-transparent bg-warn text-bg hover:bg-warn/90' : ''}`}>{t.cta}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          <section aria-label="Daily check" className="rounded-panel border border-line p-4">
            <span className="text-xs font-bold tracking-[0.12em] text-muted">DAILY CHECK · 8 STEPS</span>
            <ol className="mt-1">
              {CHECK_STEPS.map(([text, src], i) => (
                <li key={text} className="flex items-center gap-2.5 border-b border-line py-1.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${checkDoneAt ? 'bg-ok' : 'bg-line-strong'}`} aria-hidden />
                  {i + 1}. {text}<span className="ml-auto text-xs text-muted">{src}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => navigate('/check')} className="btn btn-primary mt-3 w-full">
              {checkDoneAt ? 'Repeat the daily check' : 'Start daily check'}
            </button>
          </section>
          <section aria-label="Quick log" className="flex flex-col gap-2 rounded-panel border border-line p-4">
            <span className="text-xs font-bold tracking-[0.12em] text-muted">QUICK LOG</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn rounded-control" onClick={() => openLog('meal')}>Meal</button>
              <button type="button" className="btn rounded-control" onClick={() => openLog('meal')}>Water</button>
              <button type="button" className="btn rounded-control" onClick={() => openLog('exercise')}>Exercise</button>
              <button type="button" className="btn rounded-control" onClick={() => openLog('biomarkers')}>Weekly biomarkers</button>
              <button type="button" className="btn col-span-2 rounded-control" onClick={() => openLog('mood')}>Mood and symptoms</button>
            </div>
            <span className="text-xs text-muted">Opens the log drawer. Saved on this laptop.</span>
          </section>
          <section aria-label="Reminders" className="rounded-panel border border-line p-4 text-[13px] text-muted">
            <span className="text-xs font-bold tracking-[0.12em]">REMINDERS</span>
            <p className="mt-1">
              Pop-up cards at {schedule.map((s) => s.time).join(', ') || '–'} mission time. A reminder is skipped when its task is already done.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
