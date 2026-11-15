import { Info } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { blockedMode } from '../../api/mode';
import { NEEDS_BACKEND, README_URL } from '../../api/publicDemo';

const SHOW_MS = 10000;

/** Public build only: someone opened ?mode=measurement or ?mode=research, which needs the Python backend. */
export function PublicModeNotice() {
  const [show, setShow] = useState(blockedMode !== null);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(false), SHOW_MS);
    return () => clearTimeout(id);
  }, [show]);
  if (!show || !blockedMode) return null;
  const name = blockedMode === 'research' ? 'Research' : 'Measurement';
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-rise items-center gap-3 rounded-2xl bg-raised py-2.5 pl-3 pr-4 text-sm shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10">
      <Info className="h-5 w-5 shrink-0 text-info" aria-hidden />
      <span>{name} mode: <a className="underline underline-offset-2" href={README_URL} target="_blank" rel="noreferrer">{NEEDS_BACKEND}</a>. Showing Demo mode.</span>
      <button className="ml-auto text-muted hover:text-text" onClick={() => setShow(false)} aria-label="Close">×</button>
    </div>
  );
}
