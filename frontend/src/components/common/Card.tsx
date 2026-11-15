import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Classes for the inner surface (padding, layout). */
  inner?: string;
  label?: string;
}

/** Panel surface from the design: 16px radius, #121821 with a #1C2430 border. */
export function Card({ children, className = '', inner = '', label }: Props) {
  return (
    <section aria-label={label} className={`rounded-panel border border-line bg-panel ${className}`}>
      <div className={`h-full ${inner}`}>{children}</div>
    </section>
  );
}
