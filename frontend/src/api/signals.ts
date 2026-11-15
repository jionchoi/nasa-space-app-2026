import { API_URL, WS_URL } from './mockFlag';
import type { SessionOptions, SignalCheckRequest, SignalCheckResult, SignalSession } from '../types/signals';

export async function signalRequest<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(API_URL + path, { signal: controller.signal,
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const data = await res.json();
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`);
    return data as T;
  } finally { clearTimeout(timer); }
}
export const startSession = (opts: SessionOptions) => signalRequest<SignalSession>('/api/v2/signal-sessions', opts);
export const stopSession = (id: string) => signalRequest<SignalSession>(`/api/v2/signal-sessions/${id}/stop`, {});
export const getSession = (id: string) => signalRequest<SignalSession>(`/api/v2/signal-sessions/${id}`);
export const saveSignalCheck = (req: SignalCheckRequest) => signalRequest<SignalCheckResult>('/api/v2/checks', req);
export const getSignalChecks = (subject: string) => signalRequest<SignalCheckResult[]>(`/api/v2/checks?subject_id=${encodeURIComponent(subject)}`);

export function subscribeSignals(id: string, receive: (s: SignalSession) => void, connection: (state: string) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(`${WS_URL}/ws/v2/vitals?session_id=${encodeURIComponent(id)}`);
    ws.onopen = () => connection('connected');
    ws.onmessage = ({ data }) => {
      try {
        const message = JSON.parse(data);
        if (message.message_type === 'signal_session' && message.id === id) receive(message as SignalSession);
      } catch { connection('invalid_message'); ws?.close(); }
    };
    ws.onclose = () => {
      if (closed) return;
      connection('disconnected');
      // Check for a server restart instead of reconnecting forever to a missing session.
      void getSession(id).then((s) => {
        if (closed) return;
        receive(s);
        if (!['ended', 'error'].includes(s.status)) timer = setTimeout(open, 2000);
      }).catch(() => { if (!closed) timer = setTimeout(open, 2000); });
    };
  };
  open();
  return () => { closed = true; clearTimeout(timer); if (ws) { ws.onclose = null; ws.close(); } };
}
