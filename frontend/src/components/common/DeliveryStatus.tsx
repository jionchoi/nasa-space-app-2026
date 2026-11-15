import { ChatCircleText, CheckCircle, PaperPlaneTilt } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { mmss } from '../../lib/status';
import type { Message } from '../../types/contracts';

type Delivered = Pick<Message, 'status' | 'sent_at' | 'delay_s' | 'status_text' | 'reply'>;

interface Props {
  message: Delivered;
  /** Demo only: ask the backend for a simulated reply. */
  onSimulateReply?(): void;
}

const COUNTDOWN_FROM_S = 10; // shorter delays (ISS, Moon) just show the delivered text

/** After Send: status for the environment (Delivered / Delivered after ~1.3 s / Sent... with countdown) and the reply.
 *  Shared by emergency mode and the dashboard's messages drawer. */
export function DeliveryStatus({ message, onSimulateReply }: Props) {
  const [now, setNow] = useState(Date.now());
  const sentAt = message.sent_at ? Date.parse(message.sent_at) : null;
  const left = sentAt ? Math.max(0, message.delay_s - (now - sentAt) / 1000) : 0;
  const slow = message.delay_s >= COUNTDOWN_FROM_S;

  useEffect(() => {
    if (!sentAt || left === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sentAt, left]);

  if (message.status === 'draft' || !sentAt) return null;
  return (
    <div className="space-y-2 text-sm" role="status">
      <p className="flex items-start gap-2 font-medium text-info">
        {left === 0 ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" weight="fill" aria-hidden /> : <PaperPlaneTilt className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        <span>{message.status_text ?? 'Sent'}</span>
      </p>
      {slow && (
        <p className="font-mono text-base">
          {left === 0 ? 'Message has arrived on Earth.' : `Arrives in about ${mmss(left)}`}
        </p>
      )}
      {message.reply ? (
        <div className="flex gap-2 rounded-xl bg-ok/10 p-3 ring-1 ring-ok/20">
          <ChatCircleText className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
          <p className="leading-snug">{message.reply}</p>
        </div>
      ) : onSimulateReply && (
        <button className="btn border-dashed px-3 py-1 text-xs text-muted" onClick={onSimulateReply}>
          Simulate reply <span className="badge bg-watch/10 text-watch ring-watch/25">demo</span>
        </button>
      )}
    </div>
  );
}
