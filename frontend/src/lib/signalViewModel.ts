import type { Metric, ResearchBP, Snapshot } from '../types/signals';
export const METRICS = [
  { key: 'pulse_rate_bpm', label: 'Pulse rate', unit: 'bpm' },
  { key: 'ppg_rmssd_ms', label: 'PPG RMSSD · PRV', unit: 'ms' },
  { key: 'spo2_pct', label: 'Blood oxygen', unit: '%' },
  { key: 'respiration_rate', label: 'Breathing rate', unit: '/min' },
];
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
  if (metricValue(s, m, now, connected) !== null) return 'Available · not assessed';
  if (m.status === 'valid') return 'Expired';
  return m.status.replace(/_/g, ' ');
}
export function bpValue(bp: ResearchBP | undefined, now: number, connected: boolean) {
  if (!connected || bp?.status !== 'research_unvalidated' || !bp.valid_until_utc || !Number.isFinite(Date.parse(bp.valid_until_utc)) || Date.parse(bp.valid_until_utc) <= now) return null;
  if (!Number.isFinite(bp.systolic_mmHg) || !Number.isFinite(bp.diastolic_mmHg)) return null;
  return `${bp.systolic_mmHg!.toFixed(0)} / ${bp.diastolic_mmHg!.toFixed(0)}`;
}
