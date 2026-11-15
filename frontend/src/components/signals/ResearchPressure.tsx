import { useEffect, useState } from 'react';
import { signalRequest } from '../../api/signals';
import { bpValue } from '../../lib/signalViewModel';
import { useSignals } from '../../state/SignalContext';
const explanations: Record<string,string> = {
  feature_disabled:'The optional BP add-on is off on this server.',
  optional_dependency_missing:'The optional BP add-on is not installed.',
  model_not_configured:'No evaluated model is configured.', pilot_adoption_failed:'The current pilot did not meet its accuracy criteria.',
  artifact_hash_or_size_mismatch:'The model does not match its evaluation report.',
  invalid_model_or_report:'The model or evaluation report could not be validated.',
  synchronized_ecg_ppg_required:'Synchronized ECG and PPG are required.', ecg_required:'Waiting for synchronized ECG and PPG.',
};
export function ResearchPressure() {
  const {mode,session,now,connection}=useSignals();
  const selected=mode==='research' && !!session?.enable_research_bp;
  const [capability,setCapability]=useState<{available:boolean;reason:string|null}|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!selected)return;void signalRequest<{available:boolean;reason:string|null}>('/api/v2/bp-capability').then(setCapability).catch(e=>setError(String(e)));},[selected]);
  const bp=session?.blood_pressure;
  const value=bpValue(bp??undefined,now,connection==='connected');
  const reason=capability?.available===false ? capability.reason : bp?.reason ?? capability?.reason;
  if(!selected)return null;
  return <section aria-label="Research blood pressure" className="flex flex-col gap-2 rounded-panel border border-line bg-panel p-5 text-left">
    <div className="flex items-center gap-2"><h2 className="font-semibold">Blood pressure estimate</h2><span className="badge text-watch">Research</span></div>
    <p className="font-mono text-3xl">{value ?? '— / —'} <span className="text-sm text-muted">mmHg</span></p>
    <p className="text-sm text-muted">{value ? 'ECG + PPG model · research, unvalidated' : reason ? explanations[reason] ?? reason.replace(/_/g,' ') : 'Waiting for model capability'}</p>
    <p className="text-xs text-muted">Stored separately from cuff readings. Does not affect health scores or emergency routing.</p>
    {error && <p role="alert" className="text-sm text-watch">{error}</p>}
  </section>;
}
