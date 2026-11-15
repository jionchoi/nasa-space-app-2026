import { Drop, Thermometer } from '@phosphor-icons/react';
import { useState } from 'react';
import { useGlucoseUnit } from '../../lib/crewReference';
import { undraft } from '../../lib/env';
import { CrewGlucoseLine } from '../common/CrewReference';
import type { Measurements, Questionnaire } from '../../types/contracts';

interface Props {
  limits: Questionnaire['entry_limits'];
  /** measurements.json: why we check (under each title) and the first how-to step (under each box). */
  measurements: Measurements | null;
  onDone(values: { temp_c: number | null; glucose_mmol: number | null }): void;
}

type Unit = 'mmol' | 'mgdl';

/** Manual entry of temperature (°C) and glucose (mmol/L or mg/dL). Each can be skipped; limits catch typing mistakes. */
export function TempGlucoseStep({ limits, measurements, onDone }: Props) {
  const [temp, setTemp] = useState('');
  const [glucose, setGlucose] = useState('');
  const [unit, setUnit] = useGlucoseUnit();  // remembered, so the metabolism region shows the same unit
  const [tried, setTried] = useState(false);
  const g = unit === 'mmol' ? limits.glucose_mmol : limits.glucose_mgdl;

  const tempValue = temp === '' ? null : Number(temp);
  const glucoseValue = glucose === '' ? null : Number(glucose);
  const tempError = tempValue !== null && (Number.isNaN(tempValue) || tempValue < limits.temp_c.min || tempValue > limits.temp_c.max)
    ? `Enter ${limits.temp_c.min} to ${limits.temp_c.max} ${limits.temp_c.unit}, or leave it empty to skip` : null;
  const glucoseError = glucoseValue !== null && (Number.isNaN(glucoseValue) || glucoseValue < g.min || glucoseValue > g.max)
    ? `Enter ${g.min} to ${g.max} ${g.unit}, or leave it empty to skip` : null;

  const save = () => {
    setTried(true);
    if (tempError || glucoseError) return;
    const mmol = glucoseValue === null ? null : unit === 'mmol' ? glucoseValue : Math.round((glucoseValue / limits.mgdl_per_mmol) * 10) / 10;
    onDone({ temp_c: tempValue, glucose_mmol: mmol });
  };

  const field = 'w-44 rounded-2xl bg-bg/70 px-4 py-3 text-center font-mono text-4xl text-text ring-1 ring-white/[0.08] focus:outline-none focus:ring-info/50';
  const hint = (metric: string) => undraft(measurements?.metrics[metric]?.how_to_measure[0]);
  const why = (metric: string) => {
    const text = measurements?.metrics[metric]?.why_check;
    return text ? <p className="-mt-1 text-sm text-muted">{undraft(text)}</p> : null;
  };
  return (
    <>
      <h2 className="text-4xl font-semibold leading-tight">Temperature and glucose</h2>
      <p className="text-lg text-muted">Type what the thermometer and glucometer show. Leave a box empty to skip it.</p>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4 text-left">
        <div className="panel flex flex-col gap-3 p-5">
          <span className="flex items-center gap-2 font-medium"><Thermometer className="h-5 w-5 text-info" aria-hidden /> Body temperature</span>
          {why('temp_c')}
          <div className="flex items-baseline gap-2">
            <input aria-label="Body temperature" inputMode="decimal" className={field} value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="36.8" />
            <span className="text-xl text-muted">{limits.temp_c.unit}</span>
          </div>
          {tried && tempError ? <p className="text-sm text-alert">{tempError}</p> : <p className="text-xs text-muted">{hint('temp_c')}</p>}
        </div>
        <div className="panel flex flex-col gap-3 p-5">
          <span className="flex items-center justify-between font-medium">
            <span className="flex items-center gap-2"><Drop className="h-5 w-5 text-info" aria-hidden /> Blood glucose</span>
            <span role="radiogroup" aria-label="Glucose unit" className="flex rounded-full bg-white/[0.04] p-0.5 text-xs ring-1 ring-white/[0.06]">
              {(['mmol', 'mgdl'] as Unit[]).map((u) => (
                <button key={u} role="radio" aria-checked={unit === u} onClick={() => { setUnit(u); setGlucose(''); }}
                  className={`rounded-full px-2.5 py-0.5 transition ${unit === u ? 'bg-raised text-text' : 'text-muted hover:text-text'}`}>
                  {u === 'mmol' ? 'mmol/L' : 'mg/dL'}
                </button>
              ))}
            </span>
          </span>
          {why('glucose_mmol')}
          <div className="flex items-baseline gap-2">
            <input aria-label={`Blood glucose in ${g.unit}`} inputMode="decimal" className={field} value={glucose} onChange={(e) => setGlucose(e.target.value)} placeholder={unit === 'mmol' ? '5.4' : '97'} />
            <span className="text-xl text-muted">{g.unit}</span>
          </div>
          {tried && glucoseError ? <p className="text-sm text-alert">{glucoseError}</p> : <p className="text-xs text-muted">{hint('glucose_mmol')}</p>}
          <CrewGlucoseLine className="border-t border-white/[0.06] pt-2" />
        </div>
      </div>
      <div className="flex gap-3">
        <button className="btn btn-primary px-8 py-3 text-lg" onClick={save}>{tempValue === null && glucoseValue === null ? 'Skip this step' : 'Next'}</button>
      </div>
    </>
  );
}
