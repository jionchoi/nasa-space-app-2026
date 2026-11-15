import { useEffect, useRef, useState } from 'react';
import { undraft } from '../../lib/env';
import { entryOf, fmt, judge, mmss } from '../../lib/status';
import type { Questionnaire, Thresholds, VitalsFrame } from '../../types/contracts';
import { SkipButton } from './CheckShell';

interface Props {
  /** Instruction lines; the first one is shown large. */
  lines: string[];
  durationS: number;
  latest?: VitalsFrame;
  thresholds: Thresholds | null;
  measurement: Questionnaire['measurement'];
  breathing?: boolean;
  /** measurements.json why_check, shown in one line under the title. */
  why?: string;
  onDone(recorded: VitalsFrame[]): void;
  onSkip?(): void;
}

/** Timed measurement with the measurement coach: calm hints on a bad signal, pause after a few seconds. */
export function MeasureStep({ lines, durationS, latest, thresholds, measurement, breathing, why, onDone, onSkip }: Props) {
  const [remaining, setRemaining] = useState(durationS);
  const [badFor, setBadFor] = useState(0);
  const recorded = useRef<VitalsFrame[]>([]);
  const latestRef = useRef(latest);
  const done = useRef(onDone);
  latestRef.current = latest;
  done.current = onDone;

  useEffect(() => {
    if (latest) recorded.current.push(latest); // record every frame, good or bad
  }, [latest]);

  // The coach uses the "orange" limit of signal_quality in thresholds.json.
  const signalBad = (frame?: VitalsFrame) => {
    const status = frame ? judge(frame.signal_quality, entryOf(thresholds, 'signal_quality')) : 'red';
    return status === 'orange' || status === 'red';
  };
  const badRef = useRef(signalBad);
  badRef.current = signalBad;

  useEffect(() => {
    let bad = 0;
    const timer = setInterval(() => {
      bad = badRef.current(latestRef.current) ? bad + 1 : 0;
      setBadFor(bad);
      if (bad > measurement.pause_after_bad_s) return; // paused
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [measurement.pause_after_bad_s]);

  useEffect(() => {
    if (remaining === 0) done.current(recorded.current);
  }, [remaining]);

  const paused = badFor > measurement.pause_after_bad_s;
  const hint = [...measurement.hints].reverse().find((h) => badFor > h.after_s)?.text;

  return (
    <>
      <h2 className="text-4xl font-semibold leading-tight">{lines[0]}</h2>
      {why && <p className="-mt-3 max-w-2xl text-base text-muted">{undraft(why)}</p>}
      {lines.slice(1).map((line) => <p key={line} className="-mt-3 text-xl text-muted">{line}</p>)}

      <div className="flex items-center gap-12">
        {breathing && (
          <div className="flex flex-col items-center gap-2">
            <div className="grid h-40 w-40 place-items-center">
              <div
                className="h-40 w-40 animate-breathe rounded-full border-2 border-info bg-info/20"
                style={{ animationDuration: `${60 / measurement.breaths_per_min}s` }}
              />
            </div>
            <p className="text-sm text-muted">Breathe in as the circle grows, out as it shrinks</p>
          </div>
        )}
        <div>
          <div className={`font-mono text-[9rem] font-semibold leading-none ${paused ? 'text-muted' : ''}`} role="timer">
            {mmss(remaining)}
          </div>
          <p className="h-6 text-sm text-watch">{paused ? 'Timer paused until the signal is good again' : ''}</p>
        </div>
        <div className="panel min-w-[150px] px-5 py-3">
          <div className="label">Heart rate</div>
          <div className="font-mono text-5xl font-semibold">{latest ? fmt(latest.hr, 0) : '--'}</div>
          <div className="text-sm text-muted">bpm, live</div>
        </div>
      </div>

      <div className="h-14" aria-live="polite">
        {hint && (
          <div className="rounded-lg border border-watch bg-watch/10 px-8 py-3 text-2xl font-medium text-watch">{hint}</div>
        )}
      </div>
      {onSkip && <SkipButton onSkip={onSkip} />}
    </>
  );
}
