import { useState } from 'react';
import { mmss } from '../../lib/status';
import { EventLog, logAsText } from './EventLog';
import type { LogEntry } from './useEmergency';

interface Props {
  title: string;
  durationS: number;
  log: LogEntry[];
  onBack(): void;
}

/** Shown after "End emergency": duration, steps, the full log, Copy log, Back to dashboard. */
export function EndSummary({ title, durationS, log, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const steps = new Set(log.filter((e) => e.kind === 'step').map((e) => /^Step (\d+)/.exec(e.text)?.[1]).filter(Boolean));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\nDuration ${mmss(durationS)}\n\n${logAsText(log)}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-h-[calc(100dvh-4rem)] max-w-4xl flex-col gap-5 p-8">
      <h1 className="text-5xl font-bold">Emergency ended</h1>
      <p className="text-2xl text-muted">{title}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['Duration', mmss(durationS)], ['Steps shown', String(steps.size)], ['Log entries', String(log.length)]].map(([k, v]) => (
          <div key={k} className="panel py-4">
            <div className="label">{k}</div>
            <div className="font-mono text-4xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <EventLog log={log} className="flex-1" />
      <div className="flex justify-between">
        <button className="btn px-6 py-3 text-xl" onClick={copy}>{copied ? 'Log copied' : 'Copy log'}</button>
        <button className="btn btn-primary px-8 py-3 text-xl" onClick={onBack}>Back to dashboard</button>
      </div>
    </div>
  );
}
