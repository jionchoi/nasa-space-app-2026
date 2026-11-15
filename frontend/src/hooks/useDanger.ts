import { useMemo } from 'react';
import { liveStatus, type LiveOptions } from '../lib/status';
import type { Thresholds, VitalsFrame } from '../types/contracts';

const DANGER_AFTER_S = 10;

/** True when a live vital has been in the red range for 10+ seconds in a row. */
export function useDanger(frames: VitalsFrame[], thresholds: Thresholds | null, opts: LiveOptions = {}): boolean {
  return useMemo(() => {
    let run = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (!liveStatus(frames[i], thresholds, opts)?.red.length) break;
      run++;
    }
    if (run < 2) return false;
    const seconds = (Date.parse(frames[frames.length - 1].t) - Date.parse(frames[frames.length - run].t)) / 1000;
    return seconds >= DANGER_AFTER_S;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, thresholds, opts.symptoms]);
}
