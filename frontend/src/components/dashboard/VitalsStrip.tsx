import { Heartbeat, Lightning, WarningCircle } from '@phosphor-icons/react';
import { useApp } from '../../state/AppContext';
import { USUAL_FIELD, usualValue } from '../../lib/metrics';
import { entryOf, fmt, LIVE_VITALS, liveStatus, STATUS_CLASS } from '../../lib/status';
import type { DailyEntry, Thresholds, VitalsFrame } from '../../types/contracts';
import { useSignals } from '../../state/SignalContext';
import { SignalVitals } from '../signals/SignalVitals';
import { VitalCard } from './VitalCard';

interface Props {
  frames: VitalsFrame[];
  thresholds: Thresholds | null;
  /** Daily entries, for "Your usual" (personal baseline). Optional: the emergency screen has none. */
  daily?: DailyEntry[];
  /** Tighter layout for the emergency screen. */
  compact?: boolean;
}

/** "Live vitals": heart rate, HRV, blood oxygen and breathing rate as 4 large cards, each with a 60-second sparkline. */
export function VitalsStrip({ frames, thresholds, daily = [], compact }: Props) {
  const {mode}=useSignals();
  const latest = frames[frames.length - 1];
  const live = liveStatus(latest, thresholds);
  const source = latest?.source === 'sensor' ? 'finger sensor' : 'replayed recording';
  const { personaInfo, jumpTo } = useApp();

  if (mode!=='demo') return <SignalVitals compact={compact}/>;
  return (
    <section aria-label="Live vitals" className="relative">
      <div className={`flex flex-wrap items-center gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
        <span className={`flex items-center gap-2 font-bold ${compact ? 'text-sm' : 'text-base'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${latest ? 'bg-ok shadow-[0_0_0_4px_rgb(var(--c-ok)/0.18)]' : 'bg-muted'}`} />
          Live vitals
        </span>
        <span className="text-[13px] text-muted">{latest ? `Updating every second · ${source}` : 'Waiting for the sensor…'}</span>
        {live?.irregular && (
          <span className="pill bg-alert/15 text-alert" role="alert"><Heartbeat className="h-3.5 w-3.5" weight="bold" aria-hidden /> Irregular rhythm</span>
        )}
        <span className="flex-1" />
        {!compact && latest?.source !== 'sensor' && personaInfo?.event_start_s !== undefined && (
          <button type="button" className="flex min-h-touch items-center gap-1 px-1 text-xs text-muted transition hover:text-text"
            title="Demo control: moves the simulated recording to just before the event" onClick={() => jumpTo(Math.max(0, personaInfo.event_start_s! - 10))}>
            <Lightning className="h-3.5 w-3.5" aria-hidden /> Jump to event (demo)
          </button>
        )}
        {latest && live && (
          <span className="text-[13px] text-muted">
            signal <span className={`font-mono ${live.signal === 'green' ? 'text-soft' : STATUS_CLASS[live.signal].text}`}>{fmt(latest.signal_quality * 100, 0)}%</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {!latest || !live
          ? LIVE_VITALS.map((key) => <div key={key} className={`animate-pulse rounded-[14px] border border-line bg-panel ${compact ? 'h-[120px]' : 'h-[178px]'}`} />)
          : LIVE_VITALS.map((key) => {
            const entry = entryOf(thresholds, key);
            const usual = usualValue(daily, USUAL_FIELD[key]);
            return (
              <VitalCard key={key} name={entry?.label ?? key} value={fmt(latest[key], 0)} unit={entry?.unit ?? ''}
                status={live.vitals[key]} series={frames.map((f) => f[key])} dim={live.poor} compact={compact}
                usual={!compact && usual !== null ? `Your usual: ${fmt(usual, 0)} ${entry?.unit ?? ''}` : undefined} />
            );
          })}
      </div>

      {live?.poor && (
        <div className="pointer-events-none absolute inset-0 top-8 grid place-items-center" role="status">
          <span className="flex items-center gap-2 rounded-full bg-bg/90 px-4 py-1.5 text-sm font-medium text-watch ring-1 ring-watch/30">
            <WarningCircle className="h-4 w-4" aria-hidden /> Poor signal: check the sensor
          </span>
        </div>
      )}
    </section>
  );
}
