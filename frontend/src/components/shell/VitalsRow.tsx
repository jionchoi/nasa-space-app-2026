// v4 live vitals row under the top bar: heart rate, HRV, SpO2, breathing, each with "usual X · signal N%", a small
// 60 s sparkline, colour from thresholds.json (status words kept for colour-blind readers), greyed on a poor signal.
import { Lightning } from '@phosphor-icons/react';
import { useUsingMock, useVitalsSource } from '../../api/client';
import { personaBadge } from '../demo/demoSteps';
import { useDemo } from '../../lib/demo';
import { USUAL_FIELD, usualValue } from '../../lib/metrics';
import { baselineWatch, entryOf, fmt, implausible, judge, LIVE_VITALS, STATUS_CLASS } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useSignals } from '../../state/SignalContext';
import { SignalVitals } from '../signals/SignalVitals';
import { Sparkline } from '../common/Sparkline';

const SHORT: Record<string, string> = { hr: 'Heart rate', hrv_rmssd: 'HRV', spo2: 'SpO₂', rr: 'Breathing' };

export function VitalsRow() {
  const { frames, latest, live, daily, liveOptions } = useHealth();
  const { thresholds, personaInfo, jumpTo } = useApp();
  const statusLabel = useStatusLabel();
  const source = useVitalsSource();
  const usingMock = useUsingMock();
  const { active: demo } = useDemo();
  const badge = personaBadge(personaInfo);
  const poor = !!live?.poor;
  const { mode } = useSignals();
  // Measurement / Research mode: the measured PPG values (no persona replay, no thresholds applied).
  if (mode !== 'demo') return <SignalVitals compact />;

  return (
    <section aria-label="Live vitals" className="relative flex flex-wrap items-stretch border-b border-line bg-[#06070A] px-6">
      <span className="flex flex-col justify-center gap-0.5 py-2 pr-4 text-[11px] tracking-[0.12em] text-muted">
        <span>LIVE · {source === 'sensor' ? 'LIVE SENSOR' : 'REPLAY'}</span>
        {usingMock && <span className="rounded-full border border-watch/50 px-1.5 text-center tracking-normal text-watch" title="The backend on this laptop is not answering; showing saved mock data.">Mock data</span>}
        {source !== 'sensor' && badge && (
          <span className={`rounded-full border px-1.5 text-center tracking-normal ${badge.kind === 'real' ? 'border-info/40 text-info' : 'border-line-strong text-soft'}`}>
            {badge.text}
          </span>
        )}
      </span>
      {LIVE_VITALS.map((key) => {
        const entry = entryOf(thresholds, key);
        const status = live?.vitals[key] ?? 'green';
        const cls = STATUS_CLASS[status];
        const usual = usualValue(daily, USUAL_FIELD[key]);
        const flagged = key === 'hr' && live?.irregular;
        // Outside thresholds.json "plausible": a measuring error, shown as "Invalid", never as a number.
        const invalid = !!live?.invalid.includes(key);
        return (
          <div key={key} className={`flex min-w-[170px] flex-1 items-center gap-3 border-l border-line px-4 py-2 ${status !== 'green' && !poor ? cls.soft : ''}`}>
            <span className={`flex min-w-0 flex-col ${poor ? 'opacity-40 grayscale' : ''}`}>
              <span className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted">{SHORT[key] ?? entry?.label ?? key}</span>
                {invalid ? (
                  <span className="text-[15px] font-semibold leading-tight text-watch" title="Outside the possible range: check the sensor">Invalid</span>
                ) : (
                  <>
                    <span className={`font-mono text-[22px] font-semibold leading-tight ${status === 'green' ? 'text-text' : cls.text}`}>
                      {latest ? fmt(latest[key], 0) : '–'}
                    </span>
                    <span className="text-[11px] text-muted">{entry?.unit}</span>
                  </>
                )}
                {status !== 'green' && latest && <span className={`text-[11px] font-semibold ${cls.text}`}>{statusLabel(status)}</span>}
              </span>
              <span className="whitespace-nowrap text-[11px] text-muted">
                usual {usual !== null ? fmt(usual, 0) : '–'} · signal {latest ? `${fmt(latest.signal_quality * 100, 0)}%` : '–'}
              </span>
              {flagged && <span className="text-[11px] font-bold text-alert" role="alert">Irregular rhythm</span>}
            </span>
            <Sparkline values={frames.map((f) => (implausible(key, f[key], thresholds) ? null : f[key]))}
              statusOf={poor ? undefined : (v) => { const st = judge(v, entry, liveOptions.symptoms); return st === 'green' && baselineWatch(v, entry, entry?.baseline?.metric ? liveOptions.usual?.[entry.baseline.metric] : null) ? 'yellow' : st; }}
              className={`ml-auto h-7 w-16 shrink-0 ${poor ? 'text-muted' : cls.text}`} width={64} height={28} strokeWidth={2} />
          </div>
        );
      })}
      {poor && (
        <span className="flex items-center px-3 text-xs font-medium text-watch" role="status">Poor signal: check the sensor</span>
      )}
      {demo && source !== 'sensor' && personaInfo?.event_start_s !== undefined && (
        <button type="button" onClick={() => jumpTo(Math.max(0, personaInfo.event_start_s! - 10))}
          title="Demo control: moves the simulated recording to just before the event"
          className="ml-2 flex min-h-touch items-center gap-1 px-2 text-xs text-muted hover:text-text">
          <Lightning className="h-3.5 w-3.5" aria-hidden /> Jump to event (demo)
        </button>
      )}
    </section>
  );
}
