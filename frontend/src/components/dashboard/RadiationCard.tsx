import type { RadiationFeed } from '../../types/contracts';

/** Source badge for the dose at this location: real NASA readings (blue, links to the export) or an estimate (amber). */
export function FeedBadge({ feed }: { feed: RadiationFeed }) {
  if (feed.kind === 'estimated') {
    return <span className="badge bg-watch/10 text-watch ring-watch/25" title={feed.source ?? undefined}>{feed.badge}</span>;
  }
  return (
    <a href={feed.source_url ?? undefined} target="_blank" rel="noreferrer" title={feed.instrument ?? undefined}
      className="badge bg-info/10 text-info ring-info/25 hover:underline">{feed.badge}</a>
  );
}
