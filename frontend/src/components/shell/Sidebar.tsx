// v4 sidebar (opened by ☰ or the location under the name): LOCATION, PAGES, the demo-only scenario box, and the
// footer with the vitals source and whether the local backend answers.
import { useNavigate } from 'react-router-dom';
import { useUsingMock, useVitalsSource } from '../../api/client';
import { NEEDS_BACKEND, PUBLIC_DEMO, README_URL } from '../../api/publicDemo';
import { useRoutineTasks } from '../../hooks/useRoutineTasks';
import { useDemo } from '../../lib/demo';
import { currentLocation, locationEntries, SCENARIOS } from '../../lib/locations';
import { useApp } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';

export function Sidebar() {
  const { panel, close, openInbox } = useShell();
  const { environments, env, setEnv, setPlanet, persona, setPersona, checkDoneAt } = useApp();
  const { attention, radiation } = useHealth();
  const { todo } = useRoutineTasks();
  const { active } = useDemo();
  const usingMock = useUsingMock();
  const source = useVitalsSource();
  const navigate = useNavigate();
  const open = panel === 'sidebar';
  const entries = locationEntries(environments);
  const here = currentLocation(entries, env);

  const go = (path: string) => { close(); navigate(path); };
  const pages: { name: string; badge?: string; tone?: string; run(): void }[] = [
    { name: 'Dashboard', run: () => go('/') },
    { name: "Today's routine", badge: todo ? `${todo} to do` : 'all done', tone: todo ? 'text-warn' : 'text-ok', run: () => go('/routine') },
    { name: 'Inbox', badge: attention ? `${attention} ${attention === 1 ? 'area' : 'areas'}` : '', tone: 'text-watch', run: () => openInbox(null) },
    { name: 'Daily check', badge: checkDoneAt ? 'done' : 'not done', tone: checkDoneAt ? 'text-ok' : 'text-warn', run: () => go('/check') },
    { name: 'Reaction test', run: () => go('/reaction') },
    { name: 'Sources', run: () => go('/sources') },
    { name: 'Emergency logs', run: () => go('/emergency/logs') },
  ];

  return (
    <div className={`fixed inset-0 z-[45] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <aside role="dialog" aria-label="Menu"
        className={`absolute bottom-0 left-0 top-0 flex w-[min(320px,100vw)] flex-col gap-5 overflow-y-auto border-r border-line bg-panel p-4 transition-[transform,visibility] duration-300 ease-out ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
        <div className="flex items-center gap-2">
          <span className="font-display font-bold tracking-[0.04em]">CO-PILOT</span>
          <span className="flex-1" />
          <button type="button" onClick={close} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-control border border-line-strong hover:bg-raised">✕</button>
        </div>

        <section className="flex flex-col gap-1.5" aria-label="Location">
          <span className="text-[11px] tracking-[0.12em] text-muted">LOCATION</span>
          {entries.map((e) => {
            const on = e.key === here?.key;
            const kind = on && radiation?.feed ? radiation.feed.kind : e.radiation;
            return (
              <button key={e.key} type="button" aria-pressed={on}
                onClick={() => { if (e.planet) setPlanet(e.planet); setEnv(e.key); close(); }}
                className={`flex min-h-touch flex-col items-start rounded-control border px-2.5 py-2 text-left transition ${
                  on ? 'border-info bg-info/10' : 'border-line hover:bg-raised'}`}>
                <span className="text-sm font-semibold">{e.name}</span>
                <span className="text-[11px] text-muted">
                  {e.subtitle}{e.subtitle ? ' · ' : ''}radiation{' '}
                  <span className={kind === 'real' ? 'text-ok' : 'text-watch'}>{kind === 'real' ? 'real' : kind === 'estimated' ? 'estimate' : 'n/a'}</span>
                </span>
              </button>
            );
          })}
        </section>

        <nav className="flex flex-col gap-0.5" aria-label="Pages">
          <span className="text-[11px] tracking-[0.12em] text-muted">PAGES</span>
          {pages.map((p) => (
            <button key={p.name} type="button" onClick={p.run}
              className="flex min-h-[40px] items-center gap-2 rounded-lg px-2.5 text-left text-sm transition hover:bg-raised">
              <span>{p.name}</span>
              {p.badge && <span className={`ml-auto text-[11px] ${p.tone ?? 'text-muted'}`}>{p.badge}</span>}
            </button>
          ))}
        </nav>

        {active && (
          <section className="flex flex-col gap-2 rounded-control border border-dashed border-line-strong p-2.5" aria-label="Demo scenarios">
            <span className="text-[11px] tracking-[0.12em] text-muted">DEMO MODE ONLY (presenter)</span>
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map((s) => (
                <button key={s.id} type="button" aria-pressed={persona === s.id} onClick={() => setPersona(s.id)}
                  className={`h-9 rounded-full border px-3 text-xs transition ${persona === s.id ? 'border-text bg-text text-bg' : 'border-line-strong text-soft hover:bg-raised'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted">Also: fast-forward clock, jump to event, simulate reply, Shift+D presenter bar.</span>
          </section>
        )}

        <span className="flex-1" />
        <footer className="flex flex-col gap-1.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-[7px] w-[7px] rounded-full ${source === 'sensor' ? 'bg-ok' : 'bg-watch'}`} aria-hidden />
            {source === 'sensor' ? 'Live sensor' : source === 'replay' ? 'Replay (simulated recording)' : 'No vitals yet'} · PPG pipeline
          </span>
          <span className="flex items-center gap-1.5" role="status">
            <span className={`h-[7px] w-[7px] rounded-full ${usingMock ? 'bg-watch' : 'bg-ok'}`} aria-hidden />
            {usingMock ? (PUBLIC_DEMO ? 'Mock data: public demo, no backend' : 'Mock data: the backend on this laptop is not answering') : 'Runs on board · backend answering'}
          </span>
          {PUBLIC_DEMO && (
            <span>Measurement and Research mode: <a className="underline underline-offset-2 hover:text-text" href={README_URL} target="_blank" rel="noreferrer">{NEEDS_BACKEND}</a></span>
          )}
          <span className="font-semibold text-watch">Research prototype · not clinically validated</span>
          <span>Runs on board · works offline · Mock data where labelled</span>
          <span className="text-muted/70">Admin (/admin) is hidden from crew</span>
        </footer>
      </aside>
    </div>
  );
}
