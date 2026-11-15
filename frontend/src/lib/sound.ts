// All app sounds (crew alarm siren, "Are you OK?" beep, CPR metronome) go through ONE audio context and one master
// volume, so the global mute silences everything at once, including a sound that is already playing.
// Mute is toggled by the header speaker button or the "M" key. It is NOT saved: every page load starts with sound on,
// so an alarm can never stay silent because someone muted it yesterday.
import { useSyncExternalStore } from 'react';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const listeners = new Set<() => void>();

/** The shared audio context and the node every sound must connect to (instead of ctx.destination). */
export function audioOut(): { ctx: AudioContext; out: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  // Browsers suspend audio until the page has been clicked once; try again every time a sound starts.
  void ctx.resume();
  return { ctx, out: master };
}

export const isMuted = () => muted;

export function setMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  if (ctx && master) master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
  listeners.forEach((listener) => listener());
}

export const toggleMuted = () => setMuted(!muted);

/** React: the current mute state, re-rendering on change. */
export function useMuted(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isMuted,
    isMuted,
  );
}

/** True when a key press is meant for a text field (typing an "m" must not mute). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** True for a plain "M" press (no Ctrl / Alt / Cmd) outside a text field. */
export function isMuteKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat' | 'target'>): boolean {
  return (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat && !isTypingTarget(e.target);
}

/** The "M" shortcut, installed once for the whole app (main.tsx). */
export function installMuteShortcut(): () => void {
  const onKey = (e: KeyboardEvent) => { if (isMuteKey(e)) toggleMuted(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
