import { useMemo } from 'react';
import { activeRedFlags, redFlagDefs, withPulseLost } from '../../lib/redFlags';
import type { Thresholds, VitalsFrame } from '../../types/contracts';

/** Live red flags in emergency mode (thresholds.json "red_flags", plus a lost pulse from the pulse monitor).
 *  They only light up and go into the log. Since Nov 15 they never move the protocol on (no countdown, no auto-route to
 *  CPR): the medical lead's rule is human assessment > sensors, so the crew answers CL01, CL03 and CL05 themselves. */
export function useRedFlags(frames: VitalsFrame[], thresholds: Thresholds | null, pulseStatus?: string) {
  const defs = useMemo(() => redFlagDefs(thresholds), [thresholds]);
  const pulseFlag = (thresholds?.cv as { ppg?: { pulse_lost_red_flag?: string } } | undefined)?.ppg?.pulse_lost_red_flag;
  const active = useMemo(() => withPulseLost(activeRedFlags(frames, defs, thresholds), pulseStatus, pulseFlag),
    [frames, defs, thresholds, pulseStatus, pulseFlag]);
  return { active, defs };
}
