import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  draftForAlert, editMessage, getMessages, mockDelivery, postMessage, replyMessage, sendMessage, useUsingMock,
} from '../api/client';
import { useApp } from '../state/AppContext';
import type { Alert, Message } from '../types/contracts';

const REFRESH_MS = 4000;

const upsert = (list: Message[], m: Message) =>
  list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [m, ...list];

/** Flight-surgeon messages for the current crew member: drafts from the escalation queue and sent messages.
 *  Backend: app/messaging.py. With the backend off, drafts and sends are kept locally so the demo still works. */
export function useMessages() {
  const { persona, env, escalation } = useApp();
  const usingMock = useUsingMock();
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(() => {
    getMessages(persona).then((rows) => { if (rows) setMessages(rows); });
  }, [persona]);

  useEffect(() => {
    setMessages([]);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const local = useCallback((id: string, change: (m: Message) => Message) => {
    setMessages((list) => list.map((m) => (m.id === id ? change(m) : m)));
  }, []);

  const edit = useCallback(async (id: string, text: string) => {
    const saved = usingMock ? null : await editMessage(id, text);
    if (saved) setMessages((l) => upsert(l, saved)); else local(id, (m) => ({ ...m, text }));
  }, [usingMock, local]);

  const send = useCallback(async (id: string, text: string) => {
    const sent = usingMock ? null : await sendMessage(id, env, text);
    if (sent) { setMessages((l) => upsert(l, sent)); return; }
    const d = mockDelivery(env);
    local(id, (m) => ({ ...m, text, env, status: 'sent', sent_at: new Date().toISOString(), delay_s: d.delay_s, status_text: d.status_text }));
  }, [usingMock, env, local]);

  const reply = useCallback(async (id: string) => {
    const answered = usingMock ? null : await replyMessage(id);
    if (answered) { setMessages((l) => upsert(l, answered)); return; }
    const placeholder = escalation?.link.reply_placeholder;
    local(id, (m) => ({ ...m, status: 'replied', reply: typeof placeholder === 'string' ? placeholder : 'Reply received (simulated).' }));
  }, [usingMock, escalation, local]);

  /** The draft linked to an alert, creating it if needed. Returns its id. */
  const draftFor = useCallback(async (alert: Alert): Promise<string | null> => {
    if (alert.message_draft_id) return alert.message_draft_id;
    const draft = usingMock ? null : await draftForAlert(alert.id, env);
    if (draft) { setMessages((l) => upsert(l, draft)); return draft.id; }
    const t = new Date().toISOString();
    const created: Message = { id: `local-${alert.id}`, persona, t, env, status: 'draft', delay_s: 0, alert_id: alert.id,
      region: alert.region, source: 'alert', sent_at: null, reply: null, replied_at: null, updated_at: t, status_text: null,
      text: `Flight surgeon: ALERT. ${alert.message}\n(Offline draft: the backend is not answering; edit before sending.)` };
    setMessages((l) => (l.some((m) => m.id === created.id) ? l : [created, ...l]));
    return created.id;
  }, [usingMock, env, persona]);

  /** A new message (the Inbox's auto-drafted summary when no alert draft exists): saved, then sent. Returns its id. */
  const compose = useCallback(async (text: string): Promise<string> => {
    const created = usingMock ? null : await postMessage({ persona, env, text, status: 'draft' });
    if (created) {
      const sent = await sendMessage(created.id, env, text);
      setMessages((l) => upsert(l, sent ?? created));
      return created.id;
    }
    const t = new Date().toISOString();
    const d = mockDelivery(env);
    const local: Message = { id: `local-msg-${Date.parse(t)}`, persona, t, env, text, status: 'sent', delay_s: d.delay_s, alert_id: null,
      region: null, source: 'manual', sent_at: t, reply: null, replied_at: null, updated_at: t, status_text: d.status_text };
    setMessages((l) => [local, ...l]);
    return local.id;
  }, [usingMock, persona, env]);

  const drafts = useMemo(() => messages.filter((m) => m.status === 'draft'), [messages]);
  return { messages, drafts, edit, send, reply, draftFor, compose };
}

export type MessagesApi = ReturnType<typeof useMessages>;
