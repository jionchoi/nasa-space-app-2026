import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSignalChecks } from '../api/signals';
import { AppHeader } from '../components/common/AppHeader';
import { BodyMap } from '../components/dashboard/BodyMap';
import { SignalControls } from '../components/signals/SignalControls';
import { SignalVitals } from '../components/signals/SignalVitals';
import { sourceLabel } from '../lib/signalViewModel';
import { ResearchPressure } from '../components/signals/ResearchPressure';
import { useApp } from '../state/AppContext';
import { useSignals } from '../state/SignalContext';
import type { RegionId } from '../types/contracts';
import type { SignalCheckResult } from '../types/signals';

export default function SignalDashboard() {
  const {regions}=useApp();
  const {session,mode}=useSignals();
  const [selected,setSelected]=useState<RegionId>('heart');
  const [records,setRecords]=useState<SignalCheckResult[]>([]);
  const [error,setError]=useState<string|null>(null);
  const subject=session?.subject_id;
  useEffect(()=>{
    setRecords([]);setError(null);let live=true;
    if(subject) void getSignalChecks(subject).then(r=>{if(live)setRecords(r);}).catch(e=>{if(live)setError(String(e));});
    return ()=>{live=false;};
  },[subject]);
  const meta=regions.find(r=>r.id===selected);
  return <div className="flex min-h-[100dvh] flex-col">
    <AppHeader/>
    <div className="mx-auto w-full max-w-[1440px] px-6 pt-5"><SignalVitals/></div>
    <main className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start gap-5 px-6 pb-6 pt-5">
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[340px]">
        <section aria-label="Today" className="rounded-panel border border-line bg-panel p-5">
          <p className="kicker text-muted">{mode} · not assessed</p><h1 className="mt-2 text-[22px] font-bold">Your measured signals</h1>
          <p className="my-3 text-sm text-soft">Pulse rate and PPG variability are available when the signal is usable. Health scores and forecasts need reviewed rules and actual history.</p>
          <Link to="/check" className="btn btn-primary">Start daily check</Link>
        </section>
        <SignalControls/>
        <section aria-label="Body areas" className="rounded-panel border border-line bg-panel p-4">
          <h2 className="mb-2 font-semibold">Body areas</h2>
          {regions.map(r=><button key={r.id} onClick={()=>setSelected(r.id)} aria-pressed={selected===r.id} className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-control px-2 text-left hover:bg-raised">
            <span>{r.label}</span><span className="text-xs text-muted">Not assessed</span></button>)}
        </section>
      </div>
      <BodyMap statuses={[]} regions={regions} selected={selected} onSelect={setSelected} unassessed/>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 lg:max-w-[420px]">
        <section aria-label="Region details" className="rounded-panel border border-line bg-panel p-5">
          <h2 className="text-[22px] font-bold">{meta?.label ?? 'Heart'}</h2><span className="pill my-3 bg-raised text-muted">Not assessed</span>
          <p className="text-sm text-soft">{meta?.function?.replace(/^DRAFT\s*[-:]?\s*/,'')}</p>
          <p className="mt-3 text-sm text-muted">{selected==='heart'?'See the measured pulse and PRV above. No clinical threshold or health score has been applied.':'No current measurements for this area. Simulated crew history is not used in this mode.'}</p>
        </section>
        <ResearchPressure/>
        <section aria-label="Saved measurements" className="rounded-panel border border-line bg-panel p-5">
          <h2 className="font-semibold">Saved daily checks</h2>
          {!records.length && <p className="mt-2 text-sm text-muted">{subject?'No checks recorded for this crew identifier.':'Start a session to view this crew member’s records.'}</p>}
          {records.slice(0,10).map(r=><div key={r.id} className="mt-3 border-t border-line pt-3 text-sm">
            <p>{new Date(r.created_at).toLocaleString()} · {sourceLabel(r.source)}</p>
            <p className="text-muted">Pulse {r.metrics.pulse_rate_bpm.value ?? '—'} bpm · PRV {r.metrics.ppg_rmssd_ms.value ?? '—'} ms</p>
            <p className="text-muted">Cuff: {r.cuff?`${r.cuff.systolic_mmHg}/${r.cuff.diastolic_mmHg} mmHg`:'Not measured'}</p>
          </div>)}
          {error&&<p role="alert" className="text-sm text-watch">{error}</p>}
        </section>
      </div>
    </main>
  </div>;
}
