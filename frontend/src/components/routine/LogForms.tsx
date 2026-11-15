import { useState, type ReactNode } from 'react';
import { logSymptoms, redFlagOnly, symptomsConfig } from '../../lib/symptoms';
import { useApp } from '../../state/AppContext';
import { useSignals } from '../../state/SignalContext';

// Input checks catch typing mistakes; they are not medical ranges (those live in thresholds.json).
export interface FormProps { onSave(data: Record<string, unknown>): Promise<string | null> }

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const SIZES = ['small', 'normal', 'large'] as const;
const EXERCISES = ['treadmill', 'bike', 'resistance', 'other'] as const;

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={`flex-1 rounded-full px-3 py-1.5 text-sm capitalize transition ${value === o ? 'bg-raised text-text' : 'text-muted hover:text-text'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs text-alert">{error}</span>}
    </label>
  );
}

const input = 'rounded-xl bg-bg/70 px-3 py-2 font-mono text-text ring-1 ring-white/[0.08] focus:outline-none focus:ring-info/50';

function SaveRow({ busy, message, onSave }: { busy: boolean; message: string | null; onSave(): void }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <span className={`text-sm ${message?.startsWith('Saved') ? 'text-ok' : 'text-alert'}`} role="status">{message}</span>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}

function useSave(onSave: FormProps['onSave']) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (data: Record<string, unknown>) => {
    setBusy(true);
    setMessage((await onSave(data)) ?? 'Saved.');
    setBusy(false);
  };
  return { busy, message, run, setMessage };
}

export function MealForm({ onSave }: FormProps) {
  const [mealType, setMealType] = useState<(typeof MEALS)[number]>('lunch');
  const [size, setSize] = useState<(typeof SIZES)[number]>('normal');
  const [water, setWater] = useState('0.5');
  const [notes, setNotes] = useState('');
  const s = useSave(onSave);
  const w = Number(water);
  const error = Number.isNaN(w) || w < 0 || w > 3 ? 'Enter 0 to 3 litres' : undefined;
  return (
    <div className="space-y-4">
      <Field label="Meal"><Segmented label="Meal" value={mealType} options={MEALS} onChange={(v) => setMealType(v)} /></Field>
      <Field label="Size"><Segmented label="Size" value={size} options={SIZES} onChange={(v) => setSize(v)} /></Field>
      <Field label="Water drunk with this meal (L)" error={error} hint="A drink pouch is about 0.25 L.">
        <div className="flex gap-2">
          <input className={`${input} w-28`} inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} />
          {[0.25, 0.5, 1].map((v) => <button key={v} type="button" className="btn px-3" onClick={() => setWater(String(v))}>{v} L</button>)}
        </div>
      </Field>
      <Field label="Notes (optional)"><textarea className={`${input} font-sans`} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <SaveRow busy={s.busy} message={s.message} onSave={() => (error ? s.setMessage(error) : s.run({ meal_type: mealType, size, water_l: w, notes }))} />
    </div>
  );
}

export function ExerciseForm({ onSave }: FormProps) {
  const [minutes, setMinutes] = useState('30');
  const [type, setType] = useState<(typeof EXERCISES)[number]>('treadmill');
  const s = useSave(onSave);
  const m = Number(minutes);
  const error = !Number.isInteger(m) || m < 1 || m > 300 ? 'Enter 1 to 300 minutes' : undefined;
  return (
    <div className="space-y-4">
      <Field label="Exercise"><Segmented label="Exercise" value={type} options={EXERCISES} onChange={(v) => setType(v)} /></Field>
      <Field label="Minutes" error={error}><input className={`${input} w-28`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
      <SaveRow busy={s.busy} message={s.message} onSave={() => (error ? s.setMessage(error) : s.run({ minutes: m, type }))} />
    </div>
  );
}

export function BiomarkerForm({ onSave }: FormProps) {
  const [mass, setMass] = useState('');
  const [notes, setNotes] = useState('');
  const s = useSave(onSave);
  const kg = Number(mass);
  const massError = !mass || Number.isNaN(kg) || kg < 30 || kg > 200 ? 'Enter your body mass, 30 to 200 kg' : undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Once a week. Body mass change feeds the metabolism area. Blood pressure is now part of the daily check.</p>
      <Field label="Body mass (kg)" error={massError && mass ? massError : undefined} hint="From the on-board body mass device.">
        <input className={`${input} w-32`} inputMode="decimal" value={mass} onChange={(e) => setMass(e.target.value)} />
      </Field>
      <Field label="Notes (optional)"><textarea className={`${input} font-sans`} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <SaveRow busy={s.busy} message={s.message} onSave={() => {
        if (massError) { s.setMessage(massError); return; }
        void s.run({ body_mass_kg: kg, notes });
      }} />
    </div>
  );
}

/** Symptom choices: the questionnaire's symptom questions (questionnaire.json ids), with short names. */
export const SYMPTOMS: { id: string; label: string }[] = [
  { id: 'headache', label: 'Headache' },
  { id: 'nausea_appetite', label: 'Nausea or no appetite' },
  { id: 'cough_sore_throat_fever', label: 'Cough, sore throat or fever' },
  { id: 'muscle_back_pain', label: 'Muscle or back pain' },
  { id: 'vision', label: 'Blurry vision' },
];

/** v4 "Mood and symptoms": mood 1-10 and symptoms felt now. Saved as a "mood" form. The mood score is display and
 *  timeline only (not a validated instrument); a red-flag symptom (thresholds.json "symptoms") is Act now. */
export function MoodForm({ onSave }: FormProps) {
  const { thresholds, persona } = useApp();
  const demo = useSignals().mode === 'demo'; // no automatic alerts outside Demo mode (clinical_auto_alert_enabled = false)
  const redFlags = Object.entries(symptomsConfig(thresholds)?.red_flag ?? {});
  const [mood, setMood] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const s = useSave(onSave);
  const toggle = (id: string) => setSymptoms((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <div className="space-y-4">
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium">Mood right now (1 = very low, 10 = very good)</legend>
        <div role="radiogroup" aria-label="Mood from 1 to 10" className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={mood === n} onClick={() => setMood(n)}
              className={`h-11 rounded-lg border font-mono ${mood === n ? 'border-text bg-text text-bg' : 'border-line-strong hover:bg-raised'}`}>{n}</button>
          ))}
        </div>
      </fieldset>
      {redFlags.length > 0 && (
        <fieldset className="flex flex-col gap-1.5 rounded-lg border border-alert/40 p-2 text-sm">
          <legend className="px-1 font-medium text-alert">Danger signs now (any of these = Act now)</legend>
          {redFlags.map(([id, label]) => (
            <label key={id} className="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-lg px-1 hover:bg-raised/50">
              <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--c-alert))]" checked={symptoms.includes(id)} onChange={() => toggle(id)} />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-medium">Symptoms now (optional)</legend>
        {SYMPTOMS.map((o) => (
          <label key={o.id} className="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-lg px-1 hover:bg-raised/50">
            <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--c-info))]" checked={symptoms.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.label}
          </label>
        ))}
      </fieldset>
      <Field label="Notes (optional)"><textarea className={`${input} font-sans`} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <p className="text-xs text-muted">Shown on your mission timeline. The 1-10 mood score is not a validated mood test; the daily check questions still set the Brain and mood status.</p>
      <SaveRow busy={s.busy} message={s.message} onSave={() => {
        if (mood === null) return s.setMessage('Pick a mood from 1 to 10');
        s.run({ mood, symptoms, notes });
        if (demo) logSymptoms(redFlagOnly(symptoms, symptomsConfig(thresholds)), persona);
      }} />
    </div>
  );
}
