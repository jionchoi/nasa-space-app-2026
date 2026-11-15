import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignals } from '../../state/SignalContext';
import { postEvent } from '../../api/client';
import { useApp } from '../../state/AppContext';
import type { Protocol, StepRoute } from '../../types/contracts';

export type LogKind = 'start' | 'step' | 'answer' | 'timer' | 'vital' | 'cpr' | 'message' | 'end' | 'auto';
export interface LogEntry { t: string; kind: LogKind; text: string }
export type Answer = 'yes' | 'no';
export type AnsweredBy = 'crew' | 'unresponsive detection';

const TRIGGER_TEXT: Record<string, string> = { cv: 'opened by unresponsive detection', alarm: 'opened from the crew alarm' };

type Target = { kind: 'cpr' } | { kind: 'step'; index: number } | { kind: 'finished' };

/** Where a route from step `from` leads: "next", a step number, or "cpr". */
function resolve(protocol: Protocol, from: number, route: StepRoute): Target {
  if (route === 'cpr') return { kind: 'cpr' };
  const index = route === 'next' ? from + 1 : protocol.steps.findIndex((s) => s.n === route);
  return index < 0 || index >= protocol.steps.length ? { kind: 'finished' } : { kind: 'step', index };
}

/** "responsive:no" -> { key: "responsive", value: "no" } */
function parsePreanswer(raw: string | null): { key: string; value: Answer } | null {
  const [key, value] = (raw ?? '').split(':');
  return key && (value === 'yes' || value === 'no') ? { key, value } : null;
}

/** Protocol walk-through state: current step, answers, timers, routing, red-flag jumps and the event log. */
/** `goto`: "cpr" or a step number to open right after the pre-answer (unresponsive detection: pulse lost -> CPR). */
export function useEmergency(protocol: Protocol | null, trigger: string | null, preanswer: string | null = null, goto: string | null = null) {
  const {mode}=useSignals();
  const { persona } = useApp();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [answeredBy, setAnsweredBy] = useState<Record<number, AnsweredBy>>({});
  const [timersDone, setTimersDone] = useState<number[]>([]);
  const [cpr, setCpr] = useState(false);
  const [finished, setFinished] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const startedFor = useRef<string | null>(null);
  const protocolId = protocol?.id;

  const addLog = useCallback((kind: LogKind, text: string) => {
    const entry = { t: new Date().toISOString(), kind, text };
    setLog((list) => [...list, entry]);
    // The event log is posted as "alarm" events; details travel in `signals`.
    if(mode==='demo')void postEvent({ t: entry.t, type: 'alarm', signals: { source: 'emergency', protocol: protocolId, kind, text } }, persona);
  }, [protocolId, persona,mode]);

  /** Show the target of a route; `why` is added to the log line (e.g. "auto-advanced by red flag pulse_lost"). */
  const go = useCallback((p: Protocol, from: number, route: StepRoute, why?: string) => {
    const target = resolve(p, from, route);
    const suffix = why ? ` (${why})` : '';
    if (target.kind === 'cpr') {
      setCpr(true);
      addLog(why ? 'auto' : 'cpr', `CPR guide opened${suffix}`);
    } else if (target.kind === 'finished') {
      setFinished(true);
      addLog('step', 'All steps done. Keep watching the vitals.');
    } else {
      setHistory((h) => [...h, from]);
      setIndex(target.index);
      setCpr(false);
      setFinished(false);
      addLog(why ? 'auto' : 'step', `Step ${p.steps[target.index].n} shown: ${p.steps[target.index].text}${suffix}`);
    }
  }, [addLog]);

  useEffect(() => {
    if (!protocol || startedFor.current === protocol.id) return;
    startedFor.current = protocol.id;
    setStartedAt(Date.now());
    setIndex(0);
    setHistory([]);
    setAnswers({});
    setAnsweredBy({});
    setTimersDone([]);
    setCpr(false);
    setFinished(false);
    addLog('start', `Emergency started: ${protocol.title} (${TRIGGER_TEXT[trigger ?? ''] ?? 'opened by the crew'})`);
    addLog('step', `Step 1 shown: ${protocol.steps[0].text}`);
    // Unresponsive detection already knows the answer to one question (e.g. ?preanswer=responsive:no).
    const pre = parsePreanswer(preanswer);
    const at = pre ? protocol.steps.findIndex((s) => s.key === pre.key && s.check) : -1;
    if (pre && at >= 0) {
      const s = protocol.steps[at];
      setAnswers({ [s.n]: pre.value });
      setAnsweredBy({ [s.n]: 'unresponsive detection' });
      addLog('answer', `Step ${s.n}: "${s.check}" ${pre.value.toUpperCase()} (answered by unresponsive detection)`);
      go(protocol, at, (pre.value === 'yes' ? s.on_yes : s.on_no) ?? 'next');
    }
    // A lost pulse skips the remaining questions: straight to CPR (or to the given step).
    if (goto === 'cpr') go(protocol, Math.max(0, at), 'cpr', 'pulse lost, from unresponsive detection');
    else if (goto && Number.isInteger(Number(goto))) go(protocol, Math.max(0, at), Number(goto), 'from unresponsive detection');
  }, [protocol, trigger, preanswer, goto, addLog, go]);

  const step = protocol?.steps[index];
  const answer = step ? answers[step.n] : undefined;
  const timerDone = !!step && timersDone.includes(step.n);
  const route: StepRoute = (step?.check ? (answer === 'yes' ? step.on_yes : answer === 'no' ? step.on_no : null) : null) ?? 'next';
  const canNext = !!step && (step.check ? !!answer : step.timer_s ? timerDone : true);

  const next = () => { if (protocol && step) go(protocol, index, route); };

  /** Jump straight to a step number or CPR (red-flag auto-advance). */
  const jump = (goto: number | 'cpr', why: string) => { if (protocol) go(protocol, index, goto, why); };

  const back = () => {
    if (cpr) return setCpr(false);
    if (finished) return setFinished(false);
    if (!history.length) return;
    setIndex(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const giveAnswer = (value: Answer) => {
    if (!step) return;
    setAnswers((a) => ({ ...a, [step.n]: value }));
    setAnsweredBy((b) => ({ ...b, [step.n]: 'crew' }));
    addLog('answer', `Step ${step.n}: "${step.check}" ${value.toUpperCase()}`);
  };

  const finishTimer = () => {
    if (!step || timerDone) return;
    setTimersDone((t) => [...t, step.n]);
    addLog('timer', `Step ${step.n}: timer done (${step.timer_s} s)`);
  };

  return {
    log, addLog, step, index, answers, answeredBy, answer, timerDone, route, canNext, cpr, finished, startedAt,
    canBack: cpr || finished || history.length > 0, next, back, jump, giveAnswer, finishTimer,
    startCpr: () => { setCpr(true); addLog('cpr', 'CPR guide opened'); },
  };
}
