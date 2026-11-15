// Act now pop-up: a lost pulse always triggers it (camera or not) and leads to CPR only through emergency mode's
// red-flag countdown; the area named in the title is the rule that fired first (persona C: HEART, not LUNGS).
import { describe, expect, it } from 'vitest';
import mockProtocols from '../mock/protocols.json';
import mockRegions from '../mock/regions.json';
import mockThresholds from '../mock/thresholds.json';
import type { Alert, Protocol, RegionMeta } from '../types/contracts';
import { actNowTrigger, openRedAlerts } from './actNow';
import { withPulseLost } from './redFlags';

const regions = (mockRegions as unknown as { regions: RegionMeta[] }).regions;
const alert = (id: string, region: Alert['region'], metric: string, t: string, extra: Partial<Alert> = {}): Alert => ({
  id, t, level: 'red', region, metric, message: `${metric} red`, source: 'vitals', acknowledged: false, message_draft_id: null, ...extra,
});
const none = { alerts: [], redVitals: [], danger: false, pulseLost: false, regions };

describe('pulse lost', () => {
  it('opens the Act now pop-up on its own: no alert, no red vital and no camera input needed', () => {
    const t = actNowTrigger({ ...none, pulseLost: true });
    expect(t?.kind).toBe('pulse_lost');
    expect(t?.region).toBe('heart');
  });

  it('"Open emergency mode" goes to "Not responding" answered NO, never straight to CPR', () => {
    const url = actNowTrigger({ ...none, pulseLost: true })!.emergencyUrl;
    expect(url).toContain('protocol=unresponsive');
    expect(url).toContain('preanswer=responsive:no');
    expect(url).not.toContain('goto=cpr');
  });

  it('beats any open alert (the lost pulse names the pop-up)', () => {
    const t = actNowTrigger({ ...none, pulseLost: true, alerts: [alert('l', 'lungs', 'spo2', '2026-11-15T10:00:00Z')] });
    expect(t?.kind).toBe('pulse_lost');
    expect(t?.open).toHaveLength(1); // still acknowledged together
  });

  it('in emergency mode a lost pulse counts as the pulse_lost red flag, which routes to CPR with a countdown', () => {
    const flag = (mockThresholds as { cv: { ppg: { pulse_lost_red_flag: string } } }).cv.ppg.pulse_lost_red_flag;
    expect(withPulseLost([], 'lost', flag)).toEqual([flag]);
    expect(withPulseLost([], 'ok', flag)).toEqual([]);
    expect(withPulseLost([flag], 'lost', flag)).toEqual([flag]);
    const routes = (mockProtocols as unknown as Record<string, Protocol>).unresponsive.red_flag_routes ?? [];
    const route = routes.find((r) => r.flag === flag);
    expect(route?.goto).toBe('cpr');
    expect(route?.countdown_s ?? 5).toBe(5);
  });

  it('waits no_pulse_s = 4 s (thresholds.json)', () => {
    expect((mockThresholds as { cv: { ppg: { no_pulse_s: number } } }).cv.ppg.no_pulse_s).toBe(4);
  });
});

describe('which area the pop-up names', () => {
  it('persona C: heart rate went red first, SpO2 later -> HEART (the alerts list arrives newest first)', () => {
    const alerts = [alert('l', 'lungs', 'spo2', '2026-11-15T10:02:00Z'), alert('h', 'heart', 'hr', '2026-11-15T10:00:00Z')];
    expect(actNowTrigger({ ...none, alerts })?.region).toBe('heart');
  });

  it('alerts raised in the same second: heart rate first', () => {
    const t = '2026-11-15T10:00:00Z';
    expect(openRedAlerts([alert('l', 'lungs', 'spo2', t), alert('h', 'heart', 'hr', t)]).map((a) => a.id)).toEqual(['h', 'l']);
  });

  it('backend off (no alerts): the first red live vital in heart-rate-first order', () => {
    expect(actNowTrigger({ ...none, danger: true, redVitals: ['hr', 'spo2'] })?.region).toBe('heart');
  });

  it('acknowledged, non-red and camera alerts never trigger it', () => {
    const alerts = [alert('a', 'heart', 'hr', '2026-11-15T10:00:00Z', { acknowledged: true }),
      alert('b', 'heart', 'hr', '2026-11-15T10:00:00Z', { level: 'orange' }),
      alert('c', null, 'cv', '2026-11-15T10:00:00Z', { source: 'cv' })];
    expect(actNowTrigger({ ...none, alerts })).toBeNull();
  });
});

describe('emergency red-flag panel', () => {
  it('a lost pulse lights "No pulse" (thresholds.json red_flags.pulse_lost keywords)', async () => {
    const { litByFlags, redFlagDefs } = await import('./redFlags');
    const defs = redFlagDefs(mockThresholds as never);
    const texts = (mockProtocols as unknown as Record<string, Protocol>).unresponsive.red_flags;
    const lit = litByFlags(texts, ['pulse_lost'], defs).map((i) => texts[i]);
    expect(lit).toEqual(['No pulse']);
    expect(litByFlags(texts, [], defs)).toEqual([]);
  });
});
