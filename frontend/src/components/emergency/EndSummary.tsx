import { useState } from 'react';
import { mmss } from '../../lib/status';
import type { Message } from '../../types/contracts';
import { DeliveryStatus } from '../common/DeliveryStatus';
import { EventLog, logAsText } from './EventLog';
import type { LogEntry } from './useEmergency';

interface Props {
  title: string;
  durationS: number;
  log: LogEntry[];
  /** Messages sent to the flight surgeon during the emergency (shown with their delivery status). */
  messages?: Message[];
  /** Steps in the protocol, for "steps done". */
  stepsTotal?: number;
  onBack(): void;
}

/** Shown after "End emergency" (already saved): duration, steps, message status, the full log, Copy log, Close. */
export function EndSummary({ title, durationS, log, messages = [], stepsTotal, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const steps = new Set(log.filter((e) => e.kind === 'step').map((e) => /^Step (\d+)/.exec(e.text)?.[1]).filter(Boolean));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\nDuration ${mmss(durationS)}\n\n${logAsText(log)}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const last = messages[messages.length - 1];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-7 text-[#F2EEEE] sm:px-9">
      <span className="text-[13px] tracking-[0.12em] text-[#B8999C]">EMERGENCY SUMMARY</span>
      <h2 className="font-display text-[34px] font-bold">{title} · handled</h2>
      <div className="grid max-w-[800px] gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-[#2A1416] p-3"><span className="block text-xs text-[#B8999C]">Duration</span><span className="font-mono text-2xl">{mmss(durationS)}</span></div>
        <div className="rounded-card border border-[#2A1416] p-3"><span className="block text-xs text-[#B8999C]">Steps done</span><span className="font-mono text-2xl">{steps.size}{stepsTotal ? ` of ${stepsTotal}` : ''}</span></div>
        <div className="rounded-card border border-[#2A1416] p-3"><span className="block text-xs text-[#B8999C]">Surgeon message</span><span className="text-base">{last ? (last.status_text ?? 'Sent') : 'Drafted, not sent'}</span></div>
      </div>
      {messages.length > 0 && (
        <section className="flex flex-col gap-2 rounded-card border border-[#2A1416] p-4" aria-label="Messages to the flight surgeon">
          <span className="text-xs font-bold tracking-[0.12em] text-[#B8999C]">MESSAGE TO THE FLIGHT SURGEON</span>
          {messages.map((m) => (
            <div key={m.id} className="grid gap-4 md:grid-cols-[1fr_320px]">
              <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-snug text-[#E8DADB]">{m.text}</pre>
              <DeliveryStatus message={m} />
            </div>
          ))}
        </section>
      )}
      <EventLog log={log} className="max-h-[40vh]" />
      <p className="text-[13px] text-[#B8999C]">Saved · added to the Inbox as "Emergency handled" and to Emergency logs.</p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className="h-12 rounded-full border border-[#F2EEEE] px-5 font-bold hover:bg-white/10" onClick={copy}>{copied ? 'Log copied' : 'Copy log'}</button>
        <button type="button" className="h-12 rounded-full bg-[#F2EEEE] px-6 font-extrabold text-[#0A0506]" onClick={onBack}>Close</button>
      </div>
    </div>
  );
}
