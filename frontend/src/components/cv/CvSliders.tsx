// Sliders for the debug panel: change the top-level "cv" numbers and the six weights for this browser session.
// min/max/step are only each slider's range, not medical limits; the real values live in thresholds.json.
import type { CvOverrides } from '../../cv/thresholds';
import type { CvThresholds } from '../../cv/types';

type NumberKey = keyof Omit<CvOverrides, 'weights'>;
const SLIDERS: { key: NumberKey; label: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'limb_motion_low', label: 'Hands still below', unit: 'sw/s', min: 0.01, max: 0.3, step: 0.01 },
  { key: 'limb_motion_spike', label: 'Hand movement answers above', unit: 'sw/s', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'eyes_closed_score', label: 'Eye closed above', unit: 'score', min: 0.1, max: 0.9, step: 0.05 },
  { key: 'stare_after_s', label: 'Full stare after', unit: 's', min: 5, max: 60, step: 1 },
  { key: 'unresponsive_threshold', label: 'Unresponsive at or above', unit: 'score', min: 0.3, max: 1, step: 0.05 },
  { key: 'suspect_after_s', label: 'Score high for', unit: 's', min: 3, max: 60, step: 1 },
  { key: 'suspect_after_s_with_red_vitals', label: 'Score high for (red vitals)', unit: 's', min: 2, max: 30, step: 1 },
  { key: 'checkin_countdown_s', label: '"Are you OK?" countdown', unit: 's', min: 5, max: 30, step: 1 },
  { key: 'cooldown_s', label: 'Cooldown', unit: 's', min: 10, max: 300, step: 10 },
  { key: 'window_s', label: 'Motion window', unit: 's', min: 2, max: 10, step: 1 },
];
const WEIGHTS: (keyof CvThresholds['weights'])[] = ['limb_stillness', 'nbp', 'eyes', 'drift', 'stare', 'still_hand'];

interface Props {
  thresholds: CvThresholds;
  overrides: CvOverrides;
  onNumber(key: NumberKey, value: number): void;
  onWeight(key: keyof CvThresholds['weights'], value: number): void;
}

/** One labelled slider; the value shows in blue when it differs from the file. */
function Slider({ label, value, unit, changed, min, max, step, onChange }: {
  label: string; value: number; unit: string; changed: boolean; min: number; max: number; step: number; onChange(v: number): void;
}) {
  return (
    <label className="text-xs text-muted">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className={`font-mono ${changed ? 'text-info' : 'text-text'}`}>{value} {unit}</span>
      </span>
      <input type="range" className="mt-1 w-full accent-[rgb(var(--c-info))]" min={min} max={max} step={step}
        value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function CvSliders({ thresholds: t, overrides, onNumber, onWeight }: Props) {
  return (
    <div className="mt-6 grid gap-x-8 gap-y-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
      {SLIDERS.map(({ key, label, unit, min, max, step }) => (
        <Slider key={key} label={`${label} (${key})`} value={t[key] as number} unit={unit} changed={key in overrides}
          min={min} max={max} step={step} onChange={(v) => onNumber(key, v)} />
      ))}
      {WEIGHTS.map((key) => (
        <Slider key={key} label={`Weight: ${key}`} value={t.weights[key]} unit="" changed={overrides.weights?.[key] !== undefined}
          min={0} max={1} step={0.05} onChange={(v) => onWeight(key, v)} />
      ))}
    </div>
  );
}
