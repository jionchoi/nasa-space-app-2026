// Status helpers. Numbers always come from thresholds.json (via the API), never from here.
import type { AdviceLevel, Band, RegionId, RegionMeta, Status, ThresholdEntry, Thresholds, VitalsFrame } from '../types/contracts';

export const STATUS_ORDER: Status[] = ['green', 'yellow', 'orange', 'red'];
// Status words are not here: they come from backend/data/labels.json (useStatusLabel in state/AppContext).

type Token = 'ok' | 'watch' | 'warn' | 'alert';
export const STATUS_TOKEN: Record<Status, Token> = { green: 'ok', yellow: 'watch', orange: 'warn', red: 'alert' };

/** Full class names so Tailwind keeps them. `soft` = 10% tint background, `edge` = ~35% tint border,
 *  `top` = the 3px top border of a vital card, `ring` = soft halo around status dots. */
export const STATUS_CLASS: Record<Status, {
  text: string; bg: string; border: string; fill: string; stroke: string; soft: string; ring: string; edge: string; top: string;
}> = {
  green: { text: 'text-ok', bg: 'bg-ok', border: 'border-ok', fill: 'fill-ok', stroke: 'stroke-ok', soft: 'bg-ok/10', ring: 'ring-ok/25', edge: 'border-ok/30', top: 'border-t-ok' },
  yellow: { text: 'text-watch', bg: 'bg-watch', border: 'border-watch', fill: 'fill-watch', stroke: 'stroke-watch', soft: 'bg-watch/10', ring: 'ring-watch/25', edge: 'border-watch/35', top: 'border-t-watch' },
  orange: { text: 'text-warn', bg: 'bg-warn', border: 'border-warn', fill: 'fill-warn', stroke: 'stroke-warn', soft: 'bg-warn/10', ring: 'ring-warn/30', edge: 'border-warn/40', top: 'border-t-warn' },
  red: { text: 'text-alert', bg: 'bg-alert', border: 'border-alert', fill: 'fill-alert', stroke: 'stroke-alert', soft: 'bg-alert/10', ring: 'ring-alert/30', edge: 'border-alert/45', top: 'border-t-alert' },
};

/** Status order for sorting: worst first, then the lowest score. */
export const byUrgency = (a: { status: Status; score: number }, b: { status: Status; score: number }) =>
  STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status) || a.score - b.score;

/** First sentence of a text ("Resting HR up 9 bpm over 7 days (now 72). Unusual." -> the first part). */
export const firstSentence = (text: string) => {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
};

/** Theme token as a CSS color, for chart libraries that need a color string. */
export const tokenColor = (token: Token | 'info' | 'muted' | 'soft' | 'line' | 'line-strong' | 'text' | 'panel' | 'raised') => `rgb(var(--c-${token}))`;

export const worse = (a: Status, b: Status): Status =>
  STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b;

export function entryOf(thresholds: Thresholds | null, metric: string): ThresholdEntry | undefined {
  if (metric === 'red_flags') return undefined; // a table of flags, not a metric
  const entry = thresholds?.[metric];
  return entry && typeof entry === 'object' ? (entry as ThresholdEntry) : undefined;
}

const outside = (value: number, band?: Band | null) =>
  !!band && ((band[0] !== null && value < band[0]) || (band[1] !== null && value > band[1]));

/** Same rule as the backend: below low or above high of a band is at least that status. */
export function judge(value: number, entry?: ThresholdEntry): Status {
  let status: Status = 'green';
  if (!entry) return status;
  if (outside(value, entry.yellow)) status = 'yellow';
  if (outside(value, entry.orange)) status = 'orange';
  if (outside(value, entry.red)) status = 'red';
  return status;
}

/** The limit of a band that is closest to the value (the side the value could cross). */
export function nearestLimit(band: Band | null | undefined, value: number): number | null {
  const limits: number[] = [];
  for (const b of band ?? []) if (b !== null) limits.push(b);
  if (!limits.length) return null;
  return limits.reduce((best, b) => (Math.abs(b - value) < Math.abs(best - value) ? b : best));
}

export const LIVE_VITALS = ['hr', 'hrv_rmssd', 'spo2', 'rr'] as const;
export type LiveVital = (typeof LIVE_VITALS)[number];

export interface LiveStatus {
  vitals: Record<LiveVital, Status>;
  /** Vitals outside thresholds.json "plausible" (a measuring error): shown as "Invalid", never judged. */
  invalid: LiveVital[];
  irregular: boolean;
  signal: Status;
  /** Signal too poor to trust the numbers. */
  poor: boolean;
  /** Vitals (and "irregular") currently in the red range, with a good signal. */
  red: string[];
}

/** True when a value is outside thresholds.json "plausible" for this metric (e.g. heart rate 300, SpO2 104). */
export function implausible(metric: string, value: number | null | undefined, thresholds: Thresholds | null): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const table = thresholds?.plausible as Record<string, unknown> | undefined;
  const band = table?.[metric];
  if (!Array.isArray(band)) return false;
  const [lo, hi] = band as [number | null, number | null];
  return (lo !== null && value < lo) || (hi !== null && value > hi);
}

export function liveStatus(frame: VitalsFrame | undefined, thresholds: Thresholds | null): LiveStatus | null {
  if (!frame) return null;
  const signal = judge(frame.signal_quality, entryOf(thresholds, 'signal_quality'));
  const poor = signal === 'red';
  const invalid = LIVE_VITALS.filter((key) => implausible(key, frame[key], thresholds));
  const vitals = Object.fromEntries(
    LIVE_VITALS.map((key) => [key, invalid.includes(key) ? 'green' : judge(frame[key], entryOf(thresholds, key))]),
  ) as Record<LiveVital, Status>;
  const red: string[] = poor ? [] : LIVE_VITALS.filter((key) => vitals[key] === 'red');
  if (!poor && judge(frame.irregular ? 1 : 0, entryOf(thresholds, 'irregular')) === 'red') red.push('irregular');
  return { vitals, invalid, irregular: frame.irregular, signal, poor, red };
}

/** Live status per region (only regions with live_metrics, and only with a usable signal). */
export function liveRegionStatus(live: LiveStatus | null, regions: RegionMeta[]): Partial<Record<RegionId, Status>> {
  const out: Partial<Record<RegionId, Status>> = {};
  if (!live || live.poor) return out;
  for (const region of regions) {
    if (!region.live_metrics.length) continue;
    out[region.id] = region.live_metrics.reduce<Status>((acc, key) => {
      if (key === 'irregular') return live.red.includes(key) ? 'red' : acc;
      return worse(acc, live.vitals[key as LiveVital] ?? 'green');
    }, 'green');
  }
  return out;
}

const LEVEL_ORDER: AdviceLevel[] = ['self', 'crew', 'surgeon_next', 'surgeon_now'];
/** Live vitals can raise the advice level (never lower it): warning -> next contact, alert -> now. */
export function raiseLevel(level: AdviceLevel, live?: Status): AdviceLevel {
  const fromLive: AdviceLevel = live === 'red' ? 'surgeon_now' : live === 'orange' ? 'surgeon_next' : 'self';
  return LEVEL_ORDER.indexOf(fromLive) > LEVEL_ORDER.indexOf(level) ? fromLive : level;
}
export const maxLevel = (levels: AdviceLevel[]): AdviceLevel =>
  levels.reduce<AdviceLevel>((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a), 'self');

export const fmt = (value: number, digits = 1) => {
  const rounded = Number(value.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
};
export const clock = (iso: string | number | Date) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
