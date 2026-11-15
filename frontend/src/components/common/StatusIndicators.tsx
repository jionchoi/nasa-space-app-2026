import { useSignals } from '../../state/SignalContext';
import { Broadcast, Check, CloudSlash, Record } from '@phosphor-icons/react';
import { useUsingMock, useVitalsSource } from '../../api/client';

/** "Runs on board" when the local backend answers. The app never needs the internet, only this laptop's backend. */
export function OnboardIndicator() {
  const {mode,connection}=useSignals();
  const usingMock = useUsingMock();
  if(mode!=='demo') return <span className="text-xs text-muted">Signal: {connection}</span>;
  return usingMock ? (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-watch" title="The backend on this laptop is not answering; showing saved mock data.">
      <CloudSlash className="h-3.5 w-3.5" aria-hidden /> Mock data<span className="sr-only min-[1600px]:not-sr-only">: backend unreachable</span>
    </span>
  ) : (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted" title="Runs entirely on this laptop. No internet needed.">
      <Check className="h-3.5 w-3.5 text-ok" weight="bold" aria-hidden />
      <span className="sr-only min-[1600px]:not-sr-only">Runs on board, no internet needed</span>
    </span>
  );
}

/** Where live vitals come from right now: the clip-on sensor, or the recorded persona replay. */
export function SourceChip() {
  const {mode,session}=useSignals();
  const source = useVitalsSource();
  if(mode!=='demo')return <span className="badge bg-raised text-muted">{session?.source??'No signal session'}{session?.simulated?' · simulated':''}</span>;
  if (source === 'sensor') {
    return (
      <span className="badge bg-ok/10 text-ok ring-ok/25" title="Vitals come from the clip-on sensor">
        <Broadcast className="h-3.5 w-3.5" weight="bold" aria-hidden /> Live sensor
      </span>
    );
  }
  return (
    <span className="badge bg-white/[0.05] text-muted ring-white/10" title="Vitals come from a recorded (simulated) replay">
      <Record className="h-3.5 w-3.5" aria-hidden /> {source === 'replay' ? 'Replay' : 'No vitals yet'}
    </span>
  );
}
