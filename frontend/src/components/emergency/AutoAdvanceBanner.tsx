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
  const go = useRef(onGo);
  go.current = onGo;

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
      className="flex shrink-0 animate-rise items-center gap-5 rounded-xl bg-alert px-6 py-4 text-white shadow-[0_16px_40px_-12px_rgb(var(--c-alert)/0.7)]">
      <Warning className="h-10 w-10 shrink-0 animate-pulse" weight="fill" aria-hidden />
      <p className="flex-1 text-3xl font-bold leading-tight">
        {message}: going to {target} in <span className="font-mono">{left}</span> s
      </p>
      <button onClick={onCancel}
        className="flex shrink-0 items-center gap-2 rounded-2xl bg-white px-10 py-4 text-3xl font-black text-alert transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
        <X className="h-8 w-8" weight="bold" aria-hidden /> Cancel
      </button>
    </div>
  );
}
