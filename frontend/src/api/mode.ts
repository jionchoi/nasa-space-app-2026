import type { SignalMode } from '../types/signals';

// Safe to import outside a browser (unit tests run in Node): no window or sessionStorage means Demo mode.
const browser = typeof window !== 'undefined';
const store = {
  get(): string | null { try { return browser ? window.sessionStorage.getItem('crewsense-mode') : null; } catch { return null; } },
  set(value: string) { try { if (browser) window.sessionStorage.setItem('crewsense-mode', value); } catch { /* storage blocked */ } },
};

const initial = (browser ? new URLSearchParams(window.location.search).get('mode') : null) ?? store.get();
let mode: SignalMode = initial === 'measurement' || initial === 'research' ? initial : 'demo';
store.set(mode);
export const currentMode = () => mode;
export function setCurrentMode(next: SignalMode) { mode = next; store.set(next); }
