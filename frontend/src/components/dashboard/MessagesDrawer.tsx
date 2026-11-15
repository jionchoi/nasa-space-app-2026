import { EnvelopeSimple, X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import type { MessagesApi } from '../../hooks/useMessages';
import { linkText, useApp } from '../../state/AppContext';
import { MessageCard } from './MessageCard';

interface Props {
  open: boolean;
  onClose(): void;
  focusId: string | null;
  api: MessagesApi;
}

/** Right-side drawer: the escalation queue. Drafts (made for orange/red areas) first, then sent messages. */
export function MessagesDrawer({ open, onClose, focusId, api }: Props) {
  const { envKeys, escalation, personaInfo } = useApp();
  const sent = api.messages.filter((m) => m.status !== 'draft');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-bg/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside role="dialog" aria-label="Messages to the flight surgeon"
        className={`absolute bottom-3 right-3 top-3 flex w-[min(480px,calc(100vw-1.5rem))] flex-col rounded-[1.6rem] bg-panel ring-1 ring-white/[0.08] shadow-[0_24px_64px_-16px_rgb(0_0_0/0.8)] transition-transform duration-500 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[110%]'}`}>
        <header className="flex items-start gap-3 border-b border-white/[0.06] p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-info/15 text-info"><EnvelopeSimple className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Messages to the flight surgeon</h2>
            <p className="text-xs text-muted">{personaInfo?.name} · {linkText(escalation, envKeys).pill}</p>
          </div>
          <button className="btn h-9 w-9 p-0" onClick={onClose} aria-label="Close messages"><X className="h-4 w-4" aria-hidden /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h3 className="mb-2 text-sm font-medium">Drafts <span className="text-muted">({api.drafts.length})</span></h3>
            {api.drafts.length === 0 ? (
              <p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-muted">
                No drafts. When an area turns Warning or Act now, a message is drafted here for you to review.
              </p>
            ) : (
              <div className="space-y-3">
                {api.drafts.map((m) => (
                  <MessageCard key={m.id} message={m} focused={m.id === focusId}
                    onEdit={(text) => api.edit(m.id, text)} onSend={(text) => api.send(m.id, text)} onReply={() => api.reply(m.id)} />
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-medium">Sent <span className="text-muted">({sent.length})</span></h3>
            {sent.length === 0 ? (
              <p className="text-sm text-muted">Nothing sent yet.</p>
            ) : (
              <div className="space-y-3">
                {sent.map((m) => (
                  <MessageCard key={m.id} message={m} focused={m.id === focusId}
                    onEdit={() => undefined} onSend={() => undefined} onReply={() => api.reply(m.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
