import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getQuestionnaire } from '../api/client';
import { saveSignalCheck } from '../api/signals';
import { CheckShell } from '../components/check/CheckShell';
import { BloodPressureStep } from '../components/check/BloodPressureStep';
import { ReactionTest } from '../components/check/ReactionTest';
import { QuestionsStep } from '../components/check/QuestionsStep';
import { TempGlucoseStep } from '../components/check/TempGlucoseStep';
import { ResearchPressure } from '../components/signals/ResearchPressure';
import { SignalMeasureStep } from '../components/signals/SignalMeasureStep';
import { useSignals } from '../state/SignalContext';
import { useApp } from '../state/AppContext';
import type { PvtResult, Questionnaire } from '../types/contracts';
import type { SignalCheckRequest, SignalCheckResult } from '../types/signals';
const STEPS=['Prepare','Seated rest','Stand','Temperature & glucose','Blood pressure','Reaction test','Questions','Summary'];

export default function SignalCheck() {
  const navigate=useNavigate();
  const {session}=useSignals();
  const {measurements}=useApp();
  const [config,setConfig]=useState<Questionnaire|null>(null);
  const [step,setStep]=useState(0);
  const [seated,setSeated]=useState<{start:number;end:number}|null>(null);
  const [stand,setStand]=useState<{start:number;end:number}|null>(null);
  const [bp,setBp]=useState<{bp_sys:number|null;bp_dia:number|null}>({bp_sys:null,bp_dia:null});
  const [extra,setExtra]=useState<{temp_c:number|null;glucose_mmol:number|null}>({temp_c:null,glucose_mmol:null});
  const [pvt,setPvt]=useState<PvtResult|null>(null);
  const [answers,setAnswers]=useState<Record<string,number>>({});
  const [result,setResult]=useState<SignalCheckResult|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const id=useRef(crypto.randomUUID());
  const request=useRef<SignalCheckRequest|null>(null);
  useEffect(()=>{void getQuestionnaire().then(setConfig).catch(e=>setError(String(e)));},[]);
  const save=async()=>{
    if(!session||!seated||saving)return;
    if(!request.current)request.current={check_id:id.current,session_id:session.id,seated_start_s:seated.start,seated_end_s:seated.end,
      stand_start_s:stand?.start??null,stand_end_s:stand?.end??null,...bp,...extra,answers,pvt};
    setSaving(true);setError(null);
    try{setResult(await saveSignalCheck(request.current));}catch(e){setError(String(e));}finally{setSaving(false);}
  };
  if(!session) return <CheckShell steps={STEPS} current={0} onCancel={()=>navigate('/')}><h1 className="text-3xl">Start a signal session first</h1><Link className="btn btn-primary" to="/">Back to dashboard</Link></CheckShell>;
  return <CheckShell steps={STEPS} current={step} onCancel={()=>navigate('/')}>
    {error&&<p role="alert" className="text-watch">{error}</p>}
    {!config?<p>Loading daily check…</p>:<>
      {step===0&&<><h1 className="text-4xl font-semibold">Daily check</h1><p className="text-soft">{session.subject_id} · {session.source}</p><p className="text-muted">Sit still for the pulse and PRV measurement. Cuff readings and your answers are recorded separately.</p><button className="btn btn-primary" disabled={!session.latest || session.status!=='running'} onClick={()=>setStep(1)}>Start seated measurement</button></>}
      {step===1&&<SignalMeasureStep key="seated" title="Sit still and breathe slowly" duration={120} onDone={i=>{setSeated(i);setStep(2);}}/>}
      {step===2&&<SignalMeasureStep key="stand" title="Stand when it is appropriate for your environment" duration={60} onDone={i=>{setStand(i);setStep(3);}} onSkip={()=>setStep(3)}/>}
      {step===3&&<TempGlucoseStep limits={config.entry_limits} measurements={measurements} onDone={v=>{setExtra(v);setStep(4);}}/>}
      {step===4&&<><BloodPressureStep limits={config.entry_limits} info={measurements?.metrics.bp_sys} onDone={v=>{setBp(v);setStep(5);}}/><ResearchPressure/></>}
      {step===5&&<><ReactionTest config={config.pvt} onDone={v=>{setPvt(v);setStep(6);}}/><button className="btn" onClick={()=>setStep(6)}>Skip reaction test</button></>}
      {step===6&&<QuestionsStep questions={config.questions} answers={answers} onAnswer={(k,v)=>setAnswers(a=>({...a,[k]:v}))} onDone={()=>setStep(7)}/>}
      {step===7&&<>
        <h2 className="text-3xl font-semibold">{result?'Daily check saved':'Review and save'}</h2>
        {result?<>
          <p className="text-sm text-muted">{result.subject_id} · {result.source} · {new Date(result.created_at).toLocaleString()}</p>
          {Object.entries(result.metrics).map(([key,m])=><p key={key}>{key==='ppg_rmssd_ms'?'PPG RMSSD · PRV':key}: <span className="font-mono">{m.value??'Not measured'} {m.unit??''}</span></p>)}
          <p>Cuff: {result.cuff?`${result.cuff.systolic_mmHg}/${result.cuff.diastolic_mmHg} mmHg`:'Not measured'}</p>
          <p className="text-sm text-muted">No health score assigned. Research estimates remain separate.</p><Link className="btn btn-primary" to="/">Back to dashboard</Link>
        </>:<><p className="text-soft">Only the server’s measured intervals will be summarized. Missing values stay empty.</p><p>Cuff: {bp.bp_sys===null?'Not measured':`${bp.bp_sys}/${bp.bp_dia} mmHg`}</p><button className="btn btn-primary" disabled={saving} onClick={()=>void save()}>{saving?'Saving…':error?'Retry save':'Save daily check'}</button></>}
      </>}
    </>}
  </CheckShell>;
}
