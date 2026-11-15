// Tests for pulse.ts: pulse lost vs clip off vs still hand, from fake vitals (one frame per second).
import { describe, expect, it } from 'vitest';
import type { VitalsFrame } from '../types/contracts';
import { normalAmplitude, pulseReading, type PulseSample } from './pulse';
import { ALL_THRESHOLDS, FILE_THRESHOLDS, makeVitals } from './testFrames';

const p = FILE_THRESHOLDS.ppg;

/** Samples arriving once a second; `fields(i)` sets frame i. */
function samplesOf(count: number, fields: (i: number) => Partial<VitalsFrame>): PulseSample[] {
  return Array.from({ length: count }, (_, i) => ({ at: i, frame: makeVitals(i, fields(i)) }));
}
/** Reads the status at the last sample, with the normal amplitude learned from the first 20 s. */
function read(samples: PulseSample[]) {
  const reference = normalAmplitude(samples.slice(0, 20));
  return pulseReading(samples, samples[samples.length - 1].at, reference, ALL_THRESHOLDS, FILE_THRESHOLDS);
}
const NORMAL = { pulse_amplitude: 1, beats_detected: 1, ppg_baseline: 0.6, signal_quality: 0.85 };

describe('pulseReading', () => {
  it('a normal pulse is ok', () => {
    expect(read(samplesOf(30, () => NORMAL)).status).toBe('ok');
  });

  it('pulse wave flat with good contact for no_pulse_s -> lost', () => {
    const flatFrom = 30;
    const samples = samplesOf(flatFrom + p.no_pulse_s + 2, (i) => (i < flatFrom ? NORMAL : { ...NORMAL, pulse_amplitude: 0.03 }));
    const reading = read(samples);
    expect(reading.status).toBe('lost');
    expect(reading.amplitudeRatio).toBeLessThan(p.flat_ratio);
  });

  it('no heartbeats with good contact for no_pulse_s -> lost (even without the amplitude field)', () => {
    const samples = samplesOf(40, (i) => ({ beats_detected: i < 30 ? 1 : 0, signal_quality: 0.9 }));
    expect(read(samples).status).toBe('lost');
  });

  it('the heart-rate red flag for a lost pulse also counts (sensors without the new fields)', () => {
    const samples = samplesOf(30, (i) => ({ hr: i < 25 ? 70 : 30, signal_quality: 0.9 }));
    expect(read(samples).status).toBe('lost');
  });

  it('a removed clip (no signal, light level jumps) is "clip_off", not "lost"', () => {
    const samples = samplesOf(40, (i) => (i < 30 ? NORMAL : { pulse_amplitude: 0, beats_detected: 0, ppg_baseline: 0.05, signal_quality: 0.05 }));
    expect(read(samples).status).toBe('clip_off');
  });

  it('a jump of the light level alone also reads as "clip_off"', () => {
    const samples = samplesOf(40, (i) => (i < 30 ? NORMAL : { ...NORMAL, ppg_baseline: 0.1, pulse_amplitude: 0.02 }));
    expect(read(samples).status).toBe('clip_off');
  });

  it('a long, unusually clean signal means the hand is still', () => {
    const clean = samplesOf(p.still_hand_s + 2, () => ({ ...NORMAL, signal_quality: 0.97 }));
    expect(read(clean).stillHand).toBe(true);
    const moving = samplesOf(p.still_hand_s + 2, (i) => ({ ...NORMAL, signal_quality: i % 10 === 0 ? 0.7 : 0.97 }));
    expect(read(moving).stillHand).toBe(false);
  });

  it('no recent vitals -> no_data', () => {
    const samples = samplesOf(10, () => NORMAL);
    expect(pulseReading(samples, 10 + p.stale_after_s + 1, 1, ALL_THRESHOLDS, FILE_THRESHOLDS).status).toBe('no_data');
  });
});

describe('pulse lost after 4 s (thresholds.json cv.ppg.no_pulse_s)', () => {
  it('no beats for 4 s with good contact -> lost; 3 s -> still ok', () => {
    const at = (seconds: number) => samplesOf(30 + seconds + 1, (i) => ({ ...NORMAL, beats_detected: i <= 30 ? 1 : 0 }));
    expect(read(at(4)).status).toBe('lost');
    expect(read(at(3)).status).toBe('ok');
  });
});
