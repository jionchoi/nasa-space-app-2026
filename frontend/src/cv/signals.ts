// Turns camera frames into the numbers the detector decides on. Every camera value is BODY-RELATIVE (torso.ts),
// because in microgravity an unconscious crew member does not slump or fall: they float, and the whole body may
// drift or turn slowly. So "the body moved in the picture" says nothing about being awake; "the hands moved
// relative to the torso" does.
// PURE functions: same input, same output, no DOM, no React, no clock.
import { nbpScore } from './posture';
import {
  clamp01, distance, LEFT_ELBOW, LEFT_HIP, LEFT_WRIST, midpoint, NOSE, RIGHT_ELBOW, RIGHT_HIP, RIGHT_WRIST, toTorso,
  torsoFrame, visible, LEFT_SHOULDER, RIGHT_SHOULDER,
} from './torso';
import type { CvThresholds, Frame, Landmark, Signals } from './types';

// The points whose movement relative to the torso means "the hands are doing something".
const LIMB_POINTS = [LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST];

/** Only the frames from the last `windowS` seconds, counted back from the newest frame. */
export function lastSeconds(frames: Frame[], windowS: number): Frame[] {
  if (frames.length === 0) return [];
  const from = frames[frames.length - 1].t - windowS;
  return frames.filter((frame) => frame.t >= from);
}

/**
 * Pairs of frames about `stepS` seconds apart (each frame with the newest frame at least stepS older).
 * Comparing positions half a second apart instead of 0.1 s apart keeps camera jitter from looking like movement.
 */
function pairsApart(frames: Frame[], stepS: number): [Frame, Frame][] {
  const pairs: [Frame, Frame][] = [];
  let j = 0;
  for (let i = 0; i < frames.length; i++) {
    // Move j forward while the next frame is still at least stepS older than frame i.
    while (j + 1 < i && frames[i].t - frames[j + 1].t >= stepS) j++;
    if (j < i && frames[i].t - frames[j].t >= stepS) pairs.push([frames[j], frames[i]]);
  }
  return pairs;
}

/**
 * Speed (sw/s) of the elbows and wrists relative to the torso, comparing frames `stepS` seconds apart: for each
 * pair the FASTEST limb point counts (typing moves the wrists while the elbows stay put), then the average over pairs.
 */
function limbSpeed(frames: Frame[], stepS: number, t: CvThresholds): number {
  const speeds: number[] = [];
  for (const [before, after] of pairsApart(frames, stepS)) {
    if (!before.pose || !after.pose) continue;
    // Each frame's own torso coordinate system.
    const torsoA = torsoFrame(before.pose, t.landmark_visibility);
    const torsoB = torsoFrame(after.pose, t.landmark_visibility);
    if (!torsoA || !torsoB) continue;
    let fastest = -1;
    for (const point of LIMB_POINTS) {
      // Only points visible in both frames.
      if (!visible(before.pose[point], t.landmark_visibility) || !visible(after.pose[point], t.landmark_visibility)) continue;
      // How far the point moved in torso coordinates, per second.
      const moved = distance(toTorso(before.pose[point], torsoA), toTorso(after.pose[point], torsoB));
      fastest = Math.max(fastest, moved / (after.t - before.t));
    }
    if (fastest >= 0) speeds.push(fastest);
  }
  return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
}

/**
 * Limb motion (sw/s): how fast the elbows and wrists move RELATIVE TO THE TORSO, averaged over the window.
 * Each frame is first turned into its own torso coordinates, so a body that drifts or rotates as a whole
 * with still arms gives ~0, while typing or reaching gives clearly more.
 * Two comparison gaps (motion_step_s and 1.5 x that) are used and the larger result kept: a hand tapping
 * exactly once per gap would otherwise be back in the same place each time and look still.
 */
export function limbMotion(frames: Frame[], t: CvThresholds): number {
  const recent = lastSeconds(frames, t.window_s);
  return Math.max(limbSpeed(recent, t.motion_step_s, t), limbSpeed(recent, t.motion_step_s * 1.5, t));
}

/** Straight-line fit y = a + b*x; returns the slope b and the root-mean-square distance from the line. */
function lineFit(xs: number[], ys: number[]): { slope: number; wobble: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  // How far the points sit from the straight line, on average.
  let squares = 0;
  for (let i = 0; i < n; i++) squares += (ys[i] - (my + slope * (xs[i] - mx))) ** 2;
  return { slope, wobble: Math.sqrt(squares / n) };
}

