import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { currentMode, setCurrentMode } from '../api/mode';
import { getSession, startSession, stopSession, subscribeSignals } from '../api/signals';
import type { SessionOptions, SignalMode, SignalSession, Snapshot } from '../types/signals';

interface SignalState {
  mode: SignalMode; setMode(mode: SignalMode): Promise<void>;
  session: SignalSession | null; snapshots: Snapshot[]; connection: string; now: number;
  error: string | null; busy: boolean; start(opts: SessionOptions): Promise<void>; stop(): Promise<void>;
}
const Ctx = createContext<SignalState | null>(null);
export function SignalProvider({ children }: { children: ReactNode }) {
  const [mode, modeState] = useState(currentMode);
  const [session, setSession] = useState<SignalSession | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [connection, setConnection] = useState('disconnected');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(session); sessionRef.current = session;
  const stop = useCallback(async () => {
    const active = sessionRef.current;
    if (active) {
      const stopped = await stopSession(active.id);
      setSession(stopped); setConnection('disconnected');
    }
  }, []);
  const setMode = async (next: SignalMode) => {
    if (next === mode) return;
    setBusy(true); setError(null);
    try {
      if (sessionRef.current && !['ended','error'].includes(sessionRef.current.status)) await stop();
      sessionStorage.removeItem('crewsense-signal-session');
      setCurrentMode(next); modeState(next); setSession(null); setSnapshots([]); setConnection('disconnected');
      const url = new URL(window.location.href); url.searchParams.set('mode', next); url.pathname = '/';
      window.history.replaceState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const start = async (opts: SessionOptions) => {
    setBusy(true); setError(null);
    try {
      if (sessionRef.current && !['ended','error'].includes(sessionRef.current.status)) await stop();
      const created = await startSession(opts);
      sessionStorage.setItem('crewsense-signal-session',created.id);
      setSnapshots([]); setSession(created); setConnection('connecting');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => {
    if(mode==='demo')return;
    const saved=sessionStorage.getItem('crewsense-signal-session');
    if(!saved)return;
    let live=true;
    void getSession(saved).then(s=>{
      if(live&&s.mode===mode){setSession(s);setConnection('connecting');}
    }).catch(e=>{if(live)setError(`Previous session unavailable: ${String(e)}`);});
    return ()=>{live=false;};
  },[mode]);
  const id = session?.id;
  useEffect(() => {
    if (!id || mode === 'demo') return;
    return subscribeSignals(id, (incoming) => {
      setSession(incoming);
      if (incoming.latest) setSnapshots((list) => {
        const last = list[list.length-1];
        if (last?.sequence === incoming.latest!.sequence && last.stream_status === incoming.latest!.stream_status) return list;
        return [...list.slice(-179),incoming.latest!];
      });
    }, setConnection);
  }, [id, mode]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  return <Ctx.Provider value={{mode,setMode,session,snapshots,connection,now,error,busy,start,stop}}>{children}</Ctx.Provider>;
}
export function useSignals() { const ctx = useContext(Ctx); if (!ctx) throw new Error('SignalProvider missing'); return ctx; }
