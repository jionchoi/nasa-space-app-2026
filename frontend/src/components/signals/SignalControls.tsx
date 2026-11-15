import { useEffect, useState } from 'react';
import { signalRequest } from '../../api/signals';
import { useSignals } from '../../state/SignalContext';
import type { SessionOptions, SignalMode } from '../../types/signals';

export function ModePicker() {
  const {mode,setMode,busy} = useSignals();
  return <label className="flex items-center gap-2 text-sm"><span className="text-muted">Mode</span>
    <select aria-label="Data mode" value={mode} disabled={busy} className="rounded-control border border-line bg-panel px-3 py-2"
      onChange={(e) => { void setMode(e.target.value as SignalMode); }}>
      <option value="demo">Demo · simulated crew</option><option value="measurement">Measurement</option><option value="research">Research</option>
    </select></label>;
}

type Recording = { name: string; input: 'bidmc'|'recording'; source: 'public_replay'|'recorded_live' };
export function SignalControls() {
  const signals=useSignals();
  const [subject,setSubject]=useState(signals.session?.subject_id??'crew-001');
  const [device,setDevice]=useState(signals.session?.device_id??'ppg-001');
  const [input,setInput]=useState(signals.session?.recording??(signals.session?.input==='ingest'?'ingest':undefined)??(signals.mode==='research' ? 'synthetic' : 'ingest'));
  const [recordings,setRecordings]=useState<Recording[]>([]);
  const [scenario,setScenario]=useState('clean');
  const [speed,setSpeed]=useState(1);
  const [error,setError]=useState<string|null>(null);
  const [enableBP,setEnableBP]=useState(signals.session?.enable_research_bp??false);
  const [bpCapability,setBpCapability]=useState<{enabled:boolean;available:boolean;reason:string|null}|null>(null);
  const loadBP=()=>{
    void signalRequest<{enabled:boolean;available:boolean;reason:string|null}>('/api/v2/bp-capability')
      .then(setBpCapability).catch(e=>setError(String(e)));
  };
  useEffect(() => { void signalRequest<Recording[]>('/api/v2/recordings').then(setRecordings).catch((e)=>setError(String(e))); },[]);
  const active=!!signals.session && !['ended','error'].includes(signals.session.status);
  const start=async()=>{
    setError(null);
    const r=recordings.find((x)=>x.name===input);
    const opts: SessionOptions={subject_id:subject,device_id:device,mode:signals.mode==='research'?'research':'measurement',
      input:r?.input ?? (input==='synthetic'?'synthetic':'ingest'),
      source:r?.source ?? (input==='synthetic'?'synthetic':'live'),recording:r?.name,speed,scenario,enable_research_bp:signals.mode==='research'&&enableBP};
    await signals.start(opts);
  };
  const field='w-full rounded-control border border-line bg-bg px-3 py-2';
  return <section aria-label="Signal session" className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-5">
    <h2 className="font-semibold">Signal session</h2>
    <label className="text-sm">Crew identifier<input aria-label="Signal subject" className={field} value={subject} maxLength={100} disabled={active} onChange={e=>setSubject(e.target.value)}/></label>
    <label className="text-sm">Device identifier<input aria-label="Signal device" className={field} value={device} maxLength={100} disabled={active} onChange={e=>setDevice(e.target.value)}/></label>
    <label className="text-sm">Input<select aria-label="Signal input" className={field} disabled={active} value={input} onChange={e=>setInput(e.target.value)}>
      <option value="ingest">Live device</option>
      {signals.mode==='research' && <option value="synthetic">Synthetic waveform · research</option>}
      {signals.session?.recording&&!recordings.some(r=>r.name===signals.session!.recording)&&<option value={signals.session.recording}>{signals.session.recording}</option>}
      {recordings.map(r=><option key={r.name} value={r.name}>{r.name} · {r.source}</option>)}
    </select></label>
    {!active && input==='synthetic' && <label className="text-sm">Scenario<select aria-label="Signal scenario" className={field} value={scenario} onChange={e=>setScenario(e.target.value)}>
      {['clean','dropout','noise','irregular'].map(s=><option key={s}>{s}</option>)}
    </select></label>}
    {!active && input!=='ingest' && <label className="text-sm">Replay speed<select aria-label="Replay speed" className={field} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
      {[1,2,5,10,20].map(s=><option key={s} value={s}>{s}×</option>)}
    </select></label>}
    {signals.mode==='research'&&<details className="rounded-control border border-line p-3 text-sm"
      open={signals.session?.enable_research_bp || undefined} onToggle={e=>{if(e.currentTarget.open&&!bpCapability)loadBP();}}>
      <summary className="cursor-pointer font-medium">Optional research features</summary>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" aria-label="Enable optional blood pressure model" checked={enableBP}
          disabled={active||signals.busy||(!enableBP&&!bpCapability?.available)} onChange={e=>setEnableBP(e.target.checked)}/>
        <span>ECG + PPG blood pressure model</span>
      </label>
      <p className="mt-2 text-xs text-muted">Optional · requires synchronized ECG and PPG. Cuff entry remains separate.</p>
      {bpCapability&&!bpCapability.available&&<p className="mt-2 text-xs text-muted">{
        bpCapability.reason==='feature_disabled'?'The BP add-on is off on this server.':
        bpCapability.reason==='pilot_adoption_failed'?'The current model did not meet its accuracy criteria.':
        bpCapability.reason==='optional_dependency_missing'?'The BP add-on is not installed.':
        'No evaluated BP model is available.'}</p>}
    </details>}
    <div className="flex gap-2">
      <button className="btn btn-primary" disabled={signals.busy || active || !subject || !device} onClick={()=>void start()}>Start session</button>
      <button className="btn" disabled={signals.busy || !active} onClick={()=>{void signals.stop().catch(e=>setError(String(e)));}}>Stop</button>
    </div>
    {signals.session && <p className="break-all text-xs text-muted">Session {signals.session.id}<br/>{signals.session.subject_id} · {signals.session.source} · {signals.session.status}</p>}
    {(signals.error||signals.session?.error||error) && <p role="alert" className="text-sm text-watch">{signals.error||signals.session?.error||error}</p>}
  </section>;
}
