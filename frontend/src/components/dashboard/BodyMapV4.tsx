// v4 body map (Main-v4, left column): "N areas need attention" badge, the body figure with a glowing zone per area
// (Nominal faint · Watch brighter · Warning strong + slow pulse · Act now red + fast pulse), an aura in the worst
// colour, and chips outside the figure with leader lines. Radiation is whole-body: a chip near the feet.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { metricRows } from '../../lib/metrics';
import { fmt, STATUS_ORDER, STATUS_TOKEN } from '../../lib/status';
import { useApp, useStatusLabel } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import type { RegionId, Status } from '../../types/contracts';
import { PLATE, SPOTS, ZONES } from './anatomy/plate';

const W = 560;
const H = 860;
const FIG_H = 840;
const FIG_W = Math.round((FIG_H * PLATE.width) / PLATE.height);
const FIG_X = Math.round((W - FIG_W) / 2);
const FIG_Y = 10;
const CHIP_W = 150;
const CHIP_H = 48;

const rank = (s: Status) => STATUS_ORDER.indexOf(s);
const c = (s: Status, a = 1) => `rgb(var(--c-${STATUS_TOKEN[s]}) / ${a})`;

/** Space kept under the drawing for the figure credit and the bottom padding. */
const BELOW = 36;

/** Scales the fixed 560 x 860 drawing down (never up) so it fits the column width and, on wide screens
 *  (dashboard side by side), the height left in the window, so the whole body is visible without scrolling. */
function useFit(ref: React.RefObject<HTMLDivElement>) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      const availW = wide ? W : (el.parentElement?.clientWidth ?? W) - 40;
      const availH = wide ? window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - BELOW : Infinity;
      setK(Math.max(0.35, Math.min(1, availW / W, availH / H)));
    };
    update();
    // The header can change height (wrapping, alerts), so watch the page as well as the window.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [ref]);
  return k;
}

