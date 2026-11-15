// v4 Learn pop-up for the selected area and metric (replaces the Learn tab and "Why this matters in space").
// Text comes from regions.json, measurements.json and guidance.json (Yenna's DRAFT text). Anything not written yet
// says "TODO(Yenna)" instead of an invented medical claim. Then where the numbers come from, with a tag per source.
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useVitalsSource } from '../../api/client';
import { isDraft, undraft } from '../../lib/env';
import { normsLine, usePvtNorms } from '../../lib/pvtNorms';
import { entryOf } from '../../lib/status';
import { useApp } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';
import { CrewPanelTable } from '../common/CrewReference';
import { useAreaMetric } from './AreaDetail';
import { DraftTag } from './GuidanceCard';
import { WithRefs } from './MetricInfo';

type Tag = 'REAL' | 'EST' | 'PLACEHOLDER' | 'ON DEVICE' | 'SIMULATED';
const TAG_CLASS: Record<Tag, string> = {
  REAL: 'border-ok text-ok', EST: 'border-watch text-watch', PLACEHOLDER: 'border-watch text-watch',
  'ON DEVICE': 'border-info text-info', SIMULATED: 'border-line-strong text-soft',
};
const TODO = 'TODO(Yenna): not written yet.';

function Row({ k, draft, children }: { k: string; draft?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-line pt-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <span className="flex items-start gap-2 text-[13px] font-bold text-muted">{k}{draft && <DraftTag />}</span>
      <div className="text-[15px] text-[#DDE2EA]">{children}</div>
    </div>
  );
}

