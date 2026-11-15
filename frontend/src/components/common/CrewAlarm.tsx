import { Siren, SpeakerSlash, X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { postEvent } from '../../api/client';
import { clearCrewAlarm, DEFAULT_EMERGENCY_URL, useCrewAlarm } from '../../lib/crewAlarm';
import { audioOut, useMuted } from '../../lib/sound';
import { useApp } from '../../state/AppContext';

const TONE = { high: 960, low: 640, step_s: 0.45, volume: 0.5 }; // two-tone siren, made with Web Audio (no files)
/** Development builds only: the siren stops by itself after this long (the visual alarm stays until answered). */
const DEV_SIREN_LIMIT_MS = 60_000;

/** Loud repeating two-tone alarm until stopped (or muted: it plays through the shared, mutable output).
 *  Browsers may block sound until the page has been clicked once. */
function useAlarmTone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const { ctx: audio, out } = audioOut();
    const gain = audio.createGain();
    gain.gain.value = TONE.volume;
    gain.connect(out);
    const osc = audio.createOscillator();
    osc.type = 'square';
    osc.connect(gain);
    const t0 = audio.currentTime;
    for (let i = 0; i < 400; i++) osc.frequency.setValueAtTime(i % 2 ? TONE.low : TONE.high, t0 + i * TONE.step_s); // ~3 min, re-armed below
    osc.start();
    const rearm = setInterval(() => {
      const now = audio.currentTime;
      for (let i = 0; i < 400; i++) osc.frequency.setValueAtTime(i % 2 ? TONE.low : TONE.high, now + i * TONE.step_s);
    }, 150_000);
    let stopped = false;
    const silence = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(rearm);
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    };
    const devLimit = import.meta.env.DEV ? setTimeout(silence, DEV_SIREN_LIMIT_MS) : undefined;
    return () => {
      clearTimeout(devLimit);
      silence();
    };
  }, [on]);
}

/** Full-screen flashing red overlay: "CREW ALARM: crew member not responding, <location>". Raised by triggerCrewAlarm(). */
export function CrewAlarm() {
  const alarm = useCrewAlarm();
  const navigate = useNavigate();
  const { persona, setPersona, personaInfo, envInfo } = useApp();
  useAlarmTone(!!alarm);
  const muted = useMuted();
  // The crew member the alarm is about (it may come from another tab showing someone else).
  const who = alarm?.persona ?? persona;

  // Log it once, in the tab that raised it (other tabs only show it).
  useEffect(() => {
    if (!alarm || alarm.fromOtherTab) return;
    void postEvent({ t: alarm.at, type: 'alarm', signals: { source: 'crew_alarm', origin: alarm.source ?? 'app', reason: alarm.reason, text: `Crew alarm: ${alarm.reason}` } }, alarm.persona ?? persona);
    // Only when a new alarm arrives, not when the persona shown here changes.
  }, [alarm]);

  if (!alarm) return null;
  const location = alarm.location ?? envInfo?.label ?? 'unknown location';
  const name = alarm.personaName ?? personaInfo?.name;
  const respond = () => {
    void postEvent({ t: new Date().toISOString(), type: 'alarm', signals: { source: 'crew_alarm', text: 'Crew responding to the alarm' } }, who);
    clearCrewAlarm();
    // Open emergency mode for the crew member the alarm is about, even if this tab showed someone else.
    if (who !== persona) setPersona(who);
    navigate(alarm.emergencyUrl ?? DEFAULT_EMERGENCY_URL);
  };
  const falseAlarm = () => {
    void postEvent({ t: new Date().toISOString(), type: 'ok_confirmed', signals: { source: 'crew_alarm', reason: alarm.reason, text: 'False alarm' } }, who);
    clearCrewAlarm();
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Crew alarm" className="fixed inset-0 z-[60] grid place-items-center bg-alert p-8 text-white">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-bg/40" aria-hidden />
      <div className="relative flex max-w-5xl flex-col items-center gap-8 text-center">
        <Siren className="h-28 w-28 animate-pulse" weight="fill" aria-hidden />
        <h1 className="text-6xl font-black leading-tight tracking-tight">
          CREW ALARM: crew member not responding, {location}
        </h1>
        <p className="text-2xl font-medium opacity-90">{name ? `${name} · ` : ''}{alarm.reason}</p>
        {muted && (
          <span className="flex items-center gap-2 rounded-full bg-bg/40 px-4 py-1.5 text-lg font-bold ring-2 ring-white/60">
            <SpeakerSlash className="h-5 w-5" weight="bold" aria-hidden /> Muted (press M for sound)
          </span>
        )}
        <div className="flex gap-5">
          <button onClick={respond} autoFocus
            className="rounded-3xl bg-white px-14 py-7 text-4xl font-black text-alert shadow-2xl transition active:scale-[0.98] focus:outline-none focus-visible:ring-8 focus-visible:ring-white/50">
            I'm responding
          </button>
          <button onClick={falseAlarm}
            className="flex items-center gap-3 rounded-3xl bg-bg/30 px-10 py-7 text-3xl font-bold ring-2 ring-white/60 transition hover:bg-bg/40 active:scale-[0.98]">
            <X className="h-8 w-8" weight="bold" aria-hidden /> False alarm
          </button>
        </div>
      </div>
    </div>
  );
}
