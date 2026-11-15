// Sleep hours from environments.json ("sleep": { "start": "22:00", "end": "06:00" }), in mission time (GMT).
// Someone asleep floats still with closed eyes in the same relaxed posture, so unresponsive detection must not ask
// then (the pulse check still runs).
// PURE functions: the mission clock is passed in.

/** "07:30" -> 450 minutes after midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * True when `minuteOfDay` (0-1439, mission time) is inside the sleep window.
 * The window may cross midnight (22:00 to 06:00), which is the usual case.
 */
export function isSleepTime(minuteOfDay: number, sleep: { start: string; end: string } | null | undefined): boolean {
  // No sleep hours set for this environment: never asleep.
  if (!sleep) return false;
  const start = hhmmToMinutes(sleep.start);
  const end = hhmmToMinutes(sleep.end);
  // Same-day window, e.g. 13:00 to 14:00.
  if (start <= end) return minuteOfDay >= start && minuteOfDay < end;
  // Window across midnight: late evening OR early morning.
  return minuteOfDay >= start || minuteOfDay < end;
}
