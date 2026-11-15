import { CheckCircle, XCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { isDraft, undraft } from '../../lib/env';
import type { MeasurementInfo, ThresholdEntry } from '../../types/contracts';
import { DraftTag } from './GuidanceCard';

interface Props {
  /** The metric shown (thresholds.json entry: label, source). */
  entry?: ThresholdEntry;
  /** measurements.json entry: why we check, how to measure, can it be done in space. */
  info?: MeasurementInfo;
  /** regions.json function: what this body part or system does. */
  functionText?: string;
  /** regions.json space_effect (or the old spaceflight_note). May cite [REF-xx]. */
  spaceNote: string;
  /** REF id -> status; ids without a known source get "(source pending)". */
  refs?: Record<string, { status: 'ok' | 'pending'; citation?: string }>;
  /** Where the values on screen come from (cabin telemetry, radiation feed), with a note for the reader. */
  dataSource?: { badge: string; note?: string | null; url?: string | null };
}

/** Text with [REF-xx] citations: a known source shows its citation on hover; an unknown one gets "(source pending)". */
export function WithRefs({ text, refs }: { text: string; refs?: Props['refs'] }) {
  const parts = text.split(/(\[REF-\d+\])/);
  return (
    <>
      {parts.map((part, i) => {
        const id = /^\[(REF-\d+)\]$/.exec(part)?.[1];
        if (!id) return <span key={i}>{part}</span>;
        const ref = refs?.[id];
        return ref?.status === 'ok'
          ? <span key={i} className="text-xs text-muted" title={ref.citation}>{part}</span>
          : <span key={i} className="text-xs text-muted">{part} <span className="text-watch">(source pending)</span></span>;
      })}
    </>
  );
}

function Section({ title, draft, children }: { title: string; draft?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2"><span className="kicker text-muted">{title}</span>{draft && <DraftTag />}</span>
      {children}
    </div>
  );
}

/** "Learn" tab, in this order: what this does, why we check this, how to measure, why this happens in space, source.
 *  A PLACEHOLDER source gets the amber tag so a placeholder is never presented as a reviewed value. */
export function MetricInfo({ entry, info, functionText, spaceNote, refs, dataSource }: Props) {
  const placeholder = (entry?.source ?? 'PLACEHOLDER').toUpperCase().startsWith('PLACEHOLDER');
  const steps = info?.how_to_measure ?? [];
  const metric = entry?.label ? ` ${entry.label.toLowerCase()}` : '';
  const space = info?.can_do_in_space;
  return (
    <div className="flex flex-col gap-4">
      {functionText && (
        <Section title="What this does" draft={isDraft(functionText)}>
          <span className="text-soft [text-wrap:pretty]">{undraft(functionText)}</span>
        </Section>
      )}
      <Section title={`Why we check${metric || ' this'}`} draft={isDraft(info?.why_check)}>
        <span className="text-soft [text-wrap:pretty]">{info ? undraft(info.why_check) : 'Not written yet.'}</span>
      </Section>
      <Section title={`How to measure${metric}`} draft={steps.some(isDraft)}>
        {steps.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-soft">{steps.map((step) => <li key={step}>{undraft(step)}</li>)}</ol>
        ) : <span className="text-soft">No steps written yet.</span>}
        {space && (
          <span className="flex items-start gap-1.5 text-sm text-soft">
            {space.possible
              ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-ok" weight="fill" aria-label="Can be done in space" />
              : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" weight="fill" aria-label="Cannot be done in space" />}
            <span><span className="font-medium text-text">{space.possible ? 'Can be done on board.' : 'Not possible on board.'}</span> {undraft(space.note)}</span>
          </span>
        )}
      </Section>
      <Section title="Why this happens in space">
        <span className="text-soft [text-wrap:pretty]"><WithRefs text={spaceNote} refs={refs} /></span>
      </Section>
      {dataSource && (
        <Section title="Where these numbers come from">
          <span className="text-soft [text-wrap:pretty]">
            {dataSource.url
              ? <a href={dataSource.url} target="_blank" rel="noreferrer" className="text-info hover:underline">{dataSource.badge}</a>
              : <span className="text-text">{dataSource.badge}</span>}
            {dataSource.note ? `. ${dataSource.note}` : ''}
          </span>
        </Section>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Source:
        {placeholder ? (
          <span className="rounded-full border border-watch/40 px-2 py-0.5 text-watch" title="Not yet reviewed against a medical source">
            Placeholder, medical review pending
          </span>
        ) : <span className="text-soft">{entry?.source}</span>}
      </div>
    </div>
  );
}
