// v4 top bar (design-handoff/v4/Main-v4): menu, astronaut and location, surgeon link, routine; radiation and cabin CO2
// pills; mission clock, camera, mute, Inbox and EMERGENCY. Shown on every page except emergency mode.
import { FastForward } from '@phosphor-icons/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useRoutineTasks } from '../../hooks/useRoutineTasks';
import { useDemo } from '../../lib/demo';
import { ASTRONAUT_NAME, currentLocation, locationEntries } from '../../lib/locations';
import { toggleMuted, useMuted } from '../../lib/sound';
import { fmt, STATUS_CLASS } from '../../lib/status';
import { useAlerts } from '../../state/AlertsContext';
import { linkText, useApp } from '../../state/AppContext';
import { useCv } from '../../state/CvContext';
import { useHealth } from '../../state/HealthContext';
import { missionHHMM, minuteOfDay, toMinutes, useMissionClock, useRoutine } from '../../state/RoutineContext';
import { useShell } from '../../state/ShellContext';
import { useSignals } from '../../state/SignalContext';
import { ModePicker } from '../signals/SignalControls';
import type { Environment, RegionId } from '../../types/contracts';

/** Dot colour from the delay in environments.json: live, short delay, several minutes. */
function linkDot(info?: Environment): string {
  const longest = info?.delay_s?.[1] ?? 0;
  if (longest <= 2) return 'bg-ok';
  if (longest <= 10) return 'bg-watch';
  return 'bg-warn';
}

export function MenuButton() {
  const { open } = useShell();
  return (
    <button type="button" onClick={() => open('sidebar')} aria-label="Open menu: location and pages"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line-strong transition hover:bg-raised">
      <span className="flex flex-col gap-[4px]" aria-hidden>
        <span className="h-0.5 w-4 bg-text" /><span className="h-0.5 w-4 bg-text" /><span className="h-0.5 w-4 bg-text" />
      </span>
    </button>
  );
}

export function Wordmark() {
  return <Link to="/" className="font-display text-lg font-bold tracking-[0.04em]" aria-label="CO-PILOT, back to the dashboard">CO-PILOT</Link>;
}

/** "Alex Moreno · Day 45" and the location ("ISS ▾", opens the sidebar). */
export function WhoWhere() {
  const { personaInfo, environments, env } = useApp();
  const { open } = useShell();
  const here = currentLocation(locationEntries(environments), env);
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="whitespace-nowrap text-[13px] font-semibold">{ASTRONAUT_NAME} · Day {personaInfo?.mission_day ?? '–'}</span>
      <button type="button" onClick={() => open('sidebar')} className="self-start whitespace-nowrap text-xs text-info hover:underline"
        aria-label={`Location: ${here?.name ?? env}. Change location`}>
        {here?.name ?? env} ▾
      </button>
      <SurgeonLink />
    </span>
  );
}

/** Short delay text for the bar (S2): delays over a minute as a range in minutes from environments.json
 *  ("3–22 min delay"); the full wording stays in the tooltip. */
function shortDelay(info: Environment | undefined, pill: string): string {
  const [lo, hi] = info?.delay_s ?? [0, 0];
  if (hi <= 60) return pill;
  const m = (s: number) => Math.max(1, Math.round(s / 60));
  return m(lo) === m(hi) ? `~${m(hi)} min delay` : `${m(lo)}–${m(hi)} min delay`;
}

export function SurgeonLink() {
  const { envKeys, envInfo, escalation } = useApp();
  const pill = linkText(escalation, envKeys).pill.replace(/^Flight surgeon link:\s*/i, '');
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted" title={`Flight surgeon link: ${pill}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${linkDot(envInfo)}`} aria-hidden />Surgeon link · {shortDelay(envInfo, pill)}
    </span>
  );
}

function RoutineButton() {
  const { done, total, todo, streak } = useRoutineTasks();
  return (
    <Link to="/routine" className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition hover:bg-raised ${
      todo ? 'border-warn bg-warn/10' : 'border-line-strong'}`} aria-label={`Today's routine: ${done} of ${total} done, ${streak}-day streak`}>
      <span>Today's routine</span>
      <span className="font-mono">{done}/{total}</span>
      {streak > 0 && <span className="text-watch" title={`${streak}-day streak`}>▲ {streak}</span>}
    </Link>
  );
}

function usePickOnDashboard() {
  const { setPicked } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (region: RegionId, metric?: string) => { setPicked(region, metric ?? null); if (pathname !== '/') navigate('/'); };
}

