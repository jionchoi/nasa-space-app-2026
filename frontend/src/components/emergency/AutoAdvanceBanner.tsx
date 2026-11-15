import { Warning, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** e.g. "Pulse lost" (from the protocol's red_flag_routes). */
  message: string;
  /** e.g. "CPR" or "step 6". */
  target: string;
  seconds: number;
  onGo(): void;
  onCancel(): void;
}

/** Full-width banner: "Pulse lost: going to CPR in 5 s" with a big Cancel. Goes on its own when the countdown ends. */
export function AutoAdvanceBanner({ message, target, seconds, onGo, onCancel }: Props) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const go = useRef(() => {});
  go.current = () => { if (fired.current) return; fired.current = true; onGo(); };

  useEffect(() => {
    const until = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        go.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [seconds]);

  return (
    <div role="alert" aria-live="assertive"
      className="flex shrink-0 flex-wrap items-center gap-3.5 rounded-card border border-alert bg-alert/15 px-4 py-3 text-[#F2EEEE]">
      <Warning className="h-6 w-6 shrink-0 text-alert" weight="fill" aria-hidden />
      <span className="font-extrabold text-alert">RED FLAG: {message}</span>
      <span>Jumping to {target} in <span className="font-mono">{left}</span> s</span>
      <span className="flex-1" />
      <button type="button" onClick={onCancel} autoFocus className="flex h-11 items-center gap-1.5 rounded-full border border-[#F2EEEE] px-5 font-bold hover:bg-white/10">
        <X className="h-4 w-4" weight="bold" aria-hidden /> Cancel
      </button>
      <button type="button" onClick={() => go.current()} className="h-11 rounded-full bg-alert px-5 font-bold text-white">Go now</button>
    </div>
  );
}
