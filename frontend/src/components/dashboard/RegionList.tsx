import { byUrgency, STATUS_CLASS } from '../../lib/status';
import { useStatusLabel } from '../../state/AppContext';
import type { RegionId, RegionMeta, RegionStatus } from '../../types/contracts';

interface Props {
  statuses: RegionStatus[];
  regions: RegionMeta[];
  selected: RegionId | null;
  onSelect(id: RegionId): void;
}

const NONE = { status: 'green' as const, score: 100 };

/** "Body areas, most urgent first": one row per region. Same choice as tapping the body map. */
export function RegionList({ statuses, regions, selected, onSelect }: Props) {
  const statusLabel = useStatusLabel();
  const rows = regions
    .map((meta) => ({ meta, status: statuses.find((s) => s.region === meta.id) }))
    .sort((a, b) => byUrgency(a.status ?? NONE, b.status ?? NONE));

  return (
    <section aria-label="Body areas" className="rounded-panel border border-line bg-panel px-3 pb-2 pt-4">
      <div className="flex items-center justify-between px-2 pb-2">
        <h2 className="font-semibold">Body areas</h2>
        <span className="text-xs text-muted">Most urgent first</span>
      </div>
      {rows.map(({ meta, status }) => {
        const s = status?.status ?? 'green';
        const cls = STATUS_CLASS[s];
        const active = selected === meta.id;
        return (
          <button key={meta.id} type="button" onClick={() => onSelect(meta.id)} aria-pressed={active}
            className={`flex min-h-[52px] w-full items-center gap-3 rounded-control border px-2 py-1.5 text-left transition ${
              active ? 'border-line-strong bg-raised' : 'border-transparent hover:bg-raised/50'}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls.bg}`} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{meta.label}</span>
              <span className="truncate text-xs text-muted" title={status?.reason}>{status?.reason ?? 'Loading…'}</span>
            </span>
            <span className={`pill px-2 ${cls.soft} ${cls.text}`}>{statusLabel(s)}</span>
          </button>
        );
      })}
    </section>
  );
}
