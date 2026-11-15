import { fmt, STATUS_CLASS } from '../../lib/status';
import type { CabinSummary } from '../../types/contracts';

const ITEMS = [
  { key: 'co2_ppm', label: 'CO2', unit: 'ppm', digits: 0 },
  { key: 'temp_c', label: 'Temp', unit: '°C', digits: 1 },
  { key: 'noise_dba', label: 'Noise', unit: 'dBA', digits: 0 },
] as const;

/** "Cabin air (simulated)": CO2, temperature and noise, each colored by its status from thresholds.json.
 *  `estimated`: no real cabin data at this location (the surface rover). */
export function CabinPanel({ cabin, estimated }: { cabin: CabinSummary | null; estimated?: boolean }) {
  if (!cabin) return null;
  return (
    <section aria-label="Cabin air" className="flex flex-col gap-2.5 rounded-panel border border-line bg-panel px-5 py-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Cabin air</h2>
        {estimated
          ? <span className="badge bg-watch/10 text-watch ring-watch/25" title="No cabin sensors on the rover: estimated values">Estimated</span>
          : <span className="text-xs text-muted" title={cabin.source}>Simulated</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ITEMS.map(({ key, label, unit, digits }) => {
          const status = cabin.status[key];
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted">{label}</span>
              <span className={`font-mono text-base font-semibold ${status === 'green' ? 'text-text' : STATUS_CLASS[status].text}`}>
                {fmt(cabin.now[key], digits)}<span className="font-sans text-[11px] font-normal text-muted"> {unit}</span>
              </span>
            </div>
          );
        })}
      </div>
      {cabin.co2_high_hours_24h > 0 && <p className="text-xs text-muted">CO2 high for {fmt(cabin.co2_high_hours_24h)} h in the last 24 h</p>}
    </section>
  );
}
