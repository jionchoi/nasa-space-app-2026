import { Link } from 'react-router-dom';
import { byUrgency, clock, firstSentence, maxLevel, STATUS_CLASS } from '../../lib/status';
import { adviceFor, useApp } from '../../state/AppContext';
import type { RegionId, RegionMeta, RegionStatus } from '../../types/contracts';

interface Props {
  statuses: RegionStatus[];
  regions: RegionMeta[];
  onSelect(id: RegionId): void;
  /** Opens the drafted flight-surgeon message for the most urgent region, when there is one. */
  onOpenDraft?(): void;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Status card: "how am I today and what do I do next?" Tinted with the worst status color when something needs attention. */
export function TodayCard({ statuses, regions, onSelect, onOpenDraft }: Props) {
  const { personaInfo, escalation, envKeys, checkDoneAt } = useApp();
  const attention = statuses.filter((s) => s.status !== 'green').sort(byUrgency);
  const worst = attention[0];
  const level = maxLevel(statuses.map((s) => s.advice_level));
  const levelLabel = escalation?.levels.find((l) => l.id === level)?.label ?? '';
  const label = (id: RegionId) => regions.find((r) => r.id === id)?.label ?? id;
  const firstName = personaInfo?.name.split(' ')[0];
  const cls = STATUS_CLASS[worst?.status ?? 'green'];

  // Kicker, title and next step come from the statuses, escalation.json and the daily check.
  const kicker = !statuses.length ? 'Loading' : worst
    ? `${attention.length} ${attention.length === 1 ? 'area needs' : 'areas need'} attention` : 'All systems nominal';
  const title = worst ? firstSentence(worst.reason)
    : `${greeting()}${firstName ? `, ${firstName}` : ''}. Everything looks normal.`;
  const text = worst ? `${levelLabel}: ${firstSentence(adviceFor(escalation, level, envKeys))}`
    : checkDoneAt ? `Nothing needs your attention. Daily check done at ${clock(checkDoneAt)}.`
      : 'Nothing needs your attention. Next: your 5-minute daily check.';

  return (
    <section aria-label="Today" className={`flex flex-col gap-3 rounded-panel border p-5 ${worst ? `${cls.edge} ${cls.soft}` : 'border-line bg-panel'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`h-3 w-3 rounded-full ${cls.bg}`} aria-hidden />
        <span className={`kicker ${cls.text}`}>{kicker}</span>
      </div>
      <h1 className="text-[22px] font-bold leading-tight [text-wrap:balance]">{title}</h1>
      <p className="text-soft [text-wrap:pretty]">{text}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {worst ? (
          <button type="button" className="btn btn-primary" onClick={() => onSelect(worst.region)}>Review {label(worst.region).toLowerCase()}</button>
        ) : (
          <Link to="/check" className="btn btn-primary">{checkDoneAt ? 'Repeat the 5-minute check' : 'Start the 5-minute check'}</Link>
        )}
        {worst && onOpenDraft && (
          <button type="button" className="btn border-line-strong bg-transparent" onClick={onOpenDraft}>Open draft message</button>
        )}
      </div>
    </section>
  );
}
