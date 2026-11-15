/** Always-visible note on what is real, what is simulated and what is not tested yet (medical lead's sheet: never
 *  label the app clinically validated). Links to "What's real?" on /sources. */
import { Link } from 'react-router-dom';
import { useSignals } from '../../state/SignalContext';

/** Demo mode: simulated crew on real NASA / CSA data. */
export const RESEARCH_NOTE = 'Prototype · Simulated astronaut, real NASA & CSA data · Thresholds not yet clinically tested';
/** Measurement and Research modes: real recorded signals, no simulated crew. */
export const SIGNAL_NOTE = 'Prototype · Real PhysioNet hospital recordings · Thresholds not yet clinically tested';
const NOTE_TITLE = 'The demo astronaut is simulated. Radiation, cabin, solar-event, blood-panel and reaction-test reference data are real (NASA, CSA). Thresholds, forecast and emergency protocols are based on published guidelines but have not been tested with real crew or in clinical studies. Click for the full list.';

export function useResearchNote(): string {
  const { mode } = useSignals();
  return mode === 'demo' ? RESEARCH_NOTE : SIGNAL_NOTE;
}

export function ResearchNote({ className = '' }: { className?: string }) {
  const note = useResearchNote();
  return (
    <p role="note" className={`truncate text-[11px] font-medium text-watch ${className}`}>
      <Link to="/sources#whats-real" title={NOTE_TITLE} className="underline-offset-2 hover:underline">{note}</Link>
    </p>
  );
}
