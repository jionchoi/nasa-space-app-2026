import { describe, it, expect } from 'vitest';
import { bpValue, displayMetric, HOLD_S, METRICS, metricState, metricValue, sourceLabel } from './signalViewModel';
import type { Snapshot, Metric } from '../types/signals';
const metric: Metric = {value:72,unit:'bpm',status:'valid',reason:null,method:'test',measured_start_s:0,measured_end_s:8,window_s:8,valid_window_s:8,computed_at_utc:'2026-11-15T00:00:00Z',valid_until_utc:'2026-11-15T00:00:03Z'};
const snapshot = {stream_status:'running',quality:{status:'usable',reasons:[]},metrics:{pulse_rate_bpm:metric}} as unknown as Snapshot;
const now = Date.parse('2026-11-15T00:00:01Z');
describe('measured signal display',()=>{
  it('shows only a valid current metric',()=>expect(metricValue(snapshot,metric,now,true)).toBe(72));
  it.each(['warming_up','poor_quality','gap','insufficient_beats','unsupported_channel'])('never displays %s',status=>expect(metricValue(snapshot,{...metric,status},now,true)).toBeNull());
  it('clears stale, disconnected and expired values',()=>{
    expect(metricValue({...snapshot,stream_status:'stale'},metric,now,true)).toBeNull();
    expect(metricValue(snapshot,metric,now,false)).toBeNull();
    expect(metricValue(snapshot,metric,now+3000,true)).toBeNull();
  });
  it('never coerces missing or nonfinite values to zero',()=>{
    expect(metricValue(snapshot,{...metric,value:null},now,true)).toBeNull();
    expect(metricValue(snapshot,{...metric,value:NaN},now,true)).toBeNull();
    expect(metricValue(snapshot,{...metric,valid_until_utc:'invalid'},now,true)).toBeNull();
  });
  it('distinguishes availability from clinical assessment',()=>{
    expect(metricState(snapshot,'pulse_rate_bpm',now,true)).toBe('Available · not assessed');
    expect(metricState(snapshot,'respiration_rate',now,true)).toBe('Not supported');
    expect(metricState(snapshot,'pulse_rate_bpm',now,false)).toBe('Disconnected');
  });
  it('never presents disabled or expired BP',()=>{
    const bp={systolic_mmHg:120,diastolic_mmHg:80,status:'research_unvalidated',reason:null,method:'test',assessment_enabled:false as const,valid_until_utc:metric.valid_until_utc};
    expect(bpValue(bp,now,true)).toBe('120 / 80');
    expect(bpValue({...bp,status:'unavailable'},now,true)).toBeNull();
    expect(bpValue(bp,now+4000,true)).toBeNull();
    expect(bpValue(bp,now,false)).toBeNull();
  });
});

describe('Nov 15 fixes: hold, invalid, cards, labels', () => {
  const at = (s: number) => new Date(Date.parse('2026-11-15T00:00:00Z') + s * 1000).toISOString();
  const snap = (s: number, status: string, value: number | null, stream = 'running') => ({
    stream_status: stream, observed_at_utc: at(s), quality: { status: status === 'valid' ? 'usable' : 'unusable', reasons: [] },
    metrics: { pulse_rate_bpm: { ...metric, status, value, valid_until_utc: at(s + 3) } },
  }) as unknown as Snapshot;
  const t = (s: number) => Date.parse(at(s));

  it('a short gap or poor signal keeps the last value greyed with "signal weak"', () => {
    const list = [snap(0, 'valid', 72), snap(1, 'poor_quality', null)];
    expect(displayMetric(list, list[1], 'pulse_rate_bpm', t(5), true)).toEqual({ value: 72, held: true, state: 'signal weak' });
  });

  it('...for at most 10 s, then blanks it', () => {
    const list = [snap(0, 'valid', 72), snap(1, 'gap', null), snap(11, 'warming_up', null)];
    expect(HOLD_S).toBe(10);
    expect(displayMetric(list, list[2], 'pulse_rate_bpm', t(10), true).held).toBe(true);
    expect(displayMetric(list, list[2], 'pulse_rate_bpm', t(11), true)).toMatchObject({ value: null, held: false });
  });

  it('a current valid value is shown as is; an ended session holds nothing', () => {
    expect(displayMetric([snap(0, 'valid', 70)], snap(0, 'valid', 70), 'pulse_rate_bpm', t(1), true)).toMatchObject({ value: 70, held: false });
    const list = [snap(0, 'valid', 72), snap(1, 'ended', null, 'ended')];
    expect(displayMetric(list, list[1], 'pulse_rate_bpm', t(2), true).value).toBeNull();
  });

  it('out of range is "Invalid", never a number, and never covered by an older value', () => {
    const list = [snap(0, 'valid', 72), snap(1, 'out_of_range', null)];
    expect(displayMetric(list, list[1], 'pulse_rate_bpm', t(2), true)).toEqual({ value: null, held: false, state: 'Invalid' });
    expect(metricState(list[1], 'pulse_rate_bpm', t(2), true)).toBe('Invalid');
  });

  it('no breathing-rate card outside Demo mode', () => {
    expect(METRICS.map((m) => m.key)).not.toContain('respiration_rate');
  });

  it('readable source labels', () => {
    expect(sourceLabel('public_replay')).toBe('Replay · PhysioNet BIDMC');
    expect(sourceLabel('synthetic')).toMatch(/synthetic/i);
    expect(sourceLabel('synthetic')).not.toBe('synthetic');
    expect(sourceLabel('live')).toBe('Live sensor');
  });
});
