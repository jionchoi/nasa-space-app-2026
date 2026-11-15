import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEmergencyLogs, useUsingMock } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { mmss } from '../lib/status';
import { useApp } from '../state/AppContext';
import type { EmergencyLog } from '../types/contracts';

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** /emergency/logs (v4 sidebar "Emergency logs"): read-only list of saved emergencies, each opening /emergency/log/:id.
 *  Saved logs live in the local backend; emergencies ended in this session are also listed when it is off. */
export default function EmergencyLogs() {
  const { persona, emergencies } = useApp();
  const usingMock = useUsingMock();
  const [rows, setRows] = useState<EmergencyLog[] | null | undefined>(undefined);
  useEffect(() => { getEmergencyLogs(persona).then(setRows); }, [persona, usingMock]);

  const local = emergencies.filter((e) => e.localId).map((e) => ({ id: e.localId!, title: e.title, ended: e.endedAt, duration_s: e.durationS, local: true }));
  const saved = (rows ?? []).map((r) => ({ id: String(r.id), title: r.title, ended: r.ended, duration_s: r.duration_s, local: false }));
  const list = [...local, ...saved.filter((s) => !local.some((l) => l.ended === s.ended))].sort((a, b) => b.ended.localeCompare(a.ended));

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Emergency logs</h1>
        <p className="mt-1 text-sm text-muted">Read only. Each emergency is saved when it ends.</p>
        {rows === undefined ? <p className="mt-6 text-muted">Loading…</p> : (
          <>
            {rows === null && <p className="mt-4 text-sm text-watch">Mock data: the backend is not answering, so saved logs cannot be listed. Emergencies ended in this session are shown.</p>}
            {list.length === 0 ? <p className="mt-6 text-sm text-muted">No emergencies saved yet.</p> : (
              <ul className="mt-6 flex flex-col gap-2">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link to={`/emergency/log/${e.id}`} className="flex min-h-touch items-center gap-4 rounded-card border border-line px-4 py-3 transition hover:bg-raised">
                      <span className="flex flex-col">
                        <span className="font-semibold">{e.title}</span>
                        <span className="text-xs text-muted">{when(e.ended)}{e.local ? ' · this session' : ''}</span>
                      </span>
                      <span className="ml-auto font-mono text-sm text-soft">{mmss(e.duration_s)}</span>
                      <span className="text-info" aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
