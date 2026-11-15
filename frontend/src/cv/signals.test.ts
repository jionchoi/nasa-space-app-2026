// Tests for the body-relative camera signals (torso.ts, posture.ts, signals.ts) with fake landmarks. Run: npm test
import { describe, expect, it } from 'vitest';
import { baselinePosture, nbpScore } from './posture';
import {
  blinkStarted, bodyDrift, computeSignals, fallDetected, isPresent, limbMotion, nextEyesClosedSeconds, nextSecondsSinceBlink,
} from './signals';
import { isSleepTime } from './sleep';
import { FILE_THRESHOLDS, makeBody, makeFrame, type BodyOptions } from './testFrames';
import { toTorso, torsoFrame } from './torso';
import type { Frame } from './types';

const t = FILE_THRESHOLDS;
// 10 frames per second, like the hook.
const STEP = 0.1;

/** `count` frames 0.1 s apart, the body for frame i built by `body(i)`. */
function framesOf(count: number, body: (i: number) => BodyOptions, eyes: 'open' | 'closed' | 'none' = 'open'): Frame[] {
  return Array.from({ length: count }, (_, i) => makeFrame(i * STEP, makeBody(body(i)), eyes));
}
/** The working-posture baseline from 5 s of typing, as calibration would record it. */
const typingBaseline = baselinePosture(framesOf(50, () => ({ arms: 'typing' })), t.nbp, t.landmark_visibility);

describe('torso coordinates', () => {
  it.each([0, 90, 180, 37])('give the same numbers at %i degrees of camera rotation, any size and position', (rotationDeg) => {
    const pose = makeBody({ arms: 'nbp', rotationDeg, size: 0.15, cx: 0.3, cy: 0.6 });
    const torso = torsoFrame(pose, t.landmark_visibility)!;
    // The left wrist of the NBP arm sits at (-1.27, 0.07) shoulder widths in torso coordinates.
    expect(toTorso(pose[15], torso).x).toBeCloseTo(-1.27);
    expect(toTorso(pose[15], torso).y).toBeCloseTo(0.07);
  });
});

describe('neutral body posture score', () => {
  it.each([0, 90, 180])('is high for arms floating up, whatever the camera rotation (%i degrees)', (rotationDeg) => {
    const frames = framesOf(40, () => ({ arms: 'nbp', rotationDeg }));
    expect(nbpScore(frames, typingBaseline, t.nbp, t.landmark_visibility)).toBeGreaterThan(0.9);
  });

  it('is the same at 0, 90 and 180 degrees', () => {
    const at = (rotationDeg: number) => nbpScore(framesOf(40, () => ({ arms: 'nbp', rotationDeg })), typingBaseline, t.nbp, t.landmark_visibility);
    expect(at(90)).toBeCloseTo(at(0));
    expect(at(180)).toBeCloseTo(at(0));
  });

  it('is ~0 for the normal working posture and for arms hanging down', () => {
    expect(nbpScore(framesOf(40, () => ({ arms: 'typing' })), typingBaseline, t.nbp, t.landmark_visibility)).toBeCloseTo(0);
    expect(nbpScore(framesOf(40, () => ({ arms: 'down' })), typingBaseline, t.nbp, t.landmark_visibility)).toBe(0);
  });
});

describe('limb motion (relative to the torso)', () => {
  it('is clear when typing, irregularly or in an even rhythm', () => {
    // Hands moving up to 0.15 shoulder widths, irregularly.
    const irregular = framesOf(60, (i) => ({ arms: 'typing', wristShift: 0.15 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) }));
    // Above the "hands still" limit: the hands count as busy.
    expect(limbMotion(irregular, t)).toBeGreaterThan(t.limb_motion_low);
    // An even rhythm that repeats exactly every motion_step_s (would look still with only one comparison gap).
    const rhythm = framesOf(60, (i) => ({ arms: 'typing', wristShift: [0, 0.15, 0.05, 0.12, 0][i % 5] }));
    expect(limbMotion(rhythm, t)).toBeGreaterThan(t.limb_motion_low);
  });

  it('is ~0 when the whole body drifts and turns with still arms', () => {
    // Drifting 0.1 sw/s sideways and turning 3 degrees per second: big movement in the picture, none relative to the torso.
    const frames = framesOf(60, (i) => ({ arms: 'nbp', cx: 0.4 + i * STEP * 0.1 * 0.2, rotationDeg: i * STEP * 3 }));
    expect(limbMotion(frames, t)).toBeLessThan(t.limb_motion_low);
  });
});