function RadiationPill() {
  const { radiation } = useHealth();
  const { picked } = useApp();
  const pick = usePickOnDashboard();
  const feed = radiation?.feed;
  const status = radiation?.status ?? 'green';
  const hot = status !== 'green' || picked === 'radiation';
  const cls = STATUS_CLASS[status];
  return (
    <button type="button" onClick={() => pick('radiation')} title={radiation?.event ? 'Solar event: open the radiation area' : undefined}
      aria-label={`Radiation ${feed ? `${fmt(feed.dose_rate_now, 1)} ${feed.unit}, ${feed.kind}` : 'loading'}${radiation?.event ? ', solar event' : ''}. Show the radiation area`}
      className={`flex h-10 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 transition hover:bg-raised ${
        status !== 'green' ? `${cls.border} ${cls.soft}` : hot ? 'border-info bg-info/10' : 'border-line-strong bg-panel'}`}>
      <span className="text-[11px] tracking-[0.1em] text-muted">RADIATION</span>
      <span className="font-mono text-base font-semibold">{feed ? fmt(feed.dose_rate_now, 1) : '–'}</span>
      <span className="text-[11px] text-muted">{feed?.unit ?? 'µGy/h'}</span>
      {feed && (
        <span className={`rounded-full border border-line-strong px-1.5 text-[10px] ${feed.kind === 'real' ? 'text-ok' : 'text-watch'}`}>
          {feed.kind === 'real' ? 'REAL' : 'EST'}
        </span>
      )}
      {/* Solar event: a coloured dot with a tooltip (the word made the bar wrap at 1440 px, S2). */}
      {status !== 'green' && radiation?.event && <span className={`glow-slow h-2 w-2 rounded-full ${cls.bg}`} aria-hidden />}
    </button>
  );
}

function Co2Pill() {
  const { cabin } = useHealth();
  const { labels } = useApp();
  const pick = usePickOnDashboard();
  const status = cabin?.status.co2_ppm ?? 'green';
  const cls = STATUS_CLASS[status];
  const hours = cabin?.co2_high_hours_24h ?? 0;
  const note = status === 'green' ? (hours > 0 ? `high ${fmt(hours, 0)} h / 24 h` : 'normal') : `${labels[status]} · high for ${fmt(hours, 0)} h`;
  return (
    <button type="button" onClick={() => pick('lungs', 'co2_ppm')} title={note !== 'normal' ? `Cabin CO₂: ${note}` : undefined}
      aria-label={`Cabin CO2 ${cabin ? Math.round(cabin.now.co2_ppm) : ''} ppm, ${note}. Show cabin CO2`}
      className={`flex h-10 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 transition hover:bg-raised ${
        status !== 'green' ? `${cls.border} ${cls.soft}` : 'border-line-strong bg-panel'}`}>
      <span className="text-[11px] tracking-[0.1em] text-muted">CABIN CO₂</span>
      <span className="font-mono text-base font-semibold">{cabin ? Math.round(cabin.now.co2_ppm).toLocaleString('en-US') : '–'}</span>
      <span className="text-[11px] text-muted">ppm</span>
      {note !== 'normal' && <span className={`min-w-0 truncate text-[11px] ${status === 'green' ? 'text-muted' : cls.text}`}>{note}</span>}
    </button>
  );
}

function Clock() {
  const now = useMissionClock();
  const { schedule, jumpToNextReminder, clockOffsetMs, resetClock } = useRoutine();
  const { active } = useDemo();
  const minute = minuteOfDay(now);
  const sorted = [...schedule].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const next = sorted.find((s) => toMinutes(s.time) > minute) ?? sorted[0];
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex flex-col items-end leading-tight" title="Mission time (GMT). Reminders follow this clock.">
        <span className="font-mono text-[15px]">{missionHHMM(now)}</span>
        <span className="whitespace-nowrap text-[11px] text-muted">GMT{next ? ` · next ${next.time}` : ''}</span>
      </span>
      {active && (
        <button type="button" onClick={() => jumpToNextReminder()} title="Demo: jump the mission clock to the next reminder"
          aria-label="Jump to the next reminder (demo)" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-raised hover:text-text">
          <FastForward className="h-4 w-4" aria-hidden />
        </button>
      )}
      {active && clockOffsetMs !== 0 && (
        <button type="button" onClick={resetClock} className="text-[11px] text-muted underline-offset-2 hover:text-text hover:underline">real time</button>
      )}
    </span>
  );
}

