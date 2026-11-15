// v4 metric chart: the series, dashed Watch and Warning lines (nearest limits in thresholds.json), a "usual" line
// (personal baseline) and, when the backend forecasts a crossing for the area's key metric, a dotted forecast to the
// Warning limit. Plain SVG (same look as the design), scales to the width.
import { fmt, nearestLimit, tokenColor } from '../../lib/status';
import { useStatusLabel } from '../../state/AppContext';
import type { ThresholdEntry } from '../../types/contracts';

interface Props {
  points: { x: number; value: number; label: string }[];
  entry?: ThresholdEntry;
  baseline: number | null;
  color: string;
  /** Days until the backend expects the Warning limit (key metric only), else null. */
  forecastDays: number | null;
  /** "today" for daily series, "now" for the 24 h cabin series. */
  endLabel: string;
  title: string;
}

const VW = 600;
const VH = 170;

export function MetricChart({ points, entry, baseline, color, forecastDays, endLabel, title }: Props) {
  const statusLabel = useStatusLabel();
  if (points.length < 2) return <p className="py-8 text-center text-sm text-muted">No trend data yet.</p>;
  const last = points[points.length - 1];
  const watch = nearestLimit(entry?.yellow, last.value);
  const warning = nearestLimit(entry?.orange, last.value);
  const forecast = forecastDays && forecastDays > 0 && warning !== null ? { days: forecastDays, value: warning } : null;

  const values = [...points.map((p) => p.value), ...[watch, warning, baseline, forecast?.value].filter((v): v is number => v !== null && v !== undefined)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
  lo -= pad; hi += pad;
  const plotW = forecast ? VW * 0.8 : VW - 10;
  const x = (i: number) => (i / (points.length - 1)) * plotW;
  const y = (v: number) => VH - 10 - ((v - lo) / (hi - lo)) * (VH - 20);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const bands = [[watch, 'yellow', 'watch'], [warning, 'orange', 'warn']] as const;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height={VH} preserveAspectRatio="none" role="img"
        aria-label={`${title}: ${points.length} values, latest ${fmt(last.value)} ${entry?.unit ?? ''}${forecast ? `, forecast to reach ${statusLabel('orange')} in about ${forecast.days} days` : ''}`}>
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
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {forecast && (
          <polyline points={`${x(points.length - 1)},${y(last.value)} ${VW - 6},${y(forecast.value)}`} fill="none" stroke={color} strokeWidth={2}
            strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={4.5} fill={color} />
      </svg>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{points[0].label}</span><span>{endLabel}</span>{forecast && <span>+{forecast.days} days (forecast)</span>}
      </div>
    </div>
  );
}
