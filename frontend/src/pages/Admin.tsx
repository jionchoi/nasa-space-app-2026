import { ArrowCounterClockwise, Database, Play, PresentationChart, Radioactive, Siren, Stop, UserSwitch } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { getAdminSummary, getRadiation, replayRadiation, resetDemoData, type AdminSummary } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { Card } from '../components/common/Card';
import { CvDebugPanel } from '../components/cv/CvDebugPanel';
import { startDemo } from '../lib/demo';
import { SCENARIOS } from '../lib/locations';
import { useApp } from '../state/AppContext';
import type { RadiationSummary } from '../types/contracts';
import { CV_EMERGENCY_URL, CV_PULSE_LOST_URL, triggerCrewAlarm } from '../lib/crewAlarm';

/** Hidden page (/admin, not linked anywhere): what the local database holds, and a reset before each demo. */
export default function Admin() {
  const { setCheckDoneAt, refreshStreak, persona, setPersona, env } = useApp();
  const [radiation, setRadiation] = useState<RadiationSummary | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const load = useCallback(() => {
    getAdminSummary().then(setSummary);
    getRadiation(persona, env).then(setRadiation);
  }, [persona, env]);
  const replay = async (action: 'start' | 'stop') => { await replayRadiation(action, minutes); load(); };
  useEffect(load, [load]);

  const reset = async () => {
    if (!window.confirm('Reset demo data? This clears alerts, daily checks, emergency logs, messages, forms and streaks. JSON files are not changed.')) return;
    setState('working');
    const res = await resetDemoData();
    setState(res?.ok ? 'done' : 'failed');
    setCheckDoneAt(null);
    refreshStreak();
    load();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">For the team before a demo. Not linked from the app.</p>
        <Card className="mt-6" inner="p-5">
          <div className="flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4 text-info" aria-hidden /> Local database</div>
          {summary ? (
            <>
              <p className="mt-1 break-all font-mono text-xs text-muted">{summary.db}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {Object.entries(summary.counts).map(([table, n]) => (
                  <div key={table}><dt className="text-xs text-muted">{table.replace('_', ' ')}</dt><dd className="font-mono text-lg">{n}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted">Live sensor right now: {summary.sensor_live ? 'yes' : 'no (replay)'}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-watch">The backend is not answering. Start it, then reload this page.</p>
          )}
          <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-4">
            <button className="btn btn-danger" onClick={reset} disabled={!summary || state === 'working'}>
              <ArrowCounterClockwise className="h-4 w-4" aria-hidden /> Reset demo data
            </button>
            <span className="text-sm text-muted" role="status">
              {state === 'working' ? 'Resetting…' : state === 'done' ? 'Done. The database is empty.' : state === 'failed' ? 'Reset failed: is the backend running?' : 'Clears the database only. JSON files stay as they are.'}
            </span>
          </div>
        </Card>

        <Card className="mt-4" inner="p-5">
          <div className="flex items-center gap-2 text-sm font-medium"><UserSwitch className="h-4 w-4 text-info" aria-hidden /> Scenario</div>
          <p className="mt-1 text-sm text-muted">
            The astronaut is always Alex Moreno; the scenario picks which simulated data file plays. Also in the presenter bar and
            the sidebar while demo mode is on.
          </p>
          <div role="radiogroup" aria-label="Scenario" className="mt-4 flex flex-wrap gap-2">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} type="button" role="radio" aria-checked={persona === sc.id} onClick={() => setPersona(sc.id)}
                className={`btn ${persona === sc.id ? 'btn-primary' : ''}`}>{sc.label} <span className="text-xs opacity-70">({sc.id})</span></button>
            ))}
          </div>
        </Card>

        <Card className="mt-4" inner="p-5">
          <div className="flex items-center gap-2 text-sm font-medium"><PresentationChart className="h-4 w-4 text-info" aria-hidden /> Demo mode (live pitch)</div>
          <p className="mt-1 text-sm text-muted">
            8 steps, about 3 minutes. A presenter bar (bottom right) shows the step, what to say, and the data badges; Next, Back
            and Pause. Each step sets the scenario, location, replay position and screen. Shortcuts: Shift+D on/off, arrow
            keys or a presenter clicker for Back / Next. Also works with the backend off. Tip: reset the demo data first.
          </p>
          <button className="btn btn-primary mt-4" onClick={() => startDemo()}><Play className="h-4 w-4" weight="fill" aria-hidden /> Start demo mode</button>
        </Card>

        <Card className="mt-4" inner="p-5">
          <div className="flex items-center gap-2 text-sm font-medium"><Radioactive className="h-4 w-4 text-warn" aria-hidden /> Replay solar event</div>
          {radiation?.event_available ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Real NASA DONKI solar particle event, replayed compressed, at every location at once (dose simulated;
                timing from real DONKI event). The dose is bigger on the way to Mars and on the Moon and Mars surfaces than
                on the ISS. The radiation area turns Act now for the whole crew, with a shelter alert and a drafted message.
              </p>
              {radiation.event ? (
                <p className="mt-3 text-sm">Running: <span className="font-mono">{radiation.event.sep_id}</span>, ends at {new Date(radiation.event.ends_at).toLocaleTimeString()}
                  {radiation.event.location_scale ? <span className="text-muted"> · here about {radiation.event.location_scale}× the ISS dose</span> : null}</p>
              ) : <p className="mt-3 text-sm text-muted">Not running.</p>}
              <div className="mt-4 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                <label className="flex items-center gap-2 text-sm text-muted">Length
                  <select className="rounded-lg bg-raised px-2 py-1 text-text ring-1 ring-white/10" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                    {[5, 10, 20].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
                <button className="btn btn-primary" onClick={() => replay('start')} disabled={!summary}>
                  <Play className="h-4 w-4" weight="fill" aria-hidden /> {radiation.event ? 'Restart' : 'Start'} replay
                </button>
                {radiation.event && <button className="btn" onClick={() => replay('stop')}><Stop className="h-4 w-4" aria-hidden /> Stop</button>}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-watch">No event file. Build it offline from the saved DONKI file: python scripts/fetch_donki.py --from-file data/space_weather/donki_2024-05-01_2024-05-31.json --sep-id 2024-05-10T13:35:00-SEP-001</p>
          )}
        </Card>

        <Card className="mt-4" inner="p-5">
          <div className="flex items-center gap-2 text-sm font-medium"><Siren className="h-4 w-4 text-alert" aria-hidden /> Crew alarm and unresponsive hand-off</div>
          <p className="mt-1 text-sm text-muted">
            Unresponsive detection calls <code className="font-mono text-text">triggerCrewAlarm(reason)</code> when "Are you OK?" gets no answer. Test the alarm here
            (loud tone: the page must have been clicked once for sound).
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
            <button className="btn btn-danger" onClick={() => triggerCrewAlarm('Test from the admin page: no response to "Are you OK?"', { source: 'test', emergencyUrl: CV_EMERGENCY_URL })}>
              <Siren className="h-4 w-4" weight="fill" aria-hidden /> Test crew alarm
            </button>
            <Link className="btn" to={CV_EMERGENCY_URL}>Open the unresponsive protocol as detection would</Link>
            <Link className="btn" to={CV_PULSE_LOST_URL}>Open it as a lost pulse would (straight to CPR)</Link>
          </div>
        </Card>

        <CvDebugPanel />
      </main>
    </div>
  );
}
