import { ArrowRight, Check, EnvelopeSimple, Siren } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import type { Alert } from '../../types/contracts';

interface Props {
  /** Newest unacknowledged red alert, if any. */
  alert: Alert | null;
  /** A live vital has been red for 10+ s (works without the backend too). */
  danger: boolean;
  onDraft(alert: Alert): void;
  onAck(id: string): void;
}

/** Top banner for red alerts: open emergency mode, draft a message, or acknowledge (which stops the flashing). */
export function RedAlertBanner({ alert, danger, onDraft, onAck }: Props) {
  if (!alert && !danger) return null;
  return (
    <div role="alert"
      className="relative z-20 mx-auto -mb-2 mt-3 flex max-w-[calc(100%-2rem)] animate-rise items-center gap-3 rounded-full bg-alert py-1.5 pl-5 pr-1.5 text-sm font-semibold text-white shadow-[0_16px_40px_-12px_rgb(var(--c-alert)/0.6)]">
      <Siren className="h-5 w-5 shrink-0 animate-pulse" weight="fill" aria-hidden />
      <span className="truncate">{alert ? alert.message : 'Vitals in the danger range'}</span>
      <Link to="/emergency" className="group flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-1.5 text-alert transition active:scale-[0.98]">
        Open emergency mode <ArrowRight className="h-4 w-4 transition duration-300 ease-out group-hover:translate-x-0.5" weight="bold" aria-hidden />
      </Link>
      {alert && (
        <>
          <button className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 transition hover:bg-white/30 active:scale-[0.98]"
            onClick={() => onDraft(alert)}>
            <EnvelopeSimple className="h-4 w-4" aria-hidden /> Draft message
          </button>
          <button className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-white/80 transition hover:text-white"
            onClick={() => onAck(alert.id)} title="Mark as seen: it stops flashing and stays in the alerts list">
            <Check className="h-4 w-4" aria-hidden /> Acknowledge
          </button>
        </>
      )}
    </div>
  );
}
