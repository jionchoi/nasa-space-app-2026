// v4 metric chart: the series, dashed Watch and Warning lines (nearest limits in thresholds.json), a "usual" line
// (personal baseline) and, when the backend forecasts a crossing for the area's key metric, a dotted forecast to the
// Warning limit. Plain SVG (same look as the design), scales to the width.
// Nov 15: the line is colored by status point by point (green = good, yellow = Watch, orange = Warning, red = Act now,
// from thresholds.json via judge) and the Watch / Warning / Act now zones are tinted, so a plain line never hides a bad value.
import { baselineWatch, fmt, judge, nearestLimit, STATUS_TOKEN, tokenColor } from '../../lib/status';
import type { Band, Status } from '../../types/contracts';
import { useStatusLabel } from '../../state/AppContext';
import type { ThresholdEntry } from '../../types/contracts';

interface Props {
  points: { x: number; value: number; label: string }[];
  entry?: ThresholdEntry;
  baseline: number | null;
  color: string;
  /** Days until the backend expects the next limit on this metric, else null. */
  forecastDays: number | null;
  /** The level the forecast heads to: Warning (from Watch) or Act now (from Warning). */
  forecastTo?: 'orange' | 'red';
  /** "today" for daily series, "now" for the 24 h cabin series. */
  endLabel: string;
  title: string;
}

const VW = 600;
const VH = 170;

export function MetricChart({ points, entry, baseline, color, forecastDays, forecastTo = 'orange', endLabel, title }: Props) {
  const statusLabel = useStatusLabel();
  if (points.length < 2) return <p className="py-8 text-center text-sm text-muted">No trend data yet.</p>;
  const last = points[points.length - 1];
  // Values on screen are as stored (mood 1-5); the bands are on the sheet's scale (mood 1-10): divide the limits back.
  const k = entry?.scale_factor ?? 1;
  const toShown = (b: Band | null | undefined): Band | null => (b ? [b[0] === null ? null : b[0] / k, b[1] === null ? null : b[1] / k] : null);
  // Band status, or Watch when too far from the usual (e.g. HRV 20 % below the pre-flight baseline, RULE-02).
  const statusOf = (v: number): Status => {
    const st = judge(v * k, entry);
    return st === 'green' && baseline !== null && baselineWatch(v * k, entry, baseline * k) ? 'yellow' : st;
  };
  const watch = nearestLimit(toShown(entry?.yellow), last.value);
  const warning = nearestLimit(toShown(entry?.orange), last.value);
  const actNow = forecastTo === 'red' ? nearestLimit(toShown(entry?.red), last.value) : null;
  const target = forecastTo === 'red' ? actNow : warning;
  const forecast = forecastDays && forecastDays > 0 && target !== null ? { days: forecastDays, value: target } : null;

  const values = [...points.map((p) => p.value), ...[watch, warning, actNow, baseline, forecast?.value].filter((v): v is number => v !== null && v !== undefined)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
  lo -= pad; hi += pad;
  const plotW = forecast ? VW * 0.8 : VW - 10;
  const x = (i: number) => (i / (points.length - 1)) * plotW;
  const y = (v: number) => VH - 10 - ((v - lo) / (hi - lo)) * (VH - 20);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const bands = [[watch, 'yellow', 'watch'], [warning, 'orange', 'warn'], [forecast ? actNow : null, 'red', 'alert']] as const;
  // Tinted zones outside each band (they stack: Act now looks darkest).
  const zones = (['yellow', 'orange', 'red'] as const).flatMap((level) => {
    const b = toShown(entry?.[level]);
    if (!b) return [];
    const out: { key: string; y1: number; y2: number; color: string }[] = [];
    const top = 0, bottom = VH;
    if (b[1] !== null && b[1] < hi) out.push({ key: `${level}-hi`, y1: top, y2: Math.max(top, y(b[1])), color: tokenColor(STATUS_TOKEN[level]) });
    if (b[0] !== null && b[0] > lo) out.push({ key: `${level}-lo`, y1: Math.min(bottom, y(b[0])), y2: bottom, color: tokenColor(STATUS_TOKEN[level]) });
    return out;
  });

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH} preserveAspectRatio="none" role="img"
        aria-label={`${title}: ${points.length} values, latest ${fmt(last.value)} ${entry?.unit ?? ''}${forecast ? `, forecast to reach ${statusLabel(forecastTo)} in about ${forecast.days} days` : ''}`}>
        {bands.map(([v, status, token]) => v === null ? null : (
          <g key={status}>
            <line x1={0} x2={VW} y1={y(v)} y2={y(v)} stroke={tokenColor(token)} strokeWidth={1} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <text x={VW - 4} y={y(v) - 3} textAnchor="end" fontSize={10} fill={tokenColor(token)}>{statusLabel(status)} {fmt(v)}</text>
          </g>
        ))}
        {baseline !== null && (
          <g>
            <line x1={0} x2={VW} y1={y(baseline)} y2={y(baseline)} stroke={tokenColor('line-strong')} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={4} y={y(baseline) - 4} fontSize={10} fill={tokenColor('muted')}>usual</text>
          </g>
        )}
        {zones.map((z) => <rect key={z.key} x={0} width={VW} y={z.y1} height={Math.max(0, z.y2 - z.y1)} fill={z.color} opacity={0.08} />)}
        {entry ? points.slice(1).map((p, i) => (
          <line key={p.x} x1={x(i)} y1={y(points[i].value)} x2={x(i + 1)} y2={y(p.value)} stroke={tokenColor(STATUS_TOKEN[statusOf(p.value)])}
            strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )) : <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {entry && points.length <= 40 && points.map((p, i) => (
          <circle key={`d${p.x}`} cx={x(i)} cy={y(p.value)} r={2.6} fill={tokenColor(STATUS_TOKEN[statusOf(p.value)])} />
        ))}
        {forecast && (
          <polyline points={`${x(points.length - 1)},${y(last.value)} ${VW - 6},${y(forecast.value)}`} fill="none" stroke={color} strokeWidth={2}
            strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={4.5} fill={entry ? tokenColor(STATUS_TOKEN[statusOf(last.value)]) : color} />
      </svg>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{points[0].label}</span><span>{endLabel}</span>{forecast && <span>+{forecast.days} days (forecast)</span>}
      </div>
    </div>
  );
}