export function CameraButton() {
  const { phase, enabled, start, stop } = useCv();
  const on = enabled || phase === 'loading' || phase === 'calibrating' || phase === 'running';
  return (
    <button type="button" onClick={() => (on ? stop() : void start())} aria-pressed={on}
      aria-label={on ? 'Unresponsive detection camera is on. Turn it off' : 'Turn unresponsive detection camera on'}
      title="Unresponsive detection with the webcam. On-device only; no video is stored."
      className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-semibold transition ${
        on ? 'border-ok bg-ok/10 text-ok' : 'border-line-strong hover:bg-raised'}`}>
      ◉ Camera
    </button>
  );
}

export function MuteToggle({ className = '' }: { className?: string }) {
  const muted = useMuted();
  return (
    <button type="button" onClick={toggleMuted} aria-pressed={muted}
      aria-label={muted ? 'Sound is muted. Unmute all app sounds (M)' : 'Mute all app sounds (M)'} title={muted ? 'Unmute (M)' : 'Mute all sounds (M)'}
      className={`flex h-10 min-w-10 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 transition hover:bg-raised ${
        muted ? 'border-watch text-watch' : 'border-line-strong'} ${className}`}>
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>{muted && <span className="text-xs font-semibold" role="status">Muted</span>}
    </button>
  );
}

export function InboxButton() {
  const { openInbox } = useShell();
  const { attention, worst } = useHealth();
  const { alerts } = useAlerts();
  const urgent = alerts.some((a) => !a.acknowledged && (a.level === 'red' || a.level === 'orange'));
  const tone = worst && worst.status !== 'green' ? STATUS_CLASS[worst.status].bg : 'bg-line-strong';
  return (
    <button type="button" onClick={() => openInbox(null)} aria-label={`Inbox: ${attention} ${attention === 1 ? 'area needs' : 'areas need'} attention`}
      className="relative flex h-10 items-center rounded-full border border-line-strong px-3.5 font-semibold transition hover:bg-raised">
      Inbox
      {attention > 0 && (
        <span className={`absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-extrabold text-bg ${tone} ${urgent ? 'glow-slow' : ''}`}>
          {attention}
        </span>
      )}
    </button>
  );
}

export function EmergencyButton() {
  return (
    <Link to="/emergency" className="flex h-11 items-center whitespace-nowrap rounded-full bg-emergency px-4 font-extrabold tracking-[0.06em] text-white transition hover:bg-emergency/90 active:scale-[0.98]">
      EMERGENCY
    </Link>
  );
}

/** Measurement / Research mode (PPG integration): who is measured and the signal connection, no persona data. */
function SignalWho() {
  const { session, connection } = useSignals();
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="whitespace-nowrap text-[13px] font-semibold">{session?.subject_id ?? 'No crew session'}</span>
      <span className="whitespace-nowrap text-[11px] text-muted">Local measurements · signal {connection}</span>
    </span>
  );
}

/** The full v4 top bar. `children` = an extra row under it (e.g. the daily check progress).
 *  Outside Demo mode the persona-based parts (routine, radiation, CO2, camera, inbox) are hidden. */
export function TopBar({ children }: { children?: React.ReactNode }) {
  const { mode, error } = useSignals();
  if (mode !== 'demo') {
    return (
      <header className="relative z-30 shrink-0 border-b border-line bg-header">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 2xl:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <MenuButton />
            <Wordmark />
            <SignalWho />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error && <span role="alert" className="text-sm text-watch">{error}</span>}
            <ModePicker />
            <span className="text-xs text-muted">Camera detection · demo only</span>
            <MuteToggle />
            <EmergencyButton />
          </div>
        </div>
        {children}
      </header>
    );
  }
  // One row from xl (1280 px) up in every location (S2): the outer groups keep their size, the middle pills shrink and
  // their notes end in an ellipsis (the full text stays in the tooltip and aria-label).
  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-header">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 xl:flex-nowrap 2xl:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3 xl:shrink-0 xl:flex-nowrap">
          <MenuButton />
          <Wordmark />
          <WhoWhere />
          <RoutineButton />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 xl:flex-nowrap">
          <RadiationPill />
          <Co2Pill />
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap">
          <Clock />
          <CameraButton />
          <MuteToggle />
          <InboxButton />
          <EmergencyButton />
        </div>
      </div>
      {children}
    </header>
  );
}
