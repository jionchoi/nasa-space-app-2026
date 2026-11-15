import { Broadcast, Record } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useVitalsSource } from '../../api/client';

const SHOW_MS = 5000;

/** Short notice when live vitals switch between the sensor and the replay. Shown on every screen. */
export function SourceToast() {
  const source = useVitalsSource();
  const previous = useRef(source);
  const [toast, setToast] = useState<'sensor' | 'replay' | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = source;
    if (!before || !source || before === source) return;
    setToast(source);
    const id = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [source]);

  if (!toast) return null;
  const sensor = toast === 'sensor';
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-rise items-center gap-3 rounded-full bg-raised py-2 pl-3 pr-5 text-sm shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10">
      <span className={`grid h-7 w-7 place-items-center rounded-full ${sensor ? 'bg-ok/15 text-ok' : 'bg-white/10 text-muted'}`}>
        {sensor ? <Broadcast className="h-4 w-4" weight="bold" aria-hidden /> : <Record className="h-4 w-4" aria-hidden />}
      </span>
      {sensor ? 'Live sensor connected. Showing your real vitals.' : 'Sensor signal lost. Showing the recorded replay.'}
    </div>
  );
}
