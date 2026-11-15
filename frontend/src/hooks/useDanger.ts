import { useMemo } from 'react';
import { liveStatus } from '../lib/status';
import type { Thresholds, VitalsFrame } from '../types/contracts';

const DANGER_AFTER_S = 10;

/** True when a live vital has been in the red range for 10+ seconds in a row. */
export function useDanger(frames: VitalsFrame[], thresholds: Thresholds | null): boolean {
  return useMemo(() => {
    let run = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (!liveStatus(frames[i], thresholds)?.red.length) break;
      run++;
    }
    if (run < 2) return false;
    const seconds = (Date.parse(frames[frames.length - 1].t) - Date.parse(frames[frames.length - run].t)) / 1000;
    return seconds >= DANGER_AFTER_S;
  }, [frames, thresholds]);
}
