import { useSignals } from '../../state/SignalContext';
import { METRICS, metricState, metricValue } from '../../lib/signalViewModel';
import { VitalCard } from '../dashboard/VitalCard';

export function SignalVitals({ compact = false }: { compact?: boolean }) {
  const {session, snapshots, connection, now} = useSignals();
  const latest = session?.latest;
  const connected = connection === 'connected';
  return <section aria-label="Live vitals">
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <span className="font-bold">Live vitals</span>
      <span className="text-sm text-muted">{session ? `${session.source} · ${session.status} · ${connected ? 'connected' : connection}` : 'Start a signal session'}</span>
      <span className="text-xs text-muted">{latest ? `Optical checks: ${latest.quality.status}` : 'No signal yet'}</span>
      {session?.simulated && <span className="badge text-watch">Synthetic waveform</span>}
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {METRICS.map(({key,label,unit}) => {
        const value = metricValue(latest, latest?.metrics[key], now, connected);
        return <VitalCard key={key} name={label} value={value === null ? '—' : value.toFixed(key === 'ppg_rmssd_ms' ? 1 : 0)} unit={unit}
          status={null} statusText={metricState(latest,key,now,connected)} compact={compact}
          series={snapshots.map((s) => metricValue(s,s.metrics[key],Date.parse(s.observed_at_utc),true))}
          usual={latest?.metrics[key]?.reason?.replace(/_/g,' ') ?? (key==='ppg_rmssd_ms' ? 'PRV · not ECG HRV' : undefined)} />;
      })}
    </div>
    {latest?.quality.reasons.length ? <p className="mt-2 text-sm text-watch" role="status">{latest.quality.reasons.join(' · ')}</p> : null}
  </section>;
}
