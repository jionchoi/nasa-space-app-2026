// Full-screen "Are you OK?" shown when unresponsive detection suspects the crew member is not responding. Any tap,
// any key, speaking, a purposeful hand movement (seen by the detector) or the "I'm OK" button answers it. If nobody answers before the countdown ends, the detector raises the crew alarm.
import { useEffect, useState } from 'react';
import { listenForVoice } from '../../cv/voice';
import { audioOut } from '../../lib/sound';
import { useCv } from '../../state/CvContext';

// A soft repeating beep (not the alarm siren): one short note every second, made with Web Audio (no sound files).
const BEEP = { frequency: 880, length_s: 0.18, every_ms: 1000, volume: 0.25 };

/** Plays the beep while `on` is true. Browsers may block sound until the page has been clicked once. */
function useBeep(on: boolean) {
  useEffect(() => {
    if (!on) return;
    // The app's shared audio output (lib/sound.ts), so the global mute silences the beep too.
    const { ctx, out } = audioOut();
    // One short note: a sine wave that fades out quickly so it sounds like a beep, not a click.
    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = BEEP.frequency;
      gain.gain.setValueAtTime(BEEP.volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEEP.length_s);
      osc.connect(gain).connect(out);
      osc.start();
      osc.stop(ctx.currentTime + BEEP.length_s);
    };
    // First beep at once, then every second.
    beep();
    const timer = setInterval(beep, BEEP.every_ms);
    return () => clearInterval(timer);
  }, [on]);
}

/** Seconds left until `deadline` (detector clock = performance.now() / 1000), refreshed 5 times a second. */
function useSecondsLeft(deadline: number | null): number {
  const [seconds, setSeconds] = useState(() => (deadline === null ? 0 : Math.ceil(deadline - performance.now() / 1000)));
  useEffect(() => {
    // Whole seconds left, never below 0.
    const left = () => (deadline === null ? 0 : Math.max(0, Math.ceil(deadline - performance.now() / 1000)));
    setSeconds(left());
    if (deadline === null) return;
    const timer = setInterval(() => setSeconds(left()), 200);
    return () => clearInterval(timer);
  }, [deadline]);
  return seconds;
}

export function CheckInOverlay() {
  const { checkInDeadline, respond, thresholds } = useCv();
  const showing = checkInDeadline !== null;
  const seconds = useSecondsLeft(checkInDeadline);
  useBeep(showing);

  // Any key on the keyboard counts as an answer.
  useEffect(() => {
    if (!showing) return;
    const onKey = () => respond();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing, respond]);

  // Speaking counts too: the microphone listens only while this overlay shows (loudness only, nothing recorded).
  const voiceLevel = thresholds?.voice_level;
  const voiceMin = thresholds?.voice_min_s;
  useEffect(() => {
    if (!showing || voiceLevel === undefined || voiceMin === undefined) return;
    let stop = () => {};
    let cancelled = false;
    void listenForVoice(voiceLevel, voiceMin, respond).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop(); };
  }, [showing, voiceLevel, voiceMin, respond]);

  if (!showing) return null;
  return (
    // A tap anywhere on the overlay is an answer, so a crew member who can barely move a hand still counts as OK.
    <div role="alertdialog" aria-modal="true" aria-label="Are you OK?" onPointerDown={respond}
      className="fixed inset-0 z-[55] grid cursor-pointer place-items-center bg-bg/95 p-8 text-center backdrop-blur">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-watch">Unresponsive detection</p>
        <h1 className="mt-3 text-6xl font-semibold tracking-tight">Are you OK?</h1>
        <p className="mt-3 text-xl text-muted">Tap, speak or move your hand.</p>
        {/* The big countdown. When it reaches 0 the crew alarm goes off. */}
        <p className="mt-10 font-mono text-[9rem] leading-none text-alert" aria-live="assertive">{seconds}</p>
        <p className="mt-2 text-sm text-muted">seconds until the crew is alerted</p>
        <button className="btn btn-primary mt-10 h-14 px-10 text-lg" onClick={respond} autoFocus>I'm OK</button>
      </div>
    </div>
  );
}
