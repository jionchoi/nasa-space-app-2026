import { useSignals } from '../state/SignalContext';
import { signalRequest } from '../api/signals';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCpr, getProtocol } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { DataBadges } from '../components/common/Badges';
import { VitalsStrip } from '../components/dashboard/VitalsStrip';
import { CprGuide } from '../components/emergency/CprGuide';
import { buildDraft } from '../components/emergency/draft';
import { AutoAdvanceBanner } from '../components/emergency/AutoAdvanceBanner';
import { EndSummary } from '../components/emergency/EndSummary';
import { EntryScreen } from '../components/emergency/EntryScreen';
import { EventLog } from '../components/emergency/EventLog';
import { RedFlags } from '../components/emergency/RedFlags';
import { StepView } from '../components/emergency/StepView';
import { SurgeonMessage } from '../components/emergency/SurgeonMessage';
import { useEmergency } from '../components/emergency/useEmergency';
import { useRedFlagRoutes } from '../components/emergency/useRedFlagRoutes';
import { useVitals } from '../hooks/useVitals';
import { kitNotes } from '../lib/env';
import { entryOf, fmt, liveStatus, mmss } from '../lib/status';
import { useApp } from '../state/AppContext';
import type { CprConfig, Message, Protocol, VitalsFrame } from '../types/contracts';

