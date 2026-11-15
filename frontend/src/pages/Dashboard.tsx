import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../components/common/AppHeader';
import { BodyMap } from '../components/dashboard/BodyMap';
import { CabinPanel } from '../components/dashboard/CabinPanel';
import { MessagesDrawer } from '../components/dashboard/MessagesDrawer';
import { RedAlertBanner } from '../components/dashboard/RedAlertBanner';
import { RegionList } from '../components/dashboard/RegionList';
import { RegionPanel } from '../components/dashboard/RegionPanel';
import { TodayCard } from '../components/dashboard/TodayCard';
import { VitalsStrip } from '../components/dashboard/VitalsStrip';
import { MissionsCard } from '../components/routine/MissionsCard';
import { useMockAlerts } from '../hooks/useAlerts';
import { useDanger } from '../hooks/useDanger';
import { useCabin, useRadiation } from '../hooks/useEnvironment';
import { useMessages } from '../hooks/useMessages';
import { useDaily, useStatus } from '../hooks/useStatus';
import { useVitals } from '../hooks/useVitals';
import { byUrgency, liveRegionStatus, liveStatus, raiseLevel, worse } from '../lib/status';
import { useAlerts } from '../state/AlertsContext';
import { useApp, useStatusLabel } from '../state/AppContext';
import type { Alert } from '../types/contracts';

/** Dashboard "/" (design v1): live vitals row, then Today | body map | selected area. */
export default function Dashboard() {
  const { persona, env, envInfo, regions, thresholds, checkDoneAt, picked, setPicked } = useApp();
  const statusLabel = useStatusLabel();
  const statuses = useStatus(persona, env);
  const daily = useDaily(persona, checkDoneAt);
  const { frames, latest } = useVitals(persona);
  const live = useMemo(() => liveStatus(latest, thresholds), [latest, thresholds]);
  const danger = useDanger(frames, thresholds);
  const cabin = useCabin();
  const radiation = useRadiation(persona, env);
  const messages = useMessages();
  const { alerts, ack, setFallback } = useAlerts();
  const [drawer, setDrawer] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null });

  // Alerts built in the browser are only used when the backend is off.
  const mockAlerts = useMockAlerts(statuses, live);
  useEffect(() => { setFallback(mockAlerts); }, [mockAlerts, setFallback]);
  useEffect(() => () => setFallback(null), [setFallback]);

  // The body shows the worse of the daily status and what the live vitals say right now.
  const liveRegions = useMemo(() => liveRegionStatus(live, regions), [live, regions]);
  const shown = useMemo(() => statuses.map((s) => {
    const now = liveRegions[s.region] ?? 'green';
    if (worse(now, s.status) === s.status) return s;
    return { ...s, status: now, advice_level: raiseLevel(s.advice_level, now), reason: `Live vitals right now: ${statusLabel(now)}.` };
  }), [statuses, liveRegions, statusLabel]);
  // Default selection: the most urgent area, or the heart when everything is Nominal.
  const worst = useMemo(() => [...shown].sort(byUrgency)[0] ?? null, [shown]);
  const selected = picked ?? (worst ? (worst.status === 'green' ? 'heart' : worst.region) : null);
  const redAlert = alerts.find((a) => a.level === 'red' && !a.acknowledged) ?? null;

  const openDraft = useCallback(async (alert: Alert) => {
    setDrawer({ open: true, focus: alert.message_draft_id });
    const id = await messages.draftFor(alert);
    setDrawer({ open: true, focus: id });
  }, [messages]);
  // "Open draft message" on the status card: the open alert for the most urgent area, if it has (or gets) a draft.
  const worstAlert = worst && worst.status !== 'green'
    ? alerts.find((a) => a.region === worst.region && !a.acknowledged && (a.level === 'orange' || a.level === 'red'))
    : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader onOpenMessages={() => setDrawer({ open: true, focus: null })} draftCount={messages.drafts.length} />
      <RedAlertBanner alert={redAlert} danger={danger} onDraft={openDraft} onAck={ack} />

      <div className="mx-auto w-full max-w-[1440px] px-6 pt-5">
        <VitalsStrip frames={frames} thresholds={thresholds} daily={daily} />
      </div>

      <main className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start gap-5 px-6 pb-6 pt-5">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:max-w-[340px]">
          <TodayCard statuses={shown} regions={regions} onSelect={setPicked} onOpenDraft={worstAlert ? () => openDraft(worstAlert) : undefined} />
          <MissionsCard />
          <CabinPanel cabin={cabin} estimated={!!envInfo?.estimated_data?.includes('cabin')} />
          <RegionList statuses={shown} regions={regions} selected={selected} onSelect={setPicked} />
        </div>
        <BodyMap statuses={shown} regions={regions} selected={selected} onSelect={setPicked} />
        <RegionPanel
          status={statuses.find((s) => s.region === selected)}
          meta={regions.find((r) => r.id === selected)}
          liveNow={selected ? liveRegions[selected] : undefined}
          daily={daily}
          latest={latest}
          cabin={cabin}
          radiation={radiation}
        />
      </main>

      <MessagesDrawer open={drawer.open} focusId={drawer.focus} api={messages} onClose={() => setDrawer({ open: false, focus: null })} />
    </div>
  );
}
