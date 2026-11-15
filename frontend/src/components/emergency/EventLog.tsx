import { useEffect, useRef } from 'react';
import type { LogEntry, LogKind } from './useEmergency';

const KIND_CLASS: Record<LogKind, string> = {
  start: 'text-info', step: 'text-text', answer: 'text-watch', timer: 'text-muted',
  vital: 'text-alert font-semibold', cpr: 'text-alert font-semibold', message: 'text-info', end: 'text-ok',
  auto: 'text-warn font-semibold',
};

export const logTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const logAsText = (log: LogEntry[]) => log.map((e) => `${logTime(e.t)}  ${e.text}`).join('\n');

/** Everything that happens is added here automatically, oldest first; scrolls to the newest entry. */
export function EventLog({ log, className = '' }: { log: LogEntry[]; className?: string }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'nearest' }); // some browsers return a Promise here
  }, [log.length]);
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`} aria-label="Event log">
      <div className="label border-b border-line px-3 py-2">Event log ({log.length})</div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[15px] leading-snug">
        {log.map((e, i) => (
          <li key={i} className="flex gap-2 py-0.5">
            <span className="shrink-0 font-mono text-xs leading-5 text-muted">{logTime(e.t)}</span>
            <span className={KIND_CLASS[e.kind]}>{e.text}</span>
          </li>
        ))}
        <li ref={end} />
      </ol>
    </section>
  );
}