/**
 * Body drift: how the TORSO moves in the picture over the window. A straight line is fitted through its
 * position (in shoulder widths) and its rotation (radians) over time. The slope is the drift speed; how far
 * the points wobble around the line says whether the drift is smooth (a floating body) or jerky (someone moving).
 */
export function bodyDrift(frames: Frame[], t: CvThresholds): { speed: number; score: number } {
  const ts: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const angles: number[] = [];
  let scaleSum = 0;
  for (const frame of lastSeconds(frames, t.window_s)) {
    const torso = frame.pose ? torsoFrame(frame.pose, t.landmark_visibility) : null;
    if (!torso) continue;
    // Unwrap the angle so a turn past 180 degrees does not jump by a full circle.
    let angle = torso.angle;
    const previous = angles[angles.length - 1];
    if (previous !== undefined) while (angle - previous > Math.PI) angle -= 2 * Math.PI;
    if (previous !== undefined) while (angle - previous < -Math.PI) angle += 2 * Math.PI;
    ts.push(frame.t); xs.push(torso.origin.x); ys.push(torso.origin.y); angles.push(angle); scaleSum += torso.scale;
  }
  // Need a few frames over at least a second to see a drift.
  if (ts.length < 3 || ts[ts.length - 1] - ts[0] < 1) return { speed: 0, score: 0 };
  // Positions in shoulder widths (average ruler over the window).
  const ruler = scaleSum / ts.length;
  const fx = lineFit(ts, xs.map((v) => v / ruler));
  const fy = lineFit(ts, ys.map((v) => v / ruler));
  const fa = lineFit(ts, angles);
  // Speed: translation (sw/s) plus rotation (radians/s).
  const speed = Math.hypot(fx.slope, fy.slope) + Math.abs(fa.slope);
  const wobble = Math.hypot(fx.wobble, fy.wobble) + fa.wobble;
  // Only a slow, smooth drift counts; no drift, a fast push-off or a jerky movement scores 0.
  const slow = speed >= t.drift.min_speed && speed <= t.drift.max_speed;
  return { speed, score: slow ? clamp01(1 - wobble / t.drift.max_wobble) : 0 };
}

/** True when a face is found and both blink scores are above the "closed" score. */
export function eyesClosed(frame: Frame, closedScore: number): boolean {
  if (frame.blinkLeft === null || frame.blinkRight === null) return false;
  return frame.blinkLeft > closedScore && frame.blinkRight > closedScore;
}

/** Running count of how long both eyes have stayed closed (it can be longer than the frame window). */
export function nextEyesClosedSeconds(previousSeconds: number, previous: Frame | null, current: Frame, closedScore: number): number {
  if (!eyesClosed(current, closedScore)) return 0;
  if (!previous || !eyesClosed(previous, closedScore)) return 0;
  return previousSeconds + Math.max(0, current.t - previous.t);
}

/** Running count of how long the eyes have been open WITHOUT a blink (a fixed stare). Closed eyes reset it. */
export function nextSecondsSinceBlink(previousSeconds: number, previous: Frame | null, current: Frame, closedScore: number): number {
  // No face: keep the count where it was (we cannot see a blink).
  if (current.blinkLeft === null || current.blinkRight === null) return previousSeconds;
  // Eyes closed in this frame: a blink (or closed eyes, which the eyes signal covers).
  if (eyesClosed(current, closedScore)) return 0;
  return previousSeconds + (previous ? Math.max(0, current.t - previous.t) : 0);
}

/** A blink starts in this frame: eyes closed now, open in the previous frame. */
export function blinkStarted(previous: Frame | null, current: Frame, closedScore: number): boolean {
  return !!previous && previous.blinkLeft !== null && !eyesClosed(previous, closedScore) && eyesClosed(current, closedScore);
}

/** Blinks in the last 60 s from a list of blink times, or null until there is a minute of data. */
export function blinksPerMinute(blinkTimes: number[], now: number, watchedSince: number): number | null {
  if (now - watchedSince < 60) return null;
  return blinkTimes.filter((t) => t >= now - 60).length;
}

/** Someone is at the module only when the camera finds both a body and a face. */
export function isPresent(frame: Frame | undefined): boolean {
  return !!frame && frame.pose !== null && frame.blinkLeft !== null;
}

// ---------------------------------------------------------------------------------------------------------
// MOON BASE ONLY. With 1/6 g people can still fall there, and the camera is mounted upright, so this signal
// (and only this one) uses the picture's "down". It is switched off in microgravity (ISS, Mars transit).
// ---------------------------------------------------------------------------------------------------------

