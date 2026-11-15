// Nov 15: medical lead's thresholds (RULE-01..17) in the browser, the node protocols (CL00-CL13 / CP00-CP07) and the
// symptom rule. Same data as the backend (mocks exported from backend/data).
import { describe, expect, it } from 'vitest';
import mockProtocols from '../mock/protocols.json';
import mockThresholds from '../mock/thresholds.json';
import { resolve, routeOf } from '../components/emergency/routing';
import type { Protocol, SymptomsConfig, Thresholds, VitalsFrame } from '../types/contracts';
import { actNowTrigger, firedRules } from './actNow';
import { baselineWatch, entryOf, judge, liveStatus } from './status';
import { activeSymptoms, redFlagOnly, symptomsConfig } from './symptoms';

const T = mockThresholds as unknown as Thresholds;
const P = mockProtocols as unknown as Record<string, Protocol>;
const frame = (o: Partial<VitalsFrame> = {}): VitalsFrame => ({
  t: '2026-11-15T10:00:00Z', hr: 70, hrv_rmssd: 45, spo2: 98, rr: 14, signal_quality: 0.95, irregular: false, source: 'replay', ...o,
});

describe('band edges (same table as backend tests/test_medsci_rules.py)', () => {
  const cases: [string, number, string][] = [
    ['hr', 120, 'orange'], ['hr', 120.1, 'red'], ['hr', 40, 'orange'], ['hr', 39.9, 'red'], ['hr', 90.1, 'yellow'],
    ['spo2', 95, 'green'], ['spo2', 94.9, 'yellow'], ['spo2', 90, 'orange'], ['spo2', 89.9, 'red'],
    ['temp_c', 36.0, 'orange'], ['temp_c', 38.5, 'red'], ['temp_c', 38.49, 'orange'],
    ['bp_sys', 160, 'orange'], ['bp_sys', 159.9, 'yellow'], ['co2_mmhg', 2.0, 'yellow'], ['co2_mmhg', 1.99, 'green'],
    ['rr', 30.1, 'red'], ['rr', 7.9, 'red'], ['rr', 8, 'green'],
  ];
  it.each(cases)('%s %s -> %s', (metric, value, expected) => {
    expect(judge(value, entryOf(T, metric))).toBe(expected);
  });

  it('requires_symptoms rules reach Act now only with a symptom logged', () => {
    expect(judge(1, entryOf(T, 'irregular'))).toBe('yellow');
    expect(judge(1, entryOf(T, 'irregular'), true)).toBe('red');
    expect(judge(185, entryOf(T, 'bp_sys'))).toBe('orange');
    expect(judge(185, entryOf(T, 'bp_sys'), true)).toBe('red');
  });

  it('no Act now from HRV, the reaction test or exercise alone', () => {
    for (const metric of ['hrv_rmssd', 'pvt_median_ms', 'exercise_min_7d', 'radiation_msv']) {
      for (const v of [0, 1, 1e6]) expect(judge(v, entryOf(T, metric), true)).not.toBe('red');
    }
  });
});

describe('live vitals', () => {
  it('slow drift: live heart rate 75 vs a usual of 62.5 is Watch (more than 10 bpm above, team default)', () => {
    expect(baselineWatch(75, entryOf(T, 'hr'), 62.5)).toBe(true);
    expect(baselineWatch(72, entryOf(T, 'hr'), 62.5)).toBe(false);
    expect(liveStatus(frame({ hr: 75 }), T, { usual: { hr_rest: 62.5 } })?.vitals.hr).toBe('yellow');
    expect(liveStatus(frame({ hr: 75 }), T)?.vitals.hr).toBe('green');
  });

  it('irregular pulse is red only with a red-flag symptom; poor signal never escalates', () => {
    expect(liveStatus(frame({ irregular: true }), T)?.red).toEqual([]);
    expect(liveStatus(frame({ irregular: true }), T, { symptoms: true })?.red).toEqual(['irregular']);
    const poor = liveStatus(frame({ hr: 200, spo2: 70, irregular: true, signal_quality: 0.2 }), T, { symptoms: true });
    expect(poor?.poor).toBe(true);
    expect(poor?.red).toEqual([]);
  });
});

