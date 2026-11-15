import { ArrowSquareOut, Radioactive, ShieldWarning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { fmt, mmss, STATUS_CLASS } from '../../lib/status';
import type { RadiationSummary } from '../../types/contracts';

/** Radiation region extras: the active solar particle event (real DONKI timing, simulated dose) and the mission total.
 *  `estimated`: no real data at this location (the surface rover), so the dose is shown as an estimate. */
export function RadiationCard({ data, estimated }: { data: RadiationSummary; estimated?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const event = data.event;
  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event]);
  const share = data.limit_msv ? Math.min(1, data.mission_total_msv / data.limit_msv) : 0;
  const cls = STATUS_CLASS[data.status];

  return (
    <div className="space-y-3">
      {event && (
        <div className="rounded-2xl bg-alert/10 p-4 ring-1 ring-alert/30" role="alert">
          <p className="flex items-center gap-2 font-semibold text-alert">
            <ShieldWarning className="h-5 w-5" weight="fill" aria-hidden /> {event.alert}
          </p>
          <p className="mt-1 text-sm leading-relaxed">{event.advice}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-bg/50 p-2"><dt className="text-[11px] text-muted">Dose rate now</dt><dd className="font-mono text-lg">{fmt(event.dose_rate_msv_h, 2)}<span className="text-xs text-muted"> mSv/h</span></dd></div>
            <div className="rounded-xl bg-bg/50 p-2"><dt className="text-[11px] text-muted">From this event</dt><dd className="font-mono text-lg">{fmt(event.event_dose_msv, 2)}<span className="text-xs text-muted"> mSv</span></dd></div>
            <div className="rounded-xl bg-bg/50 p-2"><dt className="text-[11px] text-muted">Expected end in</dt><dd className="font-mono text-lg">{mmss(Math.max(0, (Date.parse(event.ends_at) - now) / 1000))}</dd></div>
          </dl>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>Timing from a real NASA DONKI event: {event.sep_id} ({event.instruments.join(', ')})</span>
            <a href={event.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">
              DONKI record <ArrowSquareOut className="h-3 w-3" aria-hidden />
            </a>
            <span className="badge bg-watch/10 text-watch ring-watch/25">dose simulated</span>
          </p>
        </div>
      )}
      <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-2">
            <Radioactive className="h-4 w-4 text-muted" aria-hidden /> Mission dose
            {estimated && <span className="badge bg-watch/10 text-watch ring-watch/25" title="No dosimeter data from the rover: estimated from the base values">Estimated</span>}
          </span>
          <span><span className="font-mono">{fmt(data.mission_total_msv)}</span> <span className="text-xs text-muted">of {data.limit_msv ?? '–'} {data.unit} limit</span></span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className={`h-full rounded-full ${cls.bg}`} style={{ width: `${share * 100}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-muted">
          Today <span className="font-mono">{fmt(data.today_msv, 2)}</span> {data.unit}
          {data.fallback_spike_used && ' · solar spike day is simulated (real event file missing)'}
        </p>
      </div>
    </div>
  );
}
