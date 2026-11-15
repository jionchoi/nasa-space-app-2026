import { AppHeader } from '../components/common/AppHeader';
import { AreaDetail } from '../components/dashboard/AreaDetail';
import { BodyMapV4 } from '../components/dashboard/BodyMapV4';
import { LearnDialog } from '../components/dashboard/LearnDialog';
import { MissionTimeline } from '../components/dashboard/MissionTimeline';
import { RadiationBlock, StatusLine, WhatToDo } from '../components/dashboard/RightColumn';
import { useHealth } from '../state/HealthContext';

/** Dashboard "/" (design v4, Main-v4): top bar and live vitals row, then the body map (left, ~600 px) and the
 *  selected area (right): status line, mission timeline, metrics and chart, radiation block, what to do, who to tell.
 *  The Inbox, sidebar and Act now pop-up are global (App.tsx). */
export default function Dashboard() {
  const { selected } = useHealth();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col lg:flex-row">
        <div className="lg:w-[600px] lg:shrink-0">
          <BodyMapV4 />
        </div>
        <section aria-label="Selected area" className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-8 pt-4 sm:px-7">
          <StatusLine />
          <MissionTimeline />
          <AreaDetail />
          {selected === 'radiation' && <RadiationBlock />}
          <WhatToDo />
        </section>
      </main>
      <LearnDialog />
    </div>
  );
}
