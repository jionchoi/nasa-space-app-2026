import type { ReactNode } from 'react';
import { TopBar } from '../shell/TopBar';
import { VitalsRow } from '../shell/VitalsRow';
import { ResearchNote } from './ResearchNote';

interface Props {
  /** Extra row under the bar (e.g. daily check progress). */
  children?: ReactNode;
  /** Hide the live vitals row (the daily check has its own measurement screen). */
  noVitals?: boolean;
}

/** The v4 header on every page except emergency mode (which has its own red bar): top bar + live vitals row + the research-prototype line. */
export function AppHeader({ children, noVitals }: Props) {
  return (
    <>
      <TopBar>{children}</TopBar>
      {!noVitals && <VitalsRow />}
      <ResearchNote className="border-b border-line bg-[#06070A] px-6 py-0.5" />
    </>
  );
}
