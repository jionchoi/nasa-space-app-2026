// Health data shared by every screen (v4): the top bar pills, the Inbox badge, the Act now pop-up and the dashboard all
// read the same statuses, live vitals, cabin and radiation. The backend stays the single source of status; this only
// combines the daily status with the live vitals the same way the v1 dashboard did.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useMockAlerts } from '../hooks/useAlerts';
import { useDanger } from '../hooks/useDanger';
import { useCabin, useRadiation } from '../hooks/useEnvironment';
import { useMessages, type MessagesApi } from '../hooks/useMessages';
import { useDaily, useStatus } from '../hooks/useStatus';
import { useVitals } from '../hooks/useVitals';
import { usualValue } from '../lib/metrics';
import { symptomsConfig, useActiveSymptoms } from '../lib/symptoms';
import { byUrgency, liveRegionStatus, liveStatus, raiseLevel, worse, type LiveOptions, type LiveStatus } from '../lib/status';
import type { CabinSummary, DailyEntry, RadiationSummary, RegionId, RegionStatus, Status, VitalsFrame } from '../types/contracts';
import { useAlerts } from './AlertsContext';
import { useApp, useStatusLabel } from './AppContext';

interface HealthState {
  /** GET /api/status as the backend sent it. */
  statuses: RegionStatus[];
  /** Same, raised by the live vitals right now (never lowered). What the body map, chips and badge show. */
  shown: RegionStatus[];
  daily: DailyEntry[];
  frames: VitalsFrame[];
  latest?: VitalsFrame;
  live: LiveStatus | null;
  liveRegions: Partial<Record<RegionId, Status>>;
  /** A live vital has been red for 10+ s. */
  danger: boolean;
  /** Red-flag symptoms logged in the last hour (thresholds.json "symptoms"). */
  symptoms: string[];
  /** What liveStatus was judged with (symptoms, frozen usual), for other screens judging the same frames. */
  liveOptions: LiveOptions;
  cabin: CabinSummary | null;
  radiation: RadiationSummary | null;
  messages: MessagesApi;
  /** Most urgent area (null before the statuses load). */
  worst: RegionStatus | null;
  /** The selected area: the picked one, else the most urgent, else the heart. */
  selected: RegionId | null;
  /** Areas at Watch or worse (body badge and Inbox badge). */
  attention: number;
}

const Ctx = createContext<HealthState | null>(null);

export function HealthProvider({ children }: { children: ReactNode }) {
  const { persona, env, regions, thresholds, checkDoneAt, picked } = useApp();
  const statusLabel = useStatusLabel();
  const statuses = useStatus(persona, env);
  const daily = useDaily(persona, checkDoneAt);
  const { frames, latest } = useVitals(persona);
  // Red-flag symptoms logged here, plus those the backend raised an alert for (logged in another tab or by the demo).
  const localSymptoms = useActiveSymptoms(persona, thresholds);
  const { alerts: allAlerts, setFallback } = useAlerts();
  const activeMin = symptomsConfig(thresholds)?.active_minutes ?? 60;
  const symptomKey = [...new Set([...localSymptoms, ...allAlerts
    .filter((a) => a.metric?.startsWith('symptom:') && Date.now() - Date.parse(a.t) < activeMin * 60_000)
    .map((a) => a.metric!.slice('symptom:'.length))])].join(',');
  const symptoms = useMemo(() => (symptomKey ? symptomKey.split(',') : []), [symptomKey]);
  const usualHr = useMemo(() => usualValue(daily, 'hr_rest'), [daily]);
  const liveOptions = useMemo<LiveOptions>(() => ({ symptoms: symptoms.length > 0, usual: { hr_rest: usualHr } }), [symptoms, usualHr]);
  const live = useMemo(() => liveStatus(latest, thresholds, liveOptions), [latest, thresholds, liveOptions]);
  const danger = useDanger(frames, thresholds, liveOptions);
  const cabin = useCabin();
  const radiation = useRadiation(persona, env);
  const messages = useMessages();

  // Alerts built in the browser are only used when the backend is off (every page has the Inbox now).
  const mockAlerts = useMockAlerts(statuses, live);
  useEffect(() => { setFallback(mockAlerts); }, [mockAlerts, setFallback]);

  const liveRegions = useMemo(() => liveRegionStatus(live, regions), [live, regions]);
  const shown = useMemo(() => statuses.map((s) => {
    const now = liveRegions[s.region] ?? 'green';
    if (worse(now, s.status) === s.status) return s;
    return { ...s, status: now, advice_level: raiseLevel(s.advice_level, now), reason: `Live vitals right now: ${statusLabel(now)}.` };
  }), [statuses, liveRegions, statusLabel]);
  const worst = useMemo(() => [...shown].sort(byUrgency)[0] ?? null, [shown]);
  const selected = picked ?? (worst ? (worst.status === 'green' ? 'heart' : worst.region) : null);
  const attention = shown.filter((s) => s.status !== 'green').length;

  const value = useMemo<HealthState>(() => ({
    statuses, shown, daily, frames, latest, live, liveRegions, danger, symptoms, liveOptions, cabin, radiation, messages, worst, selected, attention,
  }), [statuses, shown, daily, frames, latest, live, liveRegions, danger, symptoms, liveOptions, cabin, radiation, messages, worst, selected, attention]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealth(): HealthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHealth must be used inside HealthProvider');
  return ctx;
}
