// v4 draggable mission timeline: 3 days back, today and a forecast zone, with a NOW line.
// Built from real history, not sample values:
//  - routine dots from the reminder schedule (environments.json), done / missed from the daily checks and the forms
//    the astronaut saved (GET /api/daily-checks, /api/forms) and, for today, the backend missions;
//  - alert diamonds from the alerts feed (GET /api/alerts, /ws/alerts), coloured by level;
//  - log dots for mood and reaction tests;
//  - dashed forecast diamonds from each area's backend "time to act".
// With the backend off there is no history: past routine dots show as "no record" instead of a guess.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDailyChecks, getForms, useUsingMock } from '../../api/client';
import { useAlerts } from '../../state/AlertsContext';
import { useApp, useStatusLabel } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { missionHHMM, toMinutes, useMissionClock, useRoutine } from '../../state/RoutineContext';
import { STATUS_CLASS, STATUS_ORDER, STATUS_TOKEN } from '../../lib/status';
import type { RegionId, Status } from '../../types/contracts';

const PX = 20; // px per hour
const DAY_H = 24;
const BACK_DAYS = 3;
const H = 132;
const OPEN_KEY = 'copilot-timeline-open';

type Kind = 'done' | 'missed' | 'next' | 'norecord' | 'log' | 'forecast' | Status;
interface TlEvent { key: string; at: number; label: string; kind: Kind; region: RegionId | null; detail: string }

const MISSION_REGION: Record<string, RegionId> = { daily_check: 'heart', meals: 'metabolism', water: 'metabolism', exercise: 'bones_muscles' };
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function useHistory() {
  const { persona } = useApp();
  const { missions } = useRoutine();
  const usingMock = useUsingMock();
  const [data, setData] = useState<{ checks: string[]; forms: { t: string; kind: string; data: Record<string, unknown> }[] } | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (usingMock) { setData(null); return; }
      const [checks, ...forms] = await Promise.all([
        getDailyChecks(persona), ...['meal', 'exercise', 'mood', 'pvt'].map((k) => getForms<Record<string, unknown>>(persona, k)),
      ]);
      if (!live) return;
      if (forms.some((f) => f === null)) { setData(null); return; }
      setData({ checks: checks.map((c) => c.t), forms: forms.flatMap((f) => f ?? []) });
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => { live = false; clearInterval(id); };
  }, [persona, missions, usingMock]);
  return data;
}

