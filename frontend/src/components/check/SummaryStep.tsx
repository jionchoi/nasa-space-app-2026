import { ArrowDown, ArrowRight, ArrowUp } from '@phosphor-icons/react';
import { fmt, STATUS_CLASS } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import type { CheckResult } from '../../types/contracts';
import { CrewGlucoseLine } from '../common/CrewReference';
import { ReferenceComparison } from './ReactionTest';

interface Props {
  result: CheckResult | null;
  skipped: boolean;
  /** Demo mode filled the values in (persona's simulated data). */
  demo?: boolean;
  onBack(): void;
}

/** Today's numbers next to the personal baseline. The backend computes and judges everything. */
export function SummaryStep({ result, skipped, demo, onBack }: Props) {
  const statusLabel = useStatusLabel();
  const { regions, escalation } = useApp();
  if (!result) return <p className="text-xl text-muted">Working out today's results…</p>;
  const label = (id: string) => regions.find((r) => r.id === id)?.label ?? id;
  const level = escalation?.levels.find((l) => l.id === result.advice.level)?.label ?? result.advice.level;

  return (
    <>
      <h2 className="text-3xl font-semibold">Today's check is done</h2>
      {skipped && <span className="badge bg-watch/10 text-watch ring-watch/25">demo shortcut: measurement skipped, last 2 minutes of the stream used</span>}
      {demo && <span className="badge bg-watch/10 text-watch ring-watch/25">demo mode: reaction test and glucose filled in from the simulated crew member</span>}

      <ul className="grid w-full grid-cols-2 gap-2 text-left">
        {result.comparison.map((row) => {
          const cls = STATUS_CLASS[row.status];
          const Arrow = !row.delta ? ArrowRight : row.delta > 0 ? ArrowUp : ArrowDown;
          return (
            <li key={row.metric} className={`panel flex items-center gap-3 border-l-4 px-4 py-2 ${cls.border}`}>
              <Arrow className={`h-7 w-7 shrink-0 ${cls.text}`} weight="bold" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] leading-snug">{row.text}</div>
              </div>
              <div className="whitespace-nowrap text-right">
                <span className="font-mono text-2xl font-semibold">{fmt(row.value)}</span>
                <span className="ml-1 text-xs text-muted">{row.unit}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {(summaryPvt(result) || summaryGlucose(result) !== null) && (
        <div className="panel w-full space-y-2 p-4 text-left">
          <div className="label">Compared with real reference data</div>
          {summaryPvt(result) && summaryPvt(result)!.version !== 'demo' && (
            <ReferenceComparison medianMs={summaryPvt(result)!.median_ms}
              lapseRate={summaryPvt(result)!.lapse_rate_pct ?? Math.round((1000 * summaryPvt(result)!.lapses) / summaryPvt(result)!.n) / 10} />
          )}
          {summaryGlucose(result) !== null && (
            <div className="space-y-1">
              <p className="text-base">Your glucose today: <span className="font-mono font-semibold">{fmt(summaryGlucose(result)!, 1)} mmol/L</span></p>
              <CrewGlucoseLine />
            </div>
          )}
        </div>
      )}

      <div className="grid w-full grid-cols-2 gap-3 text-left">
        <div className="panel p-4">
          <div className="label mb-1">Regions that changed</div>
          {result.changed.length === 0 ? (
            <p className="text-sm text-muted">No region changed status today.</p>
          ) : (
            <ul className="space-y-1 text-[15px]">
              {result.changed.map((c) => (
                <li key={c.region}>
                  {label(c.region)}:{' '}
                  <span className={STATUS_CLASS[c.from].text}>{statusLabel(c.from)}</span>{' '}<ArrowRight className="inline h-3.5 w-3.5 text-muted" aria-hidden />{' '}
                  <span className={`font-semibold ${STATUS_CLASS[c.to].text}`}>{statusLabel(c.to)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-4">
          <div className="label mb-1">Today's advice</div>
          <p className="text-lg font-semibold">{level}</p>
          <p className="text-[15px] leading-snug">{result.advice.text}</p>
        </div>
      </div>

      {result.notes.map((note) => <p key={note} className="text-xs text-muted">{note}</p>)}
      <button className="btn btn-primary px-8 py-3 text-lg" onClick={onBack}>Back to dashboard</button>
    </>
  );
}

/** The reaction test result saved with today's check, if any. */
function summaryPvt(result: CheckResult): { median_ms: number; lapses: number; n: number; lapse_rate_pct?: number; version?: string } | null {
  const pvt = (result.summary as Record<string, unknown>).pvt;
  return pvt && typeof pvt === 'object' ? (pvt as { median_ms: number; lapses: number; n: number; lapse_rate_pct?: number; version?: string }) : null;
}

/** Today's glucose (mmol/L), if it was entered. */
function summaryGlucose(result: CheckResult): number | null {
  const g = (result.summary as Record<string, unknown>).glucose_mmol;
  return typeof g === 'number' ? g : null;
}
