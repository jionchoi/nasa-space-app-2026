import { ArrowDown, ArrowUp, Lightning, Timer } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { undraft } from '../../lib/env';
import { mmss } from '../../lib/status';
import { betterThanPct, usePvtNorms } from '../../lib/pvtNorms';
import type { PvtConfig, PvtResult } from '../../types/contracts';

interface Props {
  config: PvtConfig;
  /** Personal baseline (median of the last 30 days), for the comparison. */
  baseline?: { median_ms: number | null; lapse_rate_pct: number | null; days?: number };
  onDone(result: PvtResult): void;
  doneLabel?: string;
  /** measurements.json why_check, one line under the title. */
  why?: string;
}

type Phase = 'choose' | 'running' | 'done';
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Reaction-time test (psychomotor vigilance style): a target appears after a random 2-10 s gap; press space or tap.
 *  Same rules as the CSA PRET reference group (pvt_norms.json): median = median of hits (false_start_ms to hit_max_ms),
 *  lapse = reaction >= lapse_ms (355) or no reaction, lapse rate = lapses / targets x 100, false start = press before
 *  the target or under false_start_ms. Timings from questionnaire.json. The 1-minute demo is never compared. */
export function ReactionTest({ config, baseline, onDone, doneLabel = 'Continue', why }: Props) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [version, setVersion] = useState<'full' | 'demo'>('full');
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [now, setNow] = useState(performance.now());
  const [tooEarly, setTooEarly] = useState(false);
  const [result, setResult] = useState<PvtResult | null>(null);
  const run = useRef({ start: 0, end: 0, rts: [] as number[], falseStarts: 0, timer: 0, target: null as number | null });

  const finish = useCallback(() => {
    const r = run.current;
    clearTimeout(r.timer);
    const rts = r.rts.length ? r.rts : [config.no_response_ms];
    const hits = rts.filter((x) => x < (config.hit_max_ms ?? config.no_response_ms));
    const lapses = rts.filter((x) => x >= config.lapse_ms).length;
    setResult({ median_ms: Math.round(median(hits.length ? hits : rts)), lapses, lapse_rate_pct: Math.round((1000 * lapses) / rts.length) / 10,
      false_starts: r.falseStarts, n: rts.length, duration_s: Math.round((r.end - r.start) / 1000), version, reaction_ms: rts.map(Math.round) });
    setShownAt(null);
    setPhase('done');
  }, [config, version]);

  const schedule = useCallback(() => {
    const r = run.current;
    const [lo, hi] = config.gap_s;
    const gap = (lo + Math.random() * (hi - lo)) * 1000;
    if (performance.now() + gap > r.end) { r.timer = window.setTimeout(finish, Math.max(0, r.end - performance.now())); return; }
    r.timer = window.setTimeout(() => {
      r.target = performance.now();
      setShownAt(r.target);
      r.timer = window.setTimeout(() => { r.rts.push(config.no_response_ms); r.target = null; setShownAt(null); schedule(); }, config.no_response_ms);
    }, gap);
  }, [config, finish]);

  const start = (v: 'full' | 'demo') => {
    const r = run.current;
    setVersion(v);
    r.rts = []; r.falseStarts = 0; r.target = null;
    r.start = performance.now();
    r.end = r.start + (v === 'demo' ? config.demo_duration_s : config.duration_s) * 1000;
    setPhase('running');
    schedule();
  };

  const press = useCallback(() => {
    const r = run.current;
    if (phase !== 'running') return;
    if (r.target === null) { r.falseStarts += 1; setTooEarly(true); setTimeout(() => setTooEarly(false), 600); return; }
    const rt = performance.now() - r.target;
    if (rt < (config.false_start_ms ?? 0)) { r.falseStarts += 1; return; }  // too fast to be a reaction to the target
    clearTimeout(r.timer);
    r.rts.push(rt);
    r.target = null;
    setShownAt(null);
    schedule();
  }, [phase, schedule, config]);

  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); press(); } };
    const tick = setInterval(() => setNow(performance.now()), 31);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearInterval(tick); };
  }, [phase, press]);
  useEffect(() => () => clearTimeout(run.current.timer), []);

  if (phase === 'choose') return (
    <>
      <h2 className="text-4xl font-semibold leading-tight">Reaction test</h2>
      {why && <p className="-mt-3 max-w-xl text-base text-muted">{undraft(why)}</p>}
      <p className="max-w-xl text-lg text-muted">A target appears at random moments. Press the <kbd className="rounded bg-raised px-1.5 font-mono text-text">space</kbd> bar or tap as fast as you can. Don't press before it appears.</p>
      <div className="flex gap-3">
        <button className="btn btn-primary px-8 py-3 text-lg" onClick={() => start('full')}><Timer className="h-5 w-5" aria-hidden /> Start ({mmss(config.duration_s)} min)</button>
        <button className="btn px-6 py-3" onClick={() => start('demo')}>1-minute demo version <span className="badge bg-watch/10 text-watch ring-watch/25">demo</span></button>
      </div>
    </>
  );

  if (phase === 'running') {
    const r = run.current;
    return (
      <>
        <p className="text-sm text-muted">{version === 'demo' ? 'Demo version · ' : ''}Time left {mmss((r.end - now) / 1000)} · press space or tap</p>
        <button onPointerDown={press} aria-label="Reaction target: press when it lights up"
          className={`grid h-72 w-72 select-none place-items-center rounded-full transition-colors duration-75 focus:outline-none ${
            shownAt ? 'bg-warn text-bg' : tooEarly ? 'bg-alert/30 text-alert' : 'bg-white/[0.04] text-muted ring-1 ring-white/10'}`}>
          {shownAt ? <span className="font-mono text-6xl font-bold">{Math.round(now - shownAt)}</span>
            : tooEarly ? <span className="text-2xl font-semibold">Too early</span> : <span className="text-lg">Wait…</span>}
        </button>
      </>
    );
  }

  const res = result!;
  const demo = res.version === 'demo';
  const rate = res.lapse_rate_pct ?? Math.round((1000 * res.lapses) / res.n) / 10;
  const compare = (value: number, base: number | null | undefined, unit: string) => {
    if (base == null) return <span className="text-muted">no baseline yet</span>;
    const d = Math.round(value - base);
    const Arrow = d > 0 ? ArrowUp : ArrowDown;
    return d === 0 ? <span className="text-muted">same as your usual</span>
      : <span className="inline-flex items-center gap-1 text-muted"><Arrow className="h-3 w-3" aria-hidden />{Math.abs(d)} {unit} {d > 0 ? 'above' : 'below'} your usual</span>;
  };
  return (
    <>
      <h2 className="flex items-center gap-2 text-3xl font-semibold"><Lightning className="h-7 w-7 text-warn" aria-hidden /> Reaction test done</h2>
      {demo && <span className="badge bg-watch/10 text-watch ring-watch/25">1-minute demo version: demo only, not compared</span>}
      <dl className="grid w-full max-w-2xl grid-cols-3 gap-3 text-center">
        <div className="panel p-4"><dt className="text-sm text-muted">Median reaction</dt><dd className="font-mono text-3xl font-semibold">{res.median_ms}<span className="text-sm text-muted"> ms</span></dd><dd className="text-xs">{demo ? <span className="text-muted">not compared</span> : compare(res.median_ms, baseline?.median_ms, 'ms')}</dd></div>
        <div className="panel p-4"><dt className="text-sm text-muted">Lapse rate ({config.lapse_ms} ms or slower)</dt><dd className="font-mono text-3xl font-semibold">{rate}<span className="text-sm text-muted"> %</span></dd><dd className="text-xs">{demo ? <span className="text-muted">{res.lapses} of {res.n}, not compared</span> : compare(rate, baseline?.lapse_rate_pct, 'points')}</dd></div>
        <div className="panel p-4"><dt className="text-sm text-muted">False starts</dt><dd className="font-mono text-3xl font-semibold">{res.false_starts}</dd><dd className="text-xs text-muted">{res.n} targets</dd></div>
      </dl>
      {!demo && <ReferenceComparison medianMs={res.median_ms} lapseRate={rate} />}
      <button className="btn btn-primary px-8 py-3 text-lg" onClick={() => onDone(res)}>{doneLabel}</button>
    </>
  );
}

/** "Your median reaction time: X ms - faster than Y% of the CSA reference group", and the same for the lapse rate. */
export function ReferenceComparison({ medianMs, lapseRate }: { medianMs: number; lapseRate: number }) {
  const norms = usePvtNorms();
  if (!norms) return null;
  return (
    <div className="w-full max-w-2xl space-y-1 text-base">
      <p>Your median reaction time: <span className="font-mono font-semibold">{medianMs} ms</span> - faster than{' '}
        <span className="font-semibold">{betterThanPct(medianMs, norms.distribution.median_rt_ms)}%</span> of the CSA reference group</p>
      <p>Your lapse rate: <span className="font-mono font-semibold">{lapseRate}%</span> - fewer lapses than{' '}
        <span className="font-semibold">{betterThanPct(lapseRate, norms.distribution.lapse_rate_pct)}%</span> of the CSA reference group</p>
      <p className="text-xs text-muted">Reference: {norms.n} people tested for the Canadian Space Agency (PRET, ground study, 10-minute test; lapse {'>='} {norms.lapse_ms} ms).</p>
    </div>
  );
}
