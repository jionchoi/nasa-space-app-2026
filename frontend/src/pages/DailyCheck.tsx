import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { getQuestionnaire, postCheck } from '../api/client';
import { BloodPressureStep } from '../components/check/BloodPressureStep';
import { CheckShell } from '../components/check/CheckShell';
import { MeasureStep } from '../components/check/MeasureStep';
import { PrepareStep } from '../components/check/PrepareStep';
import { QuestionsStep } from '../components/check/QuestionsStep';
import { ReactionTest } from '../components/check/ReactionTest';
import { SummaryStep } from '../components/check/SummaryStep';
import { TempGlucoseStep } from '../components/check/TempGlucoseStep';
import { useDaily } from '../hooks/useStatus';
import { useVitals } from '../hooks/useVitals';
import { pvtBaseline } from '../lib/metrics';
import { useApp } from '../state/AppContext';
import { useRoutine } from '../state/RoutineContext';
import type { CheckResult, PvtResult, Questionnaire, VitalsFrame } from '../types/contracts';

const STEPS = ['Prepare', 'Seated rest', 'Stand', 'Temperature & glucose', 'Blood pressure', 'Reaction test', 'Questions', 'Summary'];
const S = { prepare: 0, seated: 1, stand: 2, tempGlucose: 3, bp: 4, reaction: 5, questions: 6, summary: 7 };

export default function DailyCheck() {
  const navigate = useNavigate();
  const { persona, env, thresholds, measurements, setCheckDoneAt, refreshStreak } = useApp();
  const { refreshMissions } = useRoutine();
  const [config, setConfig] = useState<Questionnaire | null>(null);
  const [step, setStep] = useState(S.prepare);
  const [skipped, setSkipped] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<{ temp_c: number | null; glucose_mmol: number | null }>({ temp_c: null, glucose_mmol: null });
  const [bp, setBp] = useState<{ bp_sys: number | null; bp_dia: number | null }>({ bp_sys: null, bp_dia: null });
  const [pvt, setPvt] = useState<PvtResult | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const seated = useRef<VitalsFrame[]>([]);
  const stand = useRef<VitalsFrame[]>([]);
  const daily = useDaily(persona);
  const baseline = useMemo(() => pvtBaseline(daily), [daily]);

  useEffect(() => { getQuestionnaire().then(setConfig); }, []);
  const seatedS = config?.measurement.seated_s ?? 120;
  const { frames, latest, send } = useVitals(persona, seatedS);

  // Demo mode (/check?demo=summary): skip straight to the summary with the persona's own simulated values (the last
  // stream seconds, its latest reaction-test values, a typed glucose value), clearly marked as a demo shortcut.
  const [search] = useSearchParams();
  const demoSummary = search.get('demo') === 'summary';
  const [demoFilled, setDemoFilled] = useState(false);
  useEffect(() => {
    if (!demoSummary || demoFilled || !config || frames.length < 5 || !daily.length) return;
    const last = daily[daily.length - 1];
    const median = typeof last.pvt_median_ms === 'number' ? last.pvt_median_ms : 265;
    const rate = typeof last.pvt_lapse_rate_pct === 'number' ? last.pvt_lapse_rate_pct : 8;
    const n = 28;
    seated.current = frames.slice(-seatedS);
    stand.current = [];
    setSkipped(true);
    setExtra({ temp_c: null, glucose_mmol: 5.4 });
    setPvt({ median_ms: median, lapses: Math.round((rate * n) / 100), lapse_rate_pct: rate, false_starts: 0, n, duration_s: 180,
      version: 'full', reaction_ms: [] });
    setDemoFilled(true);
    setStep(S.summary);
  }, [demoSummary, demoFilled, config, frames, daily, seatedS]);

  // Replay only: tell the simulated stream when the crew member stands (a real sensor needs no hint).
  useEffect(() => {
    if (step !== S.stand) return;
    send({ posture: 'stand' });
    return () => send({ posture: 'sit' });
  }, [step, send]);

  useEffect(() => {
    if (step !== S.summary) return;
    let live = true;
    postCheck({ persona, seated_frames: seated.current, stand_frames: stand.current, answers, ...extra, ...bp, pvt }, env).then((r) => {
      if (!live) return;
      setResult(r);
      setCheckDoneAt(new Date().toISOString());
      refreshStreak();
      refreshMissions();
    });
    return () => { live = false; };
    // run once when the summary opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const why = (metric: string) => measurements?.metrics[metric]?.why_check;
  if (!config) return <div className="grid h-screen place-items-center text-muted">Loading the daily check…</div>;
  const m = config.measurement;
  const micro = config.stand_text.microgravity_envs.includes(env);
  const standLines = micro
    ? [config.stand_text.microgravity, `On a planet or moon: ${config.stand_text.gravity}`]
    : [config.stand_text.gravity, `In weightlessness: ${config.stand_text.microgravity}`];

  const skip = () => {
    seated.current = frames.slice(-seatedS); // last 2 minutes of the stream
    stand.current = [];
    setSkipped(true);
    setStep(S.tempGlucose);
  };

  return (
    <CheckShell steps={STEPS} current={step} onCancel={() => navigate('/')}>
      {step === S.prepare && (
        <PrepareStep config={config} frames={frames} thresholds={thresholds} onStart={() => setStep(S.seated)}
          onSkip={frames.length ? skip : () => undefined} />
      )}
      {step === S.seated && (
        <MeasureStep key="seated" lines={['Sit still and breathe slowly']} durationS={m.seated_s} latest={latest}
          thresholds={thresholds} measurement={m} breathing onSkip={skip} why={why('hr_rest')}
          onDone={(rec) => { seated.current = rec; setStep(S.stand); }} />
      )}
      {step === S.stand && (
        <MeasureStep key="stand" lines={standLines} durationS={m.stand_s} latest={latest} thresholds={thresholds}
          measurement={m} why={why('stand_hr_rise')} onDone={(rec) => { stand.current = rec; setStep(S.tempGlucose); }} />
      )}
      {step === S.tempGlucose && (
        <TempGlucoseStep limits={config.entry_limits} measurements={measurements}
          onDone={(values) => { setExtra(values); setStep(S.bp); }} />
      )}
      {step === S.bp && (
        <BloodPressureStep limits={config.entry_limits} info={measurements?.metrics.bp_sys}
          onDone={(values) => { setBp(values); setStep(S.reaction); }} />
      )}
      {step === S.reaction && (
        <>
          <ReactionTest config={config.pvt} baseline={baseline} why={why('pvt_median_ms')} onDone={(r) => { setPvt(r); setStep(S.questions); }} />
          <button className="btn bg-transparent text-muted hover:text-text" onClick={() => setStep(S.questions)}>Skip the reaction test</button>
        </>
      )}
      {step === S.questions && (
        <QuestionsStep questions={config.questions} answers={answers}
          onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))} onDone={() => setStep(S.summary)} whyFor={why} />
      )}
      {step === S.summary && <SummaryStep result={result} skipped={skipped} demo={demoFilled} onBack={() => navigate('/')} />}
    </CheckShell>
  );
}
