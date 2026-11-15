// The React hook that runs unresponsive crew member detection. It is the only detection file with side effects:
//   1. watches the live vitals for the pulse ALL THE TIME (usePulseMonitor), camera on or off,
//   2. while the camera is on: reads a video frame about 10 times a second and runs both MediaPipe models on it,
//      keeps the last window_s seconds of frames, learns the working posture during calibration_s, and works
//      out the body-relative signals (signals.ts),
//   3. feeds the detector (detector.ts) and carries out its effects: log the event, show or hide
//      "Are you OK?", raise the crew alarm and open the unresponsive protocol (straight to CPR on a lost pulse).
// It is used once, by CvProvider (state/CvContext.tsx), so every screen shares one camera and one detector.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { postEvent } from '../api/client';
import { CV_EMERGENCY_URL, CV_PULSE_LOST_URL, triggerCrewAlarm } from '../lib/crewAlarm';
import { useApp } from '../state/AppContext';
import { minuteOfDay, missionDate, useRoutine } from '../state/RoutineContext';
import { CameraError, startCamera, stopCamera } from './camera';
import { fromWallMs, onCheckIn, sendCheckIn, toWallMs } from './checkInSync';
import { UnresponsiveDetector } from './detector';
import { loadLandmarkers, ModelSetupError, readFrame, type Landmarkers } from './landmarkers';
import { baselinePosture } from './posture';
import {
  blinkStarted, blinksPerMinute, computeSignals, isPresent, lastSeconds, nextEyesClosedSeconds, nextSecondsSinceBlink,
} from './signals';
import { isSleepTime } from './sleep';
import type { CvThresholds, DetectorState, Effect, Frame, PulseReading, Signals } from './types';
import { usePulseMonitor } from './usePulseMonitor';

// Run the models about 10 times a second: plenty for slow changes, and light on the laptop.
const FRAME_INTERVAL_MS = 100;
// Refresh the numbers on screen 4 times a second (the detector itself still runs at 10 per second).
const PUBLISH_INTERVAL_MS = 250;
// Screens where stillness is expected (the 2-minute seated measurement) or an emergency is already open.
const PAUSED_PATHS = ['/check', '/emergency'];

/** off -> loading (models and camera) -> calibrating -> running. "error" shows a message instead. */
export type CvPhase = 'off' | 'loading' | 'calibrating' | 'running' | 'error';

/** What the screen shows: refreshed 4 times a second while the camera is on, once a second otherwise. */
export interface CvLive {
  present: boolean;
  /** Latest camera signals (null while calibrating or with the camera off). */
  signals: Signals | null;
  state: DetectorState | null;
  /** Working-posture score learned at calibration. */
  baseline: number | null;
  calibrationLeftS: number;
  isSleepTime: boolean;
  paused: boolean;
  fallEnabled: boolean;
  fps: number;
  /** The detector's clock (seconds), to show timers. */
  now: number;
}

const EMPTY_LIVE: CvLive = {
  present: false, signals: null, state: null, baseline: null, calibrationLeftS: 0, isSleepTime: false, paused: false, fallEnabled: false, fps: 0, now: 0,
};

export interface UnresponsiveDetection {
  phase: CvPhase;
  error: string | null;
  live: CvLive;
  /** Pulse status from the live vitals (always on). */
  pulse: PulseReading;
  /** When "Are you OK?" runs out (seconds, detector clock), or null when it is not showing. */
  checkInDeadline: number | null;
  /** The newest camera frame, for drawing the skeleton (read in an animation loop, not via React). */
  frameRef: RefObject<Frame | null>;
  /** Detection switched on (header toggle). OFF after every page load; nothing can alarm while off. */
  enabled: boolean;
  start(): Promise<void>;
  stop(): void;
  /** The crew member answered "Are you OK?" (tap, key, voice or button). */
  respond(): void;
  /** Demo mode: switch detection on and act as if the score stayed high, WITHOUT the camera if it is off
   *  ("Are you OK?", then the crew alarm if nobody answers). */
  demoTrigger(): void;
  /** Debug panel only: pretend the score stayed high long enough. */
  forceSuspected(): void;
}

/** The detector's clock: seconds since the page loaded. Frames use the same clock. */
const clockNow = () => performance.now() / 1000;
/** Rounds to 3 decimals for the event log. */
const round = (value: number | undefined) => (value === undefined ? undefined : Math.round(value * 1000) / 1000);

