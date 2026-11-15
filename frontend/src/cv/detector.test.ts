// Tests for detector.ts: feed made-up signals and pulse statuses at 10 updates per second and check states and effects.
// The numbers come from thresholds.json, so these tests keep passing if Yenna changes them.
import { describe, expect, it } from 'vitest';
import { UnresponsiveDetector } from './detector';
import { FILE_THRESHOLDS, makeSignals } from './testFrames';
import type { DetectorInput, Effect, Signals, StateName } from './types';

const t = FILE_THRESHOLDS;
const FPS = 10;

// Floating in the neutral posture, hands doing nothing, eyes closed: a high score.
const UNRESPONSIVE = makeSignals({ limbMotion: 0, nbpScore: 1, eyesClosedSeconds: 30, driftScore: 1, unresponsiveScore: 0.95 });
const AWAKE = makeSignals();

/** Runs the detector from second `fromS` up to (not including) `toS` with the given signals and extras. */
function run(detector: UnresponsiveDetector, fromS: number, toS: number, signals: Signals | null, extra: Partial<DetectorInput> = {}) {
  const effects: Effect[] = [];
  const states: StateName[] = [];
  for (let i = Math.round(fromS * FPS); i < Math.round(toS * FPS); i++) {
    const result = detector.update({
      now: i / FPS, signals, pulse: 'ok', isSleepTime: false, vitalsRed: false, paused: false, inEmergency: false, responded: false, ...extra,
    });
    effects.push(...result.effects);
    states.push(result.state.name);
  }
  return { effects, states };
}
const events = (effects: Effect[]) => effects.flatMap((e) => (e.kind === 'postEvent' ? [e.eventType] : []));
const alarm = (effects: Effect[]) => effects.find((e): e is Extract<Effect, { kind: 'alarm' }> => e.kind === 'alarm');
/** A detector that is showing "Are you OK?" at second `t.suspect_after_s + 0.2`. */
function inCheckIn() {
  const detector = new UnresponsiveDetector(t);
  run(detector, 0, t.suspect_after_s + 0.2, UNRESPONSIVE);
  expect(detector.state.name).toBe('CHECK_IN');
  return { detector, at: t.suspect_after_s + 0.2 };
}

describe('UnresponsiveDetector: camera', () => {
  it(`asks "Are you OK?" after ${t.suspect_after_s} s of a high score`, () => {
    const detector = new UnresponsiveDetector(t);
    expect(run(detector, 0, t.suspect_after_s, UNRESPONSIVE).states.every((s) => s === 'MONITORING')).toBe(true);
    const after = run(detector, t.suspect_after_s, t.suspect_after_s + 0.2, UNRESPONSIVE);
    expect(after.states).toEqual(['SUSPECTED', 'CHECK_IN']);
    expect(events(after.effects)).toEqual(['unresponsive_suspected', 'checkin_started']);
  });

  it(`asks after only ${t.suspect_after_s_with_red_vitals} s with PPG red flags`, () => {
    const detector = new UnresponsiveDetector(t);
    expect(run(detector, 0, t.suspect_after_s_with_red_vitals + 0.2, UNRESPONSIVE, { vitalsRed: true }).states.slice(-2)).toEqual(['SUSPECTED', 'CHECK_IN']);
  });

  it('the sleep window still blocks the camera trigger', () => {
    const detector = new UnresponsiveDetector(t);
    const { states, effects } = run(detector, 0, 4 * t.suspect_after_s, UNRESPONSIVE, { isSleepTime: true });
    expect(states.every((s) => s === 'MONITORING')).toBe(true);
    expect(effects).toEqual([]);
  });

  it('never triggers when nobody is at the module, on a paused screen, or with the camera off', () => {
    for (const [signals, extra] of [[{ ...UNRESPONSIVE, present: false }, {}], [UNRESPONSIVE, { paused: true }], [null, {}]] as const) {
      const detector = new UnresponsiveDetector(t);
      expect(run(detector, 0, 4 * t.suspect_after_s, signals, extra).effects).toEqual([]);
    }
  });

  it('a purposeful hand movement during the check-in counts as OK', () => {
    const { detector, at } = inCheckIn();
    const wave = run(detector, at, at + 0.1, makeSignals({ limbMotion: t.limb_motion_spike * 2 }));
    expect(wave.states).toEqual(['COOLDOWN']);
    expect(events(wave.effects)).toEqual(['ok_confirmed']);
  });

  it('body drift alone does NOT count as an answer: no response -> ALARM', () => {
    const { detector, at } = inCheckIn();
    // The body drifts fast in the picture, but the hands do nothing relative to the torso.
    const drifting = { ...UNRESPONSIVE, bodyDrift: 2, limbMotion: 0 };
    const { states, effects } = run(detector, at, at + t.checkin_countdown_s + 0.1, drifting);
    expect(states[states.length - 1]).toBe('ALARM');
    expect(alarm(effects)?.cpr).toBe(false);
  });

  it('a tap, key, voice or "I\'m OK" -> COOLDOWN, then MONITORING after the cooldown', () => {
    const { detector, at } = inCheckIn();
    expect(run(detector, at, at + 0.1, UNRESPONSIVE, { responded: true }).states).toEqual(['COOLDOWN']);
    const quiet = run(detector, at + 0.1, at + t.cooldown_s + 1, UNRESPONSIVE);
    expect(events(quiet.effects)).toEqual(['monitoring_resumed']);
  });

  it('a fall (Moon base) goes straight to SUSPECTED; the demo trigger too', () => {
    expect(run(new UnresponsiveDetector(t), 0, 0.1, makeSignals({ fallDetected: true })).states).toEqual(['SUSPECTED']);
    expect(new UnresponsiveDetector(t).forceSuspected(1).state.name).toBe('SUSPECTED');
  });
});

describe('UnresponsiveDetector: pulse', () => {
  it('pulse lost with the clip on skips the check-in: ALARM with CPR at once', () => {
    const detector = new UnresponsiveDetector(t);
    const { states, effects } = run(detector, 0, 0.1, AWAKE, { pulse: 'lost' });
    expect(states).toEqual(['ALARM']);
    expect(effects.some((e) => e.kind === 'showCheckIn')).toBe(false);
    expect(alarm(effects)?.cpr).toBe(true);
  });

  it('pulse lost works with the camera off and even in sleep hours', () => {
    const detector = new UnresponsiveDetector(t);
    expect(run(detector, 0, 0.1, null, { pulse: 'lost', isSleepTime: true }).states).toEqual(['ALARM']);
  });

  it('pulse lost during a check-in also goes straight to ALARM with CPR', () => {
    const { detector, at } = inCheckIn();
    const { states, effects } = run(detector, at, at + 0.1, UNRESPONSIVE, { pulse: 'lost' });
    expect(states).toEqual(['ALARM']);
    expect(alarm(effects)?.cpr).toBe(true);
  });

  it('a removed clip does not alarm', () => {
    const detector = new UnresponsiveDetector(t);
    expect(run(detector, 0, 60, null, { pulse: 'clip_off' }).effects).toEqual([]);
  });

  it('no second alarm while emergency mode is already open', () => {
    const detector = new UnresponsiveDetector(t);
    expect(run(detector, 0, 5, null, { pulse: 'lost', inEmergency: true }).effects).toEqual([]);
  });
});
