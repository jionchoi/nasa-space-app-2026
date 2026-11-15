// v4 Act now pop-up (replaces the v1 red banner). A red full-screen alert dialog with a repeating beep, for:
//  - an open red alert from the backend rules (an area at Act now, incl. the solar event) or the live vitals;
//  - a live vital in the red range for 10+ s (works with the backend off, like the old banner);
//  - pulse lost: the crew alarm comes first (it has priority); the pop-up follows if the vitals stay red.
// It never shows on top of the "Are you OK?" check-in, the crew alarm, an open Inbox or in emergency mode.
// Statuses, thresholds and alerts all come from the backend / thresholds.json; this only presents them.
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { undraft } from '../../lib/env';
import { useCrewAlarm } from '../../lib/crewAlarm';
import { audioOut, useMuted } from '../../lib/sound';
import { entryOf, fmt, LIVE_VITALS } from '../../lib/status';
import { useAlerts } from '../../state/AlertsContext';
import { useApp } from '../../state/AppContext';
import { useCv } from '../../state/CvContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';
import type { Alert, RegionId } from '../../types/contracts';

const BEEP = { high: 1046, low: 784, note_s: 0.16, every_ms: 1400, volume: 0.32 };

/** Two short notes every 1.4 s through the shared output (lib/sound.ts), so the global mute and M silence it. */
function useAlarmBeep(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const { ctx, out } = audioOut();
    const note = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(BEEP.volume, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + BEEP.note_s);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + BEEP.note_s);
    };
    const beep = () => { const t = ctx.currentTime; note(BEEP.high, t); note(BEEP.low, t + BEEP.note_s + 0.04); };
    beep();
    const id = setInterval(beep, BEEP.every_ms);
    return () => clearInterval(id);
  }, [on]);
}