export function useUnresponsiveDetection(videoRef: RefObject<HTMLVideoElement>, thresholds: CvThresholds | null): UnresponsiveDetection {
  const { persona, personaInfo, env, envInfo, thresholds: allThresholds } = useApp();
  const { clockOffsetMs } = useRoutine();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [phase, setPhase] = useState<CvPhase>('off');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<CvLive>(EMPTY_LIVE);
  const [checkInDeadline, setCheckInDeadline] = useState<number | null>(null);
  // Detection on/off. OFF after every page load (not saved); start() turns it on, stop() off. While off, nothing here
  // can raise the "Are you OK?" check-in or the crew alarm (the camera is off and the pulse-only path is skipped).
  const [enabled, setEnabled] = useState(false);

  // The pulse is watched all the time, camera or not.
  const pulse = usePulseMonitor(persona, allThresholds, thresholds);
  const cameraOn = phase === 'calibrating' || phase === 'running';
  const paused = PAUSED_PATHS.some((path) => pathname.startsWith(path));
  const inEmergency = pathname.startsWith('/emergency');
  const fallEnabled = !!thresholds?.fall?.environments.includes(env);

  // The animation-frame loop runs outside React's render, so it reads the newest values from this ref.
  const personaName = personaInfo?.name;
  const latest = useRef({ thresholds, pulse, paused, inEmergency, fallEnabled, sleep: envInfo?.sleep, clockOffsetMs, persona, personaName, navigate });
  latest.current = { thresholds, pulse, paused, inEmergency, fallEnabled, sleep: envInfo?.sleep, clockOffsetMs, persona, personaName, navigate };

  // Things kept between frames (refs, because changing them must not re-render the page).
  const models = useRef<Landmarkers | null>(null);
  const detector = useRef<UnresponsiveDetector | null>(null);
  const frames = useRef<Frame[]>([]);
  const calibrationFrames = useRef<Frame[]>([]);
  const baseline = useRef<number | null>(null);
  const counters = useRef({ eyesClosed: 0, sinceBlink: 0, blinkTimes: [] as number[], watchedSince: 0 });
  const frameRef = useRef<Frame | null>(null);
  const previousFrame = useRef<Frame | null>(null);
  const responded = useRef(false);
  const timing = useRef({ lastRun: 0, lastTimestamp: 0, lastPublish: 0, fps: { frames: 0, since: 0, value: 0 } });
  const lastSignals = useRef<Signals | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // One detector for the whole session, created as soon as the numbers are known; slider changes go straight in.
  useEffect(() => {
    if (!thresholds) return;
    if (!detector.current) detector.current = new UnresponsiveDetector(thresholds, clockNow());
    else detector.current.setThresholds(thresholds);
  }, [thresholds]);

  /** Is it sleep time on the mission clock right now? */
  const sleepingNow = () => isSleepTime(minuteOfDay(missionDate(latest.current.clockOffsetMs)), latest.current.sleep);

  /** Carries out what the detector asked for. The only place detection changes anything outside itself. */
  const perform = useCallback((effects: Effect[], signals: Signals | null) => {
    const { persona: who, personaName: name, navigate: go, pulse: p } = latest.current;
    for (const effect of effects) {
      if (effect.kind === 'postEvent') {
        // Log every state change (UnresponsiveEvent) with the numbers at that moment. Never images.
        void postEvent({
          t: new Date().toISOString(),
          type: effect.eventType,
          signals: {
            source: 'cv', limb_motion: round(signals?.limbMotion), body_drift: round(signals?.bodyDrift), nbp: round(signals?.nbpScore),
            eyes_closed_s: round(signals?.eyesClosedSeconds), score: round(signals?.unresponsiveScore), pulse: p.status,
            from: effect.from, to: effect.to, reason: effect.reason, text: `Unresponsive detection: ${effect.reason}`,
          },
        }, who);
      }
      // Show or hide "Are you OK?" here and in every other open tab.
      if (effect.kind === 'showCheckIn') { setCheckInDeadline(effect.deadline); sendCheckIn({ type: 'show', deadlineWallMs: toWallMs(effect.deadline) }); }
      if (effect.kind === 'hideCheckIn') { setCheckInDeadline(null); sendCheckIn({ type: 'hide' }); }
      if (effect.kind === 'alarm') {
        // Crew alarm, then the unresponsive protocol with "responds? NO" answered (and straight to CPR on a lost pulse).
        const url = effect.cpr ? CV_PULSE_LOST_URL : CV_EMERGENCY_URL;
        // The alarm says who it is about, so every tab shows the right name and can switch to them.
        triggerCrewAlarm(`Unresponsive detection: ${effect.reason}`, { source: 'cv', emergencyUrl: url, persona: who, personaName: name });
        go(url);
      }
    }
  }, []);

  // CAMERA OFF: the pulse alone can still trigger (about once a second, whenever a new reading arrives), but only
  // while detection is switched on. It is OFF after every page load (never saved): the header toggle turns it on.
  useEffect(() => {
    if (!enabled || cameraOn || !detector.current) return;
    const { paused: pause, inEmergency: emergency } = latest.current;
    const result = detector.current.update({ now: clockNow(), signals: null, pulse: pulse.status, isSleepTime: sleepingNow(),
      vitalsRed: pulse.vitalsRed, paused: pause, inEmergency: emergency, responded: responded.current });
    responded.current = false;
    perform(result.effects, null);
    setLive((old) => ({ ...old, state: result.state, now: clockNow() }));
  }, [pulse, cameraOn, perform, enabled]);

  /** CAMERA ON: one pass of the loop. */
  const step = useCallback(() => {
    const video = videoRef.current;
    const loaded = models.current;
    const { thresholds: t, pulse: p, paused: pause, inEmergency: emergency, fallEnabled: fall } = latest.current;
    if (!video || !loaded || !t || !detector.current || video.readyState < 2) return;

    // Skip animation frames so the models run about 10 times a second instead of 60.
    const nowMs = performance.now();
    const time = timing.current;
    if (nowMs - time.lastRun < FRAME_INTERVAL_MS) return;
    time.lastRun = nowMs;
    // MediaPipe needs a strictly increasing time stamp (ms) for every frame in VIDEO mode.
    const timestamp = Math.max(nowMs, time.lastTimestamp + 1);
    time.lastTimestamp = timestamp;

    // Run both models on the current picture and keep only the numbers we need.
    const frame = readFrame(nowMs / 1000, loaded.pose.detectForVideo(video, timestamp), loaded.face.detectForVideo(video, timestamp));
    frameRef.current = frame;
    time.fps.frames++;
    if (nowMs - time.fps.since >= 1000) time.fps = { frames: 0, since: nowMs, value: time.fps.frames };

    // Running eye counters (they can run longer than the frame window).
    const c = counters.current;
    if (blinkStarted(previousFrame.current, frame, t.eyes_closed_score)) c.blinkTimes = [...c.blinkTimes.filter((b) => b >= frame.t - 60), frame.t];
    c.eyesClosed = nextEyesClosedSeconds(c.eyesClosed, previousFrame.current, frame, t.eyes_closed_score);
    c.sinceBlink = nextSecondsSinceBlink(c.sinceBlink, previousFrame.current, frame, t.eyes_closed_score);
    previousFrame.current = frame;
    // Keep the last window_s seconds (at least nbp.hold_s) of frames.
    frames.current = lastSeconds([...frames.current, frame], Math.max(t.window_s, t.nbp.hold_s));

    const sleeping = sleepingNow();
    const shared = { present: isPresent(frame), isSleepTime: sleeping, paused: pause, fallEnabled: fall, fps: time.fps.value, now: frame.t };

    // CALIBRATION: the first calibration_s seconds with someone in view record their normal working posture.
    if (baseline.current === null) {
      if (isPresent(frame)) calibrationFrames.current.push(frame);
      const seen = calibrationFrames.current;
      const seenFor = seen.length > 1 ? seen[seen.length - 1].t - seen[0].t : 0;
      if (seenFor >= t.calibration_s) {
        baseline.current = baselinePosture(seen, t.nbp, t.landmark_visibility) ?? 0;
        c.watchedSince = frame.t;
        detector.current.reset(frame.t);
        setPhase('running');
      }
      if (nowMs - time.lastPublish >= PUBLISH_INTERVAL_MS) {
        time.lastPublish = nowMs;
        setLive({ ...EMPTY_LIVE, ...shared, calibrationLeftS: Math.max(0, t.calibration_s - seenFor) });
      }
      // The pulse still counts while calibrating.
      const result = detector.current.update({ now: frame.t, signals: null, pulse: p.status, isSleepTime: sleeping, vitalsRed: p.vitalsRed, paused: pause, inEmergency: emergency, responded: false });
      perform(result.effects, null);
      return;
    }

    // SIGNALS: limb motion, drift, posture, eyes, stare, still hand, combined score (and the Moon fall).
    const signals = computeSignals({
      frames: frames.current, baseline: baseline.current, eyesClosedSeconds: c.eyesClosed, secondsSinceBlink: c.sinceBlink,
      blinksPerMinute: blinksPerMinute(c.blinkTimes, frame.t, c.watchedSince), stillHand: p.stillHand, thresholds: t, fallEnabled: fall,
    });
    lastSignals.current = signals;
    const answered = responded.current;
    responded.current = false;

    // DETECTOR: decide, then carry out what it asks for.
    const result = detector.current.update({ now: frame.t, signals, pulse: p.status, isSleepTime: sleeping, vitalsRed: p.vitalsRed, paused: pause, inEmergency: emergency, responded: answered });
    perform(result.effects, signals);
    if (result.effects.length > 0 || nowMs - time.lastPublish >= PUBLISH_INTERVAL_MS) {
      time.lastPublish = nowMs;
      setLive({ ...shared, signals, state: result.state, baseline: baseline.current, calibrationLeftS: 0 });
    }
  }, [videoRef, perform]);

  // The loop itself: every animation frame while the camera is on (step() skips most of them).
  useEffect(() => {
    if (!cameraOn) return;
    let handle = requestAnimationFrame(function loop() {
      handle = requestAnimationFrame(loop);
      step();
    });
    return () => cancelAnimationFrame(handle);
  }, [cameraOn, step]);

  /** Load the models, open the camera, start calibrating. */
  const start = useCallback(async () => {
    if (phase === 'loading' || phase === 'calibrating' || phase === 'running') return;
    if (!latest.current.thresholds) {
      setError('thresholds.json has no usable "cv" block, so unresponsive detection cannot run.');
      setPhase('error');
      return;
    }
    // Switched on: from here the pulse-only alarm path runs too, even if the camera then fails to start.
    setEnabled(true);
    setError(null);
    setPhase('loading');
    try {
      // The models first: if a file is missing we say so before asking for the camera.
      models.current = await loadLandmarkers();
      await startCamera(videoRef.current!);
    } catch (problem) {
      stopCamera(videoRef.current);
      const known = problem instanceof ModelSetupError || problem instanceof CameraError;
      setError(known ? (problem as Error).message : `Unresponsive detection could not start: ${String(problem)}`);
      setPhase('error');
      return;
    }
    // Start clean.
    frames.current = [];
    calibrationFrames.current = [];
    baseline.current = null;
    counters.current = { eyesClosed: 0, sinceBlink: 0, blinkTimes: [], watchedSince: clockNow() };
    previousFrame.current = null;
    frameRef.current = null;
    responded.current = false;
    detector.current?.reset(clockNow());
    setLive(EMPTY_LIVE);
    setPhase('calibrating');
  }, [phase, videoRef]);

  /** Turn the camera off (the pulse check keeps running). */
  const stop = useCallback(() => {
    stopCamera(videoRef.current);
    detector.current?.reset(clockNow());
    frameRef.current = null;
    setCheckInDeadline(null);
    setLive(EMPTY_LIVE);
    setError(null);
    setPhase('off');
    setEnabled(false);
  }, [videoRef]);

  // Leaving the app: release the camera.
  useEffect(() => () => stopCamera(videoRef.current), [videoRef]);

  /** Any answer: picked up by the next update (within a tenth of a second with the camera on). */
  const respond = useCallback(() => {
    responded.current = true;
    // Tell the other tabs (the one running the camera picks it up), and hide the check-in here.
    sendCheckIn({ type: 'answer' });
    if (phaseRef.current !== 'running') setCheckInDeadline(null);
    // With the camera off, no frame loop picks the answer up, so hand it to the detector right away.
    if (phaseRef.current !== 'running' && detector.current) {
      const { pulse: p, paused: pause, inEmergency: emergency } = latest.current;
      const result = detector.current.update({ now: clockNow(), signals: null, pulse: p.status, isSleepTime: false, vitalsRed: p.vitalsRed, paused: pause, inEmergency: emergency, responded: true });
      responded.current = false;
      perform(result.effects, null);
    }
  }, [perform]);

  // Other tabs: show / hide the check-in they started, and take answers given in them.
  useEffect(() => onCheckIn((message) => {
    if (message.type === 'show') setCheckInDeadline(fromWallMs(message.deadlineWallMs));
    if (message.type === 'hide') setCheckInDeadline(null);
    if (message.type === 'answer') responded.current = true;
  }), []);

  /** Debug panel: jump straight to SUSPECTED; the next update shows "Are you OK?". */
  const forceSuspected = useCallback(() => {
    if (!detector.current || baseline.current === null) return;
    perform(detector.current.forceSuspected(clockNow()).effects, lastSignals.current);
  }, [perform]);

  /** Demo mode: same as the debug trigger, but also with the camera off (the pulse loop then drives the check-in). */
  const demoTrigger = useCallback(() => {
    if (!detector.current) return;
    setEnabled(true);
    perform(detector.current.forceSuspected(clockNow()).effects, lastSignals.current);
  }, [perform]);

  return { phase, error, live, pulse, checkInDeadline, frameRef, start, stop, respond, forceSuspected, demoTrigger, enabled };
}
