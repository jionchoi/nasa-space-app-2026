import { Check } from '@phosphor-icons/react';
import { useState } from 'react';
import { entryOf, fmt, judge, STATUS_CLASS } from '../../lib/status';
import type { Questionnaire, Thresholds, VitalsFrame } from '../../types/contracts';
import { SkipButton } from './CheckShell';

interface Props {
  config: Questionnaire;
  frames: VitalsFrame[];
  thresholds: Thresholds | null;
  onStart(): void;
  onSkip(): void;
}

/** Seconds the signal has been good without a break, up to now. */
function goodSignalSeconds(frames: VitalsFrame[], thresholds: Thresholds | null): number {
  const entry = entryOf(thresholds, 'signal_quality');
  let first = frames.length;
  while (first > 0 && judge(frames[first - 1].signal_quality, entry) === 'green') first--;
  if (first >= frames.length) return 0;
  return (Date.parse(frames[frames.length - 1].t) - Date.parse(frames[first].t)) / 1000 + 1;
}

export function PrepareStep({ config, frames, thresholds, onStart, onSkip }: Props) {
  const items = config.prepare.checklist;
  const [ticked, setTicked] = useState<boolean[]>(() => items.map(() => false));
  const latest = frames[frames.length - 1];
  const hold = config.measurement.signal_hold_s;
  const good = goodSignalSeconds(frames, thresholds);
  const signal = latest ? judge(latest.signal_quality, entryOf(thresholds, 'signal_quality')) : 'red';
  const ready = ticked.every(Boolean) && good >= hold;

  return (
    <>
      <h2 className="text-4xl font-semibold leading-tight">{config.prepare.instruction}</h2>

      <ul className="w-full max-w-md space-y-2 text-left">
        {items.map((text, i) => (
          <li key={text}>
            <label className="panel flex cursor-pointer items-center gap-3 px-4 py-3 text-lg transition duration-300 hover:bg-raised">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={ticked[i]}
                onChange={() => setTicked((t) => t.map((v, j) => (j === i ? !v : v)))}
              />
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 transition duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-info ${
                ticked[i] ? 'bg-ok text-bg ring-ok' : 'ring-white/20'}`}>
                {ticked[i] && <Check className="h-4 w-4" weight="bold" aria-hidden />}
              </span>
              {text}
            </label>
          </li>
        ))}
      </ul>

      <div className="w-full max-w-md text-left">
        <div className="mb-1 flex justify-between text-sm">
          <span className="label">Signal</span>
          <span className={STATUS_CLASS[signal].text}>
            {latest ? `${fmt(latest.signal_quality * 100, 0)} %` : 'waiting for sensor…'}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full transition-all ${STATUS_CLASS[signal].bg}`}
            style={{ width: `${(latest?.signal_quality ?? 0) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-sm text-muted">
          {good >= hold
            ? 'Signal is good and steady.'
            : `Waiting for a good, steady signal (${Math.min(hold, Math.floor(good))} of ${hold} s).`}
        </p>
      </div>

      <button className="btn btn-primary px-10 py-3 text-xl" disabled={!ready} onClick={onStart}>Start</button>
      {!ready && <p className="-mt-3 text-sm text-muted">Tick all three boxes and wait for a steady signal.</p>}
      <SkipButton onSkip={onSkip} />
    </>
  );
}
