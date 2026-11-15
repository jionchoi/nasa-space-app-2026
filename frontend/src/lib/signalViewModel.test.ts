import { describe, it, expect } from 'vitest';
import { metricValue, metricState, bpValue } from './signalViewModel';
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
