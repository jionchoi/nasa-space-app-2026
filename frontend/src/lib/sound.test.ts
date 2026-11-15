import { describe, expect, it } from 'vitest';
import { isMuteKey, isMuted, setMuted, toggleMuted } from './sound';

const key = (k: string, extra: Partial<KeyboardEvent> = {}, tag = 'body') =>
  ({ key: k, ctrlKey: false, altKey: false, metaKey: false, repeat: false, target: { tagName: tag } as unknown as EventTarget, ...extra });

describe('global mute', () => {
  it('starts unmuted and toggles', () => {
    setMuted(false);
    expect(isMuted()).toBe(false);
    toggleMuted();
    expect(isMuted()).toBe(true);
    toggleMuted();
    expect(isMuted()).toBe(false);
  });

  it('M toggles, but not while typing or with a modifier', () => {
    expect(isMuteKey(key('m'))).toBe(true);
    expect(isMuteKey(key('M'))).toBe(true);
    expect(isMuteKey(key('m', {}, 'INPUT'))).toBe(false);
    expect(isMuteKey(key('m', {}, 'textarea'))).toBe(false);
    expect(isMuteKey(key('m', { ctrlKey: true }))).toBe(false);
    expect(isMuteKey(key('m', { repeat: true }))).toBe(false);
    expect(isMuteKey(key('n'))).toBe(false);
  });
});
