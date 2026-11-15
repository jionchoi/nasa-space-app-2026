interface Props {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

/** Tiny line chart. Color comes from the parent's text color (currentColor). */
export function Sparkline({ values, className = '', width = 120, height = 28, strokeWidth = 1.5 }: Props) {
  if (values.length < 2) return <svg className={className} viewBox={`0 0 ${width} ${height}`} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`)
    .join(' ');
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
