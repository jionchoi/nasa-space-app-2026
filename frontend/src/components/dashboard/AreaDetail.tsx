// v4 right column, the selected area: name, health score and ⓘ Learn; a tab per metric (status dot + value); the big
// value with "Your usual" and the change; the chart (7 / 30 days, 24 h for cabin values). Every status colour comes
// from the backend (metric_status, cabin status); this only lays it out.
import { useEffect, useMemo, useState } from 'react';
import { CrewGlucoseLine } from '../common/CrewReference';
import { metricRows, type MetricRow } from '../../lib/metrics';
import { entryOf, fmt, STATUS_CLASS, STATUS_ORDER, tokenColor, STATUS_TOKEN } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';
import { MetricChart } from './MetricChart';

type Range = 7 | 30;
const rank = (r: MetricRow) => STATUS_ORDER.indexOf(r.status);

/** The metric to show: the one picked, else the worst one, else the key metric. Shared with the Learn pop-up. */
export function useAreaMetric() {
  const { regions, thresholds, pickedMetric } = useApp();
  const { shown, selected, daily, latest, cabin } = useHealth();
  const meta = regions.find((r) => r.id === selected);
  const status = shown.find((s) => s.region === selected);
  const rows = useMemo(() => (meta ? metricRows(meta, daily, thresholds, latest, cabin, status?.metric_status) : []),
    [meta, daily, thresholds, latest, cabin, status?.metric_status]);
  // Ties go to the metric the forecast was made on, so the dotted forecast is on screen first.
  const fm = status?.forecast_metric;
  const worst = [...rows].sort((a, b) => rank(b) - rank(a) || Number(b.metric === fm) - Number(a.metric === fm))[0];
  const row = rows.find((r) => r.metric === pickedMetric)
    ?? (worst && rank(worst) > 0 ? worst : rows.find((r) => r.metric === meta?.key_metric) ?? rows[0]);
  return { meta, status, rows, row };
}

export function AreaDetail() {
  const { setPickedMetric, thresholds } = useApp();
  const { open } = useShell();
  const statusLabel = useStatusLabel();
  const { meta, status, rows, row } = useAreaMetric();
  const [range, setRange] = useState<Range>(7);
  useEffect(() => { setRange(7); }, [meta?.id]);

  if (!meta || !status) return <div className="h-64 animate-pulse rounded-card bg-raised/40" />;
  const entry = entryOf(thresholds, row?.metric ?? meta.key_metric);
  const color = row && row.status !== 'green' ? tokenColor(STATUS_TOKEN[row.status]) : tokenColor('text');
  const points = row ? (row.kind === 'daily' ? row.points.slice(-range) : row.points) : [];
  // The forecast belongs to one metric: the key metric (to Warning) or the metric causing Warning (to Act now).
  const forecastHere = row?.metric === (status.forecast_metric ?? meta.key_metric) && status.status !== 'red' && !!status.time_to_act_days;
  const forecastTo = status.status === 'orange' ? 'red' : 'orange';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-[30px] font-bold leading-tight">{meta.label}</h2>
        <span className="text-[13px] text-muted">Health score <span className={`font-mono ${STATUS_CLASS[status.status].text}`}>{status.score}</span>/100</span>
        <span className="flex-1" />
        <button type="button" onClick={() => open('learn')} className="btn btn-accent h-10 min-h-0" aria-label={`Learn about ${meta.label}${row ? `, ${row.label}` : ''}`}>ⓘ Learn</button>
      </div>

      <div role="tablist" aria-label={`All metrics in ${meta.label}`} className="flex flex-wrap gap-2">
        {rows.map((r) => {
          const on = r.metric === row?.metric;
          return (
            <button key={r.metric} type="button" role="tab" aria-selected={on} onClick={() => setPickedMetric(r.metric)}
              aria-label={`${r.label}: ${r.text ?? (r.value !== null ? `${fmt(r.value)} ${r.unit}` : 'no data')}, ${statusLabel(r.status)}`}
              className={`flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${on ? 'border-text bg-text text-bg' : 'border-line-strong text-soft hover:bg-raised'}`}>
              <span className={`h-[7px] w-[7px] rounded-full ${STATUS_CLASS[r.status].bg}`} aria-hidden />
              <span>{r.label}</span>
              <span className={`font-mono ${on ? '' : r.status === 'green' ? 'text-muted' : STATUS_CLASS[r.status].text}`}>
                {r.text ?? (r.value !== null ? `${fmt(r.value, r.unit === 'ppm' ? 0 : 1)}${r.unit ? ` ${r.unit}` : ''}` : '–')}
              </span>
            </button>
          );
        })}
      </div>

      {row && (
        <div className="flex flex-wrap items-end gap-7">
          <div className="flex min-w-[190px] flex-col">
            <span className="text-[13px] text-muted">{row.label}{row.source ? ` · cabin, ${row.source}` : ''}</span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[64px] font-semibold leading-none" style={{ color }}>
                {row.text ?? (row.value !== null ? fmt(row.value, row.unit === 'ppm' ? 0 : 1) : '–')}
              </span>
              <span className="text-[17px] text-muted">{row.unit}</span>
            </span>
            {row.baseline !== null && (
              <span className="text-sm text-soft">Your usual: <span className="font-mono">{fmt(row.baseline)}</span> {row.unit} <span className="text-xs text-muted">({row.baselineLabel})</span></span>
            )}
            <span className="text-xs text-muted">
              {row.delta === null ? statusLabel(row.status)
                : `${row.delta === 0 ? 'Same as usual' : `${row.delta > 0 ? '+' : ''}${fmt(row.delta)} ${row.unit} vs your usual`} · ${statusLabel(row.status)}`}
            </span>
          </div>
          <div className="min-w-0 flex-[1_1_380px]">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs text-muted">dashed lines = {statusLabel('yellow')} / {statusLabel('orange')} limits{forecastHere ? ' · dotted = forecast' : ''}</span>
              <span className="flex-1" />
              {row.kind === 'daily' && (
                <span role="radiogroup" aria-label="Chart range" className="flex gap-1">
                  {([7, 30] as Range[]).map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={range === r} onClick={() => setRange(r)}
                      className={`h-8 rounded-full border px-3 text-xs ${range === r ? 'border-text bg-text text-bg' : 'border-line-strong text-soft hover:bg-raised'}`}>
                      {r} days
                    </button>
                  ))}
                </span>
              )}
            </div>
            {row.metric === 'glucose_mmol' && <CrewGlucoseLine className="mb-2" />}
            <MetricChart points={points} entry={entry} baseline={row.baseline} color={color} title={row.label}
              forecastDays={forecastHere ? status.time_to_act_days : null} forecastTo={forecastTo}
              endLabel={row.kind === 'cabin' ? 'now' : 'today'} />
          </div>
        </div>
      )}
    </div>
  );
}
