import { CaretLeft, CaretRight, Pause, Play, PresentationChart, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setVitalsPaused } from '../../api/live';
import { goToStep, setDemoPaused, startDemo, stopDemo, useDemo } from '../../lib/demo';
import { isTypingTarget } from '../../lib/sound';
import { useApp } from '../../state/AppContext';
import { useCv } from '../../state/CvContext';
import { DEMO_STEPS, personaBadge, type DemoContext } from './demoSteps';
import { SCENARIOS } from '../../lib/locations';

const KIND_CLASS = {
  real: 'bg-info/10 text-info ring-info/25',
  simulated: 'bg-white/[0.06] text-soft ring-white/15',
  estimated: 'bg-watch/10 text-watch ring-watch/25',
} as const;

/** Shift+D anywhere (not while typing): demo mode on/off. In demo mode, arrow keys or PageUp/PageDown (a presenter
 *  clicker) go back and forward. */
function useDemoKeys(active: boolean, step: number) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); if (active) stopDemo(); else startDemo(); return; }
      if (!active) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToStep(Math.min(DEMO_STEPS.length - 1, step + 1)); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goToStep(Math.max(0, step - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step]);
}

/** Demo mode controller and presenter bar (mounted once, on every screen; works in the public build). */
export function DemoBar() {
  const { active, step, paused } = useDemo();
  const app = useApp();
  const cv = useCv();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useDemoKeys(active, step);

  // ?demo=1 starts demo mode on load (handy for the pitch laptop's bookmark).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') startDemo();
  }, []);

  // Pause: hold the live vitals still on every screen.
  useEffect(() => { setVitalsPaused(active && paused); }, [active, paused]);

  // Keep the newest app functions for the step code (it runs after state changes).
  const ctxRef = useRef<DemoContext | null>(null);
  const timers = useRef<number[]>([]);
  ctxRef.current = {
    setPersona: app.setPersona, setEnv: app.setEnv, setPlanet: app.setPlanet, setPicked: app.setPicked, jumpTo: app.jumpTo,
    navigate, pathname, search, cv: { start: cv.start, stop: cv.stop, demoTrigger: cv.demoTrigger },
    later: (fn, ms) => { timers.current.push(window.setTimeout(() => fn(), ms)); },
  };
  const clearTimers = useCallback(() => { timers.current.forEach((t) => clearTimeout(t)); timers.current = []; }, []);

  // Apply the step whenever it changes (Next, Back, or the start).
  useEffect(() => {
    if (!active) return;
    clearTimers();
    setDemoPaused(false);
    DEMO_STEPS[step]?.apply(ctxRef.current!);
  }, [active, step, clearTimers]);
  useEffect(() => { if (!active) clearTimers(); }, [active, clearTimers]);

  if (!active) return null;
  const current = DEMO_STEPS[step];
  const persona = personaBadge(app.personaInfo);
  const badges = [...(persona ? [persona] : []), ...current.sources];

  return (
    <div role="region" aria-label="Demo presenter bar"
      className="fixed bottom-4 right-4 z-[70] flex w-[min(560px,calc(100vw-2rem))] flex-col gap-2 rounded-panel border border-line-strong bg-panel/95 p-3 text-sm shadow-[0_20px_50px_-12px_rgb(0_0_0/0.85)] backdrop-blur">
      <div className="flex items-center gap-2">
        <PresentationChart className="h-4 w-4 shrink-0 text-info" aria-hidden />
        <span className="font-mono text-xs text-muted">{current.label} / 8</span>
        <span className="min-w-0 flex-1 truncate font-semibold" title={current.title}>{current.title}</span>
        {paused && <span className="badge bg-watch/10 text-watch ring-watch/25">Paused</span>}
        <button type="button" className="rounded p-1 text-muted hover:text-text" onClick={stopDemo} aria-label="Leave demo mode (Shift+D)" title="Leave demo mode (Shift+D)">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted">{current.note}</p>
      <div role="radiogroup" aria-label="Scenario" className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">Scenario</span>
        {SCENARIOS.map((sc) => (
          <button key={sc.id} type="button" role="radio" aria-checked={app.persona === sc.id} onClick={() => app.setPersona(sc.id)}
            className={`h-8 rounded-full border px-2.5 ${app.persona === sc.id ? 'border-text bg-text text-bg' : 'border-line-strong text-soft hover:bg-raised'}`}>{sc.label}</button>
        ))}
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => <span key={b.text} className={`badge ${KIND_CLASS[b.kind]}`}>{b.text}</span>)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" className="btn h-9 px-3" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Back (left arrow)">
          <CaretLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <button type="button" className="btn h-9 px-3" onClick={() => setDemoPaused(!paused)} aria-pressed={paused}>
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />} {paused ? 'Resume' : 'Pause'}
        </button>
        {current.actions?.map((a) => (
          <button key={a.label} type="button" className="btn h-9 px-3" onClick={() => a.run(ctxRef.current!)}>{a.label}</button>
        ))}
        <span className="flex-1" />
        <button type="button" className="btn btn-primary h-9 px-4" onClick={() => goToStep(Math.min(DEMO_STEPS.length - 1, step + 1))}
          disabled={step === DEMO_STEPS.length - 1} aria-label="Next (right arrow)">
          Next <CaretRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