describe('symptoms and the Act now "why" line', () => {
  const cfg = symptomsConfig(T) as SymptomsConfig;

  it('only red-flag symptoms count, for active_minutes', () => {
    expect(redFlagOnly(['headache', 'chest_pain'], cfg)).toEqual(['chest_pain']);
    const at = Date.parse('2026-11-15T10:00:00Z');
    const list = [{ id: 'chest_pain', persona: 'C', at }];
    expect(activeSymptoms(list, 'C', cfg, at + 59 * 60_000)).toEqual(['chest_pain']);
    expect(activeSymptoms(list, 'C', cfg, at + 61 * 60_000)).toEqual([]);
    expect(activeSymptoms(list, 'A', cfg, at)).toEqual([]);
  });

  it('acute event: the why line names RULE-01 + RULE-05 and the logged chest pain', () => {
    expect(firedRules(['irregular', 'hr'], T, ['chest_pain'], cfg)).toBe('RULE-01 + RULE-05 + chest pain or pressure logged');
    const t = actNowTrigger({ alerts: [], redVitals: [], danger: false, pulseLost: false, regions: [], symptoms: ['chest_pain'], symptomsConfig: cfg });
    expect(t?.kind).toBe('symptom');
    expect(t?.region).toBe('heart');
    expect(t?.emergencyUrl).toContain('protocol=chest_pain');
  });
});

describe('node protocols', () => {
  const cl = P.unresponsive;
  const cp = P.chest_pain;
  const at = (p: Protocol, id: string) => p.steps.findIndex((s) => s.id === id);

  it('starts at CL00 and the crew answers CL01, CL03 and CL05 (YES / NO by node ID)', () => {
    expect(cl.steps[0].id).toBe('CL00');
    const step = (id: string) => cl.steps[at(cl, id)];
    expect(resolve(cl, 0, routeOf(step('CL00'), undefined))).toEqual({ kind: 'step', index: at(cl, 'CL01') });
    expect(resolve(cl, at(cl, 'CL01'), routeOf(step('CL01'), 'no'))).toEqual({ kind: 'step', index: at(cl, 'CL03') });
    expect(resolve(cl, at(cl, 'CL03'), routeOf(step('CL03'), 'no'))).toEqual({ kind: 'step', index: at(cl, 'CL05') });
    const cpr = resolve(cl, at(cl, 'CL05'), routeOf(step('CL05'), 'no'));
    expect(cpr).toEqual({ kind: 'step', index: at(cl, 'CL07') });
    expect(cl.steps[at(cl, 'CL07')].cpr).toBe(true);
    expect(routeOf(step('CL01'), undefined)).toBeNull(); // no answer, no route: nothing is pre-answered
  });

  it('end nodes finish; CP01 NO hands over to the collapse protocol at CL00', () => {
    const end = cl.steps[at(cl, 'CL12')];
    expect(routeOf(end, undefined)).toBeNull();
    expect(resolve(cl, at(cl, 'CL12'), null)).toEqual({ kind: 'finished' });
    expect(resolve(cp, at(cp, 'CP01'), routeOf(cp.steps[at(cp, 'CP01')], 'no'))).toEqual({ kind: 'protocol', protocol: 'unresponsive', node: 'CL00' });
  });

  it('every step shows its urgency and its cited sources as REF IDs; no oxygen step', () => {
    for (const p of [cl, cp]) {
      for (const s of p.steps) {
        expect(s.urgency, s.id).toBeTruthy();
        expect(s.refs?.length, s.id).toBeGreaterThan(0);
        expect(s.equipment ?? []).not.toContain('oxygen');
      }
    }
  });
});
