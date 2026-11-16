// /watch: the smartwatch display (demo). Same live data as the dashboard, but only what matters right now:
//  - normal: heart rate, SpO2, the most urgent area and who to tell, the next task. Tap for the areas needing attention.
//  - alert: pulse lost, a live vital red for 10+ s, or an area at Act now takes over the whole face in red.
// Statuses, limits and advice come from the backend / thresholds.json / escalation.json; this only presents them.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useVitalsSource } from '../api/client';
import { byUrgency, fmt, STATUS_ORDER, STATUS_TOKEN } from '../lib/status';
import { useApp, useStatusLabel } from '../state/AppContext';
import { useCv } from '../state/CvContext';
import { useHealth } from '../state/HealthContext';
import { minuteOfDay, missionHHMM, toMinutes, useMissionClock, useRoutine } from '../state/RoutineContext';
import type { Status } from '../types/contracts';

const color = (s: Status, a = 1) => `rgb(var(--c-${STATUS_TOKEN[s]}) / ${a})`;

export default function Watch() {
  const { regions, escalation, persona, setPersona, jumpTo } = useApp();
  const { shown, worst, latest, danger, live } = useHealth();
  const { pulse } = useCv();
  const { schedule } = useRoutine();
  const statusLabel = useStatusLabel();
  const now = useMissionClock();
  const source = useVitalsSource();
  const navigate = useNavigate();
  const [screen, setScreen] = useState(0);
  const sorted = [...schedule].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  const nextReminder = sorted.find((s) => toMinutes(s.time) > minuteOfDay(now)) ?? sorted[0];

  const ws: Status = worst?.status ?? 'green';
  const areaName = (id: string) => regions.find((r) => r.id === id)?.label ?? id;
  const advice = worst ? escalation?.levels.find((l) => l.id === worst.advice_level)?.label : undefined;
  const attention = [...shown].filter((s) => STATUS_ORDER.indexOf(s.status) > 0).sort(byUrgency);

  const pulseLost = pulse.status === 'lost';
  const alert = pulseLost ? { title: 'PULSE LOST', text: 'Start CPR. Crew alerted.', url: '/emergency?protocol=unresponsive&trigger=crew&preanswer=responsive:no' }
    : danger ? { title: 'ACT NOW', text: `Live ${live?.red[0]?.toUpperCase() ?? 'vital'} in the danger range`, url: '/emergency' }
    : ws === 'red' && worst ? { title: 'ACT NOW', text: `${areaName(worst.region)}: call the flight surgeon now`, url: '/emergency' }
    : null;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#05060A] px-4 py-10">
      <div className="relative rounded-[64px] bg-gradient-to-b from-[#2a2d35] to-[#121318] p-3 shadow-[0_30px_80px_rgb(0_0_0/0.7)]">
        <button type="button" onClick={() => (alert ? navigate(alert.url) : setScreen((s) => (s + 1) % 2))}
          aria-label={alert ? `${alert.title}. Open emergency mode` : 'Watch face. Tap for the next screen'}
          className="relative flex h-[380px] w-[320px] flex-col overflow-hidden rounded-[54px] bg-black px-7 pb-6 pt-5 text-left text-text"
          style={alert ? { background: 'radial-gradient(circle at 50% 40%, rgb(var(--c-alert) / 0.55), #2a0508 75%)' } : undefined}>

          <div className="flex items-center justify-between font-mono text-sm text-muted">
            <span>{missionHHMM(now)}</span>
            {source !== 'sensor' && <span className="rounded bg-white/10 px-1.5 text-[10px] tracking-wider">SIMULATED</span>}
          </div>

          {alert ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="glow-fast h-16 w-16 rounded-full border-4 border-white/90" aria-hidden />
              <span className="text-[34px] font-black leading-none tracking-wide">{alert.title}</span>
              <span className="text-base font-semibold">{alert.text}</span>
              <span className="mt-2 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-[#7a0a12]">Tap: open emergency mode</span>
              <span className="text-[11px] text-white/70">Vibrating · alarm on</span>
            </div>
          ) : screen === 0 ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center">
                <span className="text-[13px] tracking-[0.2em] text-muted">HEART RATE</span>
                <span className="font-mono text-[72px] font-bold leading-none">{latest?.hr != null ? Math.round(latest.hr) : '--'}</span>
                <span className="text-sm text-muted">bpm · SpO₂ <span className="font-mono text-soft">{latest?.spo2 != null ? fmt(latest.spo2, 0) : '--'}%</span></span>
              </div>
              <div className="rounded-2xl px-3 py-2" style={{ background: color(ws, 0.15), border: `1px solid ${color(ws, 0.7)}` }}>
                <div className="flex items-center gap-2 text-[15px] font-bold" style={{ color: color(ws) }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color(ws) }} aria-hidden />
                  {ws === 'green' || !worst ? 'All areas nominal' : `${areaName(worst.region)} · ${statusLabel(ws)}`}
                </div>
                {ws !== 'green' && advice && <div className="text-xs text-soft">{advice}</div>}
              </div>
              {nextReminder && <div className="mt-2 text-center text-xs text-muted">Next {nextReminder.time} · {nextReminder.text}</div>}
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-2 pt-3">
              <span className="text-[13px] tracking-[0.2em] text-muted">NEEDS ATTENTION</span>
              {attention.length === 0 && <span className="mt-6 text-center text-lg font-semibold text-ok">Nothing today</span>}
              {attention.slice(0, 3).map((s) => (
                <div key={s.region} className="rounded-xl px-3 py-2" style={{ background: color(s.status, 0.12) }}>
                  <div className="text-sm font-bold" style={{ color: color(s.status) }}>{areaName(s.region)} · {statusLabel(s.status)}</div>
                  {s.time_to_act_days != null && s.time_to_act_days > 0 && <div className="text-xs text-soft">Time to act: about {s.time_to_act_days} days</div>}
                </div>
              ))}
              {attention.length > 3 && <span className="text-center text-xs text-muted">+{attention.length - 3} more on the tablet</span>}
            </div>
          )}

          {!alert && (
            <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
              {[0, 1].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === screen ? 'bg-text' : 'bg-white/25'}`} />)}
            </div>
          )}
        </button>
      </div>
      <div className="max-w-sm text-center text-sm text-muted">
        <p><span className="font-semibold text-soft">Watch display (demo).</span> Shows only what needs attention, from the same live data as the dashboard. Tap the face for the next screen.</p>
        <p className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <button type="button" onClick={() => setPersona('A')} className="rounded-full border border-line-strong px-3 py-1 hover:bg-raised">A · healthy</button>
          <button type="button" onClick={() => setPersona('B')} className="rounded-full border border-line-strong px-3 py-1 hover:bg-raised">B · slow drift</button>
          <button type="button" onClick={() => { setPersona('C'); setTimeout(() => jumpTo(500), 300); }} className="rounded-full border border-line-strong px-3 py-1 hover:bg-raised">C · pulse lost (~25 s)</button>
        </p>
        <p className="mt-1 text-xs">Now: persona {persona}</p>
        <Link to="/" className="mt-3 inline-block text-xs underline underline-offset-2 hover:text-text">Back to the dashboard</Link>
      </div>
    </div>
  );
}