export function ActNowAlert() {
  const { alerts, ack } = useAlerts();
  const { danger, live, latest, shown, radiation, messages } = useHealth();
  const { regions, guidance, thresholds, labels } = useApp();
  const { panel, openInbox } = useShell();
  const crewAlarm = useCrewAlarm();
  const { checkInDeadline } = useCv();
  const muted = useMuted();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dangerAcked, setDangerAcked] = useState(false);
  useEffect(() => { if (!danger) setDangerAcked(false); }, [danger]);

  // Camera alarms have their own screen (crew alarm); "Emergency handled" is a record, not an alarm.
  const open = useMemo(() => alerts.filter((a) => a.level === 'red' && !a.acknowledged && (a.source === 'rules' || a.source === 'vitals')), [alerts]);
  const redVitals = live && !live.poor ? live.red : [];
  const triggered = open.length > 0 || (danger && !dangerAcked);
  const blocked = !!crewAlarm || checkInDeadline !== null || pathname.startsWith('/emergency') || panel === 'inbox';
  const visible = triggered && !blocked;
  useAlarmBeep(visible);

  if (!visible) return null;
  const first: Alert | undefined = open[0];
  const vitalRegion = (key: string): RegionId | null => regions.find((r) => r.live_metrics.includes(key))?.id ?? null;
  const region: RegionId | null = first?.region ?? (redVitals[0] ? vitalRegion(redVitals[0]) : null);
  const meta = regions.find((r) => r.id === region);
  const status = shown.find((s) => s.region === region);
  const solar = region === 'radiation' && radiation?.event ? radiation.event : null;

  const headline = solar ? solar.alert
    : first?.source === 'vitals' || !first ? `${redVitals.map((k) => entryOf(thresholds, k)?.label ?? k).join(', ') || 'Live vitals'} in the danger range.`
    : status?.reason ?? first.message;
  const vitalsLine = latest
    ? `Now: heart rate ${fmt(latest.hr, 0)} bpm, HRV ${fmt(latest.hrv_rmssd, 0)} ms, SpO₂ ${fmt(latest.spo2, 0)}%, breathing ${fmt(latest.rr, 0)}/min${latest.irregular ? ', rhythm irregular' : ''}.`
    : '';
  const ruleLines = redVitals.map((k) => {
    const entry = entryOf(thresholds, k);
    if (k === 'irregular') return 'Irregular heart rhythm flagged by the sensor.';
    const band = entry?.red;
    const limit = band ? [band[0] !== null ? `below ${band[0]}` : '', band[1] !== null ? `above ${band[1]}` : ''].filter(Boolean).join(' or ') : '';
    return `${entry?.label ?? k} ${latest ? fmt(latest[k as (typeof LIVE_VITALS)[number]], 0) : ''} ${entry?.unit ?? ''}: ${labels.red} range is ${limit}${danger ? ', for 10 s or more' : ''}.`;
  });
  const why = [first && first.source === 'rules' ? first.message : '', ...ruleLines, vitalsLine].filter(Boolean);
  const item = region ? guidance?.regions[region]?.[guidance.status_keys.red] : undefined;
  const steps = [...(solar ? [solar.advice] : []), ...(item?.self_care ?? [])].map(undraft).filter(Boolean);

  const acknowledge = () => { open.forEach((a) => ack(a.id)); setDangerAcked(true); };
  const toEmergency = () => { acknowledge(); navigate('/emergency'); };
  const toDraft = async () => { openInbox(first ? await messages.draftFor(first) : null); };

  return (
    <div className="fixed inset-0 z-[55] grid place-items-start overflow-y-auto p-4 pt-[8vh]">
      <div className="glow-fast absolute inset-0 bg-[rgb(40_0_4/0.72)]" aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="act-now-title" aria-describedby="act-now-why"
        className="relative mx-auto flex w-[min(720px,100%)] flex-col gap-4 rounded-[20px] border-2 border-alert bg-[#16070A] p-7 shadow-[0_0_80px_rgb(255_77_94/0.45)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-extrabold tracking-[0.16em] text-alert">ACT NOW · {(meta?.label ?? 'LIVE VITALS').toUpperCase()}</span>
          {open.length > 1 && <span className="text-xs text-[#F3B7BD]">+{open.length - 1} more in the Inbox</span>}
          <span className="flex-1" />
          <span className="flex h-9 items-center gap-2 rounded-full border border-[#5A2A30] px-3.5 text-xs text-[#F3B7BD]" role="status">
            <span className={muted ? 'opacity-40' : 'bell-ring'} aria-hidden>🔔</span>
            {muted ? 'Alarm muted · M to unmute' : 'Alarm sounding · M to mute'}
          </span>
        </div>
        <h2 id="act-now-title" className="font-display text-[30px] font-bold leading-tight">{headline}</h2>
        <div id="act-now-why" className="flex flex-col gap-1 text-sm text-[#F3B7BD]">{why.map((w) => <span key={w}>{w}</span>)}</div>
        {steps.length > 0 && (
          <div className="flex flex-col gap-2.5 border-t border-[#3A1218] pt-3.5">
            <span className="text-xs font-bold tracking-[0.12em] text-[#F3B7BD]">DO THIS NOW</span>
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-3.5 text-[19px]"><span className="font-mono text-alert">{String(i + 1).padStart(2, '0')}</span>{s}</li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-2.5">
          <button type="button" autoFocus onClick={toEmergency} className="h-[54px] rounded-full bg-alert px-6 text-[17px] font-extrabold text-white hover:brightness-110">Open emergency mode</button>
          <button type="button" onClick={() => void toDraft()} className="h-[54px] rounded-full border border-[#FF8A95] px-5 font-bold text-white hover:bg-white/5">Draft message to surgeon</button>
          <button type="button" onClick={acknowledge} className="h-[54px] rounded-full border border-[#5A2A30] px-5 font-semibold text-[#F3B7BD] hover:bg-white/5">Acknowledge</button>
        </div>
      </div>
    </div>
  );
}
