import { ArrowSquareOut, Radioactive, ShieldWarning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { fmt, mmss, STATUS_CLASS } from '../../lib/status';
import type { RadiationFeed, RadiationSummary } from '../../types/contracts';
import { DoseRateChart } from './DoseRateChart';
import { DraftTag } from './GuidanceCard';

/** Source badge for the dose at this location: real NASA readings (blue, links to the export) or an estimate (amber). */
export function FeedBadge({ feed }: { feed: RadiationFeed }) {
  if (feed.kind === 'estimated') {
    return <span className="badge bg-watch/10 text-watch ring-watch/25" title={feed.source ?? undefined}>{feed.badge}</span>;
  }
  return (
    <a href={feed.source_url ?? undefined} target="_blank" rel="noreferrer" title={feed.instrument ?? undefined}
      className="badge bg-info/10 text-info ring-info/25 hover:underline">{feed.badge}</a>
  );
}

/** Dose rate where the crew member is: real RadLab replay (with the last 24 h chart) or a steady DRAFT estimate. */
function LocationDose({ feed }: { feed: RadiationFeed }) {
  const real = feed.kind === 'real';
  const perDay = real ? feed.today_mgy : feed.daily_mgy[feed.daily_mgy.length - 1];
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Dose rate here{feed.place ? <span className="font-normal text-muted"> · {feed.place}</span> : null}</span>
        <span className="flex items-center gap-1.5"><FeedBadge feed={feed} />{feed.draft && <DraftTag />}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <div><dt className="text-[11px] text-muted">{real ? 'Now' : 'Average'}</dt><dd className="font-mono text-base">{fmt(feed.dose_rate_now, 1)}<span className="text-[11px] text-muted"> {feed.unit}</span></dd></div>
        <div><dt className="text-[11px] text-muted">{real ? 'Today so far' : 'Per day'}</dt><dd className="font-mono text-base">{perDay === null ? "–" : fmt(perDay, 2)}<span className="text-[11px] text-muted"> mGy</span></dd></div>
        <div><dt className="text-[11px] text-muted">Last 30 days</dt><dd className="font-mono text-base">{fmt(feed.total_30d_mgy, 1)}<span className="text-[11px] text-muted"> mGy</span></dd></div>
      </dl>
      {real && feed.last_24h.length > 1 && (
        <div className="mt-2">
          <span className="text-[11px] text-muted">Dose rate, last 24 h ({feed.unit})</span>
          <DoseRateChart points={feed.last_24h} unit={feed.unit} />
        </div>
      )}
      {feed.note && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{feed.note}</p>}
      <p className="mt-1 text-[11px] text-muted">
        {real
          ? `${feed.replay_label}${feed.window ? ` (${feed.window.start.slice(0, 10)} to ${feed.window.end.slice(0, 10)})` : ''}. Dose in the detector, not the body.`
          : 'Steady published average. Real readings go up and down.'}
      </p>
    </div>
  );
}

/** Radiation region extras: the dose rate at this location, the active solar particle event (real DONKI timing,
 *  simulated dose, on top of every location) and the mission total (simulated persona values). */
export function RadiationCard({ data }: { data: RadiationSummary }) {
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
      {data.feed && <LocationDose feed={data.feed} />}
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
          {event.location_reason && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {event.location_scale && event.location_scale !== 1 && <span className="font-medium text-text">About {event.location_scale}× the ISS dose here. </span>}
              {event.location_reason}
            </p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span>Timing from a real NASA DONKI event: {event.sep_id} ({event.instruments.join(', ')})</span>
            <a href={event.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">
              DONKI record <ArrowSquareOut className="h-3 w-3" aria-hidden />
            </a>
            <span className="badge bg-watch/10 text-watch ring-watch/25">{event.dose_note ?? 'dose simulated; timing from real DONKI event'}</span>
          </p>
        </div>
      )}
      <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-2">
            <Radioactive className="h-4 w-4 text-muted" aria-hidden /> Mission dose
            {data.mission_dose_simulated !== false && <span className="badge bg-white/[0.05] text-muted ring-white/10" title="Body dose from the simulated crew member file">Simulated</span>}
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
