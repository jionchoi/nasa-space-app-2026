import { useState, type ReactNode } from 'react';

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
