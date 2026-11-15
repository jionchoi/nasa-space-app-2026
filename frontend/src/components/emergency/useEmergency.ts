import { useCallback, useEffect, useRef, useState } from 'react';
import { useSignals } from '../../state/SignalContext';
import { postEvent } from '../../api/client';
import { useApp } from '../../state/AppContext';
import type { Protocol, ProtocolStep, StepRoute } from '../../types/contracts';

export type LogKind = 'start' | 'step' | 'answer' | 'timer' | 'vital' | 'cpr' | 'message' | 'end' | 'auto';
export interface LogEntry { t: string; kind: LogKind; text: string }
export type Answer = 'yes' | 'no';
export type AnsweredBy = 'crew' | 'unresponsive detection';

const TRIGGER_TEXT: Record<string, string> = { cv: 'opened by unresponsive detection', alarm: 'opened from the crew alarm' };

import { resolve, routeOf } from './routing';

export { resolve, routeOf };

const label = (s: ProtocolStep) => (s.id ? s.id : `Step ${s.n}`);

/** Protocol walk-through state: current node, answers, timers, routing and the event log.
 *  Sensors never answer a step or move the crew on (medical lead, Nov 15): `flag` only adds a log line. */
export function useEmergency(protocol: Protocol | null, trigger: string | null, flag: string | null = null, start: string | null = null) {
  const { mode } = useSignals();
  const { persona } = useApp();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [answeredBy, setAnsweredBy] = useState<Record<number, AnsweredBy>>({});
  const [timersDone, setTimersDone] = useState<number[]>([]);
  const [cpr, setCpr] = useState(false);
  const [finished, setFinished] = useState(false);
  const [handoff, setHandoff] = useState<{ protocol: string; node: string } | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const startedFor = useRef<string | null>(null);
  const protocolId = protocol?.id;

  const addLog = useCallback((kind: LogKind, text: string) => {
    const entry = { t: new Date().toISOString(), kind, text };
    setLog((list) => [...list, entry]);
    // The event log is posted as "alarm" events; details travel in `signals`.
    if (mode === 'demo') void postEvent({ t: entry.t, type: 'alarm', signals: { source: 'emergency', protocol: protocolId, kind, text } }, persona);
  }, [protocolId, persona, mode]);

  const show = useCallback((p: Protocol, i: number) => {
    const s = p.steps[i];
    setIndex(i);
    setFinished(false);
    // CL07 / CL13: the CPR guide (metronome, cycle timers) opens with the step.
    setCpr(!!s.cpr);
    addLog('step', `${label(s)} shown: ${s.text}`);
    if (s.cpr) addLog('cpr', `CPR guide opened (${label(s)})`);
  }, [addLog]);

  const go = useCallback((p: Protocol, from: number, route: StepRoute | null) => {
    const target = resolve(p, from, route);
    if (target.kind === 'cpr') {
      setCpr(true);
      addLog('cpr', 'CPR guide opened');
    } else if (target.kind === 'finished') {
      setFinished(true);
      addLog('step', 'End of protocol. Keep watching the vitals.');
    } else if (target.kind === 'protocol') {
      addLog('step', `Going to ${target.node} (${target.protocol === 'chest_pain' ? 'chest-pain' : 'collapse'} protocol)`);
      setHandoff({ protocol: target.protocol, node: target.node });
    } else {
      setHistory((h) => [...h, from]);
      show(p, target.index);
    }
  }, [addLog, show]);

  useEffect(() => {
    if (!protocol || startedFor.current === protocol.id) return;
    startedFor.current = protocol.id;
    setStartedAt(Date.now());
    setHistory([]);
    setAnswers({});
    setAnsweredBy({});
    setTimersDone([]);
    setHandoff(null);
    addLog('start', `Emergency started: ${protocol.title} (${TRIGGER_TEXT[trigger ?? ''] ?? 'opened by the crew'})`);
    if (flag) addLog('vital', `Red flag from the sensor: ${flag.replace(/_/g, ' ')} (shown only; the crew answers every step)`);
    const at = start ? protocol.steps.findIndex((s) => s.id === start) : -1;
    show(protocol, Math.max(0, at));
  }, [protocol, trigger, flag, start, addLog, show]);

  const step = protocol?.steps[index];
  const answer = step ? answers[step.n] : undefined;
  const timerDone = !!step && timersDone.includes(step.n);
  const route = routeOf(step, answer);
  const target = protocol && step ? resolve(protocol, index, route) : null;
  const canNext = !!step && (step.check ? !!answer : step.timer_s ? timerDone : true);

  const next = () => { if (protocol && step) go(protocol, index, route); };

  /** Follow a link on the step (CL10 -> chest-pain protocol CP00). */
  const follow = (to: string) => { if (protocol) go(protocol, index, to); };

  const back = () => {
    if (cpr && !step?.cpr) return setCpr(false);
    if (cpr && step?.cpr) return setCpr(false); // back from the guide to the CPR step's text
    if (finished) return setFinished(false);
    if (!history.length) return;
    setIndex(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const giveAnswer = (value: Answer) => {
    if (!step) return;
    setAnswers((a) => ({ ...a, [step.n]: value }));
    setAnsweredBy((b) => ({ ...b, [step.n]: 'crew' }));
    addLog('answer', `${label(step)}: "${step.check}" ${value.toUpperCase()}`);
  };

  const finishTimer = () => {
    if (!step || timerDone) return;
    setTimersDone((t) => [...t, step.n]);
    addLog('timer', `${label(step)}: timer done (${step.timer_s} s)`);
  };

  return {
    log, addLog, step, index, answers, answeredBy, answer, timerDone, route, target, canNext, cpr, finished, startedAt, handoff,
    canBack: cpr || finished || history.length > 0, next, back, follow, giveAnswer, finishTimer,
    startCpr: () => { setCpr(true); addLog('cpr', 'CPR guide opened'); },
  };
}
