import { useSignals } from '../../state/SignalContext';
import { useState } from 'react';
import { mockDelivery, postMessage, replyMessage } from '../../api/client';
import { undraft } from '../../lib/env';
import { useApp } from '../../state/AppContext';
import type { Message } from '../../types/contracts';
import { DeliveryStatus } from '../common/DeliveryStatus';

interface Props {
  draft: string;
  onLog(text: string): void;
  /** Called with each sent (or answered) message, so the emergency log can keep it. */
  onSent?(message: Message): void;
}

/** Draft built from the log, a Send button, and the delivery status for the current environment.
 *  Uses the shared messaging service (POST /api/messages) and DeliveryStatus, like the dashboard's drawer. */
export function SurgeonMessage({ draft, onLog, onSent }: Props) {
  const {mode}=useSignals();
  const { persona, env, envInfo, escalation } = useApp();
  const [sent, setSent] = useState<Message | null>(null);

  const send = async () => {
    onLog(`Message sent to the flight surgeon (${envInfo?.label ?? env})`);
    const saved = await postMessage({ persona, env, text: draft, status: 'sent' });
    if (saved) {
      setSent(saved);
      onSent?.(saved);
      return;
    }
    const d = mockDelivery(env); // backend off: same delivery rules from the mock data
    const t = new Date().toISOString();
    const local: Message = { id: `local-${t}`, persona, t, env, text: draft, status: 'sent', delay_s: d.delay_s, alert_id: null,
      region: null, source: 'emergency', sent_at: t, reply: null, replied_at: null, updated_at: t, status_text: d.status_text };
    setSent(local);
    onSent?.(local);
  };

  const simulateReply = async () => {
    if (!sent) return;
    onLog('Flight surgeon reply received (simulated for the demo)');
    const answered = sent.id.startsWith('local-') ? null : await replyMessage(sent.id);
    const placeholder = escalation?.link.reply_placeholder;
    const next = answered ?? { ...sent, status: 'replied' as const, reply: typeof placeholder === 'string' ? placeholder : 'Reply received (simulated).' };
    setSent(next);
    onSent?.(next);
  };

  if(mode!=='demo')return <section className="rounded-panel border border-line bg-panel p-3 text-sm text-muted">Local protocol log · simulated flight-surgeon messaging is available in demo mode.</section>;
  return (
    <section className="panel grid shrink-0 grid-cols-[1fr_340px] gap-4 p-3" aria-label="Flight surgeon message">
      <div className="min-w-0">
        <div className="label mb-1">Message to the flight surgeon ({sent ? 'sent copy' : 'draft, updates by itself'})</div>
        <pre className="h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-2 font-mono text-[13px] leading-snug">
          {sent ? sent.text : draft}
        </pre>
      </div>
      <div className="flex flex-col gap-2">
        <button className="btn btn-primary py-2.5 text-xl font-bold" onClick={send}>{sent ? 'Send update' : 'Send'}</button>
        {sent ? <DeliveryStatus message={sent} onSimulateReply={simulateReply} /> : <p className="text-sm text-muted">{undraft(envInfo?.advice_note)}</p>}
      </div>
    </section>
  );
}
