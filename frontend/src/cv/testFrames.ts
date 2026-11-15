// Helpers for the detection tests: build fake MediaPipe output (and fake vitals) without a camera or sensor.
// Bodies are described in TORSO coordinates (shoulder widths, y toward the hips) and then placed in the picture
// at any position, size and ROTATION, which is how a floating crew member can appear to the camera.
// Only the tests import this file.
import mockThresholds from '../mock/thresholds.json';
import type { Thresholds, VitalsFrame } from '../types/contracts';
import { readCvThresholds } from './thresholds';
import type { CvThresholds, Frame, Landmark, Signals, Vec } from './types';

/** The real numbers from thresholds.json (through the exported mock copy), so tests follow the file. */
export const ALL_THRESHOLDS = mockThresholds as unknown as Thresholds;
export const FILE_THRESHOLDS: CvThresholds = readCvThresholds(ALL_THRESHOLDS)!;

/** Arm shapes, in torso coordinates (left arm; the right arm is the mirror image). */
export type ArmPose = 'typing' | 'nbp' | 'down';
const ARMS: Record<ArmPose, { elbow: Vec; wrist: Vec; wristInFront: number }> = {
  // Working at a keyboard: upper arm along the body, forearm forward, wrist about level with the elbow.
  typing: { elbow: { x: -0.6, y: 0.9 }, wrist: { x: -0.4, y: 0.85 }, wristInFront: 0.05 },
  // Neutral body posture: upper arm raised 45 degrees, elbow bent 90 degrees, wrist floating up near shoulder height.
  nbp: { elbow: { x: -0.92, y: 0.42 }, wrist: { x: -1.27, y: 0.07 }, wristInFront: 0.05 },
  // Arms hanging straight along the body.
  down: { elbow: { x: -0.6, y: 0.9 }, wrist: { x: -0.62, y: 1.7 }, wristInFront: 0 },
};

/** Where and how the fake person appears in the picture, plus things that can move. */
export interface BodyOptions {
  arms?: ArmPose;
  /** Shoulder width in image units (bigger = closer to the camera). */
  size?: number;
  /** Shoulder midpoint in the picture. */
  cx?: number;
  cy?: number;
  /** Rotation of the whole body in the picture (degrees): a floating crew member can be at any angle. */
  rotationDeg?: number;
  /** Shift both wrists along the shoulder line (shoulder widths): typing / reaching. */
  wristShift?: number;
  /** Move the hips toward the feet (shoulder widths): the Moon fall test. */
  hipDown?: number;
}

/** 33 body points for the given arm pose, placed in the picture. Unused points sit at the shoulder midpoint. */
export function makeBody({ arms = 'typing', size = 0.2, cx = 0.5, cy = 0.4, rotationDeg = 0, wristShift = 0, hipDown = 0 }: BodyOptions = {}): Landmark[] {
  const angle = (rotationDeg * Math.PI) / 180;
  // Torso axes in the picture: x along the shoulders, y toward the hips (image y grows downward).
  const xAxis = { x: Math.cos(angle), y: Math.sin(angle) };
  const yAxis = { x: -Math.sin(angle), y: Math.cos(angle) };
  // Torso coordinates -> picture coordinates (depth z only matters relative to other points).
  const place = (local: Vec, z = 0): Landmark => ({
    x: cx + size * (local.x * xAxis.x + local.y * yAxis.x),
    y: cy + size * (local.x * xAxis.y + local.y * yAxis.y),
    z,
  });
  const arm = ARMS[arms];
  const pose: Landmark[] = Array.from({ length: 33 }, () => place({ x: 0, y: 0 }));
  pose[0] = place({ x: 0, y: -0.6 });
  pose[11] = place({ x: -0.5, y: 0 });
  pose[12] = place({ x: 0.5, y: 0 });
  pose[13] = place(arm.elbow);
  pose[14] = place({ x: -arm.elbow.x, y: arm.elbow.y });
  pose[15] = place({ x: arm.wrist.x + wristShift, y: arm.wrist.y }, -arm.wristInFront);
  pose[16] = place({ x: -arm.wrist.x + wristShift, y: arm.wrist.y }, -arm.wristInFront);
  pose[23] = place({ x: -0.25, y: 1.5 + hipDown });
  pose[24] = place({ x: 0.25, y: 1.5 + hipDown });
  return pose;
}

/** One frame: a body (or none) and both eyes open (0.05), closed (0.9) or not found (null). */
export function makeFrame(t: number, pose: Landmark[] | null, eyes: 'open' | 'closed' | 'none' = 'open'): Frame {
  const blink = eyes === 'none' ? null : eyes === 'closed' ? 0.9 : 0.05;
  return { t, pose, blinkLeft: blink, blinkRight: blink };
}

/** Camera signals with "awake and working" defaults; override what a test needs. */
export function makeSignals(overrides: Partial<Signals> = {}): Signals {
  return {
    present: true, limbMotion: 0.3, bodyDrift: 0, driftScore: 0, nbpScore: 0, eyesClosedSeconds: 0, secondsSinceBlink: 2,
    blinksPerMinute: 15, stillHand: 0, unresponsiveScore: 0.1, fallDetected: false, ...overrides,
  };
}

/** A vitals frame `second` seconds into a fake recording, with optional PPG fields. */
export function makeVitals(second: number, fields: Partial<VitalsFrame> = {}): VitalsFrame {
  return {
    t: new Date(Date.UTC(2026, 10, 14, 10, 0, second)).toISOString(), hr: 70, hrv_rmssd: 45, spo2: 98, rr: 14,
    signal_quality: 0.9, irregular: false, source: 'sensor', ...fields,
  };
}
