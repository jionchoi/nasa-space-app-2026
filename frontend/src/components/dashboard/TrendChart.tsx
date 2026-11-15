import { ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt, nearestLimit, tokenColor } from '../../lib/status';
import { useStatusLabel } from '../../state/AppContext';
import type { ThresholdEntry } from '../../types/contracts';

export type Range = 7 | 30;

interface Props {
  /** x = day number (daily metrics) or index (cabin); label is shown on the axis and tooltip. */
  points: { x: number; value: number; label: string }[];
  title: string;
  entry?: ThresholdEntry;
  /** Only for the region's key metric (the backend forecasts that one). */
  timeToActDays: number | null;
  /** Daily metrics: 7 or 30 days. Omit for series with their own window (cabin: last 24 h). */
  range?: Range;
  onRange?(range: Range): void;
  windowLabel?: string;
}

/** Trend with dashed Watch and Warning limits (thresholds.json) and, when the backend forecasts a crossing, a dashed forecast segment. */
export function TrendChart({ points: all, title, entry, timeToActDays, range, onRange, windowLabel }: Props) {
  const statusLabel = useStatusLabel();
  const points = range ? all.slice(-range) : all;
  if (points.length < 2) return <p className="py-6 text-center text-sm text-muted">No trend data yet.</p>;

  const last = points[points.length - 1];
  const watch = nearestLimit(entry?.yellow, last.value);
  const warning = nearestLimit(entry?.orange, last.value);
  const crossing = timeToActDays && timeToActDays > 0 && warning !== null ? last.x + timeToActDays : null;
  const labels = new Map(points.map((p) => [p.x, p.label]));
  if (crossing) labels.set(crossing, `Day ${crossing}`);
  // The forecast is a second series that starts at today's value and ends at the warning limit on the forecast day.
  const data = crossing
    ? [...points.slice(0, -1), { ...last, forecast: last.value }, { x: crossing, label: `Day ${crossing}`, forecast: warning! }]
    : points;
  const unit = entry?.unit ?? '';
  const axis = { fill: tokenColor('muted'), fontSize: 10 };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] text-soft">{title}, {windowLabel ?? `last ${points.length} days`}</span>
        {onRange && range && (
          <div className="flex shrink-0 rounded-control bg-inset p-0.5 text-xs" role="radiogroup" aria-label="Chart range">
            {([7, 30] as Range[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={range === r} onClick={() => onRange(r)}
                className={`rounded-[7px] px-2 py-0.5 transition ${range === r ? 'bg-raised text-text' : 'text-muted hover:text-text'}`}>{r} d</button>
            ))}
          </div>
        )}
        <span className="shrink-0 font-mono font-semibold">{fmt(last.value)} <span className="font-sans text-xs font-normal text-muted">{unit}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
          <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={axis} axisLine={false} tickLine={false}
            ticks={[points[0].x, last.x]} tickFormatter={(x) => (x === last.x ? 'Today' : labels.get(x) ?? String(x))} />
          <YAxis domain={['auto', 'auto']} tick={axis} axisLine={false} tickLine={false} width={48} />
          <Tooltip contentStyle={{ background: tokenColor('panel'), border: `1px solid ${tokenColor('line')}`, borderRadius: 10, fontSize: 12 }}
            labelFormatter={(x) => labels.get(x as number) ?? String(x)}
            formatter={(v: number, name) => [`${fmt(v)} ${unit}`, name === 'forecast' ? 'Forecast' : title]} />
          {warning !== null && (
            <ReferenceLine y={warning} stroke={tokenColor('warn')} strokeDasharray="4 4" ifOverflow="extendDomain"
              label={{ value: statusLabel('orange'), position: 'insideTopRight', fill: tokenColor('warn'), fontSize: 10 }} />
          )}
          {watch !== null && (
            <ReferenceLine y={watch} stroke={tokenColor('watch')} strokeDasharray="4 4" ifOverflow="extendDomain"
              label={{ value: statusLabel('yellow'), position: 'insideTopRight', fill: tokenColor('watch'), fontSize: 10 }} />
          )}
          <Line dataKey="value" stroke={tokenColor('info')} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="forecast" stroke={tokenColor('info')} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="3 4" dot={false} isAnimationActive={false} connectNulls />
          <ReferenceDot x={last.x} y={last.value} r={4} fill={tokenColor('info')} stroke="none" />
        </ComposedChart>
      </ResponsiveContainer>
      {crossing && <p className="text-xs text-muted">Dashed: forecast to the {statusLabel('orange').toLowerCase()} limit if the trend continues.</p>}
    </div>
  );
}
