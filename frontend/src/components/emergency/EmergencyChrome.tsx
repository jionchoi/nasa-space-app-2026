// v4 emergency mode chrome (Emergency-v4): the red bar (protocol, astronaut and location, timer, sound, End emergency)
// and the live vitals strip with status badges. Keeps the data badges (simulated recording / mock data).
import { useUsingMock, useVitalsSource } from '../../api/client';
import { ASTRONAUT_NAME } from '../../lib/locations';
import { entryOf, fmt, liveStatus, mmss, STATUS_CLASS } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import type { VitalsFrame } from '../../types/contracts';
import { personaBadge } from '../demo/demoSteps';
import { MuteToggle } from '../shell/TopBar';
import { RESEARCH_NOTE } from '../common/ResearchNote';

interface BarProps {
  title: string;
  where: string;
  draft?: string;
  startedAt?: number;
  now?: number;
  onEnd?(): void;
}

export function EmergencyBar({ title, where, draft, startedAt, now, onEnd }: BarProps) {
  const usingMock = useUsingMock();
  const source = useVitalsSource();
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#4A1219] bg-[#2A0A0E] px-6 py-3 text-[#F2EEEE] short:py-2">
      <span className="glow-slow text-xs font-extrabold tracking-[0.18em] text-alert">● EMERGENCY</span>
      <h1 className="font-display text-xl font-bold">{title}</h1>
      {draft && <span className="rounded-full border border-watch/50 px-2 text-[11px] text-watch">{draft}</span>}
      <span className="text-[13px] text-[#D9A9AE]">{ASTRONAUT_NAME} · {where}</span>
      <span className="text-[11px] text-[#B8999C]">{source === 'sensor' ? 'Live sensor' : 'Replay'}{usingMock ? ' · Mock data (backend off)' : ' · runs on board'}</span>
      <span role="note" className="text-[11px] font-semibold text-watch">{RESEARCH_NOTE}</span>
      <span className="flex-1" />
      {startedAt !== undefined && now !== undefined && (
        <span className="flex items-baseline gap-2"><span className="text-xs text-[#B8999C]">Time since start</span><span className="font-mono text-[22px]">{mmss((now - startedAt) / 1000)}</span></span>
      )}
      <MuteToggle className="border-[#5A2A30]" />
      {onEnd && (
        <button type="button" onClick={onEnd} className="h-11 rounded-full border border-[#F2EEEE] px-5 font-bold hover:bg-white/10">End emergency</button>
      )}
    </header>
  );
}

const KEYS = ['hr', 'spo2', 'rr', 'hrv_rmssd'] as const;
const SHORT: Record<string, string> = { hr: 'Heart rate', spo2: 'Blood oxygen', rr: 'Breathing', hrv_rmssd: 'HRV' };

export function EmergencyVitals({ frames }: { frames: VitalsFrame[] }) {
  const { thresholds, personaInfo } = useApp();
  const statusLabel = useStatusLabel();
  const usingMock = useUsingMock();
  const latest = frames[frames.length - 1];
  const live = liveStatus(latest, thresholds);
  const badge = personaBadge(personaInfo);
  return (
    <section aria-label="Live vitals" className="shrink-0 border-b border-[#2A1416]">
      <div className="grid grid-cols-2 gap-px bg-[#2A1416] md:grid-cols-4">
        {KEYS.map((k) => {
          const st = live?.vitals[k] ?? 'green';
          const entry = entryOf(thresholds, k);
          return (
            <div key={k} className={`flex flex-col px-6 py-2.5 short:py-1.5 ${st === 'red' ? 'bg-[#1E080B]' : 'bg-[#0E0708]'} ${live?.poor ? 'opacity-50 grayscale' : ''}`}>
              <span className="text-xs text-[#B8999C]">{SHORT[k]}</span>
              <span className="flex items-baseline gap-1.5">
                <span className={`font-mono text-[30px] font-semibold short:text-[24px] ${st === 'green' ? '' : STATUS_CLASS[st].text}`}>{latest ? fmt(latest[k], 0) : '--'}</span>
                <span className="text-xs text-[#B8999C]">{entry?.unit}</span>
                {st !== 'green' && <span className={`rounded-full px-2 text-[11px] font-extrabold text-bg ${STATUS_CLASS[st].bg}`}>{statusLabel(st)}</span>}
                {k === 'hr' && live?.irregular && <span className="text-[11px] font-bold text-alert">Irregular</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 bg-[#0A0506] px-6 py-1 text-[11px] text-[#B8999C]">
        {badge && <span>{badge.text}</span>}
        {usingMock && <span className="text-watch">Offline: mock data</span>}
        {live?.poor && <span className="text-watch">Poor signal: check the sensor</span>}
      </div>
    </section>
  );
}
