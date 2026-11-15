import { useSignals } from '../state/SignalContext';
import { signalRequest } from '../api/signals';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCpr, getProtocol } from '../api/client';
import { EmergencyBar, EmergencyVitals } from '../components/emergency/EmergencyChrome';
import { CprGuide } from '../components/emergency/CprGuide';
import { buildDraft } from '../components/emergency/draft';
import { AutoAdvanceBanner } from '../components/emergency/AutoAdvanceBanner';
import { EndSummary } from '../components/emergency/EndSummary';
import { EntryScreen } from '../components/emergency/EntryScreen';
import { EventLog } from '../components/emergency/EventLog';
import { RedFlags } from '../components/emergency/RedFlags';
import { StepView } from '../components/emergency/StepView';
import { SurgeonMessage } from '../components/emergency/SurgeonMessage';
import { useDemoCommand } from '../lib/demo';
import { useEmergency } from '../components/emergency/useEmergency';
import { useRedFlagRoutes } from '../components/emergency/useRedFlagRoutes';
import { useVitals } from '../hooks/useVitals';
import { kitNotes } from '../lib/env';
import { entryOf, fmt, liveStatus } from '../lib/status';
import { currentLocation, locationEntries } from '../lib/locations';
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
  const { persona, personaInfo, thresholds, addEmergency, envInfo, environments, env } = useApp();
  const where = currentLocation(locationEntries(environments), env)?.name ?? env;
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

  // Demo mode: end without the confirm box (step 8). Above the early returns (hooks order)
  const endRef = useRef<(skip?: boolean) => void>(() => {});
  useDemoCommand(['endEmergency'], () => endRef.current(true));

  const withHeader = (content: ReactNode, title?: string) => (
    <div className="flex min-h-[100dvh] flex-col bg-[#0A0506]">
      <EmergencyBar title={title ?? 'What is happening?'} where={where} />
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
  if (!protocolId) {
    return withHeader(<EntryScreen onPick={(id) => setParams({ protocol: id })} onExit={() => navigate('/')} />);
  }
  if (!protocol || !em.step) {
    return withHeader(<div className="grid h-full min-h-[60vh] place-items-center text-4xl text-muted">Loading protocol…</div>, 'Loading…');
  }
  if (ended !== null) {
    return withHeader(<EndSummary title={protocol.title} durationS={(ended - em.startedAt) / 1000} log={em.log}
      stepsTotal={protocol.steps.length} messages={Object.values(sentMessages)} onBack={() => navigate('/')} />, `${protocol.title} · handled`);
  }

  const end = async (skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('End the emergency? You will see a summary of what was done.')) return;
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
  endRef.current = end;
  const draft = buildDraft({
    protocol, persona: personaInfo, startedAt: em.startedAt, latest, thresholds, log: em.log, answers: em.answers,
    litFlags: lit.map((i) => protocol.red_flags[i]),
  });

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0A0506] text-[#F2EEEE] lg:h-[100dvh] lg:overflow-hidden">
      <EmergencyBar title={protocol.title} where={where} draft={protocol.draft} startedAt={em.startedAt} now={now} onEnd={() => void end()} />
      {saveError && <p role="alert" className="bg-watch/10 px-5 py-2 text-watch">{saveError}</p>}
      <EmergencyVitals frames={frames} />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto px-5 py-6 sm:px-9">
          {flags.pending && (
            <AutoAdvanceBanner key={`${flags.pending.route.flag}-${em.log.length}`} message={flags.pending.route.message}
              target={flags.pending.target} seconds={flags.pending.seconds} onGo={flags.go} onCancel={flags.cancel} />
          )}
          {em.cpr ? (
            <CprGuide config={cprConfig} latest={latest} onLog={(text) => em.addLog('cpr', text)} onBack={em.back}
              onPulseBack={() => { em.addLog('cpr', 'Pulse is back: CPR stopped, back to the steps'); em.back(); }} />
          ) : (
            <StepView
              step={em.step} index={em.index} total={protocol.steps.length} answer={em.answer} timerDone={em.timerDone}
              canNext={em.canNext} canBack={em.canBack} finished={em.finished}
              nextLabel={em.route === 'cpr' ? 'Start CPR' : em.index === protocol.steps.length - 1 ? 'Finish' : 'Done, next step'}
              kitNotes={kitNotes(envInfo, em.step.equipment)}
              onAnswer={em.giveAnswer} onTimerDone={em.finishTimer} onNext={em.next} onBack={em.back}
            />
          )}
        </main>
        <aside className="flex min-h-0 flex-col gap-4 border-t border-[#2A1416] bg-[#0E0708] p-5 lg:border-l lg:border-t-0">
          <RedFlags flags={protocol.red_flags} lit={lit} />
          <SurgeonMessage draft={draft} onLog={(text) => em.addLog('message', text)}
            onSent={(m) => setSentMessages((all) => ({ ...all, [m.id]: m }))} />
          <EventLog log={em.log} className="min-h-[180px] flex-1" />
        </aside>
      </div>
    </div>
  );
}
