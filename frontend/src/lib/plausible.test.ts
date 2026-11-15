// Range limits (thresholds.json "plausible"): heart rate under 25 or over 220 and SpO2 over 100 are a measuring error:
// shown as "Invalid", never judged, never a red flag or an Act now trigger.
import { describe, expect, it } from 'vitest';
import mockThresholds from '../mock/thresholds.json';
import type { Thresholds } from '../types/contracts';
import { makeVitals } from '../cv/testFrames';
import { activeRedFlags, redFlagDefs } from './redFlags';
import { implausible, liveStatus } from './status';

const th = mockThresholds as unknown as Thresholds;

describe('plausible ranges', () => {
  it('limits come from thresholds.json: HR 25-220, SpO2 at most 100', () => {
    expect(implausible('hr', 24, th)).toBe(true);
    expect(implausible('hr', 25, th)).toBe(false);
    expect(implausible('hr', 220, th)).toBe(false);
    expect(implausible('hr', 221, th)).toBe(true);
    expect(implausible('spo2', 100, th)).toBe(false);
    expect(implausible('spo2', 101, th)).toBe(true);
    expect(implausible('rr', 300, th)).toBe(false); // no limit set for breathing
  });

  it('an implausible vital is "invalid", not red, and never a reason for Act now', () => {
    const live = liveStatus(makeVitals(0, { hr: 300, spo2: 104, signal_quality: 0.95 }), th)!;
    expect(live.invalid).toEqual(['hr', 'spo2']);
    expect(live.vitals.hr).toBe('green');
    expect(live.red).not.toContain('hr');
    expect(live.red).not.toContain('spo2');
  });

  it('an implausible heart rate is never the "pulse lost" red flag', () => {
    const frames = Array.from({ length: 10 }, (_, i) => makeVitals(i, { hr: 5, signal_quality: 0.95 }));
    expect(activeRedFlags(frames, redFlagDefs(th), th)).not.toContain('pulse_lost');
    const slow = Array.from({ length: 10 }, (_, i) => makeVitals(i, { hr: 30, signal_quality: 0.95 }));
    expect(activeRedFlags(slow, redFlagDefs(th), th)).toContain('pulse_lost'); // 30 is plausible: the flag still works
  });
});
