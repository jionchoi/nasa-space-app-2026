import { undraft } from '../../lib/env';
import { STATUS_CLASS } from '../../lib/status';
import type { AdviceLevel, EscalationConfig, ExtraStep, Status } from '../../types/contracts';

interface Props {
  escalation: EscalationConfig | null;
  level: AdviceLevel;
  advice: string;
  /** The region's status: fills the bars. */
  status: Status;
  /** Steps for this location only (escalation.json extra_steps), e.g. "Return to base" on the rover. */
  extraSteps?: ExtraStep[];
}

type Rung = { id: string; label: string; extra?: ExtraStep };

/** "Who to tell": the advice level (escalation.json) with its advice for this location, then the ladder with the
 *  current step in bold. Extra location steps sit after their `after` level; they are reached with the next level. */
export function EscalationLadder({ escalation, level, advice, status, extraSteps = [] }: Props) {
  const rungs: Rung[] = [];
  for (const l of escalation?.levels ?? []) {
    rungs.push({ id: l.id, label: l.label });
    for (const extra of extraSteps.filter((x) => x.after === l.id)) rungs.push({ id: extra.id, label: extra.label, extra });
  }
  const current = rungs.findIndex((r) => r.id === level);
  const reached = rungs.filter((r, i) => r.extra && i < current);
  const cls = STATUS_CLASS[status];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">Who to tell: <span className="font-semibold text-text">{rungs[current]?.label}</span></span>
      <span className="text-sm text-soft [text-wrap:pretty]">{advice}</span>
      {reached.map((r) => (
        <span key={r.id} className="text-sm text-soft [text-wrap:pretty]"><span className="font-semibold text-text">{r.label}:</span> {undraft(r.extra?.advice)}</span>
      ))}
      <ol aria-label="Who to tell" className="mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${rungs.length || 4}, minmax(0, 1fr))` }}>
        {rungs.map((item, i) => (
          <li key={item.id} aria-current={i === current ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1 rounded-sm ${i <= current ? cls.bg : 'bg-line-strong'}`} />
            <span className={`text-[11px] leading-snug ${i === current ? 'font-bold text-text' : 'text-muted'}`}>{item.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
