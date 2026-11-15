import { describe, expect, it } from 'vitest';
import norms from '../mock/pvtNorms.json';
import { betterThanPct } from './pvtNorms';

describe('betterThanPct (faster than Y % of the reference group)', () => {
  it('counts the share with a higher (worse) value, ties as half', () => {
    expect(betterThanPct(250, [200, 250, 300, 400])).toBe(63); // 2 higher + half of 1 tie, of 4
    expect(betterThanPct(100, [200, 300])).toBe(100);
    expect(betterThanPct(500, [200, 300])).toBe(0);
  });

  it('puts the PRET median near 50 % and the 90th percentile near 10 %', () => {
    const rt = norms.distribution.median_rt_ms;
    expect(Math.abs(betterThanPct(norms.percentiles.median_rt_ms.p50, rt) - 50)).toBeLessThanOrEqual(3);
    expect(Math.abs(betterThanPct(norms.percentiles.median_rt_ms.p90, rt) - 10)).toBeLessThanOrEqual(3);
  });
});
