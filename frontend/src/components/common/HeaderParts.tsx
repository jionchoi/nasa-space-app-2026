// Pieces of the shared header (AppHeader): logo, crew member picker, location switch and flight-surgeon link status.
import { Link } from 'react-router-dom';
import { undraft } from '../../lib/env';
import { linkText, useApp } from '../../state/AppContext';
import type { Environment } from '../../types/contracts';

/** Logo mark + "Health Co-Pilot". */
export function Brand({ small }: { small?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <span className={`grid place-items-center rounded-lg bg-info/15 ${small ? 'h-7 w-7' : 'h-8 w-8'}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" className="text-info" aria-hidden><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
      </span>
      <span className="text-base font-bold">Health Co-Pilot</span>
    </Link>
  );
}

/** Avatar, name and "Mission day N · Simulated data". The whole block is a persona picker (hidden select on top). */
export function CrewPicker() {
  const { persona, setPersona, personas, personaInfo } = useApp();
  const initials = personaInfo?.name.split(' ').map((w) => w[0]).join('').slice(0, 2) ?? persona;
  return (
    <label className="relative flex min-h-touch cursor-pointer items-center gap-2.5 border-l border-line pl-4" title="Switch crew member">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-raised text-xs font-semibold">{initials}</span>
      <span className="flex flex-col whitespace-nowrap leading-tight">
        <span className="font-semibold">{personaInfo?.name ?? 'Crew member'}</span>
        <span className="text-xs text-muted">
          Mission day {personaInfo?.mission_day ?? '–'}
          {personaInfo?.simulated && <> · <span className="text-watch" title={personaInfo.description}>Simulated data</span></>}
        </span>
      </span>
      <select aria-label="Crew member" className="absolute inset-0 cursor-pointer opacity-0" value={persona} onChange={(e) => setPersona(e.target.value)}>
        {personas.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
      </select>
    </label>
  );
}

/** ISS / Moon base / Mars transit / Surface rover segmented control (from environments.json). A location with
 *  planets (the rover) gets a small Moon/Mars toggle next to it while it is selected. */
export function LocationSwitch() {
  const { env, envInfo, setEnv, setPlanet, environments } = useApp();
  const base = env.split(':')[0];
  return (
    <div className="flex items-center gap-1.5">
      <div role="group" aria-label="Location" className="flex gap-1 rounded-control border border-line bg-raised/40 p-1">
        {environments.map((e) => {
          const on = base === e.id;
          return (
            <button key={e.id} type="button" aria-pressed={on} onClick={() => setEnv(e.id)} title={undraft(e.advice_note)}
              className={`h-9 whitespace-nowrap rounded-[7px] px-2 transition ${on ? 'bg-info/20 font-semibold text-text' : 'font-medium text-muted hover:text-text'}`}>
              {e.label}
            </button>
          );
        })}
      </div>
      {envInfo?.planets && (
        <div role="radiogroup" aria-label={`${envInfo.label}: planet`} className="flex rounded-full border border-line bg-raised/40 p-0.5 text-xs">
          {Object.entries(envInfo.planets).map(([id, p]) => (
            <button key={id} type="button" role="radio" aria-checked={envInfo.planet === id} onClick={() => setPlanet(id)}
              title={undraft(p.advice_note)}
              className={`rounded-full px-2 py-1 transition ${envInfo.planet === id ? 'bg-info/20 font-semibold text-text' : 'text-muted hover:text-text'}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Dot color from the delay in environments.json: live (no delay), short delay, several minutes. */
function linkDot(info?: Environment): string {
  const longest = info?.delay_s?.[1] ?? 0;
  if (longest <= 1) return 'bg-ok';
  if (longest <= 10) return 'bg-watch';
  return 'bg-warn';
}

/** "Flight surgeon link: live" with a colored dot (text from escalation.json). */
export function LinkStatus() {
  const { envKeys, envInfo, escalation } = useApp();
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-soft">
      <span className={`h-2 w-2 rounded-full ${linkDot(envInfo)}`} aria-hidden />
      {linkText(escalation, envKeys).pill}
    </span>
  );
}
