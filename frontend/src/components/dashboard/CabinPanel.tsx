import { fmt, STATUS_CLASS } from '../../lib/status';
import type { CabinField, CabinSummary } from '../../types/contracts';

const ITEMS: { key: CabinField; label: string; unit: string; digits: number }[] = [
  { key: 'co2_ppm', label: 'CO2', unit: 'ppm', digits: 0 },
  { key: 'temp_c', label: 'Temp', unit: '°C', digits: 1 },
  { key: 'rh_pct', label: 'Humidity', unit: '%', digits: 0 },
  { key: 'noise_dba', label: 'Noise', unit: 'dBA', digits: 0 },
];

/** "Cabin air": CO2, temperature and humidity (real ISS telemetry replay) or noise (simulated fallback), each colored
 *  by its status from thresholds.json. The same ISS readings are shown at every location (see the Learn tab). */
export function CabinPanel({ cabin }: { cabin: CabinSummary | null }) {
  if (!cabin) return null;
  const real = cabin.kind === 'real';
  const items = ITEMS.filter(({ key }) => typeof cabin.now[key] === 'number').slice(0, 3);
  return (
    <section aria-label="Cabin air" className="flex flex-col gap-2.5 rounded-panel border border-line bg-panel px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Cabin air</h2>
        {real
          ? <a href={cabin.source_urls?.[0]} target="_blank" rel="noreferrer" title={cabin.mission ?? undefined}
              className="badge bg-info/10 text-info ring-info/25 hover:underline">{cabin.badge}</a>
          : <span className="text-xs text-muted" title={cabin.source}>Simulated</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ key, label, unit, digits }) => {
          const status = cabin.status[key] ?? 'green';
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted">{label}</span>
              <span className={`font-mono text-base font-semibold ${status === 'green' ? 'text-text' : STATUS_CLASS[status].text}`}>
                {fmt(cabin.now[key] as number, digits)}<span className="font-sans text-[11px] font-normal text-muted"> {unit}</span>
              </span>
            </div>
          );
        })}
      </div>
      {cabin.co2_high_hours_24h > 0 && <p className="text-xs text-muted">CO2 high for {fmt(cabin.co2_high_hours_24h)} h in the last 24 h</p>}
      {real && cabin.replay_note && <p className="text-[11px] text-muted">{cabin.replay_note}</p>}
    </section>
  );
}
