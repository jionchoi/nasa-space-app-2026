// v4 Learn pop-up for the selected area and metric (replaces the Learn tab and "Why this matters in space").
// Nov 15: the indicator text comes from the medical lead's Master Health Indicator Catalog (indicators.json); it wins
// over regions.json / measurements.json where they disagree. "What this does" (regions.json) and "How to stay healthy"
// (guidance.json) stay. Then where the numbers come from: the sheet rule, its REF IDs (references.json, linked), tags
// for proposed / DEMO ONLY / team-default values and the medical lead's QA note. Anything missing says TODO.
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useVitalsSource } from '../../api/client';
import { isDraft, undraft } from '../../lib/env';
import { normsLine, usePvtNorms } from '../../lib/pvtNorms';
import { entryOf, isTeamDefault } from '../../lib/status';
import { useApp } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';
import { CrewPanelTable } from '../common/CrewReference';
import { useAreaMetric } from './AreaDetail';
import { useIndicators, useReferences } from '../../hooks/useMedical';
import { useSignals } from '../../state/SignalContext';
import { DraftTag } from './GuidanceCard';
import { WithRefs } from './MetricInfo';

type Tag = 'REAL' | 'EST' | 'ON DEVICE' | 'SIMULATED' | 'PROPOSED' | 'DEMO ONLY' | 'TEAM DEFAULT';
const TAG_CLASS: Record<Tag, string> = {
  REAL: 'border-ok text-ok', EST: 'border-watch text-watch',
  'ON DEVICE': 'border-info text-info', SIMULATED: 'border-line-strong text-soft',
  PROPOSED: 'border-info text-info', 'DEMO ONLY': 'border-warn text-warn', 'TEAM DEFAULT': 'border-watch text-watch',
};
const TAG_TEXT: Partial<Record<Tag, string>> = {
  PROPOSED: 'Proposed · not clinically validated', 'TEAM DEFAULT': 'Team default',
};
const LEVEL_WORD = { yellow: 'Watch', orange: 'Warning', red: 'Act now' } as const;
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
  const catalog = useIndicators();
  const references = useReferences();
  const demo = useSignals().mode === 'demo';
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
  const teamDefault = isTeamDefault(entry?.source);
  const ind = catalog?.indicators[catalog.metric_index[metric] ?? ''];
  const refLink = (id: string) => {
    const ref = references?.references.find((r) => r.id === id);
    if (!ref) return <span key={id} title="TODO: not in Scientific_References.csv">{id} (missing)</span>;
    return ref.url
      ? <a key={id} href={ref.url} target="_blank" rel="noreferrer" title={ref.title} className="text-info hover:underline">{id}</a>
      : <span key={id} title={`${ref.title} (no link yet · needs verification)`}>{id} (no link yet · needs verification)</span>;
  };
  // Which bands are team defaults (not on the sheet), in plain words.
  const teamLevels = (Object.entries(entry?.band_sources ?? {}) as [keyof typeof LEVEL_WORD, string][])
    .filter(([, src]) => src.startsWith('team-default')).map(([lv]) => LEVEL_WORD[lv]);
  const teamBaseline = Object.entries(entry?.baseline_sources ?? {}).filter(([, src]) => src.startsWith('team-default')).map(([k]) => k);

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
  if (entry?.rule_id) {
    sources.push({ tag: 'PROPOSED', text: <>Limits for {entry.label ?? metric}: medical lead's threshold sheet, <b>{entry.rule_id}</b>{entry.ref_ids?.length ? <> · {entry.ref_ids.map((id, i) => <span key={id}>{i ? ', ' : ''}{refLink(id)}</span>)}</> : null}. {entry.evidence_status} · {entry.validation_status}.</> });
    if (entry.demo_only) sources.push({ tag: 'DEMO ONLY', text: <>The sheet marks these limits as for the demo only.</> });
    if (teamLevels.length || teamBaseline.length || entry.gap_note) {
      sources.push({ tag: 'TEAM DEFAULT', text: <>{teamLevels.length ? <>Not on the sheet: the {teamLevels.join(' and ')} level{teamLevels.length > 1 ? 's' : ''}{teamBaseline.length ? ` and the baseline ${teamBaseline.join('/')} limit` : ''}. </> : teamBaseline.length ? <>Not on the sheet: the baseline {teamBaseline.join('/')} limit. </> : null}{entry.gap_note ?? ''}</> });
    }
  } else {
    sources.push({ tag: teamDefault ? 'TEAM DEFAULT' : 'REAL', text: <>Limits for {entry?.label ?? metric}: {teamDefault ? "Team default (not on the medical lead's sheet)" : entry?.source}.</> });
  }
  if (row?.kind === 'daily') sources.push({ tag: 'ON DEVICE', text: <>"Your usual": the median of your first 14 days (pre-flight baseline, frozen).</> });
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
        {ind ? (
          <>
            <Row k="Data source">
              <span className="rounded-full border border-info px-2 py-0.5 text-xs text-info">{ind.data_source}</span>
              {demo && <span className="ml-1.5 rounded-full border border-line-strong px-2 py-0.5 text-xs text-soft">Simulation (Demo mode)</span>}
              <span className="ml-2 text-[13px] text-soft">{catalog?.data_source_types[ind.data_source]}</span>
            </Row>
            <Row k="How to measure">
              <ol className="list-decimal space-y-1 pl-5">{ind.how_to_measure.map((s) => <li key={s}>{s}</li>)}</ol>
              {info?.how_to_measure.length ? <p className="mt-1.5 text-[13px] text-soft">In this app: {info.how_to_measure.map(undraft).join(' ')}</p> : null}
            </Row>
            <Row k="What it measures">{ind.what}</Row>
            <Row k="Why it matters in space">{ind.why_space}</Row>
            <Row k="How spaceflight affects it">{ind.space_effect}</Row>
            <Row k="Normal range">{ind.normal_range}</Row>
            <Row k="Limitations">{ind.limitations}{metric === 'mood' ? ' The 1-10 mood score is not a validated mood test.' : ''}</Row>
            <Row k="Citation">{ind.citation}{ind.url && <> · <a href={ind.url} target="_blank" rel="noreferrer" className="break-all text-info hover:underline">{ind.url}</a></>}</Row>
          </>
        ) : (
          <>
            <Row k="Why we check it" draft={isDraft(info?.why_check)}>{info ? undraft(info.why_check) : TODO}</Row>
            <Row k="How it is measured" draft={info?.how_to_measure.some(isDraft)}>
              {info?.how_to_measure.length ? <ol className="list-decimal space-y-1 pl-5">{info.how_to_measure.map((s) => <li key={s}>{undraft(s)}</li>)}</ol> : TODO}
            </Row>
            <Row k="Why this happens in space"><WithRefs text={spaceNote || TODO} refs={meta.refs} /></Row>
          </>
        )}
        <Row k="Can it be done on board?" draft={isDraft(space?.note)}>
          {space ? <><span className="font-semibold">{space.possible ? 'Yes.' : 'No.'}</span> {undraft(space.note)}</> : TODO}
        </Row>
        <Row k="How to stay healthy" draft={!!item?.draft}>
          {item?.prevention.length ? <ul className="list-disc space-y-0.5 pl-5">{item.prevention.map((p) => <li key={p}>{undraft(p)}</li>)}</ul> : TODO}
        </Row>
        {meta.id === 'metabolism' && <div className="border-t border-line pt-3"><CrewPanelTable /></div>}

        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[13px] font-bold text-muted">Where these numbers come from</span>
          {sources.map((s, i) => (
            <span key={i} className="flex items-start gap-2 text-[13px] text-soft">
              <span className={`mt-0.5 shrink-0 rounded-full border px-1.5 text-[10px] ${TAG_CLASS[s.tag]}`}>{TAG_TEXT[s.tag] ?? s.tag}</span><span>{s.text}</span>
            </span>
          ))}
          {entry?.qa_note && (
            <span className="text-[12px] text-soft"><b>Medical lead's note:</b> {entry.qa?.finding ?? entry.qa_note}{entry.qa?.recommendation ? ` ${entry.qa.recommendation}` : ''}</span>
          )}
          {refs.length > 0 && !ind && (
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
