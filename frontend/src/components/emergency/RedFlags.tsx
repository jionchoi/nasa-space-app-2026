interface Props {
  flags: string[];
  /** Indexes of flags that have lit up (they stay lit). */
  lit: number[];
}

/** RED FLAGS · LIVE: the protocol's red flags. A flag lights up by itself when the matching live vital is red. */
export function RedFlags({ flags, lit }: Props) {
  return (
    <section className="flex shrink-0 flex-col gap-1.5" aria-label="Red flags">
      <span className="text-xs font-bold tracking-[0.12em] text-[#B8999C]">RED FLAGS · LIVE ({lit.length} active)</span>
      <ul className="flex flex-col gap-1">
        {flags.map((flag, i) => {
          const on = lit.includes(i);
          return (
            <li key={flag} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm ${on ? 'bg-alert/15 font-bold text-[#FFD0D4]' : 'text-[#8A6E71]'}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'glow-fast bg-alert' : 'bg-[#3A2226]'}`} aria-hidden />
              <span className="flex-1">{flag}</span>
              <span className="text-[11px]">{on ? 'ACTIVE' : 'clear'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
