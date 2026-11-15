// Shapes shared by every unresponsive-detection file. Nothing here runs; it only describes data.
// Units: times in seconds; camera distances in "shoulder widths" (sw) RELATIVE TO THE TORSO (see torso.ts);
// scores 0 to 1. In microgravity "up" in the camera picture means nothing, so no shape here uses image "down".

/** One body point from MediaPipe. x and y are 0-1 across the camera image; z is a rough depth (smaller = closer). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  /** MediaPipe's confidence that the point is visible (0-1). Missing in test data = visible. */
  visibility?: number;
}

/** A 2D point or direction (image or torso coordinates). */
export interface Vec {
  x: number;
  y: number;
}

/** What the camera saw at one moment, reduced to the few numbers we need. */
export interface Frame {
  /** Seconds since the page loaded (performance.now() / 1000). Only differences between frames matter. */
  t: number;
  /** The 33 body points from the pose model, or null when no body was found. */
  pose: Landmark[] | null;
  /** How closed the left eye is, 0 (open) to 1 (closed), or null when no face was found. */
  blinkLeft: number | null;
  /** How closed the right eye is, 0 (open) to 1 (closed), or null when no face was found. */
  blinkRight: number | null;
}

/** The camera numbers the detector decides on, worked out from the recent frames. */
export interface Signals {
  /** False when the camera finds no body or no face: nobody is at the module. */
  present: boolean;
  /** Purposeful activity: how fast the wrists and elbows move RELATIVE TO THE TORSO (sw/s). Drifting does not count. */
  limbMotion: number;
  /** How fast the torso itself moves in the picture (sw/s, rotation in radians/s added). */
  bodyDrift: number;
  /** 0-1: the drift is slow and smooth (as when nothing holds a relaxed body in place). Jerky or no drift = 0. */
  driftScore: number;
  /** 0-1: how close the arms are to the neutral body posture, compared with this person's working posture. */
  nbpScore: number;
  /** How long both eyes have stayed closed without a break (s). */
  eyesClosedSeconds: number;
  /** How long the eyes have been open without a blink (s): a long stare also counts, with a lower weight. */
  secondsSinceBlink: number;
  /** Blinks in the last minute (null until a minute of face data). */
  blinksPerMinute: number | null;
  /** 1 when the PPG signal has been unusually clean for a long time (the hand is not moving), else 0. */
  stillHand: number;
  /** Everything above combined, 0-1 (weights in thresholds.json "cv"). */
  unresponsiveScore: number;
  /** Gravity only (cv.fall.environments): the hips dropped fast and the body then stayed still. Always false elsewhere. */
  fallDetected: boolean;
}

/** What the live vitals say about the pulse (pulse.ts). */
export type PulseStatus = 'ok' | 'lost' | 'clip_off' | 'no_data';

export interface PulseReading {
  status: PulseStatus;
  /** Plain words for the debug panel and the event log. */
  reason: string;
  /** Unusually clean signal for a long time: the hand with the clip is not moving (supporting signal). */
  stillHand: boolean;
  /** Any red flag from thresholds.json "red_flags" is active (very low or high HR, SpO2 falling...). */
  vitalsRed: boolean;
  /** Latest signal quality (0-1), or null without vitals. */
  quality: number | null;
  /** Latest pulse wave height as a share of this person's normal height, or null when the sensor does not send it. */
  amplitudeRatio: number | null;
  /** Seconds since the last detected heartbeat (0 when the sensor does not send beats). */
  secondsWithoutBeats: number;
}

/** The five states of the detector (see detector.ts and docs/cv-explained.md). */
export type StateName = 'MONITORING' | 'SUSPECTED' | 'CHECK_IN' | 'ALARM' | 'COOLDOWN';

/** Everything the detector remembers between updates. */
export interface DetectorState {
  name: StateName;
  /** When this state started (seconds, same clock as Frame.t). */
  enteredAt: number;
  /** MONITORING only: when the unresponsive score first reached the threshold without a break, else null. */
  highSince: number | null;
  /** CHECK_IN only: when the "Are you OK?" countdown runs out. */
  checkInDeadline: number | null;
  /** COOLDOWN and ALARM: when monitoring starts again. */
  resumeAt: number | null;
  /** Why the detector moved into this state, in plain words (debug panel, event log). */
  reason: string;
}

