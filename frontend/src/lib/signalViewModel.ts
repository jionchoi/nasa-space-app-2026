import type { Metric, ResearchBP, Snapshot, SignalSource } from '../types/signals';
// Cards shown outside Demo mode. No breathing-rate card: the pipeline does not compute it (no "Not supported" card).
export const METRICS = [
  { key: 'pulse_rate_bpm', label: 'Pulse rate', unit: 'bpm' },
  { key: 'ppg_rmssd_ms', label: 'PPG RMSSD · PRV', unit: 'ms' },
  { key: 'spo2_pct', label: 'Blood oxygen', unit: '%' },
];

/** Plain words for where a signal session's data comes from. */
export const SOURCE_LABEL: Record<SignalSource, string> = {
  public_replay: 'Replay · PhysioNet BIDMC',
  synthetic: 'Synthetic test waveform · simulated',
  recorded_live: 'Replay · recorded sensor session',
  live: 'Live sensor',
};
export const sourceLabel = (source: string | null | undefined): string =>
  (source && SOURCE_LABEL[source as SignalSource]) || source || 'No signal';

/** After a short gap or poor signal, keep the last value greyed ("signal weak") for up to this long, then blank it. */
export const HOLD_S = 10;
export function metricValue(s: Snapshot | null | undefined, metric: Metric | undefined, now = Date.now(), connected = true): number | null {
  if (!connected || s?.stream_status !== 'running' || s.quality.status !== 'usable' || metric?.status !== 'valid') return null;
  if (!Number.isFinite(metric.value) || Date.parse(metric.valid_until_utc) <= now || !Number.isFinite(Date.parse(metric.valid_until_utc))) return null;
  return metric.value;
}
export function metricState(s: Snapshot | null | undefined, key: string, now: number, connected: boolean) {
  const m = s?.metrics[key];
  if (!connected) return 'Disconnected';
  if (!s) return 'Waiting for data';
  if (s.stream_status !== 'running') return s.stream_status;
  if (!m) return 'Not supported';
  if (m.status === 'out_of_range') return 'Invalid';
  if (metricValue(s, m, now, connected) !== null) return 'Available · not assessed';
  if (m.status === 'valid') return 'Expired';
  return m.status.replace(/_/g, ' ');
}
export function bpValue(bp: ResearchBP | undefined, now: number, connected: boolean) {
  if (!connected || bp?.status !== 'research_unvalidated' || !bp.valid_until_utc || !Number.isFinite(Date.parse(bp.valid_until_utc)) || Date.parse(bp.valid_until_utc) <= now) return null;
  if (!Number.isFinite(bp.systolic_mmHg) || !Number.isFinite(bp.diastolic_mmHg)) return null;
  return `${bp.systolic_mmHg!.toFixed(0)} / ${bp.diastolic_mmHg!.toFixed(0)}`;
}

export interface DisplayedMetric { value: number | null; held: boolean; state: string }

/** What a card shows: the current valid value; or, after a short gap / poor signal, the last valid value from the
 *  last HOLD_S seconds, greyed with "signal weak"; otherwise no number. An out-of-range reading is "Invalid" and is
 *  never covered by an older value; an ended or failed session holds nothing. */
export function displayMetric(snapshots: Snapshot[], latest: Snapshot | null | undefined, key: string, now: number,
  connected: boolean): DisplayedMetric {
  const state = metricState(latest, key, now, connected);
  const current = metricValue(latest, latest?.metrics[key], now, connected);
  if (current !== null) return { value: current, held: false, state };
  if (latest?.metrics[key]?.status === 'out_of_range') return { value: null, held: false, state: 'Invalid' };
  if (latest && ['ended', 'error'].includes(latest.stream_status)) return { value: null, held: false, state };
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const m = snapshots[i].metrics[key];
    if (m?.status !== 'valid' || typeof m.value !== 'number' || !Number.isFinite(m.value)) continue;
    const age = (now - Date.parse(snapshots[i].observed_at_utc)) / 1000;
    return age <= HOLD_S ? { value: m.value, held: true, state: 'signal weak' } : { value: null, held: false, state };
  }
  return { value: null, held: false, state };
}
