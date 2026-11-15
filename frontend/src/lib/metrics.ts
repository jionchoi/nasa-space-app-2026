// Rows for the region panel's "All metrics" list: latest value, status, change vs the personal baseline, series.
import type { CabinField, CabinSummary, DailyEntry, RegionMeta, Status, Thresholds, VitalsFrame } from '../types/contracts';
import { entryOf } from './status';

export type MetricKind = 'daily' | 'live' | 'cabin';

export interface MetricRow {
  metric: string;
  kind: MetricKind;
  label: string;
  unit: string;
  /** Latest value; null when there is no data yet. */
  value: number | null;
  /** Shown instead of a number (e.g. "Irregular"). */
  text?: string;
  status: Status;
  baseline: number | null;
  delta: number | null;
  /** What the baseline is: "30-day usual" or "24 h average". */
  baselineLabel: string;
  series: number[];
  /** Cabin rows: where the values come from, in a few words ("real ISS telemetry" or "simulated"). */
  source?: string;
  /** For the chart: x = day number (daily) or index (cabin), xLabel for the axis. */
  points: { x: number; value: number; label: string }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const CABIN_FIELD: Record<string, CabinField> = { co2_ppm: 'co2_ppm', cabin_temp_c: 'temp_c', cabin_noise_dba: 'noise_dba' };

/** Rows for the "All metrics" list. Every colour comes from the backend: daily metrics from the region's
 *  `metric_status` (GET /api/status, which includes the personal reaction-time rule), cabin values from the cabin
 *  feed's `status` (GET /api/cabin). `thresholds` is only used for labels and units here. A metric the backend did not
 *  judge today shows as green. */
export function metricRows(region: RegionMeta, daily: DailyEntry[], thresholds: Thresholds | null,
  latest?: VitalsFrame, cabin?: CabinSummary | null, metricStatus?: Partial<Record<string, Status>>): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const metric of [...region.metrics, ...(region.context_metrics ?? [])]) {
    const entry = entryOf(thresholds, metric);
    const base = { metric, label: entry?.label ?? metric, unit: entry?.unit ?? '' };
    const cabinField = CABIN_FIELD[metric];
    if (cabinField) {
      // Skip a field this cabin feed does not have (the real ISS telemetry has no noise).
      if (!cabin || typeof cabin.now[cabinField] !== 'number') continue;
      const series = cabin.last_24h.map((p) => p[cabinField] ?? 0);
      const value = cabin.now[cabinField] as number;
      const mean = series.reduce((a, b) => a + b, 0) / series.length;
      rows.push({ ...base, kind: 'cabin', value, status: cabin.status[cabinField] ?? 'green', baseline: Math.round(mean), delta: Math.round(value - mean),
        baselineLabel: '24 h average', series, source: cabin.kind === 'real' ? 'real ISS telemetry' : 'simulated',
        points: cabin.last_24h.map((p, i) => ({ x: i, value: p[cabinField] ?? 0, label: p.t.slice(11, 16) })) });
      continue;
    }
    const days = daily.filter((d) => typeof d[metric] === 'number');
    if (days.length) {
      const series = days.map((d) => d[metric] as number);
      const value = series[series.length - 1];
      const baseline = median(series.slice(-31, -1));
      rows.push({ ...base, kind: 'daily', value, status: metricStatus?.[metric] ?? 'green', baseline,
        delta: baseline === null ? null : value - baseline, baselineLabel: '30-day usual', series,
        points: days.map((d) => ({ x: d.day, value: d[metric] as number, label: `Day ${d.day}` })) });
      continue;
    }
    if (metric === 'irregular' && latest) {
      rows.push({ ...base, kind: 'live', value: null, text: latest.irregular ? 'Irregular now' : 'Regular now', status: metricStatus?.[metric] ?? 'green',
        baseline: null, delta: null, baselineLabel: 'live', series: [], points: [] });
    }
  }
  return rows;
}

/** Personal reaction-test baseline: median of the last 30 days. */
export function pvtBaseline(daily: DailyEntry[]): { median_ms: number | null; lapse_rate_pct: number | null; days: number } {
  const recent = daily.filter((d) => !d.today).slice(-30);
  const values = (key: string) => recent.map((d) => d[key]).filter((v): v is number => typeof v === 'number');
  return { median_ms: median(values('pvt_median_ms')), lapse_rate_pct: median(values('pvt_lapse_rate_pct')),
    days: values('pvt_median_ms').length };
}

/** Daily field that holds each live vital's personal baseline ("Your usual"): resting HR for live HR. */
export const USUAL_FIELD = { hr: 'hr_rest', hrv_rmssd: 'hrv_rmssd', spo2: 'spo2', rr: 'rr' } as const;

/** The personal usual value: median of the last 30 daily entries that have this field, or null. */
export function usualValue(daily: DailyEntry[], field: string): number | null {
  const values = daily.map((d) => d[field]).filter((v): v is number => typeof v === 'number').slice(-30);
  return median(values);
}
