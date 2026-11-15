interface Props {
  values: (number | null)[];
  className?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

/** Tiny line chart. Color comes from the parent's text color (currentColor). */
export function Sparkline({ values, className = '', width = 120, height = 28, strokeWidth = 1.5 }: Props) {
  if (values.length < 2) return <svg className={className} viewBox={`0 0 ${width} ${height}`} />;
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!present.length) return <svg className={className} viewBox={`0 0 ${width} ${height}`} />;
  const min = Math.min(...present);
  const span = Math.max(...present) - min || 1;
  let pen = false;
  const points = values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) { pen = false; return ''; }
    const command = pen ? 'L' : 'M'; pen = true;
    return `${command}${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`;
  }).join(' ');
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={points} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
