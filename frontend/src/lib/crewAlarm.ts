// Crew alarm: a full-screen alarm any part of the app can raise. Unresponsive detection calls
// triggerCrewAlarm(reason) when "Are you OK?" gets no answer or the pulse is lost. The overlay is <CrewAlarm/> in App.tsx.
// Every open tab of the app shows the same alarm (BroadcastChannel): each tab is its own copy of the app, and an alarm
// raised in a background tab must never be heard without being seen. Answering it in any tab clears it in all tabs.
import { useSyncExternalStore } from 'react';

export interface CrewAlarmOptions {
  /** Where the crew member is, e.g. "Columbus module". Defaults to the current environment's name. */
  location?: string;
  /** Where "I'm responding" goes. Default: the unresponsive protocol opened from the alarm. */
  emergencyUrl?: string;
  /** Who raised it, for the log: "cv", "test", ... */
  source?: string;
  /** Which crew member (persona id) it is about, so another tab can switch to them. */
  persona?: string;
  /** Their name, shown on the alarm in every tab. */
  personaName?: string;
}

export interface CrewAlarmState extends CrewAlarmOptions {
  reason: string;
  at: string;
  /** True when another tab raised it (that tab already logged it, so this one must not log it again). */
  fromOtherTab?: boolean;
}

export const DEFAULT_EMERGENCY_URL = '/emergency?protocol=unresponsive&trigger=alarm';
/** What unresponsive detection passes: the "does the crew member respond?" step is already answered NO. */
export const CV_EMERGENCY_URL = '/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no';
/** A lost pulse: same, then straight to the CPR guide (goto=cpr). */
export const CV_PULSE_LOST_URL = `${CV_EMERGENCY_URL}&goto=cpr`;

let state: CrewAlarmState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

// The channel all tabs of this app share (not available in very old browsers or in tests: then single-tab only).
type AlarmMessage = { type: 'raise'; state: CrewAlarmState } | { type: 'clear' };
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('health-copilot-crew-alarm') : null;

// Another tab raised or cleared the alarm: show or hide it here too.
if (channel) {
  channel.onmessage = (event: MessageEvent<AlarmMessage>) => {
    state = event.data.type === 'raise' ? { ...event.data.state, fromOtherTab: true } : null;
    emit();
  };
}

/** Raise the crew alarm (full-screen flashing overlay with a repeating tone) in this tab and every other open tab. */
export function triggerCrewAlarm(reason: string, options: CrewAlarmOptions = {}): void {
  state = { reason, at: new Date().toISOString(), ...options };
  emit();
  channel?.postMessage({ type: 'raise', state } satisfies AlarmMessage);
}

/** Clear the alarm here and in every other open tab (someone is responding, or it was a false alarm). */
export function clearCrewAlarm(): void {
  state = null;
  emit();
  channel?.postMessage({ type: 'clear' } satisfies AlarmMessage);
}

export const useCrewAlarm = () =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);

// Handy for the CV module and for testing from the browser console: window.triggerCrewAlarm("test")
declare global {
  interface Window { triggerCrewAlarm?: typeof triggerCrewAlarm }
}
if (typeof window !== 'undefined') window.triggerCrewAlarm = triggerCrewAlarm;