describe('body drift', () => {
  it('scores a slow, smooth drift', () => {
    const frames = framesOf(60, (i) => ({ arms: 'nbp', cx: 0.4 + i * STEP * 0.1 * 0.2, rotationDeg: i * STEP * 2 }));
    const drift = bodyDrift(frames, t);
    expect(drift.speed).toBeGreaterThan(t.drift.min_speed);
    expect(drift.score).toBeGreaterThan(0.8);
  });

  it('scores 0 without drift, and 0 for jerky movement', () => {
    expect(bodyDrift(framesOf(60, () => ({ arms: 'typing' })), t).score).toBe(0);
    const jerky = framesOf(60, (i) => ({ arms: 'typing', cx: 0.4 + (i % 2) * 0.06 + i * 0.002 }));
    expect(bodyDrift(jerky, t).score).toBe(0);
  });
});

describe('unresponsive score', () => {
  const base = { baseline: typingBaseline, secondsSinceBlink: 0, blinksPerMinute: null, stillHand: false, thresholds: t, fallEnabled: false };

  it('slow drift with still limbs raises the score; typing does not', () => {
    const drifting = framesOf(60, (i) => ({ arms: 'nbp', cx: 0.4 + i * STEP * 0.02, rotationDeg: i * STEP * 2 }));
    const floatingStill = framesOf(60, () => ({ arms: 'nbp' }));
    const typing = framesOf(60, (i) => ({ arms: 'typing', wristShift: 0.15 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) }));
    const score = (frames: Frame[]) => computeSignals({ ...base, frames, eyesClosedSeconds: 0 }).unresponsiveScore;
    expect(score(drifting)).toBeGreaterThan(score(floatingStill));
    expect(score(typing)).toBeLessThan(0.2);
  });

  it('floating in NBP with still hands and closed eyes reaches the threshold', () => {
    const frames = framesOf(60, () => ({ arms: 'nbp', rotationDeg: 120 }), 'closed');
    const signals = computeSignals({ ...base, frames, eyesClosedSeconds: t.window_s });
    expect(signals.present).toBe(true);
    expect(signals.unresponsiveScore).toBeGreaterThanOrEqual(t.unresponsive_threshold);
  });

  it('marks nobody present without a body or a face', () => {
    expect(isPresent(makeFrame(0, null))).toBe(false);
    expect(isPresent(makeFrame(0, makeBody(), 'none'))).toBe(false);
  });
});

describe('eyes', () => {
  const pose = makeBody();
  /** Runs a frame-by-frame counter over the frames. */
  const run = (frames: Frame[], next: typeof nextEyesClosedSeconds) => {
    let value = 0;
    let previous: Frame | null = null;
    for (const f of frames) { value = next(value, previous, f, t.eyes_closed_score); previous = f; }
    return value;
  };

  it('counts closed eyes and starts again when they open', () => {
    const closed = Array.from({ length: 31 }, (_, i) => makeFrame(i * STEP, pose, 'closed'));
    expect(run(closed, nextEyesClosedSeconds)).toBeCloseTo(3);
    expect(run([...closed, makeFrame(3.1, pose, 'open')], nextEyesClosedSeconds)).toBe(0);
  });

  it('counts a stare (open, no blink) and a blink resets it', () => {
    const open = Array.from({ length: 201 }, (_, i) => makeFrame(i * STEP, pose, 'open'));
    expect(run(open, nextSecondsSinceBlink)).toBeCloseTo(20);
    const blink = makeFrame(20.1, pose, 'closed');
    expect(blinkStarted(open[open.length - 1], blink, t.eyes_closed_score)).toBe(true);
    expect(run([...open, blink], nextSecondsSinceBlink)).toBe(0);
  });
});

describe('fall (gravity only)', () => {
  it('detects a fast hip drop followed by stillness, and ignores sitting down slowly', () => {
    const fall = framesOf(40, (i) => ({ hipDown: Math.min(i, 3) }));
    expect(fallDetected(fall, t.fall!)).toBe(true);
    const slow = framesOf(40, (i) => ({ hipDown: Math.min(i, 10) * 0.05 }));
    expect(fallDetected(slow, t.fall!)).toBe(false);
  });
});

describe('sleep window', () => {
  it('covers late evening and early morning across midnight', () => {
    const sleep = { start: '22:00', end: '06:00' };
    expect(isSleepTime(23 * 60, sleep)).toBe(true);
    expect(isSleepTime(5 * 60 + 59, sleep)).toBe(true);
    expect(isSleepTime(12 * 60, sleep)).toBe(false);
  });
});
