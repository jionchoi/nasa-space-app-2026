import { useMemo, useRef, useState, useEffect } from 'react';
import { activeRedFlags, redFlagDefs } from '../../lib/redFlags';
import type { Protocol, RedFlagRoute, Thresholds, VitalsFrame } from '../../types/contracts';
import type { useEmergency } from './useEmergency';

/** Never auto-advance (or ask again) for the same flag within this time. */
const REPEAT_MS = 60_000;
const DEFAULT_COUNTDOWN_S = 5;

type Emergency = ReturnType<typeof useEmergency>;

export interface PendingJump { route: RedFlagRoute; target: string; seconds: number }

/** Red flags that move the protocol forward (protocol "red_flag_routes", flags from thresholds.json "red_flags").
 *  A firing flag starts a countdown the crew can cancel; when it ends the protocol jumps and the log says so. */
export function useRedFlagRoutes(protocol: Protocol | null, frames: VitalsFrame[], thresholds: Thresholds | null,
  em: Emergency, enabled: boolean) {
  const defs = useMemo(() => redFlagDefs(thresholds), [thresholds]);
  const active = useMemo(() => activeRedFlags(frames, defs), [frames, defs]);
  const [pending, setPending] = useState<PendingJump | null>(null);
  const lastFired = useRef<Record<string, number>>({});
  const emRef = useRef(em);
  emRef.current = em;
  const activeKey = active.join(',');

  useEffect(() => {
    if (!enabled || !protocol || pending) return;
    for (const route of protocol.red_flag_routes ?? []) {
      if (!active.includes(route.flag)) continue;
      if (Date.now() - (lastFired.current[route.flag] ?? 0) < REPEAT_MS) continue;
      const e = emRef.current;
      const already = route.goto === 'cpr' ? e.cpr : !e.cpr && e.step?.n === route.goto;
      if (already) continue;
      // CPR has priority: while the CPR guide is open, no red flag may move the crew to another step
      // (e.g. "SpO2 critical -> give oxygen" must not interrupt compressions after a lost pulse).
      if (e.cpr && route.goto !== 'cpr') continue;
      lastFired.current[route.flag] = Date.now();
      const target = route.goto === 'cpr' ? 'CPR' : `step ${route.goto}`;
      const seconds = route.countdown_s ?? DEFAULT_COUNTDOWN_S;
      e.addLog('auto', `Red flag ${route.flag} (${defs[route.flag]?.label ?? route.message}): going to ${target} in ${seconds} s unless cancelled`);
      setPending({ route, target, seconds });
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, enabled, protocol, pending]);

  const go = () => {
    if (!pending) return;
    emRef.current.jump(pending.route.goto, `auto-advanced by red flag ${pending.route.flag}`);
    setPending(null);
  };
  const cancel = () => {
    if (!pending) return;
    emRef.current.addLog('auto', `Auto-advance cancelled by the crew (red flag ${pending.route.flag})`);
    setPending(null);
  };

  return { pending, go, cancel, active, defs };
}
