import type { Status } from '../../types/contracts';
import { STATUS_TOKEN, tokenColor } from '../../lib/status';

interface Props {
  values: (number | null)[];
  className?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Status of each value (thresholds.json via judge): each piece of the line takes its status color (green = good,
   *  yellow = Watch, orange = Warning, red = Act now). Without it the line uses the parent's text color. */
  statusOf?: (value: number) => Status;
}

/** Tiny line chart. */
export function Sparkline({ values, className = '', width = 120, height = 28, strokeWidth = 1.5, statusOf }: Props) {
  if (values.length < 2) return <svg className={className} viewBox={`0 0 ${width} ${height}`} />;
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!present.length) return <svg className={className} viewBox={`0 0 ${width} ${height}`} />;
  const min = Math.min(...present);
  const span = Math.max(...present) - min || 1;
  const px = (i: number) => (i / (values.length - 1)) * width;
  const py = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  if (statusOf) {
    const pieces = values.flatMap((v, i) => {
      const prev = values[i - 1];
      if (i === 0 || v === null || prev === null || prev === undefined || !Number.isFinite(v) || !Number.isFinite(prev)) return [];
      return [{ i, d: `M${px(i - 1)},${py(prev)} L${px(i)},${py(v)}`, color: tokenColor(STATUS_TOKEN[statusOf(v)]) }];
    });
    return (
      <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        {pieces.map((p) => <path key={p.i} d={p.d} fill="none" stroke={p.color} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
    );
  }
  let pen = false;
  const points = values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) { pen = false; return ''; }
    const command = pen ? 'L' : 'M'; pen = true;
    return `${command}${px(i)},${py(v)}`;
  }).join(' ');
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={points} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
