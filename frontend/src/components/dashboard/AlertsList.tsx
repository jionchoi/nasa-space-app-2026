import { Bell, BellRinging, Check } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { clock, STATUS_CLASS } from '../../lib/status';
import type { Alert, AlertSource, RegionId } from '../../types/contracts';

interface Props {
  alerts: Alert[];
  onView(region: RegionId): void;
  onAck(id: string): void;
  /** Open an alert's page (e.g. the read-only emergency log). */
  onOpen(link: string): void;
}

const SOURCE_LABEL: Record<AlertSource, string> = {
  rules: 'Body check', vitals: 'Live vitals', emergency: 'Emergency', cv: 'Camera',
};

/** Bell button in the header; opens the alerts, newest first. Open red/orange alerts flash; Acknowledge stops the
 *  flashing and keeps the alert in the list (dimmed). View selects the region. */
export function AlertsList({ alerts, onView, onAck, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const openAlerts = alerts.filter((a) => !a.acknowledged);
  const urgent = openAlerts.filter((a) => a.level !== 'yellow');
  const red = openAlerts.some((a) => a.level === 'red');
  const BellIcon = openAlerts.length ? BellRinging : Bell;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button className="btn h-9 gap-1.5 px-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={`Alerts: ${openAlerts.length} open`}>
        <BellIcon className={`h-4 w-4 ${red ? 'animate-pulse text-alert' : urgent.length ? 'text-warn' : openAlerts.length ? 'text-watch' : 'text-muted'}`} aria-hidden />
        <span className="font-mono text-xs">{openAlerts.length}</span>
      </button>

      {open && (
        <section className="panel absolute right-0 top-full z-40 mt-2 w-[26rem] animate-rise overflow-hidden" aria-label="Alerts">
          <div className="flex items-baseline justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-sm font-medium">Alerts</span>
            <span className="text-xs text-muted">{openAlerts.length} open · {alerts.length} total</span>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Nothing needs attention right now.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-white/[0.05] overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${a.acknowledged ? 'opacity-50' : ''}`}>
                  <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
                    {!a.acknowledged && a.level !== 'yellow' && <span className={`absolute inset-0 animate-halo rounded-full ${STATUS_CLASS[a.level].bg}`} />}
                    <span className={`relative h-2 w-2 rounded-full ${STATUS_CLASS[a.level].bg}`} />
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    {a.message}
                    <span className="mt-0.5 block text-xs text-muted">
                      <span className="font-mono">{clock(a.t)}</span> · {SOURCE_LABEL[a.source]}
                      {a.message_draft_id ? ' · message drafted' : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {a.link && (
                      <button className="text-xs font-medium text-info transition hover:text-text"
                        onClick={() => { onOpen(a.link!); setOpen(false); }}>
                        Open log
                      </button>
                    )}
                    {a.region && (
                      <button className="text-xs font-medium text-info transition hover:text-text"
                        onClick={() => { onView(a.region!); setOpen(false); }}>
                        View
                      </button>
                    )}
                    {a.acknowledged ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted"><Check className="h-3 w-3" aria-hidden /> Seen</span>
                    ) : (
                      <button className="text-xs text-muted transition hover:text-text" onClick={() => onAck(a.id)}>Acknowledge</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
