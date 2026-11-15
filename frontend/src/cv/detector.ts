// The unresponsive detector: a state machine fed once per camera frame (or once a second from the vitals when
// the camera is off).
//
//   MONITORING -> SUSPECTED -> CHECK_IN -> ALARM -> (after cooldown_s) MONITORING
//                                  |
//                                  +-> COOLDOWN (tap, key, voice or a purposeful hand movement) -> MONITORING
//   any state except ALARM --(pulse lost)--> ALARM with CPR (no check-in: there is no time for one)
//
// It is PURE: it never reads a clock (the time comes in as `now`), never starts timers, never touches the
// screen or the network. update() returns a list of "effects" (post an event, show the check-in, hide it,
// raise the alarm) and the React hook carries them out. That keeps every rule testable in detector.test.ts.
import type { CvThresholds, DetectorInput, DetectorResult, DetectorState, Effect, StateName, UnresponsiveEventType } from './types';

// The event type sent to /api/events when the detector enters each state.
const EVENT_FOR_STATE: Record<StateName, UnresponsiveEventType> = {
  SUSPECTED: 'unresponsive_suspected',
  CHECK_IN: 'checkin_started',
  ALARM: 'alarm',
  COOLDOWN: 'ok_confirmed',
  MONITORING: 'monitoring_resumed',
};

/** A fresh MONITORING state starting at `now`. */
function monitoringState(now: number, reason: string): DetectorState {
  return { name: 'MONITORING', enteredAt: now, highSince: null, checkInDeadline: null, resumeAt: null, reason };
}

export class UnresponsiveDetector {
  // The current state. Replaced (never edited in place) on every change.
  private current: DetectorState;
  // The numbers from thresholds.json "cv" (or the debug panel's overrides).
  private thresholds: CvThresholds;

  constructor(thresholds: CvThresholds, now = 0) {
    this.thresholds = thresholds;
    this.current = monitoringState(now, 'Started');
  }

  /** The current state (read-only copy for the screen). */
  get state(): DetectorState {
    return this.current;
  }

  /** Swap in new numbers (the debug panel sliders). The current state and timers are kept. */
  setThresholds(thresholds: CvThresholds): void {
    this.thresholds = thresholds;
  }

  /** Back to MONITORING with no timers running, without any effects (used when the camera starts or stops). */
  reset(now: number): void {
    this.current = monitoringState(now, 'Reset');
  }

  /** Debug panel only: act as if the unresponsive score had stayed high long enough. */
  forceSuspected(now: number): DetectorResult {
    return this.moveTo('SUSPECTED', now, 'Demo trigger from the debug panel');
  }

  /** Feed one update. Returns the new state and the effects the hook must carry out. */
  update(input: DetectorInput): DetectorResult {
    // A lost pulse beats every other rule, even sleep hours (no pulse is never "just asleep"). Emergency mode,
    // if already open, handles it itself (its red-flag route opens CPR), so no second alarm then.
    if (input.pulse === 'lost' && !input.inEmergency && this.current.name !== 'ALARM') {
      return this.moveTo('ALARM', input.now, 'Pulse lost with the clip on', true);
    }
    // Otherwise each state has its own rule for what can happen next.
    switch (this.current.name) {
      case 'MONITORING':
        return this.whileMonitoring(input);
      case 'SUSPECTED':
        return this.whileSuspected(input);
      case 'CHECK_IN':
        return this.whileCheckIn(input);
      case 'ALARM':
      case 'COOLDOWN':
        return this.whileWaiting(input);
    }
  }

