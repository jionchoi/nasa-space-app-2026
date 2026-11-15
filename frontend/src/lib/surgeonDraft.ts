// The Inbox's "✦ Auto-drafted from your data" message to the flight surgeon: a plain rule-based template filled from the
// current state (no AI needed, works offline). Areas at Watch or worse with their worst metric vs the usual value,
// the live vitals, the self-care steps ticked today, the location and the mission day.
import { metricRows } from './metrics';
import { byUrgency, fmt, STATUS_ORDER } from './status';
import type { DailyEntry, Labels, RegionMeta, RegionStatus, Thresholds, VitalsFrame, CabinSummary } from '../types/contracts';

export interface DraftInput {
  name: string;
  day: number | undefined;
  location: string;
  statuses: RegionStatus[];
  regions: RegionMeta[];
  daily: DailyEntry[];
  thresholds: Thresholds | null;
  latest?: VitalsFrame;
  cabin: CabinSummary | null;
  labels: Labels;
  /** Self-care items ticked today, per area. */
  ticked: Record<string, string[]>;
}

export function buildSurgeonDraft(i: DraftInput): string {
  const lines: string[] = [`Day ${i.day ?? '–'}, ${i.location}. ${i.name}. Auto-summary for your review.`];
  const flagged = i.statuses.filter((s) => s.status !== 'green').sort(byUrgency);
  if (!flagged.length) lines.push('• All areas Nominal.');
  for (const s of flagged) {
    const meta = i.regions.find((r) => r.id === s.region);
    const rows = meta ? metricRows(meta, i.daily, i.thresholds, i.latest, i.cabin, s.metric_status) : [];
    const worstRow = [...rows].sort((a, b) => STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status))[0];
    let metric = '';
    if (worstRow && worstRow.value !== null) {
      metric = ` ${worstRow.label} ${fmt(worstRow.value)} ${worstRow.unit}`.trimEnd();
      if (worstRow.baseline !== null) metric += ` (usual ${fmt(worstRow.baseline)})`;
      metric += '.';
    }
    lines.push(`• ${meta?.label ?? s.region}: ${i.labels[s.status]}.${metric} ${s.reason}`.trim());
  }
  if (i.latest) {
    const v = i.latest;
    lines.push(`Vitals now: HR ${fmt(v.hr, 0)} bpm, HRV ${fmt(v.hrv_rmssd, 0)} ms, SpO2 ${fmt(v.spo2, 0)}%, breathing ${fmt(v.rr, 0)}/min`
      + `${v.irregular ? ', rhythm irregular' : ''} (signal ${fmt(v.signal_quality * 100, 0)}%, ${v.source === 'sensor' ? 'finger sensor' : 'replayed recording'}).`);
  }
  const steps = Object.entries(i.ticked).flatMap(([region, items]) => {
    const label = i.regions.find((r) => r.id === region)?.label ?? region;
    return items.map((t) => `${label}: ${t.replace(/^DRAFT:\s*/, '')}`);
  });
  lines.push(steps.length ? `Done so far today: ${steps.join('; ')}.` : 'No self-care steps ticked yet today.');
  lines.push('Please advise.');
  return lines.join('\n');
}