/** Average speed of the head, shoulders and wrists in the picture (sw/s): "the body lies still" after a fall. */
function imageMotion(frames: Frame[]): number {
  const points = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST];
  const speeds: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].pose;
    const b = frames[i].pose;
    const seconds = frames[i].t - frames[i - 1].t;
    if (!a || !b || seconds <= 0) continue;
    const ruler = distance(b[LEFT_SHOULDER], b[RIGHT_SHOULDER]);
    if (ruler <= 0) continue;
    const moved = points.reduce((sum, p) => sum + distance(a[p], b[p]), 0) / points.length;
    speeds.push(moved / seconds / ruler);
  }
  return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
}

/** Height of the middle of the hips in the picture (bigger y = lower down; Moon base camera mounted upright). */
const hipY = (pose: Landmark[]) => midpoint(pose[LEFT_HIP], pose[RIGHT_HIP]).y;

/** Moon base fall: the hips moved down faster than hip_drop_speed (sw/s), then the body stayed still for still_after_s. */
export function fallDetected(frames: Frame[], fall: NonNullable<CvThresholds['fall']>): boolean {
  const withBody = frames.filter((frame) => frame.pose);
  // The newest pair of frames where the hips dropped fast; `landed` is the frame after the drop.
  let landed = -1;
  for (let i = withBody.length - 1; i >= 1 && landed < 0; i--) {
    const a = withBody[i - 1].pose!;
    const b = withBody[i].pose!;
    const seconds = withBody[i].t - withBody[i - 1].t;
    const ruler = distance(b[LEFT_SHOULDER], b[RIGHT_SHOULDER]);
    const speed = seconds > 0 && ruler > 0 ? (hipY(b) - hipY(a)) / seconds / ruler : 0;
    if (speed >= fall.hip_drop_speed) landed = i;
  }
  if (landed < 0) return false;
  const afterLanding = withBody.slice(landed);
  const stillFor = afterLanding[afterLanding.length - 1].t - afterLanding[0].t;
  return stillFor >= fall.still_after_s && imageMotion(afterLanding) <= fall.still_motion;
}

// ---------------------------------------------------------------------------------------------------------

/** Everything the signals need besides the frames. */
export interface SignalInputs {
  /** Recent frames, oldest first (the hook keeps the last window_s seconds). */
  frames: Frame[];
  /** This person's working-posture score from calibration (posture.ts). */
  baseline: number | null;
  /** Running counters kept by the hook (they can run longer than the frame window). */
  eyesClosedSeconds: number;
  secondsSinceBlink: number;
  blinksPerMinute: number | null;
  /** From the PPG: unusually clean signal for a long time (hand not moving). */
  stillHand: boolean;
  thresholds: CvThresholds;
  /** True only in environments listed in thresholds.json cv.fall.environments (Moon base). */
  fallEnabled: boolean;
}

/** Works out all the signals for the newest frame, and the combined unresponsive score. */
export function computeSignals(input: SignalInputs): Signals {
  const { frames, baseline, thresholds: t } = input;
  const newest = frames[frames.length - 1];
  const limbs = limbMotion(frames, t);
  const drift = bodyDrift(frames, t);
  const nbp = nbpScore(frames, baseline, t.nbp, t.landmark_visibility);
  // The six parts of the score, each 0-1.
  const parts = {
    // Hands doing nothing: 1 at or below limb_motion_low, then smaller the more they move.
    limb_stillness: limbs <= 0 ? 1 : Math.min(1, t.limb_motion_low / limbs),
    nbp,
    // Closed eyes count fully after window_s seconds (a 0.1 s blink hardly counts).
    eyes: clamp01(input.eyesClosedSeconds / t.window_s),
    drift: drift.score,
    // A long stare without blinking: lower weight, because blinks can be missed at 10 frames a second.
    stare: clamp01(input.secondsSinceBlink / t.stare_after_s),
    still_hand: input.stillHand ? 1 : 0,
  };
  const w = t.weights;
  const score = w.limb_stillness * parts.limb_stillness + w.nbp * parts.nbp + w.eyes * parts.eyes
    + w.drift * parts.drift + w.stare * parts.stare + w.still_hand * parts.still_hand;
  return {
    present: isPresent(newest),
    limbMotion: limbs,
    bodyDrift: drift.speed,
    driftScore: drift.score,
    nbpScore: nbp,
    eyesClosedSeconds: input.eyesClosedSeconds,
    secondsSinceBlink: input.secondsSinceBlink,
    blinksPerMinute: input.blinksPerMinute,
    stillHand: parts.still_hand,
    unresponsiveScore: clamp01(score),
    fallDetected: input.fallEnabled && !!t.fall && fallDetected(frames, t.fall),
  };
}
