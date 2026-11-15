import { ForkKnife, PersonSimpleRun, Scales, X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { postForm, useUsingMock } from '../../api/client';
import { useApp } from '../../state/AppContext';
import { useRoutine } from '../../state/RoutineContext';
import type { LogKind } from '../../types/contracts';
import { BiomarkerForm, ExerciseForm, MealForm } from './LogForms';

const TABS: { id: LogKind; label: string; Icon: typeof ForkKnife }[] = [
  { id: 'meal', label: 'Meal and water', Icon: ForkKnife },
  { id: 'exercise', label: 'Exercise', Icon: PersonSimpleRun },
  { id: 'biomarkers', label: 'Weekly biomarkers', Icon: Scales },
];

/** Slide-over with the three log forms. Opened from the missions card, reminders, or the metabolism area. */
export function LogDrawer() {
  const { logOpen, openLog, closeLog, refreshMissions } = useRoutine();
  const { persona, personaInfo } = useApp();
  const usingMock = useUsingMock();
  const open = logOpen !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeLog]);

  const save = (kind: LogKind) => async (data: Record<string, unknown>) => {
    const res = await postForm(persona, kind, data);
    if (!res?.ok) return usingMock ? 'The backend is off, so this was not saved.' : 'Could not save. Check the values and try again.';
    refreshMissions();
    return null;
  };

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-bg/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={closeLog} />
      <aside role="dialog" aria-label="Log"
        className={`absolute bottom-3 right-3 top-3 flex w-[min(460px,calc(100vw-1.5rem))] flex-col rounded-[1.6rem] bg-panel ring-1 ring-white/[0.08] shadow-[0_24px_64px_-16px_rgb(0_0_0/0.8)] transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[110%]'}`}>
        <header className="flex items-center gap-3 border-b border-white/[0.06] p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Log for today</h2>
            <p className="text-xs text-muted">{personaInfo?.name} · saved on this laptop</p>
          </div>
          <button className="btn h-9 w-9 p-0" onClick={closeLog} aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
        </header>
        <nav className="flex gap-1 border-b border-white/[0.06] px-3 py-2" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={logOpen === id} onClick={() => openLog(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${logOpen === id ? 'bg-white/[0.08] text-text' : 'text-muted hover:text-text'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {logOpen === 'meal' && <MealForm key={`meal-${persona}`} onSave={save('meal')} />}
          {logOpen === 'exercise' && <ExerciseForm key={`ex-${persona}`} onSave={save('exercise')} />}
          {logOpen === 'biomarkers' && <BiomarkerForm key={`bio-${persona}`} onSave={save('biomarkers')} />}
        </div>
      </aside>
    </div>
  );
}
