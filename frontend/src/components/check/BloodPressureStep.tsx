import { Heartbeat } from '@phosphor-icons/react';
import { useState } from 'react';
import { undraft } from '../../lib/env';
import type { EntryLimit, MeasurementInfo } from '../../types/contracts';

interface Props {
  /** Typing-mistake limits (questionnaire.json entry_limits), not medical ranges. */
  limits: { bp_sys: EntryLimit; bp_dia: EntryLimit };
  /** measurements.json bp_sys: cuff steps and why we check. */
  info?: MeasurementInfo;
  onDone(values: { bp_sys: number | null; bp_dia: number | null }): void;
}

/** Manual blood pressure entry from the arm cuff: short cuff steps, then the top and bottom number. Can be skipped. */
export function BloodPressureStep({ limits, info, onDone }: Props) {
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [tried, setTried] = useState(false);
  const s = sys === '' ? null : Number(sys);
  const d = dia === '' ? null : Number(dia);
  const out = (v: number | null, l: EntryLimit) => v !== null && (!Number.isInteger(v) || v < l.min || v > l.max);

  let error: string | null = null;
  if ((s === null) !== (d === null)) error = 'Enter both numbers, or leave both empty to skip';
  else if (out(s, limits.bp_sys)) error = `Top number: enter ${limits.bp_sys.min} to ${limits.bp_sys.max} ${limits.bp_sys.unit}`;
  else if (out(d, limits.bp_dia)) error = `Bottom number: enter ${limits.bp_dia.min} to ${limits.bp_dia.max} ${limits.bp_dia.unit}`;
  else if (s !== null && d !== null && d >= s) error = 'The bottom number should be lower than the top number';

  const save = () => {
    setTried(true);
    if (!error) onDone({ bp_sys: s, bp_dia: d });
  };
  const field = 'w-36 rounded-2xl bg-bg/70 px-4 py-3 text-center font-mono text-4xl text-text ring-1 ring-white/[0.08] focus:outline-none focus:ring-info/50';

  return (
    <>
      <h2 className="text-4xl font-semibold leading-tight">Blood pressure</h2>
      {info && <p className="-mt-3 max-w-2xl text-base text-muted">{undraft(info.why_check)}</p>}
      <div className="grid w-full max-w-3xl gap-4 text-left md:grid-cols-[1fr_auto]">
        <div className="panel flex flex-col gap-2 p-5">
          <span className="flex items-center gap-2 font-medium"><Heartbeat className="h-5 w-5 text-info" aria-hidden /> Before you press start on the cuff</span>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-soft">
            {(info?.how_to_measure ?? []).map((step) => <li key={step}>{undraft(step)}</li>)}
          </ol>
        </div>
        <div className="panel flex flex-col items-center gap-3 p-5">
          <div className="flex items-end gap-3">
            <label className="flex flex-col items-center gap-1 text-xs text-muted">
              Top (systolic)
              <input aria-label="Blood pressure, top number" inputMode="numeric" className={field} value={sys}
                min={limits.bp_sys.min} max={limits.bp_sys.max} onChange={(e) => setSys(e.target.value.trim())} placeholder="118" />
            </label>
            <span className="pb-4 text-4xl text-muted">/</span>
            <label className="flex flex-col items-center gap-1 text-xs text-muted">
              Bottom (diastolic)
              <input aria-label="Blood pressure, bottom number" inputMode="numeric" className={field} value={dia}
                min={limits.bp_dia.min} max={limits.bp_dia.max} onChange={(e) => setDia(e.target.value.trim())} placeholder="76" />
            </label>
          </div>
          <span className="text-sm text-muted">{limits.bp_sys.unit}</span>
          {tried && error && <p className="text-sm text-alert" role="alert">{error}</p>}
        </div>
      </div>
      <div className="flex gap-3">
        <button className="btn btn-primary px-8 py-3 text-lg" onClick={save}>Next</button>
        <button className="btn bg-transparent text-muted hover:text-text" onClick={() => onDone({ bp_sys: null, bp_dia: null })}>Skip blood pressure</button>
      </div>
    </>
  );
}