export function LearnDialog() {
  const { panel, close } = useShell();
  const { measurements, guidance, thresholds, env } = useApp();
  const { cabin, radiation, selected, shown } = useHealth();
  const { meta, row } = useAreaMetric();
  const pvt = usePvtNorms();
  const vitalsSource = useVitalsSource();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = panel === 'learn';
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  if (!open || !meta) return null;

  const metric = row?.metric ?? meta.key_metric;
  const entry = entryOf(thresholds, metric);
  const info = measurements?.metrics[metric];
  const status = shown.find((s) => s.region === selected)?.status ?? 'green';
  const item = guidance?.regions[meta.id]?.[guidance.status_keys[status]] ?? guidance?.regions[meta.id]?.nominal;
  const space = info?.can_do_in_space;
  const spaceNote = meta.space_effect ?? meta.spaceflight_note;
  const placeholder = (entry?.source ?? 'PLACEHOLDER').toUpperCase().startsWith('PLACEHOLDER');

  // Where these numbers come from.
  const sources: { text: ReactNode; tag: Tag }[] = [];
  if (metric.startsWith('pvt_') && pvt) {
    sources.push({ tag: 'REAL', text: <>{normsLine(pvt)}. Reaction-time limits: the CSA PRET ground study, {pvt.n} people (90th / 97.5th percentiles). <a href={pvt.url} target="_blank" rel="noreferrer" className="text-info hover:underline">{pvt.source}</a>, {pvt.licence}.</> });
  }
  if (row?.kind === 'cabin' && cabin) {
    sources.push({ tag: cabin.kind === 'real' ? 'REAL' : 'SIMULATED', text: <>{cabin.badge ?? 'Simulated cabin profile'}{cabin.kind === 'real' ? ' (NASA Environmental Data App, RR-23 / SpaceX-21)' : ''}. {cabin.location_note ?? ''}{cabin.source_urls?.[0] && <> <a href={cabin.source_urls[0]} target="_blank" rel="noreferrer" className="text-info hover:underline">Source</a></>}</> });
  }
  if (meta.id === 'radiation' && radiation?.feed) {
    const f = radiation.feed;
    sources.push({ tag: f.kind === 'real' ? 'REAL' : 'EST', text: <>{f.badge}{f.instrument ? ` (${f.instrument})` : ''} for {env}. {f.note ?? ''}{f.source_url && <> <a href={f.source_url} target="_blank" rel="noreferrer" className="text-info hover:underline">Source</a></>}</> });
    sources.push({ tag: 'REAL', text: <>Solar events: timing from NASA DONKI (replay of 10 May 2024); the dose during the event is simulated.</> });
    sources.push({ tag: 'SIMULATED', text: <>Mission dose so far: simulated crew member file.</> });
  }
  if (meta.id === 'metabolism') sources.push({ tag: 'REAL', text: <>Inspiration4 crew blood panel: NASA OSDR OSD-575 (reference only, table below).</> });
  if (['hr_rest', 'hrv_rmssd', 'spo2', 'rr', 'irregular'].includes(metric)) {
    sources.push({ tag: vitalsSource === 'sensor' ? 'ON DEVICE' : 'SIMULATED', text: vitalsSource === 'sensor' ? <>Finger clip PPG, processed on this laptop.</> : <>Replayed recording (simulated crew member), through the same PPG pipeline.</> });
  }
  sources.push({ tag: placeholder ? 'PLACEHOLDER' : 'REAL', text: <>Limits for {entry?.label ?? metric}: {placeholder ? 'placeholder, medical review pending (Yenna)' : entry?.source}.</> });
  if (row?.kind === 'daily') sources.push({ tag: 'ON DEVICE', text: <>"Your usual": the median of your own last 30 days.</> });
  const refs = Object.entries(meta.refs ?? {});

  return (
    <div className="fixed inset-0 z-[46] overflow-y-auto p-4 pt-[6vh]">
      <div className="absolute inset-0 bg-black/65" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="learn-title"
        className="relative mx-auto flex w-[min(780px,100%)] flex-col gap-3.5 rounded-[18px] border border-line-strong bg-panel px-7 py-6">
        <div className="flex items-center">
          <span className="text-xs tracking-[0.12em] text-info">LEARN</span>
          <span className="flex-1" />
          <button ref={closeRef} type="button" onClick={close} aria-label="Close Learn" className="grid h-10 w-10 place-items-center rounded-control border border-line-strong hover:bg-raised">✕</button>
        </div>
        <h2 id="learn-title" className="font-display text-[28px] font-bold leading-tight">{meta.label}{row ? ` · ${row.label}` : ''}</h2>

        <Row k="What this does" draft={isDraft(meta.function)}>{meta.function ? undraft(meta.function) : TODO}</Row>
        <Row k="Why we check it" draft={isDraft(info?.why_check)}>{info ? undraft(info.why_check) : TODO}</Row>
        <Row k="How it is measured" draft={info?.how_to_measure.some(isDraft)}>
          {info?.how_to_measure.length ? <ol className="list-decimal space-y-1 pl-5">{info.how_to_measure.map((s) => <li key={s}>{undraft(s)}</li>)}</ol> : TODO}
        </Row>
        <Row k="Can it be done on board?" draft={isDraft(space?.note)}>
          {space ? <><span className="font-semibold">{space.possible ? 'Yes.' : 'No.'}</span> {undraft(space.note)}</> : TODO}
        </Row>
        <Row k="Why this happens in space"><WithRefs text={spaceNote || TODO} refs={meta.refs} /></Row>
        <Row k="How to stay healthy" draft={!!item?.draft}>
          {item?.prevention.length ? <ul className="list-disc space-y-0.5 pl-5">{item.prevention.map((p) => <li key={p}>{undraft(p)}</li>)}</ul> : TODO}
        </Row>
        {meta.id === 'metabolism' && <div className="border-t border-line pt-3"><CrewPanelTable /></div>}

        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[13px] font-bold text-muted">Where these numbers come from</span>
          {sources.map((s, i) => (
            <span key={i} className="flex items-start gap-2 text-[13px] text-soft">
              <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] ${TAG_CLASS[s.tag]}`}>{s.tag}</span><span>{s.text}</span>
            </span>
          ))}
          {refs.length > 0 && (
            <span className="text-[12px] text-muted">
              References: {refs.map(([id, r], i) => (
                <span key={id}>{i ? ' · ' : ''}{id}{r.status === 'ok' && r.citation ? `: ${r.citation}` : ' (source pending)'}</span>
              ))}
            </span>
          )}
          <Link to="/sources" onClick={close} className="self-start text-[13px] text-info hover:underline">See all sources →</Link>
        </div>
      </div>
    </div>
  );
}
