import { useSignals } from '../../state/SignalContext';
import { useState } from 'react';
import { mockDelivery, postMessage, replyMessage } from '../../api/client';
import { useDemo, useDemoCommand } from '../../lib/demo';
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
  const { active: demo } = useDemo();

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

  // Demo mode (step 8): send the message as if the crew pressed Send.
  useDemoCommand(['sendSurgeonMessage'], () => { void send(); });

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
    <section className="flex shrink-0 flex-col gap-2 border-t border-[#2A1416] pt-3" aria-label="Flight surgeon message">
      <span className="text-xs font-bold tracking-[0.12em] text-[#B8999C]">FLIGHT SURGEON</span>
      <span className="text-[11px] text-info">✦ Auto-drafted from vitals + log{sent ? ' · sent copy' : ' · updates by itself'}</span>
      <pre className="max-h-[130px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#2A1416] bg-[#160B0D] p-2.5 font-sans text-xs leading-relaxed text-[#E8DADB]">
        {sent ? sent.text : draft}
      </pre>
      <span className="flex flex-wrap items-center gap-2.5">
        <button type="button" className="h-11 rounded-full bg-[#F2EEEE] px-5 font-extrabold text-[#0A0506]" onClick={send}>{sent ? 'Send update' : 'Send now'}</button>
        {!sent && <span className="text-xs text-[#B8999C]">{undraft(envInfo?.advice_note)}</span>}
      </span>
      {sent && <DeliveryStatus message={sent} onSimulateReply={demo ? simulateReply : undefined} />}
    </section>
  );
}
