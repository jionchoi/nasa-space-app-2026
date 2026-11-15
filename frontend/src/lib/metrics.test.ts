import mockDailyAll from '../mock/daily.json';
import mockRegionsFile from '../mock/regions.json';
import { describe, expect, it } from 'vitest';
import type { DailyEntry, RegionMeta, RegionStatus, Thresholds } from '../types/contracts';
import { metricRows, usualValue } from './metrics';

// Reaction time inside the PRET percentile bands (watch above 318 ms) but 20 % slower than the personal baseline:
// the backend says Watch (personal 15 % rule), so the list must say Watch too, not recompute green from the bands.
const thresholds = { pvt_median_ms: { label: 'Reaction time (median)', unit: 'ms', yellow: [null, 318.4], orange: [null, 345.8], red: null } } as unknown as Thresholds;
const brain = { id: 'brain_mood', label: 'Brain and mood', metrics: ['pvt_median_ms'], key_metric: 'pvt_median_ms', live_metrics: [], spaceflight_note: '' } as unknown as RegionMeta;
const daily = [...Array.from({ length: 7 }, (_, i) => ({ day: i + 1, pvt_median_ms: 260 })), { day: 8, pvt_median_ms: 312 }] as unknown as DailyEntry[];
const status = { region: 'brain_mood', status: 'yellow', score: 74, trend: [], time_to_act_days: null,
  reason: 'Reaction time 312 ms is 20% slower than your usual 260 ms.', advice_level: 'self',
  metric_status: { pvt_median_ms: 'yellow' } } as RegionStatus;

describe('All metrics list uses the backend per-metric status', () => {
  it('shows Watch for a value inside the bands but 20% slower than baseline, like the region', () => {
    const row = metricRows(brain, daily, thresholds, undefined, null, status.metric_status).find((r) => r.metric === 'pvt_median_ms')!;
    expect(row.value).toBe(312);
    expect(row.value!).toBeLessThan(318.4); // inside the percentile bands
    expect(row.status).toBe('yellow');
    expect(row.status).toBe(status.status);
  });

  it('never judges a daily value in the browser', () => {
    const row = metricRows(brain, [{ day: 1, pvt_median_ms: 999 }] as unknown as DailyEntry[], thresholds, undefined, null, {})[0];
    expect(row.status).toBe('green'); // far above the bands, but the backend gave no status: nothing invented here
  });
});

describe('"your usual" is frozen to the pre-flight baseline (regions.json baseline.first_days)', () => {
  const dailyB = (mockDailyAll as unknown as Record<string, DailyEntry[]>).B;
  const days = (mockRegionsFile as unknown as { baseline: { first_days: number } }).baseline.first_days;

  it('uses the first 14 days', () => {
    expect(days).toBe(14);
    const first = dailyB.slice(0, days).map((d) => d.hr_rest).sort((a, b) => a - b);
    expect(usualValue(dailyB, 'hr_rest', days)).toBe((first[6] + first[7]) / 2);
  });

  it('persona B: today about 72-77 against a usual of about 61-63 (not the drifting 30-day median)', () => {
    const today = dailyB[dailyB.length - 1].hr_rest;
    const usual = usualValue(dailyB, 'hr_rest', days)!;
    expect(today).toBeGreaterThanOrEqual(72);
    expect(today).toBeLessThanOrEqual(77);
    expect(usual).toBeGreaterThanOrEqual(61);
    expect(usual).toBeLessThanOrEqual(63);
  });

  it('later days never move it', () => {
    const more = [...dailyB, ...[31, 32, 33].map((day) => ({ ...dailyB[dailyB.length - 1], day, hr_rest: 95 }))];
    expect(usualValue(more, 'hr_rest', days)).toBe(usualValue(dailyB, 'hr_rest', days));
  });
});
