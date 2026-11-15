import { entryOf, fmt, LIVE_VITALS } from '../../lib/status';
import type { Persona, Protocol, Thresholds, VitalsFrame } from '../../types/contracts';
import { logTime } from './EventLog';
import type { Answer, LogEntry } from './useEmergency';

interface DraftInput {
  protocol: Protocol;
  persona?: Persona;
  startedAt: number;
  latest?: VitalsFrame;
  thresholds: Thresholds | null;
  log: LogEntry[];
  answers: Record<number, Answer>;
  litFlags: string[];
}

/** Message to the flight surgeon, built from the log: who, what started when, vitals now, steps, answers. */
export function buildDraft(d: DraftInput): string {
  const vitals = d.latest
    ? LIVE_VITALS.map((key) => {
        const entry = entryOf(d.thresholds, key);
        return `${entry?.label ?? key} ${fmt(d.latest![key], 0)} ${entry?.unit ?? ''}`.trim();
      }).join(', ') + (d.latest.irregular ? ', irregular rhythm' : '')
    : 'no sensor data';
  const stepsDone = [...new Set(d.log.filter((e) => e.kind === 'step').map((e) => /^Step (\d+)/.exec(e.text)?.[1]))]
    .filter(Boolean).join(', ');
  const answers = Object.entries(d.answers).map(([n, value]) => {
    const step = d.protocol.steps.find((s) => s.n === Number(n));
    return `  Step ${n}: ${step?.check} ${value.toUpperCase()}`;
  });
  const who = d.persona ? `${d.persona.name}${d.persona.simulated ? ' (simulated data)' : ''}` : 'unknown';

  return [
    `URGENT: ${d.protocol.title}`,
    `Crew member: ${who}`,
    `Started: ${logTime(new Date(d.startedAt).toISOString())}`,
    `Vitals now: ${vitals}`,
    `Red flags: ${d.litFlags.length ? d.litFlags.join('; ') : 'none so far'}`,
    `Steps shown: ${stepsDone || 'none'}`,
    answers.length ? `Answers:\n${answers.join('\n')}` : 'Answers: none yet',
    d.log.some((e) => e.kind === 'cpr') ? 'CPR: started' : null,
  ].filter(Boolean).join('\n');
}