  /** MONITORING: watch for a high unresponsive score that lasts (or a fall where there is gravity). */
  private whileMonitoring({ now, signals, isSleepTime, vitalsRed, paused }: DetectorInput): DetectorResult {
    // Camera off, asleep, on a screen where stillness is expected, or nobody at the module: the camera cannot
    // trigger, and the timer starts over. (A sleeping crew member floats in the same relaxed posture.)
    if (!signals || isSleepTime || paused || !signals.present) {
      return this.stay({ ...this.current, highSince: null });
    }
    // Gravity only (Moon base, rover on the Moon or Mars): a fall followed by stillness goes straight to SUSPECTED.
    if (signals.fallDetected) {
      return this.moveTo('SUSPECTED', now, 'Fell, then stayed still (gravity: Moon or Mars surface)');
    }
    // Score below the threshold: the timer starts over.
    if (signals.unresponsiveScore < this.thresholds.unresponsive_threshold) {
      return this.stay({ ...this.current, highSince: null });
    }
    // High score: start the timer if it is not running yet.
    const highSince = this.current.highSince ?? now;
    // Red vitals make us ask sooner.
    const needed = vitalsRed ? this.thresholds.suspect_after_s_with_red_vitals : this.thresholds.suspect_after_s;
    if (now - highSince >= needed) {
      const why = vitalsRed ? `No purposeful movement for ${needed} s, with red vitals` : `No purposeful movement for ${needed} s`;
      return this.moveTo('SUSPECTED', now, why);
    }
    // Still counting.
    return this.stay({ ...this.current, highSince });
  }

  /**
   * SUSPECTED lasts one update: the "unresponsive suspected" event is logged on the way in, and on the next
   * update the detector asks "Are you OK?". Keeping it as its own state makes the log show exactly when the
   * suspicion began.
   */
  private whileSuspected({ now }: DetectorInput): DetectorResult {
    return this.moveTo('CHECK_IN', now, 'Asking "Are you OK?"');
  }

  /** CHECK_IN: any answer or a purposeful hand movement means OK; silence until the deadline means alarm. */
  private whileCheckIn({ now, signals, responded }: DetectorInput): DetectorResult {
    // A tap, a key, a spoken word or the "I'm OK" button.
    if (responded) {
      return this.moveTo('COOLDOWN', now, 'Answered "I\'m OK"');
    }
    // A clear hand movement RELATIVE TO THE TORSO counts as an answer. Body drift does not: a floating,
    // unconscious body can still move slowly in the picture.
    if (signals?.present && signals.limbMotion >= this.thresholds.limb_motion_spike) {
      return this.moveTo('COOLDOWN', now, 'Moved a hand on purpose');
    }
    // No answer in time.
    if (this.current.checkInDeadline !== null && now >= this.current.checkInDeadline) {
      return this.moveTo('ALARM', now, `No response to "Are you OK?" within ${this.thresholds.checkin_countdown_s} s`);
    }
    // Still waiting. (Floating out of view does not stop the countdown.)
    return this.stay(this.current);
  }

  /** ALARM and COOLDOWN: wait quietly, then go back to MONITORING. */
  private whileWaiting({ now }: DetectorInput): DetectorResult {
    if (this.current.resumeAt !== null && now >= this.current.resumeAt) {
      return this.moveTo('MONITORING', now, 'Cooldown over');
    }
    return this.stay(this.current);
  }

  /** No change of state: keep `next` (it may carry an updated timer) and do nothing else. */
  private stay(next: DetectorState): DetectorResult {
    this.current = next;
    return { state: next, effects: [] };
  }

  /** Change state and list the effects that go with it. Every change posts an event. `cpr`: alarm straight to CPR. */
  private moveTo(to: StateName, now: number, reason: string, cpr = false): DetectorResult {
    const from = this.current.name;
    const effects: Effect[] = [{ kind: 'postEvent', eventType: EVENT_FOR_STATE[to], from, to, reason }];
    let next: DetectorState = { name: to, enteredAt: now, highSince: null, checkInDeadline: null, resumeAt: null, reason };

    if (to === 'CHECK_IN') {
      // Start the "Are you OK?" countdown and show the overlay.
      next = { ...next, checkInDeadline: now + this.thresholds.checkin_countdown_s };
      effects.push({ kind: 'showCheckIn', deadline: next.checkInDeadline! });
    }
    if (to === 'COOLDOWN') {
      // Answered: hide the overlay and stay quiet for a while.
      next = { ...next, resumeAt: now + this.thresholds.cooldown_s };
      effects.push({ kind: 'hideCheckIn' });
    }
    if (to === 'ALARM') {
      // Hide the overlay (if any), raise the crew alarm and stay quiet while the crew responds.
      next = { ...next, resumeAt: now + this.thresholds.cooldown_s };
      effects.push({ kind: 'hideCheckIn' }, { kind: 'alarm', reason, cpr });
    }

    this.current = next;
    return { state: next, effects };
  }
}
