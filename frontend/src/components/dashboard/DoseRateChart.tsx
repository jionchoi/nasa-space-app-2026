import { Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt, tokenColor } from '../../lib/status';

interface Props {
  points: { t: string; dose_rate: number }[];
  unit: string;
}

/** Last 24 h of dose rate (real RadLab replay). On the ISS the tall spikes are South Atlantic Anomaly passes. */
export function DoseRateChart({ points, unit }: Props) {
  if (points.length < 2) return null;
  const data = points.map((p, i) => ({ i, rate: p.dose_rate, label: p.t.slice(11, 16) }));
  const axis = { fill: tokenColor('muted'), fontSize: 10 };
  const last = data.length - 1;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="dose-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokenColor('info')} stopOpacity={0.35} />
            <stop offset="100%" stopColor={tokenColor('info')} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="i" type="number" domain={[0, last]} ticks={[0, Math.round(last / 2), last]} tick={axis} axisLine={false} tickLine={false}
          tickFormatter={(i: number) => (i === last ? 'Now' : data[i]?.label ?? '')} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={{ background: tokenColor('panel'), border: `1px solid ${tokenColor('line')}`, borderRadius: 10, fontSize: 12 }}
          labelFormatter={(i) => data[i as number]?.label ?? ''} formatter={(v: number) => [`${fmt(v, 1)} ${unit}`, 'Dose rate']} />
        <Area dataKey="rate" type="linear" stroke={tokenColor('info')} strokeWidth={1.5} fill="url(#dose-fill)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
