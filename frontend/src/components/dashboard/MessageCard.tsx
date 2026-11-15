import { PaperPlaneRight } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { clock } from '../../lib/status';
import { undraft } from '../../lib/env';
import { useApp } from '../../state/AppContext';
import type { Message } from '../../types/contracts';
import { DeliveryStatus } from '../common/DeliveryStatus';
import { RegionIcon } from '../common/RegionIcon';

interface Props {
  message: Message;
  focused: boolean;
  onEdit(text: string): void;
  onSend(text: string): void;
  /** Demo mode only: "Simulate reply" (omit it to hide the button). */
  onReply?(): void;
}

/** One flight-surgeon message: an editable draft with Send, or a sent message with its delivery status. */
export function MessageCard({ message, focused, onEdit, onSend, onReply }: Props) {
  const { regions, envInfo } = useApp();
  const [text, setText] = useState(message.text);
  const box = useRef<HTMLElement>(null);
  const draft = message.status === 'draft';
  const region = regions.find((r) => r.id === message.region);

  useEffect(() => { if (!draft) setText(message.text); }, [draft, message.text]);
  useEffect(() => { if (focused) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [focused]);

  return (
    <article ref={box} className={`rounded-2xl p-4 transition ${focused ? 'bg-raised ring-1 ring-info/40' : 'bg-white/[0.03]'}`}>
      <header className="mb-2 flex items-center gap-2 text-sm">
        {region ? <RegionIcon id={region.id} className="h-4 w-4 text-muted" /> : null}
        <span className="font-medium">{region?.label ?? (message.source === 'emergency' ? 'Emergency' : 'Message')}</span>
        <span className="text-xs text-muted">· {draft ? 'drafted' : 'sent'} {clock(message.sent_at ?? message.t)}</span>
        <span className={`badge ml-auto ${draft ? 'bg-watch/10 text-watch ring-watch/25' : 'bg-info/10 text-info ring-info/25'}`}>
          {draft ? 'Draft' : message.status === 'replied' ? 'Replied' : 'Sent'}
        </span>
      </header>

      {draft ? (
        <>
          <label className="sr-only" htmlFor={`msg-${message.id}`}>Message text</label>
          <textarea id={`msg-${message.id}`} value={text} onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== message.text && onEdit(text)} rows={9}
            className="w-full resize-y rounded-xl bg-bg/70 p-3 font-mono text-[12px] leading-relaxed text-text ring-1 ring-white/[0.06] focus:outline-none focus:ring-info/50" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">Review and edit, then send. {envInfo ? `${envInfo.label}${envInfo.planet_label ? ` (${envInfo.planet_label})` : ''}: ${undraft(envInfo.advice_note)}` : ''}</span>
            <button className="btn btn-primary shrink-0 gap-1.5" disabled={!text.trim()} onClick={() => onSend(text)}>
              <PaperPlaneRight className="h-4 w-4" weight="fill" aria-hidden /> Send
            </button>
          </div>
        </>
      ) : (
        <>
          <details className="mb-3">
            <summary className="cursor-pointer text-xs text-muted hover:text-text">Show the message</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-bg/70 p-3 font-mono text-[12px] leading-relaxed">{message.text}</pre>
          </details>
          <DeliveryStatus message={message} onSimulateReply={onReply} />
        </>
      )}
    </article>
  );
}
