import { AppHeader } from '../components/common/AppHeader';
import { AreaDetail } from '../components/dashboard/AreaDetail';
import { BodyMapV4 } from '../components/dashboard/BodyMapV4';
import { LearnDialog } from '../components/dashboard/LearnDialog';
import { MissionTimeline } from '../components/dashboard/MissionTimeline';
import { RadiationBlock, StatusLine, WhatToDo } from '../components/dashboard/RightColumn';
import { useHealth } from '../state/HealthContext';

/** Dashboard "/" (design v4, Main-v4): top bar and live vitals row, then the body map (left, scaled to fit the window
 *  height) and the selected area (right): status line, mission timeline (collapsed by default), metrics and chart,
 *  radiation block, what to do, who to tell.
 *  The Inbox, sidebar and Act now pop-up are global (App.tsx). */
export default function Dashboard() {
  const { selected } = useHealth();
  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh]">
      <AppHeader />
      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <div id="bodymap-col" className="lg:shrink-0">
          <BodyMapV4 />
        </div>
        {/* One page on wide screens: if the selected area is ever taller than the window, only this column scrolls. */}
        <section aria-label="Selected area" className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-6 pt-4 sm:px-7 lg:overflow-y-auto">
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
