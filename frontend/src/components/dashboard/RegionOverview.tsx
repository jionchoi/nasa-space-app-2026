import { ForkKnife, Lightning, PersonSimpleRun, Scales } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import type { MetricRow } from '../../lib/metrics';
import { raiseLevel, STATUS_CLASS, worse } from '../../lib/status';
import { adviceFor, useApp, useStatusLabel } from '../../state/AppContext';
import { useRoutine } from '../../state/RoutineContext';
import type { RadiationSummary, RegionMeta, RegionStatus, Status, ThresholdEntry } from '../../types/contracts';
import { CrewGlucoseLine } from '../common/CrewReference';
import { EscalationLadder } from './EscalationLadder';
import { GuidanceCard, PreventionList } from './GuidanceCard';
import { RadiationCard } from './RadiationCard';
import { TrendChart, type Range } from './TrendChart';

interface Props {
  status: RegionStatus;
  meta: RegionMeta;
  liveNow?: Status;
  /** The metric to chart (the key metric unless one was picked on "All metrics"). */
  row?: MetricRow;
  entry?: ThresholdEntry;
  range: Range;
  onRange(range: Range): void;
  radiation: RadiationSummary | null;
}

function timeToAct(status: RegionStatus, liveNow?: Status): string {
  if (liveNow === 'red' || liveNow === 'orange') return 'Now';
  const days = status.time_to_act_days;
  if (days === 0) return 'Now';
  if (days !== null) return `About ${days} ${days === 1 ? 'day' : 'days'}`;
  return status.status === 'green' ? 'Nothing to do' : 'No deadline yet';
}

/** Overview tab: what to do (guidance.json, with the ladder), how to stay healthy, what's happening, time to act,
 *  and the 30-day chart. */
export function RegionOverview({ status, meta, liveNow, row, entry, range, onRange, radiation }: Props) {
  const statusLabel = useStatusLabel();
  const { escalation, envKeys, envInfo, guidance, persona } = useApp();
  const { openLog } = useRoutine();
  const navigate = useNavigate();
  const level = raiseLevel(status.advice_level, liveNow);
  // Live vitals can make the area look worse right now than the daily status.
  const shown = worse(liveNow ?? 'green', status.status);
  const cls = STATUS_CLASS[shown];
  const live = liveNow && liveNow !== 'green' && liveNow !== status.status;
  const item = guidance?.regions[meta.id]?.[guidance.status_keys[shown]];
  const extraSteps = envInfo ? escalation?.extra_steps?.[envInfo.id] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <GuidanceCard persona={persona} region={meta.id} status={shown} item={item}
        ladder={<EscalationLadder escalation={escalation} level={level} advice={adviceFor(escalation, level, envKeys)} status={shown} extraSteps={extraSteps} />} />
      <PreventionList item={item} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">What's happening</span>
          {live && <span className={`font-medium ${STATUS_CLASS[liveNow].text}`}>Live vitals right now: {statusLabel(liveNow)}.</span>}
          <span className="font-medium [text-wrap:pretty]">{status.reason}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Time to act</span>
          <span className={`text-base font-bold ${shown === 'green' ? 'text-text' : cls.text}`}>{timeToAct(status, liveNow)}</span>
          {status.time_to_act_days !== null && status.time_to_act_days > 0 && !live && <span className="text-xs text-muted">if the trend continues</span>}
        </div>
      </div>

      {meta.id === 'radiation' && radiation && <RadiationCard data={radiation} />}

      {row && row.points.length > 1 && (
        <TrendChart points={row.points} title={row.label} entry={entry}
          timeToActDays={row.metric === meta.key_metric ? status.time_to_act_days : null}
          range={row.kind === 'daily' ? range : undefined} onRange={row.kind === 'daily' ? onRange : undefined}
          windowLabel={row.kind === 'cabin' ? `last 24 h (${row.source ?? 'simulated'})` : undefined} />
      )}

      {meta.id === 'brain_mood' && (
        <button type="button" className="btn self-start" onClick={() => navigate('/reaction')}><Lightning className="h-4 w-4 text-warn" aria-hidden /> Take reaction test</button>
      )}
      {meta.id === 'metabolism' && <CrewGlucoseLine />}
      {meta.id === 'metabolism' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => openLog('meal')}><ForkKnife className="h-4 w-4" aria-hidden /> Log meal and water</button>
          <button type="button" className="btn" onClick={() => openLog('biomarkers')}><Scales className="h-4 w-4" aria-hidden /> Weekly biomarkers</button>
        </div>
      )}
      {meta.id === 'bones_muscles' && (
        <button type="button" className="btn self-start" onClick={() => openLog('exercise')}><PersonSimpleRun className="h-4 w-4" aria-hidden /> Log exercise</button>
      )}
    </div>
  );
}
