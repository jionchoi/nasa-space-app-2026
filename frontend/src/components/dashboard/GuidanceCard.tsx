import { Check, Leaf } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { useSelfCare } from '../../hooks/useSelfCare';
import { isDraft, undraft } from '../../lib/env';
import { STATUS_CLASS } from '../../lib/status';
import type { GuidanceItem, Status } from '../../types/contracts';

export function DraftTag() {
  return <span className="rounded-full border border-watch/40 px-1.5 py-px text-[10px] font-medium text-watch" title="Text not yet reviewed by our medical lead">Draft</span>;
}

interface Props {
  persona: string;
  region: string;
  status: Status;
  item?: GuidanceItem;
  /** The escalation ladder ("Who to tell"), shown at the bottom of the card. */
  ladder: ReactNode;
}

/** "What to do" (guidance.json for the region's current status): the summary as the title, a self-care checklist the
 *  astronaut can tick (saved for today), who to tell, then the escalation ladder. */
export function GuidanceCard({ persona, region, status, item, ladder }: Props) {
  const { ticked, toggle } = useSelfCare(persona, region, status);
  const cls = STATUS_CLASS[status];
  const steps = item?.self_care ?? [];
  const done = steps.filter((s) => ticked.includes(s)).length;

  return (
    <div className={`flex flex-col gap-3 rounded-card border p-4 ${cls.soft} ${cls.edge}`}>
      <span className="flex items-center justify-between gap-2">
        <span className={`kicker ${cls.text}`}>What to do</span>
        {item && (isDraft(item.summary) || item.draft) && <DraftTag />}
      </span>
      {item ? (
        <>
          <span className="text-[17px] font-bold leading-snug [text-wrap:pretty]">{undraft(item.summary)}</span>
          {steps.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Today, {done} of {steps.length} done</span>
              <ul className="flex flex-col gap-1">
                {steps.map((s) => {
                  const on = ticked.includes(s);
                  return (
                    <li key={s}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s)}
                        className="flex min-h-touch w-full items-center gap-2.5 rounded-control px-1 text-left transition hover:bg-bg/30">
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? `${cls.bg} border-transparent text-bg` : 'border-line-strong'}`}>
                          {on && <Check className="h-3.5 w-3.5" weight="bold" aria-hidden />}
                        </span>
                        <span className={`text-sm ${on ? 'text-muted line-through' : 'text-text'}`}>{undraft(s)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <dl className="grid gap-1.5 text-sm">
            <div><dt className="inline font-semibold">Crew: </dt><dd className="inline text-soft">{undraft(item.tell_crew)}</dd></div>
            <div><dt className="inline font-semibold">Flight surgeon: </dt><dd className="inline text-soft">{undraft(item.contact_surgeon)}</dd></div>
          </dl>
        </>
      ) : <span className="text-sm text-muted">No guidance written for this area yet.</span>}
      <div className="border-t border-line pt-3">{ladder}</div>
    </div>
  );
}

/** "How to stay healthy": the prevention list from guidance.json. */
export function PreventionList({ item }: { item?: GuidanceItem }) {
  if (!item?.prevention.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs text-muted"><Leaf className="h-3.5 w-3.5" aria-hidden /> How to stay healthy</span>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-soft">
        {item.prevention.map((p) => <li key={p}>{undraft(p)}</li>)}
      </ul>
    </div>
  );
}
