// Watches the live vitals for the pulse, ALL THE TIME (with or without the camera): pulse lost, clip off,
// still hand and red flags (pulse.ts). Replaces useVitalsRed.
import { useEffect, useRef, useState } from 'react';
import { connectVitals } from '../api/client';
import type { Thresholds } from '../types/contracts';
import { normalAmplitude, pulseReading, type PulseSample } from './pulse';
import type { CvThresholds, PulseReading } from './types';

// Keep two minutes of vitals (about one frame per second): long enough for the 60 s "still hand" check.
const KEEP_SAMPLES = 120;
// How often to re-read the status when no new frame arrives (so a stopped sensor turns into "no data").
const RECHECK_MS = 1000;

const NO_DATA: PulseReading = {
  status: 'no_data', reason: 'No vitals from the sensor', stillHand: false, vitalsRed: false, quality: null, amplitudeRatio: null, secondsWithoutBeats: 0,
};

/** The latest pulse reading for this persona. Updates about once a second. */
export function usePulseMonitor(persona: string, all: Thresholds | null, cv: CvThresholds | null): PulseReading {
  const [reading, setReading] = useState<PulseReading>(NO_DATA);
  // The newest numbers for the timer callbacks.
  const config = useRef({ all, cv });
  config.current = { all, cv };

  useEffect(() => {
    let samples: PulseSample[] = [];
    // This person's normal pulse wave height, updated only while the pulse is ok.
    let reference: number | null = null;
    const now = () => performance.now() / 1000;

    /** Re-read the status from the samples and remember a new normal amplitude when all is well. */
    const update = () => {
      const { all: a, cv: c } = config.current;
      if (!c) return;
      const next = pulseReading(samples, now(), reference, a, c);
      if (next.status === 'ok') reference = normalAmplitude(samples) ?? reference;
      setReading(next);
    };

    // Each new vitals frame: keep it (with our arrival time) and re-read.
    const connection = connectVitals(persona, (frame) => {
      samples = [...samples.slice(-(KEEP_SAMPLES - 1)), { at: now(), frame }];
      update();
    });
    // Also re-read once a second, so a sensor that stops sending turns into "no data".
    const timer = setInterval(update, RECHECK_MS);
    return () => {
      clearInterval(timer);
      connection.close();
    };
  }, [persona]);

  return reading;
}