export default function Emergency() {
  const signals=useSignals();
  const demo=signals.mode==='demo';
  const [saveError,setSaveError]=useState<string|null>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Old links used protocol=collapse; it is now "unresponsive" (the backend also answers the old id).
  const protocolId = params.get('protocol') === 'collapse' ? 'unresponsive' : params.get('protocol');
  const { persona, personaInfo, thresholds, addEmergency, envInfo } = useApp();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [cprConfig, setCprConfig] = useState<CprConfig | null>(null);
  const [lit, setLit] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState<number | null>(null);
  const { frames, latest } = useVitals(persona);
  const trigger = params.get('trigger');
  const em = useEmergency(protocol, demo?trigger:'crew', demo?params.get('preanswer'):null, demo?params.get('goto'):null);
  const flags = useRedFlagRoutes(protocol, frames, thresholds, em, ended === null);
  const [sentMessages, setSentMessages] = useState<Record<string, Message>>({});
  const live = useMemo(() => liveStatus(latest, thresholds), [latest, thresholds]);
  const wasRed = useRef<string[]>([]);

  useEffect(() => {
    setProtocol(null);
    setLit([]);
    wasRed.current = [];
    if (protocolId) getProtocol(protocolId).then(setProtocol);
  }, [protocolId]);
  useEffect(() => { getCpr().then(setCprConfig); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // A live vital entering the red range adds a log entry and lights the matching red flag.
  const redKey = live?.red.join(',') ?? '';
  const latestRef = useRef<VitalsFrame | undefined>(latest);
  latestRef.current = latest;
  useEffect(() => {
    if (!protocol) return;
    const red = redKey ? redKey.split(',') : [];
    for (const key of red.filter((k) => !wasRed.current.includes(k))) { // each vital is logged once
      wasRed.current.push(key);
      const entry = entryOf(thresholds, key);
      const frame = latestRef.current;
      const value = key === 'irregular' || !frame ? '' : `: ${fmt(frame[key as 'hr'], 0)} ${entry?.unit ?? ''}`;
      em.addLog('vital', `Red flag from vitals: ${entry?.label ?? key} in the danger range${value}`);
      const words = (entry?.keywords ?? []).map((w) => w.toLowerCase());
      const hits = protocol.red_flags.flatMap((flag, i) => (words.some((w) => flag.toLowerCase().includes(w)) ? [i] : []));
      setLit((prev) => [...new Set([...prev, ...hits])]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redKey, protocol, thresholds]);

  const withHeader = (content: ReactNode) => (
    <div className="flex min-h-[100dvh] flex-col p-2"><AppHeader compact /><div className="min-h-0 flex-1">{content}</div></div>
  );
  if (!protocolId) {
    return withHeader(<EntryScreen onPick={(id) => setParams({ protocol: id })} onExit={() => navigate('/')} />);
  }
  if (!protocol || !em.step) {
    return withHeader(<div className="grid h-full min-h-[60vh] place-items-center text-4xl text-muted">Loading protocol…</div>);
  }
  if (ended !== null) {
    return withHeader(<EndSummary title={protocol.title} durationS={(ended - em.startedAt) / 1000} log={em.log} onBack={() => navigate('/')} />);
  }

  const end = async () => {
    if (!window.confirm('End the emergency? You will see a summary of what was done.')) return;
    const at = Date.now();
    em.addLog('end', 'Emergency ended by the crew');
    const endedAt = new Date(at).toISOString();
    const durationS = (at - em.startedAt) / 1000;
    const answers = Object.fromEntries(Object.entries(em.answers).map(([n, value]) => {
      const s = protocol.steps.find((x) => x.n === Number(n));
      return [n, { question: s?.check ?? '', answer: value, by: em.answeredBy[Number(n)] ?? 'crew' }];
    }));
    const messages = Object.values(sentMessages).map((m) => ({ id: m.id, text: m.text, status: m.status, sent_at: m.sent_at, status_text: m.status_text }));
    const record = {
      protocol: protocol.id, title: protocol.title, started: new Date(em.startedAt).toISOString(), ended: endedAt,
      duration_s: durationS, log: [...em.log, { t: endedAt, kind: 'end', text: 'Emergency ended by the crew' }],
      answers, messages, trigger: demo?trigger ?? 'crew':'crew',
    };
    if(demo)addEmergency({endedAt,title:protocol.title,durationS},record);
    else {
      if(!signals.session){setSaveError('No signal session is available to save this log.');return;}
      try{await signalRequest('/api/v2/emergency-logs',{subject_id:signals.session.subject_id,session_id:signals.session.id,data:record});}
      catch(e){setSaveError(String(e));return;}
    }
    setEnded(at);
  };
  const draft = buildDraft({
    protocol, persona: personaInfo, startedAt: em.startedAt, latest, thresholds, log: em.log, answers: em.answers,
    litFlags: lit.map((i) => protocol.red_flags[i]),
  });

  return (
    <div className="flex h-[100dvh] flex-col gap-2 overflow-hidden p-2">
      <AppHeader compact />
      {saveError&&<p role="alert" className="text-watch">{saveError}</p>}
      <header className="flex shrink-0 items-center gap-4 rounded-lg bg-alert px-4 py-2 text-bg">
        <span className="text-2xl font-black tracking-wider">EMERGENCY</span>
        <span className="truncate text-2xl font-semibold">{protocol.title}</span>
        {protocol.draft && <span className="rounded bg-bg/20 px-2 py-0.5 text-sm font-semibold">{protocol.draft}</span>}
        <span className="ml-auto text-lg">Time since start <span className="font-mono text-3xl font-bold">{mmss((now - em.startedAt) / 1000)}</span></span>
        <button className="rounded-md bg-bg px-4 py-2 text-lg font-bold text-text hover:brightness-150" onClick={()=>void end()}>End emergency</button>
      </header>

      {flags.pending && (
        <AutoAdvanceBanner key={`${flags.pending.route.flag}-${em.log.length}`} message={flags.pending.route.message}
          target={flags.pending.target} seconds={flags.pending.seconds} onGo={flags.go} onCancel={flags.cancel} />
      )}

      <div className="flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1"><VitalsStrip frames={frames} thresholds={thresholds} compact /></div>
        <div className="flex gap-1 pt-1"><DataBadges /></div>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-2">
        {em.cpr ? (
          <CprGuide config={cprConfig} latest={latest} onLog={(text) => em.addLog('cpr', text)} onBack={em.back} />
        ) : (
          <StepView
            step={em.step} total={protocol.steps.length} answer={em.answer} timerDone={em.timerDone}
            canNext={em.canNext} canBack={em.canBack} finished={em.finished}
            nextLabel={em.route === 'cpr' ? 'Start CPR' : 'Next'} kitNotes={kitNotes(envInfo, em.step.equipment)}
            onAnswer={em.giveAnswer} onTimerDone={em.finishTimer} onNext={em.next} onBack={em.back}
          />
        )}
        <aside className="flex min-h-0 flex-col gap-2">
          <RedFlags flags={protocol.red_flags} lit={lit} />
          <EventLog log={em.log} className="flex-1" />
        </aside>
      </main>

      <SurgeonMessage draft={draft} onLog={(text) => em.addLog('message', text)}
        onSent={(m) => setSentMessages((all) => ({ ...all, [m.id]: m }))} />
    </div>
  );
}
