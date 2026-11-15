import { CloudSlash, Flask } from '@phosphor-icons/react';
import { useUsingMock } from '../../api/client';
import { useApp } from '../../state/AppContext';

/** "Simulated data" (when the persona is simulated) and "Offline: mock data" (when the backend is off). */
export function DataBadges() {
  const { personaInfo } = useApp();
  const usingMock = useUsingMock();
  return (
    <>
      {personaInfo?.simulated && (
        <span className="badge bg-info/10 text-info ring-info/25" title={personaInfo.description}>
          <Flask className="h-3.5 w-3.5" aria-hidden /> Simulated data
        </span>
      )}
      {usingMock && (
        <span className="badge bg-watch/10 text-watch ring-watch/25">
          <CloudSlash className="h-3.5 w-3.5" aria-hidden /> Offline: mock data
        </span>
      )}
    </>
  );
}
