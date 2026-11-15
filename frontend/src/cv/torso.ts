// Body-relative coordinates. In microgravity "up" and "down" in the camera picture mean nothing: the crew member
// can float sideways or upside down in front of the camera. So every body point is expressed relative to the
// TORSO instead of the picture:
//   origin  = the point between the shoulders
//   x axis  = along the shoulders (from the left shoulder to the right shoulder)
//   y axis  = at right angles to the shoulders, pointing toward the hips (or away from the nose when the hips
//             are out of view)
//   unit    = one shoulder width
// The same pose then gives the same numbers whatever the camera rotation, distance or position.
// PURE functions: no DOM, no React, no clock.
import type { Landmark, Vec } from './types';

// MediaPipe Pose numbers its 33 body points. These are the ones we use.
export const NOSE = 0;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13;
export const RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;

/** The torso's own coordinate system in the picture. */
export interface Torso {
  /** Point between the shoulders (image units). */
  origin: Vec;
  /** Unit direction along the shoulders. */
  xAxis: Vec;
  /** Unit direction toward the hips, at right angles to xAxis. */
  yAxis: Vec;
  /** Shoulder width in image units: the ruler. */
  scale: number;
  /** Angle of the shoulder line in the picture (radians), to measure rotation. */
  angle: number;
}

/** a - b */
export const minus = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
/** Dot product: how far `a` points along `b`. */
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
/** Length of a vector. */
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
/** The point halfway between two points. */
export const midpoint = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Straight-line distance in the picture (x and y only; MediaPipe's depth z is too noisy for this). */
export const distance = (a: Vec, b: Vec): number => length(minus(a, b));
/** Keeps a number between 0 and 1. */
export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Angle between two directions, in degrees (0-180). */
export function angleDeg(a: Vec, b: Vec): number {
  // Both directions need a length; a zero-length direction has no angle.
  const lengths = length(a) * length(b);
  if (lengths === 0) return 0;
  // Clamp against rounding just outside -1..1.
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / lengths))) * 180) / Math.PI;
}

/** True when the point exists and MediaPipe is confident enough that it is visible. */
export function visible(point: Landmark | undefined, minVisibility: number): point is Landmark {
  return !!point && (point.visibility === undefined || point.visibility >= minVisibility);
}

/** Works out the torso's coordinate system, or null when the shoulders (and both hips and nose) are not visible. */
export function torsoFrame(pose: Landmark[], minVisibility: number): Torso | null {
  const left = pose[LEFT_SHOULDER];
  const right = pose[RIGHT_SHOULDER];
  // Without both shoulders there is no ruler and no x axis.
  if (!visible(left, minVisibility) || !visible(right, minVisibility)) return null;
  const scale = distance(left, right);
  if (scale <= 0) return null;
  const origin = midpoint(left, right);
  // x axis: from the left shoulder to the right shoulder, length 1.
  const xAxis = { x: (right.x - left.x) / scale, y: (right.y - left.y) / scale };

  // Which way is "toward the hips"? Use the hips if both are visible, otherwise "away from the nose".
  const hipsVisible = visible(pose[LEFT_HIP], minVisibility) && visible(pose[RIGHT_HIP], minVisibility);
  let toward: Vec;
  if (hipsVisible) toward = minus(midpoint(pose[LEFT_HIP], pose[RIGHT_HIP]), origin);
  else if (visible(pose[NOSE], minVisibility)) toward = minus(origin, pose[NOSE]);
  else return null;

  // y axis: at right angles to the shoulders, on the side of the hips. (Exactly at right angles, so the two
  // axes form a proper grid even if the hips are a little off-centre.)
  const perpendicular = { x: -xAxis.y, y: xAxis.x };
  const yAxis = dot(perpendicular, toward) >= 0 ? perpendicular : { x: -perpendicular.x, y: -perpendicular.y };
  return { origin, xAxis, yAxis, scale, angle: Math.atan2(xAxis.y, xAxis.x) };
}

/** A picture point in torso coordinates (shoulder widths; y grows toward the hips, so the head side is negative). */
export function toTorso(point: Vec, torso: Torso): Vec {
  const offset = minus(point, torso.origin);
  return { x: dot(offset, torso.xAxis) / torso.scale, y: dot(offset, torso.yAxis) / torso.scale };
}
