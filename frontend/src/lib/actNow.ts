// What the Act now pop-up shows and why (pure, tested in actNow.test.ts). No numbers here: red ranges come from
// thresholds.json, alerts from the backend rules, the lost pulse from cv/pulse.ts.
import type { Alert, RegionId, RegionMeta, SymptomsConfig, Thresholds } from '../types/contracts';
import { CV_PULSE_LOST_URL } from './crewAlarm';
import { entryOf, LIVE_VITALS } from './status';

export type ActNowKind = 'pulse_lost' | 'symptom' | 'alert' | 'vitals';

export interface ActNowInput {
  /** Backend alerts (any level, any source). */
  alerts: Alert[];
  /** Live vitals in the red range right now, in LIVE_VITALS order (empty on a poor signal). */
  redVitals: string[];
  /** A live vital has been red for 10+ s and the crew has not acknowledged it. */
  danger: boolean;
  /** cv/pulse.ts says the pulse is lost (clip on, no beats) and the crew has not acknowledged it. */
  pulseLost: boolean;
  regions: RegionMeta[];
  /** Red-flag symptoms logged in the last hour that the crew has not acknowledged (thresholds.json "symptoms"). */
  symptoms?: string[];
  symptomsConfig?: SymptomsConfig | null;
}

export interface ActNowTrigger {
  kind: ActNowKind;
  region: RegionId | null;
  /** The alert the pop-up is about (kind "alert"). */
  alert?: Alert;
  /** Open red alerts the pop-up acknowledges, oldest first. */
  open: Alert[];
  /** Where "Open emergency mode" goes. */
  emergencyUrl: string;
}

/** Region whose live metrics include this vital (hr -> heart, spo2 -> lungs). */
export const regionOfVital = (regions: RegionMeta[], key: string): RegionId | null =>
  regions.find((r) => r.live_metrics.includes(key))?.id ?? null;

const vitalRank = (metric: string | null) => {
  const i = LIVE_VITALS.indexOf(metric as (typeof LIVE_VITALS)[number]);
  return i === -1 ? LIVE_VITALS.length : i;
};

/** Open red alerts from the rules or the live vitals, OLDEST first: the rule that fired first names the pop-up.
 *  Alerts raised in the same second are ordered heart rate first (LIVE_VITALS order). */
export function openRedAlerts(alerts: Alert[]): Alert[] {
  return alerts
    .filter((a) => a.level === 'red' && !a.acknowledged && (a.source === 'rules' || a.source === 'vitals'))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t) || vitalRank(a.metric) - vitalRank(b.metric));
}

/** Why the pop-up should show, or null. A lost pulse comes first: it opens the unresponsive protocol with
 *  "responds? NO" answered; emergency mode then offers CPR through the pulse_lost red flag (5 s, with Cancel). */
export function actNowTrigger(input: ActNowInput): ActNowTrigger | null {
  const open = openRedAlerts(input.alerts);
  if (input.pulseLost) {
    return { kind: 'pulse_lost', region: regionOfVital(input.regions, 'hr'), open, emergencyUrl: CV_PULSE_LOST_URL };
  }
  const symptom = input.symptoms?.[0];
  if (symptom) {
    return { kind: 'symptom', region: input.symptomsConfig?.region[symptom] ?? null, open,
      emergencyUrl: symptom === 'chest_pain' ? '/emergency?protocol=chest_pain&trigger=crew' : '/emergency' };
  }
  if (open.length) {
    const alert = open[0];
    return { kind: 'alert', region: alert.region ?? (alert.metric ? regionOfVital(input.regions, alert.metric) : null), alert, open, emergencyUrl: '/emergency' };
  }
  if (input.danger) {
    return { kind: 'vitals', region: input.redVitals[0] ? regionOfVital(input.regions, input.redVitals[0]) : null, open, emergencyUrl: '/emergency' };
  }
  return null;
}

/** Which of the medical lead's rules fired, e.g. "RULE-01 + RULE-05 + chest pain or pressure logged" (the "why" line).
 *  Red vitals name their thresholds.json rule_id; a logged red-flag symptom is the team-default symptom rule. */
export function firedRules(redVitals: string[], thresholds: Thresholds | null, symptoms: string[] = [],
  cfg: SymptomsConfig | null = null): string {
  const ids: string[] = [];
  for (const key of redVitals) {
    const id = entryOf(thresholds, key)?.rule_id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  ids.sort();
  const words = symptoms.map((s) => `${(cfg?.red_flag[s] ?? s).toLowerCase()} logged`);
  return [...ids, ...words].join(' + ');
}
