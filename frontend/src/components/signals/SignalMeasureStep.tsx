import { useEffect, useRef, useState } from 'react';
import { metricValue } from '../../lib/signalViewModel';
import { useSignals } from '../../state/SignalContext';
import { mmss } from '../../lib/status';

export function SignalMeasureStep({title,duration,onDone,onSkip}: {
  title:string; duration:number; onDone(interval:{start:number;end:number}):void; onSkip?():void;
}) {
  const {session,connection,now}=useSignals();
  const latest=session?.latest;
  const [start,setStart]=useState<number|null>(latest?.data_end_s ?? null);
  const [elapsed,setElapsed]=useState(0);
  const previous=useRef<number|null>(null);
  const done=useRef(false);
  const usable=metricValue(latest,latest?.metrics.pulse_rate_bpm,now,connection==='connected')!==null;
  useEffect(()=>{
    if(!latest || done.current) return;
    if(start===null) setStart(latest.data_end_s);
    const delta=previous.current===null?0:latest.data_end_s-previous.current;
    previous.current=latest.data_end_s;
    if(usable && delta>0 && delta<=5) setElapsed(e=>e+delta);
  },[latest,usable,start]);
  useEffect(()=>{
    if(elapsed>=duration && start!==null && latest && !done.current) {
      done.current=true;onDone({start,end:latest.data_end_s});
    }
  },[elapsed,duration,start,latest,onDone]);
  return <>
    <h2 className="text-4xl font-semibold">{title}</h2>
    <p className="font-mono text-[7rem] leading-none" role="timer">{mmss(duration-elapsed)}</p>
    <p className="text-soft">{usable?'Usable signal · measuring':'Waiting for a usable, current pulse window'}</p>
    <p className="text-sm text-muted">The timer advances with usable signal data. Missing measurements remain empty.</p>
    <div className="flex gap-3">
      <button className="btn" disabled={start===null || !latest || latest.data_end_s<=start} onClick={()=>{if(start!==null&&latest)onDone({start,end:latest.data_end_s});}}>Finish with available data</button>
      {onSkip&&<button className="btn" onClick={onSkip}>Skip standing measurement</button>}
    </div>
  </>;
}
