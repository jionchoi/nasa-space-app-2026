import { useEffect, useMemo, useState } from 'react';
import { isDraft, undraft } from '../../lib/env';
import { metricRows } from '../../lib/metrics';
import { normsLine, usePvtNorms } from '../../lib/pvtNorms';
import { entryOf, STATUS_CLASS, worse } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import type { CabinSummary, DailyEntry, RadiationSummary, RegionMeta, RegionStatus, Status, VitalsFrame } from '../../types/contracts';
import { CrewPanelTable } from '../common/CrewReference';
import { DraftTag } from './GuidanceCard';
import { MetricInfo } from './MetricInfo';
import { MetricsList } from './MetricsList';
import { RegionOverview } from './RegionOverview';
import type { Range } from './TrendChart';

interface Props {
  status?: RegionStatus;
  meta?: RegionMeta;
  daily: DailyEntry[];
  /** Status from the live vitals, for regions that have them. */
  liveNow?: Status;
  latest?: VitalsFrame;
  cabin: CabinSummary | null;
  radiation: RadiationSummary | null;
}

type Tab = 'overview' | 'metrics' | 'learn';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'metrics', label: 'All metrics' },
  { id: 'learn', label: 'Learn' },
];

const SHELL = 'flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-panel border border-line bg-panel p-5 lg:max-w-[420px]';

/** Right column: the selected body area with Overview / All metrics / Learn tabs. */
export function RegionPanel({ status, meta, daily, liveNow, latest, cabin, radiation }: Props) {
  const statusLabel = useStatusLabel();
  const { thresholds, measurements } = useApp();
  const pvtNorms = usePvtNorms();
  const [tab, setTab] = useState<Tab>('overview');
  const [metric, setMetric] = useState(meta?.key_metric ?? '');
  const [range, setRange] = useState<Range>(30);
  // A new area starts on its key metric (the tab stays where the crew member left it).
  useEffect(() => { setMetric(meta?.key_metric ?? ''); }, [meta?.id, meta?.key_metric]);
  const rows = useMemo(() => (meta ? metricRows(meta, daily, thresholds, latest, cabin, status?.metric_status) : []),
    [meta, daily, thresholds, latest, cabin, status?.metric_status]);

  if (!status || !meta) {
    return <section aria-label="Region details" className={SHELL}>{[60, 44, 180, 130].map((h, i) => <div key={i} className="animate-pulse rounded-card bg-raised/50" style={{ height: h }} />)}</section>;
  }
  const shown = worse(liveNow ?? 'green', status.status);
  const cls = STATUS_CLASS[shown];
  const row = rows.find((r) => r.metric === metric) ?? rows[0];
  const entry = entryOf(thresholds, row?.metric ?? meta.key_metric);
  // Learn tab: say where cabin values and the location's dose rate come from.
  const feed = radiation?.feed;
  const dataSource = row?.metric.startsWith('pvt_') && pvtNorms
    ? { badge: normsLine(pvtNorms), note: `${pvtNorms.source}, ${pvtNorms.licence}`, url: pvtNorms.url }
    : row?.kind === 'cabin' && cabin
    ? { badge: cabin.badge ?? 'Simulated', note: cabin.kind === 'real' ? cabin.location_note : 'Simulated cabin profile (no real file).', url: cabin.source_urls?.[0] }
    : meta.id === 'radiation' && feed
      ? { badge: feed.badge, note: [feed.note, feed.kind === 'real' ? feed.quantity : feed.source].filter(Boolean).join('. '), url: feed.source_url }
      : undefined;

  return (
    <section aria-label="Region details" className={SHELL}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[22px] font-bold leading-tight">{meta.label}</h2>
          {meta.function && (
            <p className="flex items-start gap-1.5 text-sm text-soft [text-wrap:pretty]">
              <span>{undraft(meta.function)}</span>{isDraft(meta.function) && <DraftTag />}
            </p>
          )}
          <span className="flex flex-wrap gap-1.5">
            <span className={`pill ${STATUS_CLASS[status.status].soft} ${STATUS_CLASS[status.status].text}`} title="From the daily checks">{statusLabel(status.status)}</span>
            {liveNow && liveNow !== 'green' && <span className={`pill ${cls.soft} ${cls.text}`}>Live: {statusLabel(liveNow)}</span>}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`font-mono text-[28px] font-semibold leading-none ${STATUS_CLASS[status.status].text}`}>{status.score}</span>
          <span className="mt-1 text-xs text-muted">health score / 100</span>
        </div>
      </header>

      <div role="tablist" aria-label="Region detail sections" className="flex gap-1 rounded-control bg-inset p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`h-9 flex-1 rounded-lg transition ${tab === t.id ? 'bg-raised font-semibold text-text' : 'font-medium text-muted hover:text-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'overview' && (
          <RegionOverview status={status} meta={meta} liveNow={liveNow} row={row} entry={entry} range={range} onRange={setRange} radiation={radiation} />
        )}
        {tab === 'metrics' && <MetricsList rows={rows} selected={row?.metric ?? ''} onSelect={(m) => { setMetric(m); setTab('overview'); }} />}
        {tab === 'learn' && (
          <MetricInfo entry={entry} info={measurements?.metrics[row?.metric ?? meta.key_metric]} functionText={meta.function}
            spaceNote={meta.space_effect ?? meta.spaceflight_note} refs={meta.refs} dataSource={dataSource} />
        )}
        {tab === 'learn' && meta.id === 'metabolism' && <div className="mt-5"><CrewPanelTable /></div>}
      </div>
    </section>
  );
}