/** What the hook hands the detector on every camera frame, or once a second from the vitals when the camera is off. */
export interface DetectorInput {
  /** Seconds, same clock as Frame.t. */
  now: number;
  /** Camera signals, or null when the camera is off (then only the pulse can trigger). */
  signals: Signals | null;
  /** Pulse status from the live vitals. "lost" skips the check-in and goes straight to the alarm and CPR. */
  pulse: PulseStatus;
  /** Inside the sleep hours from environments.json: someone asleep floats still with closed eyes too. */
  isSleepTime: boolean;
  /** A red flag in the live vitals: ask sooner (suspect_after_s_with_red_vitals). */
  vitalsRed: boolean;
  /** Screens where stillness is expected (daily check) or an emergency is already open: no camera trigger. */
  paused: boolean;
  /** Emergency mode is open: it handles a lost pulse itself, so no second alarm. */
  inEmergency: boolean;
  /** The crew member tapped, pressed a key, spoke or pressed "I'm OK" since the last update. */
  responded: boolean;
}

/** Event types sent to POST /api/events (UnresponsiveEvent, one per state change). */
export type UnresponsiveEventType = 'unresponsive_suspected' | 'checkin_started' | 'ok_confirmed' | 'alarm' | 'monitoring_resumed';

/** Side effects the detector asks for. The detector never does them itself; the hook does (see detector.ts). */
export type Effect =
  | { kind: 'postEvent'; eventType: UnresponsiveEventType; from: StateName; to: StateName; reason: string }
  | { kind: 'showCheckIn'; deadline: number }
  | { kind: 'hideCheckIn' }
  | { kind: 'alarm'; reason: string; cpr: boolean };

/** The detector's answer to one update: its new state and what should happen because of it. */
export interface DetectorResult {
  state: DetectorState;
  effects: Effect[];
}

/** thresholds.json "cv" block (Yenna's file): every number lives there, none in code. */
export interface CvThresholds {
  /** At or below this limb motion relative to the torso (sw/s) the hands count as doing nothing. */
  limb_motion_low: number;
  /** During "Are you OK?", a hand movement at or above this (sw/s, relative to the torso) is an answer. */
  limb_motion_spike: number;
  /** Limb motion compares positions this many seconds apart (smooths out camera jitter). */
  motion_step_s: number;
  /** Body points below this MediaPipe visibility are ignored. */
  landmark_visibility: number;
  /** A blink score above this means the eye is closed. */
  eyes_closed_score: number;
  /** Eyes open with no blink for this long gives the full staring score. */
  stare_after_s: number;
  /** Neutral body posture checks. */
  nbp: { elbow_deg: [number, number]; tolerance_deg: number; wrist_rise: number; upper_arm_raise_deg: number; depth_margin: number; hold_s: number };
  /** What counts as a slow, smooth drift. */
  drift: { min_speed: number; max_speed: number; max_wobble: number };
  /** The unresponsive score at or above this starts the timer. */
  unresponsive_threshold: number;
  /** Seconds of a high score before "Are you OK?" is asked. */
  suspect_after_s: number;
  /** Same, shorter, when the live vitals show a red flag. */
  suspect_after_s_with_red_vitals: number;
  /** Seconds the crew member has to answer "Are you OK?". */
  checkin_countdown_s: number;
  /** Microphone level (0-1 RMS) that counts as speaking during the check-in. */
  voice_level: number;
  /** ...for at least this many seconds. */
  voice_min_s: number;
  /** Seconds of quiet after an answer (or an alarm) before checking again. */
  cooldown_s: number;
  /** Seconds of frames kept for the motion, drift and posture averages. */
  window_s: number;
  /** Seconds of normal working posture at the start, to learn this person's baseline. */
  calibration_s: number;
  /** How much each part counts toward the unresponsive score (they add up to 1). */
  weights: { limb_stillness: number; nbp: number; eyes: number; drift: number; stare: number; still_hand: number };
  /** Pulse checks on the live vitals (pulse.ts). */
  ppg: {
    pulse_lost_red_flag: string; good_quality: number; flat_ratio: number; no_pulse_s: number; clip_off_quality: number;
    baseline_jump_ratio: number; clean_quality: number; still_hand_s: number; stale_after_s: number;
  };
  /** Gravity only (Moon base, rover on the Moon or Mars): fall signal. */
  fall?: { environments: string[]; hip_drop_speed: number; still_after_s: number; still_motion: number };
}
