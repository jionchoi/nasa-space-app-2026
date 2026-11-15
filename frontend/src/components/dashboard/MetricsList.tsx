import type { MetricRow } from '../../lib/metrics';
import { fmt, STATUS_CLASS } from '../../lib/status';
import { useStatusLabel } from '../../state/AppContext';

interface Props {
  rows: MetricRow[];
  selected: string;
  /** Tap a metric to show its chart on the Overview tab. */
  onSelect(metric: string): void;
}

/** "Change vs usual" in plain words, e.g. "3.1 above 30-day usual". */
function changeText(row: MetricRow, statusWord: string): string {
  if (row.delta === null || row.baseline === null) return statusWord;
  if (fmt(Math.abs(row.delta)) === '0') return `${statusWord} · same as ${row.baselineLabel}`;
  return `${statusWord} · ${fmt(Math.abs(row.delta))} ${row.delta > 0 ? 'above' : 'below'} ${row.baselineLabel}`;
}

/** Every metric of the region: status dot, value with unit, and change vs the personal usual. */
export function MetricsList({ rows, selected, onSelect }: Props) {
  const statusLabel = useStatusLabel();
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No data for this area yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const cls = STATUS_CLASS[row.status];
        return (
          <button key={row.metric} type="button" onClick={() => onSelect(row.metric)} aria-pressed={row.metric === selected}
            className={`flex min-h-touch items-center gap-3 rounded-control border bg-inset p-3 text-left transition hover:border-line-strong ${
              row.metric === selected ? 'border-line-strong' : 'border-line'}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${cls.bg}`} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{row.label}{row.kind === 'cabin' && <span className="font-normal text-muted"> · cabin, {row.source ?? 'simulated'}</span>}</span>
              <span className="truncate text-xs text-muted">{changeText(row, statusLabel(row.status))}</span>
            </span>
            <span className="whitespace-nowrap text-right">
              {row.value !== null
                ? <><span className="font-mono text-base font-semibold">{fmt(row.value)}</span><span className="text-xs text-muted"> {row.unit}</span></>
                : <span className={`text-xs font-semibold ${cls.text}`}>{row.text ?? '–'}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
