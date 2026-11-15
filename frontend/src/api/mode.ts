import type { SignalMode } from '../types/signals';
import { PUBLIC_DEMO } from './publicDemo';

// Safe to import outside a browser (unit tests run in Node): no window or sessionStorage means Demo mode.
const browser = typeof window !== 'undefined';
const store = {
  get(): string | null { try { return browser ? window.sessionStorage.getItem('crewsense-mode') : null; } catch { return null; } },
  set(value: string) { try { if (browser) window.sessionStorage.setItem('crewsense-mode', value); } catch { /* storage blocked */ } },
};

const initial = (browser ? new URLSearchParams(window.location.search).get('mode') : null) ?? store.get();
// The public build has no backend, so it always stays in Demo mode (?mode= is ignored there).
let mode: SignalMode = !PUBLIC_DEMO && (initial === 'measurement' || initial === 'research') ? initial : 'demo';
store.set(mode);
/** Measurement / Research asked for (?mode=) in the public build, where only Demo exists; null otherwise. */
export const blockedMode = PUBLIC_DEMO && (initial === 'measurement' || initial === 'research') ? initial : null;
export const currentMode = () => mode;
export function setCurrentMode(next: SignalMode) { if (PUBLIC_DEMO && next !== 'demo') return; mode = next; store.set(next); }
