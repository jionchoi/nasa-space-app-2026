// Protocol routing (pure, tested in lib/medsci.test.ts): the medical lead's node IDs, YES / NO / Next.
import type { Protocol, ProtocolStep, StepRoute } from '../../types/contracts';
import type { Answer } from './useEmergency';

/** Where a node ID that is not in this protocol lives (the medical lead's prefixes: CL = collapse, CP = chest pain). */
const PROTOCOL_OF_PREFIX: Record<string, string> = { CL: 'unresponsive', CP: 'chest_pain' };

export type Target =
  | { kind: 'cpr' }
  | { kind: 'step'; index: number }
  | { kind: 'finished' }
  | { kind: 'protocol'; protocol: string; node: string };

/** Where a route from step `from` leads: a node ID (this protocol or another one), "next", an old step number or "cpr". */
export function resolve(protocol: Protocol, from: number, route: StepRoute | null | undefined): Target {
  if (route === 'cpr') return { kind: 'cpr' };
  if (route == null) return { kind: 'finished' };
  let index: number;
  if (route === 'next') index = from + 1;
  else if (typeof route === 'number') index = protocol.steps.findIndex((s) => s.n === route);
  else {
    index = protocol.steps.findIndex((s) => s.id === route);
    const other = PROTOCOL_OF_PREFIX[route.slice(0, 2)];
    if (index < 0 && other && other !== protocol.id) return { kind: 'protocol', protocol: other, node: route };
  }
  return index < 0 || index >= protocol.steps.length ? { kind: 'finished' } : { kind: 'step', index };
}

/** The route the crew's answer (or "done") takes from this step: YES / NO for a decision, Next for an action, none at an
 *  end node. Old protocols without node IDs keep "next". */
export function routeOf(step: ProtocolStep | undefined, answer: Answer | undefined): StepRoute | null {
  if (!step) return null;
  if (step.check) return (answer === 'yes' ? step.on_yes : answer === 'no' ? step.on_no : null) ?? (step.id ? null : 'next');
  if (step.type === 'end') return null;
  return step.next ?? (step.id ? null : 'next');
}