export function MissionTimeline() {
  const { personaInfo, regions, setPicked } = useApp();
  const { shown } = useHealth();
  const { alerts } = useAlerts();
  const { schedule, missions } = useRoutine();
  const statusLabel = useStatusLabel();
  const history = useHistory();
  const now = useMissionClock();

  const forecastDays = Math.min(14, Math.max(1, ...shown.map((s) => (s.time_to_act_days && s.time_to_act_days > 0 ? Math.ceil(s.time_to_act_days) : 0))));
  const dayStart = useMemo(() => { const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }, [now]);
  const start = dayStart - BACK_DAYS * DAY_H * 3_600_000;
  const days = BACK_DAYS + 1 + forecastDays;
  const total = days * DAY_H * PX;
  const xOf = useCallback((t: number) => ((t - start) / 3_600_000) * PX, [start]);
  const nowX = xOf(now.getTime());
  const today = personaInfo?.mission_day ?? 0;
  const label = (id: RegionId | null) => regions.find((r) => r.id === id)?.label ?? 'Live vitals';

  const events = useMemo<TlEvent[]>(() => {
    const out: TlEvent[] = [];
    // Routine from the schedule, every day in the window up to tomorrow.
    for (let d = 0; d < BACK_DAYS + 2 && d < days; d++) {
      const date = new Date(start + d * DAY_H * 3_600_000);
      const key = dayKey(date);
      for (const item of schedule) {
        const at = start + d * DAY_H * 3_600_000 + toMinutes(item.time) * 60_000;
        const past = at < now.getTime();
        let kind: Kind = 'next';
        if (d === BACK_DAYS) {
          const done = !!missions?.missions.find((m) => m.id === item.mission)?.done;
          kind = done ? 'done' : past ? 'missed' : 'next';
        } else if (past) {
          if (!history) kind = 'norecord';
          else {
            const same = (t: string) => dayKey(new Date(t)) === key;
            const done = item.mission === 'daily_check' ? history.checks.some(same)
              : item.mission === 'exercise' ? history.forms.some((f) => f.kind === 'exercise' && same(f.t))
              : item.mission === 'water' ? history.forms.some((f) => f.kind === 'meal' && same(f.t) && Number(f.data.water_l) > 0)
              : history.forms.some((f) => f.kind === 'meal' && same(f.t));
            kind = done ? 'done' : 'missed';
          }
        }
        const name = item.mission === 'daily_check' ? 'Daily check' : item.mission === 'meals' ? 'Meal + water' : item.mission === 'water' ? 'Water' : 'Exercise';
        out.push({ key: `r-${key}-${item.id}`, at, label: name, kind, region: MISSION_REGION[item.mission] ?? null, detail: item.text });
      }
    }
    for (const f of history?.forms ?? []) {
      if (f.kind === 'mood') out.push({ key: `m-${f.t}`, at: Date.parse(f.t), label: `Mood ${f.data.mood ?? ''}/10`, kind: 'log', region: 'brain_mood', detail: 'Mood and symptoms logged' });
      if (f.kind === 'pvt') out.push({ key: `p-${f.t}`, at: Date.parse(f.t), label: 'Reaction test', kind: 'log', region: 'brain_mood', detail: 'Reaction test saved' });
    }
    // Every medical concern is shown, emergencies included. Alerts raised close together (e.g. several areas at once)
    // become one diamond: worst first, "+N", and the tooltip lists every message in the group.
    const sortedAlerts = [...alerts].sort((a, b) => a.t.localeCompare(b.t));
    let group: typeof sortedAlerts = [];
    const flush = () => {
      if (!group.length) return;
      const worst = [...group].sort((a, b) => STATUS_ORDER.indexOf(b.level) - STATUS_ORDER.indexOf(a.level))[0];
      const name = worst.region ? label(worst.region) : worst.source === 'emergency' ? 'Emergency' : label(null);
      out.push({ key: `a-${group[0].id}`, at: Date.parse(group[0].t), kind: worst.level, region: worst.region,
        label: `${name}: ${statusLabel(worst.level)}${group.length > 1 ? ` +${group.length - 1}` : ''}`,
        detail: group.map((a) => a.message).join(' · ') });
      group = [];
    };
    for (const a of sortedAlerts) {
      if (group.length && Date.parse(a.t) - Date.parse(group[0].t) > 45 * 60_000) flush();
      group.push(a);
    }
    flush();
    for (const s of shown) {
      if (!s.time_to_act_days || s.time_to_act_days <= 0 || s.status === 'red') continue;
      const next = STATUS_ORDER[Math.min(3, STATUS_ORDER.indexOf(s.status) + 1)];
      out.push({ key: `f-${s.region}`, at: now.getTime() + s.time_to_act_days * 86_400_000, label: `${label(s.region)} may reach ${statusLabel(next)}`,
        kind: 'forecast', region: s.region, detail: `Backend forecast if the trend continues (${s.time_to_act_days} days).` });
    }
    return out.filter((e) => e.at >= start && e.at <= start + days * DAY_H * 3_600_000).sort((a, b) => a.at - b.at);
  }, [schedule, missions, history, alerts, shown, start, days, now, regions, statusLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapsed by default so the area details below get the space; the choice is remembered per browser.
  const [open, setOpenState] = useState(() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } });
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* storage blocked */ } };

  // One-line summary for the collapsed bar: concerns in the window, forecasts and the next routine item.
  const summary = useMemo(() => {
    const concerns = events.filter((e) => STATUS_ORDER.includes(e.kind as Status) && e.at <= now.getTime());
    const worst = [...concerns].sort((a, b) => STATUS_ORDER.indexOf(b.kind as Status) - STATUS_ORDER.indexOf(a.kind as Status))[0];
    const forecasts = events.filter((e) => e.kind === 'forecast').length;
    const next = events.find((e) => e.kind === 'next' && e.at > now.getTime());
    return { concerns: concerns.length, worst: worst?.kind as Status | undefined, forecasts, next };
  }, [events, now]);

  // Drag (mouse and touch) with pointer events; a drag never counts as a tap on an event.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [off, setOff] = useState<number | null>(null);
  const drag = useRef<{ x: number; off: number; moved: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  const clamp = useCallback((v: number) => Math.max(0, Math.min(total - width, v)), [total, width]);
  const offset = clamp(off ?? nowX - width * 0.62);
  const centerNow = () => setOff(nowX - width * 0.62);
  const shift = (hours: number) => setOff(clamp(offset + hours * PX));

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, off: offset, moved: 0 };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      drag.current.moved = Math.max(drag.current.moved, Math.abs(ev.clientX - drag.current.x));
      setOff(clamp(drag.current.off - (ev.clientX - drag.current.x)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTimeout(() => { drag.current = null; }, 0); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const pick = (e: TlEvent) => { if ((drag.current?.moved ?? 0) > 5 || !e.region) return; setPicked(e.region); };

  // Two lanes per row so labels close in time do not overlap.
  const laneOf = useMemo(() => {
    const last: Record<string, number> = {};
    const lanes = new Map<string, number>();
    for (const e of events) {
      const row = ['done', 'missed', 'next', 'norecord', 'log'].includes(e.kind) ? 'low' : 'high';
      const x = xOf(e.at);
      const lane = last[`${row}0`] !== undefined && x - last[`${row}0`] < 90 ? (last[`${row}1`] !== undefined && x - last[`${row}1`] < 90 ? 0 : 1) : 0;
      last[`${row}${lane}`] = x;
      lanes.set(e.key, lane);
    }
    return lanes;
  }, [events, xOf]);

  return (
    <section aria-label="Mission timeline" className={`rounded-panel border border-line bg-map px-3.5 ${open ? 'pb-2.5 pt-3' : 'py-1.5'}`}>
      <div className={`flex flex-wrap items-center gap-2.5 ${open ? 'mb-1.5' : ''}`}>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mission-timeline-body"
          className="flex min-h-9 items-center gap-2 rounded-lg text-left hover:text-text">
          <span aria-hidden className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          <span className="text-xs font-bold tracking-[0.12em] text-muted">MISSION TIMELINE</span>
        </button>
        {open ? (
          <span className="text-xs text-muted/80">drag left / right · tap an event</span>
        ) : (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>
              {summary.worst && <span className={STATUS_CLASS[summary.worst].text}>◆ </span>}
              {summary.concerns === 0 ? 'No health concerns' : `${summary.concerns} health ${summary.concerns === 1 ? 'concern' : 'concerns'}`} in the last {BACK_DAYS} days
            </span>
            {summary.forecasts > 0 && <span><span className="text-warn">◇</span> {summary.forecasts} {summary.forecasts === 1 ? 'forecast' : 'forecasts'}</span>}
            {summary.next && <span>Next: {summary.next.label} {new Date(summary.next.at).toISOString().slice(11, 16)}</span>}
          </span>
        )}
        <span className="flex-1" />
        {open ? (
          <>
            <button type="button" onClick={() => shift(-8)} aria-label="Earlier" className="h-9 w-9 rounded-lg border border-line-strong hover:bg-raised">‹</button>
            <button type="button" onClick={centerNow} className="h-9 rounded-lg border border-line-strong px-3 text-xs hover:bg-raised">Now</button>
            <button type="button" onClick={() => shift(8)} aria-label="Later" className="h-9 w-9 rounded-lg border border-line-strong hover:bg-raised">›</button>
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line-strong px-3 text-xs hover:bg-raised">Hide</button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-lg border border-line-strong px-3 text-xs hover:bg-raised">Show timeline</button>
        )}
      </div>
      {open && <div id="mission-timeline-body">
      <div ref={box} onPointerDown={onDown} className="relative cursor-grab select-none overflow-hidden active:cursor-grabbing" style={{ height: H, touchAction: 'pan-y' }}>
        <div className="absolute left-0 top-0" style={{ height: H, width: total, transform: `translateX(${-offset}px)`, transition: drag.current ? 'none' : 'transform .25s' }}>
          <div aria-hidden className="absolute inset-x-0 top-[64px] h-0.5 bg-line" />
          <div aria-hidden className="absolute bottom-[18px] top-0 right-0 bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgb(255_255_255/0.025)_8px_16px)]" style={{ left: nowX }} />
          <span aria-hidden className="absolute top-0.5 text-[10px] tracking-[0.12em] text-line-strong" style={{ left: nowX + 200 }}>FORECAST</span>
          {Array.from({ length: days }, (_, d) => (
            <span key={d} aria-hidden>
              <span className="absolute bottom-[18px] top-0 w-px bg-line" style={{ left: d * DAY_H * PX }} />
              <span className={`absolute bottom-0 whitespace-nowrap text-[11px] ${d === BACK_DAYS ? 'text-text' : 'text-muted'}`} style={{ left: d * DAY_H * PX + 6 }}>
                Day {today - BACK_DAYS + d}{d === BACK_DAYS ? ' · today' : d === BACK_DAYS + 1 ? ' · tomorrow' : ''}
              </span>
            </span>
          ))}
          <div aria-hidden className="absolute bottom-[18px] top-0 w-0.5 bg-info" style={{ left: nowX }} />
          <span aria-hidden className="absolute bottom-0 rounded bg-map px-1 font-mono text-[10px] text-info" style={{ left: nowX + 4 }}>NOW {missionHHMM(now)}</span>
          {events.map((e) => {
            const alertish = !['done', 'missed', 'next', 'norecord', 'log'].includes(e.kind);
            const lane = laneOf.get(e.key) ?? 0;
            const color = e.kind === 'done' ? 'rgb(var(--c-ok))' : e.kind === 'missed' || e.kind === 'forecast' ? 'rgb(var(--c-warn))'
              : e.kind === 'next' || e.kind === 'norecord' ? 'rgb(var(--c-muted))' : e.kind === 'log' ? 'rgb(var(--c-info))'
              : `rgb(var(--c-${STATUS_TOKEN[e.kind as Status]}))`;
            const hollow = e.kind === 'next' || e.kind === 'forecast' || e.kind === 'norecord';
            const state = e.kind === 'done' ? 'done' : e.kind === 'missed' ? 'missed or not done' : e.kind === 'next' ? 'upcoming'
              : e.kind === 'norecord' ? 'no record (offline)' : e.kind === 'log' ? 'logged' : e.kind === 'forecast' ? 'forecast' : statusLabel(e.kind as Status);
            return (
              <button key={e.key} type="button" onClick={() => pick(e)} title={`${e.label}: ${e.detail}`}
                aria-label={`${e.label}, ${state}, ${new Date(e.at).toUTCString().slice(17, 22)} GMT`}
                className={`absolute flex items-start gap-px bg-transparent p-0 text-left ${alertish ? 'flex-col-reverse' : 'flex-col'}`}
                style={{ left: xOf(e.at) - 6, top: alertish ? 4 : 58 + lane * 14 }}>
                <span className="h-3 w-3 shrink-0" style={{
                  borderRadius: alertish ? 2 : 999, transform: alertish ? 'rotate(45deg)' : undefined,
                  background: hollow ? 'rgb(var(--c-map))' : color, border: `2px ${e.kind === 'forecast' ? 'dashed' : 'solid'} ${color}`,
                  boxShadow: e.kind === 'red' ? `0 0 12px ${color}` : undefined,
                }} />
                <span className="font-mono text-[10px] text-muted">{new Date(e.at).toISOString().slice(11, 16)}</span>
                {!(alertish && lane === 1) && (
                  <span className="whitespace-nowrap text-[11px] font-semibold" style={{ color: e.kind === 'done' || e.kind === 'next' || e.kind === 'norecord' ? 'rgb(var(--c-soft))' : color }}>
                    {e.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-3.5 text-[11px] text-muted">
        <span><span className="text-ok">●</span> done</span><span><span className="text-warn">●</span> missed / not done</span>
        <span><span className="text-muted">○</span> upcoming</span><span><span className="text-info">●</span> logged</span>
        <span><span className={STATUS_CLASS.yellow.text}>◆</span> alert</span><span><span className="text-warn">◇</span> forecast</span>
      </div>
      </div>}
    </section>
  );
}
