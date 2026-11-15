interface Props {
  flags: string[];
  /** Indexes of flags that have lit up (they stay lit). */
  lit: number[];
}

/** The protocol's red flags. A flag lights up by itself when the matching live vital is in the red range. */
export function RedFlags({ flags, lit }: Props) {
  return (
    <section className="panel shrink-0" aria-label="Red flags">
      <div className="label border-b border-line px-3 py-2">Red flags ({lit.length} active)</div>
      <ul className="space-y-1 p-2">
        {flags.map((flag, i) => {
          const on = lit.includes(i);
          return (
            <li
              key={flag}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[15px] leading-snug ${
                on ? 'animate-zone border-alert bg-alert/20 font-semibold text-text' : 'border-line text-muted'
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-alert' : 'bg-line'}`} />
              {flag}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
