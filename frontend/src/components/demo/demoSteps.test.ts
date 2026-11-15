import { describe, expect, it, vi } from 'vitest';
import { goToStep, sendDemoCommand, startDemo, stopDemo, demoState, useDemoCommand } from '../../lib/demo';
import { offlineSolarEvent, startOfflineSolar, stopOfflineSolar, withOfflineSolar } from '../../lib/solarOffline';
import type { RegionStatus } from '../../types/contracts';
import { DEMO_STEPS, personaBadge, type DemoContext } from './demoSteps';

function fakeContext(pathname = '/') {
  const calls: string[] = [];
  const ctx: DemoContext = {
    setPersona: (id) => calls.push(`persona:${id}`),
    setEnv: (id) => calls.push(`env:${id}`),
    setPlanet: (p) => calls.push(`planet:${p}`),
    setPicked: (id) => calls.push(`picked:${id}`),
    jumpTo: (s) => calls.push(`jump:${s}`),
    navigate: ((to: string) => calls.push(`nav:${to}`)) as unknown as DemoContext['navigate'],
    pathname,
    search: '',
    cv: { start: async () => { calls.push('cv:start'); }, stop: () => calls.push('cv:stop'), demoTrigger: () => calls.push('cv:trigger') },
    later: (fn) => fn(),
  };
  return { ctx, calls };
}

describe('demo script', () => {
  it('covers the 8 parts of the pitch in order', () => {
    expect(DEMO_STEPS.map((s) => s.label)).toEqual(['1', '2', '3', '4a', '4b', '5', '6a', '6b', '7', '8']);
  });

  it('each step sets crew member, location and screen', () => {
    const expected: Record<string, string[]> = {
      '1': ['persona:A', 'env:iss', 'jump:0', 'nav:/', 'picked:radiation'],
      '2': ['persona:A', 'nav:/check?demo=summary'],
      '3': ['persona:B', 'env:iss', 'picked:heart'],
      '4a': ['persona:B', 'env:mars'],
      '4b': ['planet:mars', 'env:rover:mars', 'picked:radiation'],
      '5': ['env:mars', 'picked:radiation'],
      '6a': ['persona:C', 'env:mars', 'jump:285'],
      '6b': ['persona:C', 'jump:440', 'nav:/emergency?protocol=chest_pain&trigger=crew'],
      '7': ['persona:A', 'env:mars', 'jump:0'],
    };
    for (const step of DEMO_STEPS) {
      const { ctx, calls } = fakeContext('/somewhere-else');
      step.apply(ctx);
      for (const call of expected[step.label] ?? []) expect(calls, step.label).toContain(call);
    }
  });

  it('does not navigate again when already on the right screen (keeps the open drawer)', () => {
    const { ctx, calls } = fakeContext('/');
    DEMO_STEPS.find((s) => s.label === '4a')!.apply(ctx);
    expect(calls.filter((c) => c.startsWith('nav:'))).toEqual([]);
  });

  it('step 7 keeps detection on; the others switch it off', () => {
    const seven = fakeContext();
    DEMO_STEPS.find((s) => s.label === '7')!.apply(seven.ctx);
    expect(seven.calls).not.toContain('cv:stop');
    const one = fakeContext();
    DEMO_STEPS[0].apply(one.ctx);
    expect(one.calls).toContain('cv:stop');
  });

  it('shows "Simulated recording" for persona C and a real-recording badge once it is real', () => {
    const c = { id: 'C', name: 'Jordan Lee', description: '', simulated: true } as never;
    expect(personaBadge(c)?.text).toBe('Simulated recording');
    expect(personaBadge({ ...(c as object), recording: 'real' } as never)?.text).toMatch(/^Real clinical recording/);
    expect(personaBadge({ id: 'A', name: 'Alex', description: '', simulated: true } as never)?.kind).toBe('simulated');
  });

  it('demo state starts, moves and stops', () => {
    startDemo();
    goToStep(3);
    expect(demoState()).toMatchObject({ active: true, step: 3 });
    stopDemo();
    expect(demoState().active).toBe(false);
    expect(typeof useDemoCommand).toBe('function');
    expect(() => sendDemoCommand({ kind: 'closeDrawer' })).not.toThrow();
  });
});

describe('offline DONKI replay (public build)', () => {
  it('runs in the browser, stronger on Mars transit than on the ISS, and turns radiation Act now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    startOfflineSolar(5);
    vi.setSystemTime(new Date('2026-11-15T10:01:00Z'));
    const iss = offlineSolarEvent('iss')!;
    const mars = offlineSolarEvent('mars')!;
    expect(iss.sep_id).toBe('2024-05-10T13:35:00-SEP-001');
    expect(mars.dose_rate_msv_h).toBeGreaterThan(iss.dose_rate_msv_h);
    expect(mars.dose_note).toMatch(/dose simulated/);
    const rows = [{ region: 'radiation', status: 'green', score: 90, trend: [], time_to_act_days: null, reason: '', advice_level: 'self' }] as RegionStatus[];
    expect(withOfflineSolar(rows, 'mars')[0].status).toBe('red');
    stopOfflineSolar();
    expect(offlineSolarEvent('mars')).toBeNull();
    vi.useRealTimers();
  });
});
