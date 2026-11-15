import { useSignals } from '../../state/SignalContext';
import { ModePicker } from '../signals/SignalControls';
import { EnvelopeSimple, Warning } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAlerts } from '../../state/AlertsContext';
import { useApp } from '../../state/AppContext';
import { CameraToggle } from '../cv/CameraMonitor';
import { AlertsList } from '../dashboard/AlertsList';
import { MissionClock } from '../routine/MissionClock';
import { Brand, CrewPicker, LinkStatus, LocationSwitch } from './HeaderParts';
import { OnboardIndicator, SourceChip } from './StatusIndicators';

interface Props {
  /** Emergency screen: no switching, no Emergency button; keeps mission day, link status and the source chip. */
  compact?: boolean;
  /** Dashboard: shows the "Messages" button that opens the flight-surgeon drawer. */
  onOpenMessages?(): void;
  /** Number of unsent drafts, shown on the Messages button. */
  draftCount?: number;
  /** Extra row under the bar (e.g. daily check progress). */
  children?: ReactNode;
}

/** The red EMERGENCY button (always one tap away). */
function EmergencyButton() {
  return (
    <Link to="/emergency" className="flex h-11 items-center gap-2 rounded-control bg-emergency px-4 font-bold tracking-[0.04em] text-white transition hover:bg-emergency/90 active:scale-[0.98]">
      <Warning className="h-4 w-4" weight="bold" aria-hidden /> EMERGENCY
    </Link>
  );
}

/** The same header on every screen (dashboard v1 design). */
export function AppHeader({ compact, onOpenMessages, draftCount = 0, children }: Props) {
  const {mode,session,error}=useSignals();
  const demo=mode==='demo';
  const { personaInfo, setPicked } = useApp();
  const { alerts, ack } = useAlerts();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (compact) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-4 rounded-card border border-line bg-header px-3 text-sm">
        <Brand small />
        <span className="text-muted">Mission day <span className="font-mono text-text">{demo ? personaInfo?.mission_day ?? '–' : '–'}</span></span>
        {demo?<LinkStatus />:<span className="text-sm text-muted">Local measurements</span>}
        <div className="ml-auto flex items-center gap-3"><SourceChip /><OnboardIndicator /></div>
      </header>
    );
  }

  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-header">
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3">
        <Brand />
        {demo?<CrewPicker />:<span className="border-l border-line pl-4 text-sm">{session?.subject_id??'No crew session'}</span>}
        <ModePicker/>
        <LocationSwitch />
        <div className="flex flex-col gap-0.5">
          {demo?<LinkStatus />:<span className="text-sm text-muted">Local measurements</span>}
          <span className="flex items-center gap-2">{demo&&<MissionClock />}<SourceChip /></span>
        </div>

        <div className="flex-1" />

        <OnboardIndicator />
        {demo?<CameraToggle />:<span className="text-xs text-muted">Camera detection · demo only</span>}
        {demo && onOpenMessages && (
          <button type="button" className="flex h-11 items-center gap-1.5 rounded-control border border-line bg-raised/50 px-3 transition hover:bg-raised"
            onClick={onOpenMessages} aria-label={`Messages to the flight surgeon: ${draftCount} drafts`}>
            <EnvelopeSimple className="h-4 w-4" aria-hidden /> Messages
            <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-bold ${draftCount > 0 ? 'bg-warn text-bg' : 'bg-line-strong text-text'}`}>
              {draftCount}
            </span>
          </button>
        )}
        {demo && <AlertsList alerts={alerts} onAck={ack} onOpen={(link) => navigate(link)}
          onView={(region) => { setPicked(region); if (pathname !== '/') navigate('/'); }} />}
        {error&&<span role="alert" className="text-sm text-watch">{error}</span>}
        <EmergencyButton />
      </div>
      {children}
    </header>
  );
}
