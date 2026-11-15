// Neutral body posture (NBP): the shape a relaxed body takes by itself in microgravity (NASA neutral body
// posture research, NASA-STD-3000 / NASA-STD-3001, NASA TM-2003-104805): arms float up in front to about chest
// or shoulder height with the elbows bent, shoulders raised, knees and hips bent, head tilted slightly forward.
// An unconscious crew member drifts into it; so does a resting or sleeping one, which is why NBP is only one
// part of the score (with the hands doing nothing, the eyes, the sleep schedule, the check-in and the pulse).
// Everything is measured in torso coordinates (torso.ts), so camera rotation does not matter.
// PURE functions.
import {
  angleDeg, clamp01, LEFT_ELBOW, LEFT_SHOULDER, LEFT_WRIST, minus, RIGHT_ELBOW, RIGHT_SHOULDER, RIGHT_WRIST, toTorso,
  torsoFrame, visible, type Torso,
} from './torso';
import type { CvThresholds, Frame, Landmark } from './types';

type Nbp = CvThresholds['nbp'];

// The body points of each arm: shoulder, elbow, wrist.
const ARMS = [
  [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
  [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
] as const;

/** 1 inside [low, high], falling to 0 at `tolerance` degrees outside it. */
function within(value: number, [low, high]: [number, number], tolerance: number): number {
  if (value >= low && value <= high) return 1;
  const outside = value < low ? low - value : value - high;
  return clamp01(1 - outside / tolerance);
}

/** How much one arm looks like the neutral body posture, 0-1, or null when the arm is not visible. */
export function armPostureScore(pose: Landmark[], torso: Torso, arm: 0 | 1, nbp: Nbp, minVisibility: number): number | null {
  const [s, e, w] = ARMS[arm];
  // All three points of the arm must be visible.
  if (!visible(pose[s], minVisibility) || !visible(pose[e], minVisibility) || !visible(pose[w], minVisibility)) return null;
  // The arm in torso coordinates.
  const shoulder = toTorso(pose[s], torso);
  const elbow = toTorso(pose[e], torso);
  const wrist = toTorso(pose[w], torso);

  // 1. Elbow bent about 60-120 degrees (180 = straight arm).
  const elbowBent = within(angleDeg(minus(shoulder, elbow), minus(wrist, elbow)), nbp.elbow_deg, nbp.tolerance_deg);
  // 2. Wrist above the elbow, i.e. on the head side. The torso y axis points to the hips, so "above" = smaller y.
  const wristUp = clamp01((elbow.y - wrist.y) / nbp.wrist_rise);
  // 3. Upper arm raised away from the torso line (0 degrees = hanging along the body toward the hips).
  const armRaised = clamp01(angleDeg(minus(elbow, shoulder), { x: 0, y: 1 }) / nbp.upper_arm_raise_deg);
  // 4. Wrist in front of the elbow (closer to the camera = smaller z). Depth is a rough estimate, so when it
  //    is missing this part counts as "don't know" (0.5).
  const z = pose[e].z !== undefined && pose[w].z !== undefined ? (pose[e].z! - pose[w].z!) / torso.scale : null;
  const inFront = z === null ? 0.5 : clamp01(z / nbp.depth_margin);

  // Each part counts the same.
  return (elbowBent + wristUp + armRaised + inFront) / 4;
}

/** Posture score for one frame: the average of the visible arms, or null when no arm (or no torso) is visible. */
export function postureScore(pose: Landmark[] | null, nbp: Nbp, minVisibility: number): number | null {
  if (!pose) return null;
  const torso = torsoFrame(pose, minVisibility);
  if (!torso) return null;
  const arms = [armPostureScore(pose, torso, 0, nbp, minVisibility), armPostureScore(pose, torso, 1, nbp, minVisibility)]
    .filter((score): score is number => score !== null);
  return arms.length ? arms.reduce((a, b) => a + b, 0) / arms.length : null;
}

/** This person's normal working posture score: the average over the calibration frames (null if never seen). */
export function baselinePosture(frames: Frame[], nbp: Nbp, minVisibility: number): number | null {
  const scores = frames.map((f) => postureScore(f.pose, nbp, minVisibility)).filter((s): s is number => s !== null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

/**
 * NBP score 0-1: the posture held over the last hold_s seconds (average, so passing through the pose for a
 * moment does not count), measured as the step FROM this person's working posture (baseline) TOWARD the
 * full neutral body posture. A crew member whose normal work already looks a bit like NBP is not penalised.
 */
export function nbpScore(frames: Frame[], baseline: number | null, nbp: Nbp, minVisibility: number): number {
  // Frames from the last hold_s seconds.
  const newest = frames[frames.length - 1];
  if (!newest) return 0;
  const recent = frames.filter((f) => f.t >= newest.t - nbp.hold_s);
  const scores = recent.map((f) => postureScore(f.pose, nbp, minVisibility)).filter((s): s is number => s !== null);
  if (!scores.length) return 0;
  const held = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Room between the working posture and full NBP (at least 0.1, so a baseline near 1 does not divide by ~0).
  const start = baseline ?? 0;
  return clamp01((held - start) / Math.max(0.1, 1 - start));
}
