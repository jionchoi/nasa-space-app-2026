// Shares the "Are you OK?" check-in between all open tabs of the app (BroadcastChannel). The camera runs in one tab,
// but the crew member may be looking at another: the check-in must show (and be answerable) wherever they look.
// Times travel as wall-clock milliseconds, because each tab has its own performance.now() clock.

/** Messages between tabs: the camera tab shows / hides the check-in; any tab can answer it. */
export type CheckInMessage = { type: 'show'; deadlineWallMs: number } | { type: 'hide' } | { type: 'answer' };

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('health-copilot-checkin') : null;

/** Tell the other tabs. */
export function sendCheckIn(message: CheckInMessage): void {
  channel?.postMessage(message);
}

/** Listen to the other tabs; returns a function that stops listening. */
export function onCheckIn(handler: (message: CheckInMessage) => void): () => void {
  if (!channel) return () => {};
  const listener = (event: MessageEvent<CheckInMessage>) => handler(event.data);
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/** This tab's detector clock (seconds) -> wall clock (ms), and back. */
export const toWallMs = (detectorSeconds: number) => Date.now() + (detectorSeconds - performance.now() / 1000) * 1000;
export const fromWallMs = (wallMs: number) => performance.now() / 1000 + (wallMs - Date.now()) / 1000;
