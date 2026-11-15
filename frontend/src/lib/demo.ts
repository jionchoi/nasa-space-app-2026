// Demo mode for the live pitch: on/off, the current step, pause, and a small command channel so a step can ask a
// screen to do something ("open the heart draft", "end the emergency") without wiring props through the app.
// Started with Shift+D, the button on /admin or ?demo=1. Works in the public build (backend off) too.
import { useEffect, useRef, useSyncExternalStore } from 'react';

export interface DemoState {
  active: boolean;
  step: number;
  paused: boolean;
}

let state: DemoState = { active: false, step: 0, paused: false };
const listeners = new Set<() => void>();

function set(next: Partial<DemoState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const demoState = () => state;
export const startDemo = (step = 0) => set({ active: true, step, paused: false });
export const stopDemo = () => set({ active: false, paused: false });
export const goToStep = (step: number) => set({ step });
export const setDemoPaused = (paused: boolean) => set({ paused });

export function useDemo(): DemoState {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    demoState,
    demoState,
  );
}

// ---- commands for screens ----

export type DemoCommand =
  | { kind: 'openDraft'; region: string }   // dashboard: open the drafted message for this region's alert
  | { kind: 'sendDraft' }                    // dashboard: send the open draft (delivery follows the location)
  | { kind: 'closeDrawer' }                  // dashboard: close the messages drawer
  | { kind: 'sendSurgeonMessage' }           // emergency: send the message to the flight surgeon
  | { kind: 'endEmergency' };                // emergency: end it (no confirm dialog) and show the summary

const commandListeners = new Set<(command: DemoCommand) => void>();
/** The last command, so a screen that mounts a moment later (after navigation) still receives it. */
let pending: { command: DemoCommand; at: number } | null = null;
const PENDING_MS = 4000;

export function sendDemoCommand(command: DemoCommand): void {
  pending = { command, at: Date.now() };
  commandListeners.forEach((listener) => listener(command));
}

/** Run `handler` for demo commands of these kinds (also one sent just before this screen mounted). */
export function useDemoCommand(kinds: DemoCommand['kind'][], handler: (command: DemoCommand) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  const key = kinds.join(',');
  useEffect(() => {
    const wanted = new Set(key.split(','));
    const listener = (command: DemoCommand) => {
      if (!wanted.has(command.kind)) return;
      pending = null;
      ref.current(command);
    };
    if (pending && Date.now() - pending.at < PENDING_MS) listener(pending.command);
    commandListeners.add(listener);
    return () => { commandListeners.delete(listener); };
  }, [key]);
}
