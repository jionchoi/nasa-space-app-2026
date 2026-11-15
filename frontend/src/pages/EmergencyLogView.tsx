import { ArrowLeft, Copy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEmergencyLog } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { Card } from '../components/common/Card';
import { EventLog, logAsText } from '../components/emergency/EventLog';
import type { LogEntry } from '../components/emergency/useEmergency';
import { mmss } from '../lib/status';
import { useApp } from '../state/AppContext';
import type { EmergencyLogIn } from '../types/contracts';

const TRIGGER: Record<string, string> = { cv: 'Unresponsive detection', alarm: 'Crew alarm', crew: 'Crew' };
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Read-only view of a saved emergency: duration, answers, messages and the full event log. */
export default function EmergencyLogView() {
  const { id = '' } = useParams();
  const { emergencies } = useApp();
  const [data, setData] = useState<EmergencyLogIn | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const local = emergencies.find((e) => e.localId === id)?.data;
    if (local) { setData(local); return; }
    getEmergencyLog(id).then(setData);
  }, [id, emergencies]);

  const log = (data?.log ?? []) as LogEntry[];
  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(`${data.title}\nDuration ${mmss(data.duration_s)}\n\n${logAsText(log)}`).catch(() => undefined);
    setCopied(true);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard</Link>
        {data === undefined ? <p className="text-muted">Loading the log…</p> : data === null ? (
          <p className="text-watch">This log is not available. It may have been cleared, or the backend is not running.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Emergency log · read only</p>
                <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
                <p className="text-sm text-muted">{when(data.started)} to {when(data.ended)} · opened by {TRIGGER[data.trigger ?? 'crew'] ?? data.trigger}</p>
              </div>
              <button className="btn" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy log'}</button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['Duration', mmss(data.duration_s)], ['Questions answered', String(Object.keys(data.answers ?? {}).length)], ['Messages sent', String(data.messages?.length ?? 0)]].map(([k, v]) => (
                <Card key={k} inner="py-4"><div className="text-xs text-muted">{k}</div><div className="font-mono text-2xl font-semibold">{v}</div></Card>
              ))}
            </div>
            {Object.keys(data.answers ?? {}).length > 0 && (
              <Card inner="p-5">
                <h2 className="mb-2 text-sm font-medium">Answers</h2>
                <ul className="divide-y divide-white/[0.05] text-sm">
                  {Object.entries(data.answers ?? {}).map(([n, a]) => (
                    <li key={n} className="flex items-baseline gap-3 py-2">
                      <span className="w-14 shrink-0 text-muted">Step {n}</span>
                      <span className="flex-1">{a.question}</span>
                      <span className="font-semibold uppercase">{a.answer}</span>
                      <span className="w-40 text-right text-xs text-muted">{a.by === 'crew' ? 'by the crew' : `by ${a.by}`}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {(data.messages?.length ?? 0) > 0 && (
              <Card inner="p-5">
                <h2 className="mb-2 text-sm font-medium">Messages to the flight surgeon</h2>
                {data.messages!.map((m) => (
                  <div key={m.id} className="mb-3 last:mb-0">
                    <p className="text-xs text-muted">{m.sent_at ? when(m.sent_at) : ''} · {m.status_text ?? m.status}</p>
                    <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-bg/70 p-3 font-mono text-[12px] leading-relaxed">{m.text}</pre>
                  </div>
                ))}
              </Card>
            )}
            <EventLog log={log} className="max-h-[32rem]" />
          </div>
        )}
      </main>
    </div>
  );
}
