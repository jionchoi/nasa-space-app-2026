// Reads the "cv" block out of thresholds.json and applies the debug panel's temporary overrides.
// PURE functions. The numbers themselves live only in backend/data/thresholds.json (Yenna's file).
import type { Thresholds } from '../types/contracts';
import type { CvThresholds } from './types';

/** The "cv" block from thresholds.json, or null if the file has none (the camera panel then says so). */
export function readCvThresholds(all: Thresholds | null): CvThresholds | null {
  // The whole file may not have loaded yet.
  const block = all?.cv as unknown as CvThresholds | undefined;
  // A quick shape check: without the main timer, the weights, the posture and pulse settings the block is not usable
  // (an old file with the gravity-based keys is rejected too).
  if (!block || typeof block.suspect_after_s !== 'number' || !block.weights || !block.nbp || !block.ppg || !block.drift) return null;
  return block;
}

/** Overrides from the debug panel. Only the top-level numbers can be overridden, plus the six weights. */
export type CvOverrides = Partial<Omit<CvThresholds, 'weights' | 'fall' | 'nbp' | 'drift' | 'ppg'>> & { weights?: Partial<CvThresholds['weights']> };

/** The file's numbers with the debug panel's overrides on top (for this browser session only). */
export function withOverrides(base: CvThresholds, overrides: CvOverrides): CvThresholds {
  return {
    ...base,
    ...overrides,
    // The weights are nested, so they are merged one level deeper.
    weights: { ...base.weights, ...overrides.weights },
  };
}