export function BodyMapV4() {
  const { regions, setPicked, thresholds } = useApp();
  const { shown, selected, attention, worst, daily, latest, cabin, radiation } = useHealth();
  const statusLabel = useStatusLabel();
  const [broken, setBroken] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const k = useFit(box);

  // Key value per area: its worst metric (status from the backend), else the key metric.
  const keyValue = useMemo(() => {
    const out: Partial<Record<RegionId, string>> = {};
    for (const meta of regions) {
      const st = shown.find((s) => s.region === meta.id);
      if (meta.id === 'radiation' && radiation?.feed) { out.radiation = `${fmt(radiation.feed.dose_rate_now, 1)} ${radiation.feed.unit}`; continue; }
      const rows = metricRows(meta, daily, thresholds, latest, cabin, st?.metric_status).filter((r) => r.value !== null || r.text);
      const worstRow = [...rows].sort((a, b) => rank(b.status) - rank(a.status))[0];
      const row = worstRow && rank(worstRow.status) > 0 ? worstRow : rows.find((r) => r.metric === meta.key_metric) ?? rows[0];
      if (row) out[meta.id] = row.text ?? `${fmt(row.value!, row.unit === 'ppm' ? 0 : 1)}${row.unit ? ` ${row.unit}` : ''}`;
    }
    return out;
  }, [regions, shown, daily, thresholds, latest, cabin, radiation]);

  const statusOf = (id: RegionId): Status => shown.find((s) => s.region === id)?.status ?? 'green';
  const ws: Status = worst?.status ?? 'green';
  const wr = rank(ws);

  // Chips: left / right of the figure at the height of their zone, pushed down so they never overlap.
  const placed = useMemo(() => {
    const used: Record<'left' | 'right', number[]> = { left: [], right: [] };
    return regions.filter((r) => SPOTS[r.id]).map((r) => {
      const spot = SPOTS[r.id];
      const zone = ZONES[r.id];
      const side = spot.side;
      const cx = FIG_X + ((zone?.cx ?? 50) / 100) * FIG_W;
      const cy = FIG_Y + ((zone?.cy ?? spot.y) / 100) * FIG_H;
      let y = r.id === 'radiation' ? 776 : cy - CHIP_H / 2;
      for (const other of used[side].sort((a, b) => a - b)) if (Math.abs(other - y) < CHIP_H + 8) y = other + CHIP_H + 8;
      used[side].push(y);
      return { meta: r, zone, side, cx, cy, y, x: side === 'left' ? 4 : W - CHIP_W - 4 };
    });
  }, [regions]);

  const badge = attention === 0 ? 'All areas nominal' : `${attention} ${attention === 1 ? 'area needs' : 'areas need'} attention`;
  const aura: CSSProperties = {
    left: 100, right: 100, top: 0, bottom: 0,
    background: `radial-gradient(ellipse at 50% 35%, ${c(ws, [0.08, 0.13, 0.2, 0.33][wr])}, transparent 65%)`,
  };

  return (
    <section aria-label="Body map" className="flex flex-col items-center gap-2 border-line bg-map px-5 pb-3 pt-4 lg:h-full lg:border-r">
      <span role="status" className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-bold ${wr >= 2 ? 'shadow-[0_0_20px_var(--glow)]' : ''}`}
        style={{ borderColor: c(ws), color: c(ws), background: c(ws, 0.08), ['--glow' as string]: c(ws, 0.35) }}>
        {badge}
      </span>
      <div ref={box} className="shrink-0" style={{ width: W * k, height: H * k }}>
        <div className="relative origin-top-left" style={{ width: W, height: H, transform: `scale(${k})` }}>
          <div aria-hidden className={`absolute rounded-[50%] ${wr === 3 ? 'glow-fast' : wr === 2 ? 'glow-slow' : ''}`} style={aura} />
          {broken
            ? <div className="absolute grid place-items-center rounded-card border border-line p-3 text-center text-xs text-muted" style={{ left: FIG_X, top: FIG_Y, width: FIG_W, height: FIG_H }}>{PLATE.alt}</div>
            : <img src={PLATE.src} alt={PLATE.alt} draggable={false} onError={() => setBroken(true)} className="absolute select-none opacity-90"
                style={{ left: FIG_X, top: FIG_Y, width: FIG_W, height: FIG_H }} />}

          <svg width={W} height={H} className="pointer-events-none absolute inset-0" aria-hidden>
            {placed.filter((p) => p.zone).map((p) => {
              const st = statusOf(p.meta.id);
              const on = selected === p.meta.id;
              const ex = p.side === 'left' ? p.x + CHIP_W : p.x;
              const ey = p.y + CHIP_H / 2;
              const zx = p.side === 'left' ? p.cx - p.zone!.w / 2 + 4 : p.cx + p.zone!.w / 2 - 4;
              const mid = p.side === 'left' ? ex + 18 : ex - 18;
              const color = on ? 'rgb(var(--c-text))' : c(st);
              return (
                <g key={p.meta.id}>
                  <polyline points={`${ex},${ey} ${mid},${ey} ${zx},${p.cy}`} fill="none" stroke={color} strokeWidth={on ? 1.6 : 1} strokeOpacity={on ? 1 : rank(st) > 0 ? 0.9 : 0.35} />
                  <circle cx={zx} cy={p.cy} r={3.5} fill={color} />
                </g>
              );
            })}
          </svg>

          {placed.filter((p) => p.zone).map((p) => {
            const st = statusOf(p.meta.id);
            const r = rank(st);
            const on = selected === p.meta.id;
            const glow = [8, 22, 34, 48][r];
            return (
              <button key={p.meta.id} type="button" onClick={() => setPicked(p.meta.id)} aria-pressed={on}
                aria-label={`${p.meta.label}, ${statusLabel(st)}`}
                className={`absolute rounded-[50%] ${r === 3 ? 'glow-fast' : r === 2 ? 'glow-slow' : ''}`}
                style={{
                  left: p.cx - p.zone!.w / 2, top: p.cy - p.zone!.h / 2, width: p.zone!.w, height: p.zone!.h,
                  background: r > 0 ? c(st, 0.13) : 'transparent',
                  border: on ? '2px solid rgb(var(--c-text))' : `1.5px solid ${c(st, r === 0 ? 0.33 : 1)}`,
                  boxShadow: `0 0 ${glow}px ${r * 6}px ${c(st, r === 0 ? 0.27 : 0.55)}, inset 0 0 ${glow / 2}px ${c(st, r === 0 ? 0.2 : 0.53)}`,
                }} />
            );
          })}

          {placed.map((p) => {
            const st = statusOf(p.meta.id);
            const r = rank(st);
            const on = selected === p.meta.id;
            return (
              <button key={`chip-${p.meta.id}`} type="button" onClick={() => setPicked(p.meta.id)} aria-pressed={on}
                aria-label={`${p.meta.label}${p.meta.id === 'radiation' ? ', whole body' : ''}: ${statusLabel(st)}, ${keyValue[p.meta.id] ?? ''}`}
                className="absolute flex flex-col gap-px rounded-[10px] px-2.5 py-1.5 text-left transition hover:brightness-125"
                style={{
                  left: p.x, top: p.y, width: CHIP_W, minHeight: CHIP_H,
                  background: on ? 'rgb(var(--c-raised))' : 'rgb(var(--c-panel))',
                  border: `1px solid ${on ? 'rgb(var(--c-text))' : r > 0 ? c(st) : 'rgb(var(--c-line-strong))'}`,
                  boxShadow: r >= 2 ? `0 0 18px ${c(st, 0.33)}` : undefined,
                }}>
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c(st), boxShadow: `0 0 ${4 + r * 5}px ${c(st)}` }} />
                  <span className="truncate">{SPOTS[p.meta.id]?.short ?? p.meta.label}</span>
                </span>
                <span className="truncate text-xs" style={{ color: c(st) }}>
                  {statusLabel(st)}{keyValue[p.meta.id] ? <> · <span className="font-mono text-soft">{keyValue[p.meta.id]}</span></> : null}
                </span>
                {p.meta.id === 'radiation' && <span className="text-[10px] text-muted">whole body</span>}
              </button>
            );
          })}
        </div>
      </div>
      <span className="text-[11px] text-muted/80" title={PLATE.credit}>Figure: M. Häggström, public domain</span>
    </section>
  );
}
