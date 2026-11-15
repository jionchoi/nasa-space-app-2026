// Reaction-test reference group (CSA PRET v4.0 ground study, backend/data/pvt_norms.json): "faster than Y %".
import { useEffect, useState } from 'react';
import { getPvtNorms } from '../api/client';
import type { PvtNorms } from '../types/contracts';

/** Share (%) of the reference group with a HIGHER value than `value` (ties count half): for reaction time and lapse
 *  rate, higher is worse, so this is "faster than" / "fewer lapses than" Y % of the group. */
export function betterThanPct(value: number, sorted: number[]): number {
  if (!sorted.length) return 0;
  let higher = 0;
  let same = 0;
  for (const x of sorted) {
    if (x > value) higher += 1;
    else if (x === value) same += 1;
  }
  return Math.round((100 * (higher + same / 2)) / sorted.length);
}

let cache: PvtNorms | null = null;

/** The norms, loaded once (falls back to the mock copy offline). */
export function usePvtNorms(): PvtNorms | null {
  const [norms, setNorms] = useState<PvtNorms | null>(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    getPvtNorms().then((n) => { cache = n; if (live) setNorms(n); });
    return () => { live = false; };
  }, []);
  return norms;
}

/** Learn-tab line: "Compared with <n> people tested for the Canadian Space Agency (...)". */
export const normsLine = (n: PvtNorms) =>
  `Compared with ${n.n} people tested for the Canadian Space Agency (PRET, ground study; lapse >= ${n.lapse_ms} ms)`;
