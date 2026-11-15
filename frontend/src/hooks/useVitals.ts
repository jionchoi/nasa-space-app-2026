import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignals } from '../state/SignalContext';
import { connectVitals, type VitalsConnection } from '../api/client';
import { useApp } from '../state/AppContext';
import type { VitalsFrame } from '../types/contracts';

/** Live vitals for a persona. Keeps the last `keep` frames; the client reconnects 2 s after a drop. */
export function useVitals(persona: string, keep = 60) {
  const {mode}=useSignals();
  const { replayNonce } = useApp();
  const [frames, setFrames] = useState<VitalsFrame[]>([]);
  const conn = useRef<VitalsConnection | null>(null);

  useEffect(() => {
    setFrames([]);
    if(mode!=='demo')return;
    const connection = connectVitals(persona, (frame) =>
      setFrames((prev) => [...prev.slice(-(keep - 1)), frame]));
    conn.current = connection;
    return () => connection.close();
  }, [persona, keep, replayNonce, mode]);

  const send = useCallback((message: unknown) => conn.current?.send(message), []);
  return { frames, latest: frames[frames.length - 1] as VitalsFrame | undefined, send };
}
