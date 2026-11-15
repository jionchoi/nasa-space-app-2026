import type { CSSProperties } from 'react';
import { useState } from 'react';
import { STATUS_CLASS, STATUS_ORDER, STATUS_TOKEN } from '../../lib/status';
import { useStatusLabel } from '../../state/AppContext';
import type { RegionId, RegionMeta, RegionStatus, Status } from '../../types/contracts';
import { PLATE, SPOTS } from './anatomy/plate';

interface Props {
  statuses: RegionStatus[];
  regions: RegionMeta[];
  selected: RegionId | null;
  onSelect(id: RegionId): void;
}

/** Halo around a dot: a 10% tint ring, then a thin status ring (white when selected). Colors are theme tokens. */
function dotShadow(status: Status, selected: boolean): CSSProperties {
  const c = `var(--c-${STATUS_TOKEN[status]})`;
  return {
    boxShadow: selected
      ? `0 0 0 6px rgb(${c} / 0.12), 0 0 0 8px rgb(var(--c-text))`
      : `0 0 0 4px rgb(${c} / 0.12), 0 0 0 5px rgb(${c} / 0.35)`,
  };
}

/** Still full-body figure with one tappable dot per body area. Radiation is a dashed ellipse around the whole body. */
export function BodyMap({ statuses, regions, selected, onSelect }: Props) {
  const statusLabel = useStatusLabel();
  const [broken, setBroken] = useState(false);
  const statusOf = (id: RegionId): Status => statuses.find((s) => s.region === id)?.status ?? 'green';
  const radiation = statusOf('radiation');
  const radCls = STATUS_CLASS[radiation];

  return (
    <section aria-label="Body map" className="flex min-w-0 flex-[2_1_380px] flex-col items-center gap-3 rounded-panel border border-line bg-map p-5">
      <div className="flex items-baseline justify-between self-stretch">
        <h2 className="text-base font-semibold">Body map</h2>
        <span className="text-xs text-muted">Tap a point to see details</span>
      </div>

      <div className="relative mb-2 mt-4 h-[620px] max-h-[70vh] min-h-[420px]" style={{ aspectRatio: `${PLATE.width} / ${PLATE.height}` }}>
        {/* Radiation: the whole body, drawn around the figure. */}
        <span aria-hidden className={`pointer-events-none absolute -inset-x-[70px] -inset-y-[14px] rounded-[50%] border-[1.5px] border-dashed opacity-[0.55] ${radCls.border}`} />
        {broken ? (
          <div className="absolute inset-0 grid place-items-center rounded-card border border-line p-3 text-center text-xs text-muted">{PLATE.alt}</div>
        ) : (
          <img src={PLATE.src} alt={PLATE.alt} draggable={false} onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full select-none object-contain" />
        )}

        {regions.filter((r) => r.id !== 'radiation' && SPOTS[r.id]).map((r) => {
          const spot = SPOTS[r.id];
          const status = statusOf(r.id);
          const cls = STATUS_CLASS[status];
          const isSelected = selected === r.id;
          const notice = status !== 'green';
          return (
            <button key={r.id} type="button" onClick={() => onSelect(r.id)} aria-pressed={isSelected}
              aria-label={`${r.label}, ${statusLabel(status)}`}
              className="absolute -ml-[22px] -mt-[22px] flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
              {(status === 'orange' || status === 'red') && <span className={`absolute h-[18px] w-[18px] animate-halo rounded-full ${cls.bg}`} aria-hidden />}
              <span className={`relative rounded-full ${cls.bg} ${notice ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'}`} style={dotShadow(status, isSelected)} />
              {/* A text label only for the selected area and areas that are not Nominal. */}
              {(isSelected || notice) && (
                <span className={`absolute left-10 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-panel px-2.5 py-1 text-xs font-semibold text-text ${cls.edge}`}>
                  {spot.short ?? r.label} · {statusLabel(status)}
                </span>
              )}
            </button>
          );
        })}

        <button type="button" onClick={() => onSelect('radiation')} aria-pressed={selected === 'radiation'}
          aria-label={`Radiation, whole body, ${statusLabel(radiation)}`}
          className={`absolute -bottom-9 left-1/2 flex min-h-8 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border bg-panel px-3 text-xs transition ${
            selected === 'radiation' ? 'border-text' : 'border-line-strong hover:border-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${radCls.bg}`} aria-hidden />
          Radiation · whole body · {statusLabel(radiation)}
        </button>
      </div>

      <ul aria-label="Legend" className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-soft">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS_CLASS[s].bg}`} />{statusLabel(s)}</li>
        ))}
      </ul>
      <span className="text-[11px] text-muted/80" title={PLATE.credit}>Figure: M. Häggström, public domain</span>
    </section>
  );
}
