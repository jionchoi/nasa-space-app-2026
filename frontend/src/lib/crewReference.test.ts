import { describe, expect, it } from 'vitest';
import ref from '../mock/crewReference.json';
import { glucoseText } from './crewReference';

describe('crew reference glucose (OSD-575)', () => {
  it('shows the file value unchanged in mg/dL and converts only for mmol/L', () => {
    expect(glucoseText('103', 'mgdl', 18.016)).toBe('103');
    expect(glucoseText('99', 'mmol', 18.016)).toBe('5.5');
    expect(glucoseText('65', 'mmol', 18.016)).toBe('3.6');
    expect(glucoseText(undefined, 'mmol', 18.016)).toBe('–');
  });

  it('keeps the four crew members before (L-3) and after (R+1) flight', () => {
    const g = ref.analytes.glucose;
    expect(ref.display).toEqual({ pre_flight: 'L-3', post_flight: 'R+1' });
    expect(ref.crew.map((c) => (g.values as Record<string, Record<string, string>>)[c.id]['R+1'])).toEqual(['90', '83', '103', '97']);
  });
});
