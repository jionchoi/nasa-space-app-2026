// v4 right column pieces: the small status line, the radiation block (Radiation selected), and What to do + Who to tell.
import { ArrowSquareOut } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelfCare } from '../../hooks/useSelfCare';
import { isDraft, undraft } from '../../lib/env';
import { fmt, mmss, raiseLevel, STATUS_CLASS, STATUS_ORDER, worse } from '../../lib/status';
import { useAlerts } from '../../state/AlertsContext';
import { adviceFor, useApp, useStatusLabel } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useRoutine } from '../../state/RoutineContext';
import { useShell } from '../../state/ShellContext';
import type { RegionId, Status } from '../../types/contracts';
import { DoseRateChart } from './DoseRateChart';
import { DraftTag } from './GuidanceCard';
import { FeedBadge } from './RadiationCard';

/** "At this pace: Warning in about 4 days" (backend forecast), "Act now" or nothing. */
function timeToAct(status: Status, days: number | null, live: Status | undefined, label: (s: Status) => string): string {
  if (status === 'red' || live === 'red') return `${label('red')}: follow the steps below now.`;
  if (days === 0) return `${label('orange')} reached: act today.`;
  if (days !== null && days > 0) {
    const next = STATUS_ORDER[Math.min(3, STATUS_ORDER.indexOf(status) + 1)];
    return `At this pace: ${label(next === 'green' ? 'yellow' : next)} in about ${days} ${days === 1 ? 'day' : 'days'}.`;
  }
  return '';
}

export function StatusLine() {
  const { regions } = useApp();
  const { shown, statuses, selected, liveRegions } = useHealth();
  const statusLabel = useStatusLabel();
  const s = shown.find((x) => x.region === selected);
  const daily = statuses.find((x) => x.region === selected);
  if (!s) return <div className="h-10 animate-pulse rounded-control bg-raised/40" />;
  const cls = STATUS_CLASS[s.status];
  const live = liveRegions[s.region];
  const liveWorse = live && live !== 'green' && daily && worse(live, daily.status) !== daily.status;
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2.5 rounded-control border px-3 py-2 ${cls.edge} ${cls.soft}`}>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-bg ${cls.bg}`}>{statusLabel(s.status)}</span>
      <span className="text-sm font-bold">{regions.find((r) => r.id === s.region)?.label}</span>
      <span className="min-w-[200px] flex-1 text-sm text-soft">{daily?.reason ?? s.reason}</span>
      {liveWorse && <span className={`pill ${STATUS_CLASS[live].soft} ${STATUS_CLASS[live].text}`}>Live vitals: {statusLabel(live)}</span>}
      <span className={`text-xs ${s.status === 'green' ? 'text-muted' : cls.text}`}>{timeToAct(s.status, s.time_to_act_days, live, statusLabel)}</span>
    </div>
  );
}

export function RadiationBlock() {
  const { radiation } = useHealth();
  const [now, setNow] = useState(Date.now());
  const event = radiation?.event;
  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event]);
  if (!radiation) return null;
  const feed = radiation.feed;
  const real = feed?.kind === 'real';
  const perDay = feed ? (real ? feed.today_mgy : feed.daily_mgy[feed.daily_mgy.length - 1]) : null;
  const share = radiation.limit_msv ? Math.min(1, radiation.mission_total_msv / radiation.limit_msv) : 0;
  const stats = [
    { k: real ? 'Now' : 'Average', v: feed ? fmt(feed.dose_rate_now, 1) : '–', u: feed?.unit ?? 'µGy/h' },
    { k: real ? 'Today so far' : 'Per day', v: perDay === null || perDay === undefined ? '–' : fmt(perDay, 2), u: 'mGy' },
    { k: 'Last 30 days', v: feed ? fmt(feed.total_30d_mgy, 1) : '–', u: 'mGy' },
    { k: 'Mission so far (simulated)', v: fmt(radiation.mission_total_msv), u: radiation.unit },
  ];
  return (
    <section id="radiation-feed" aria-label="Radiation details" className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-card border border-line px-3 py-2.5">
            <span className="block text-[11px] text-muted">{s.k}</span>
            <span className="font-mono text-xl">{s.v}</span> <span className="text-[11px] text-muted">{s.u}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span>Mission dose vs limit</span>
        <span className="h-1.5 flex-1 rounded-full bg-line-strong"><span className={`block h-full rounded-full ${STATUS_CLASS[radiation.status].bg}`} style={{ width: `${share * 100}%` }} /></span>
        <span className="font-mono">{fmt(radiation.mission_total_msv)} / {radiation.limit_msv ?? '–'} {radiation.unit}</span>
        {radiation.mission_dose_simulated !== false && <span className="rounded-full border border-line-strong px-1.5">Simulated</span>}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-[2_1_360px] rounded-card border border-line px-3 py-2.5">
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Last 24 h dose rate{real ? ' · spikes on the ISS = South Atlantic Anomaly passes' : ''}
            {feed && <FeedBadge feed={feed} />}{feed?.draft && <DraftTag />}
          </span>
          {real && feed && feed.last_24h.length > 1
            ? <DoseRateChart points={feed.last_24h} unit={feed.unit} />
            : <p className="py-4 text-xs text-muted">{feed ? 'Steady published estimate here: no 24 h readings. Real readings go up and down.' : 'No dose feed for this location.'}</p>}
          {feed?.note && <p className="text-[11px] text-muted">{feed.note}</p>}
        </div>
        <div className={`min-w-0 flex-[1_1_240px] rounded-card border px-3 py-2.5 text-[13px] ${event ? 'border-alert/50 bg-alert/10' : 'border-watch/30 bg-watch/5'}`} role={event ? 'alert' : undefined}>
          <span className={`block text-[11px] tracking-[0.1em] ${event ? 'text-alert' : 'text-watch'}`}>SOLAR EVENT WATCH (NASA DONKI)</span>
          {event ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-alert">{event.alert}</span>
              <span>{event.advice}</span>
              <span className="font-mono text-xs">{fmt(event.dose_rate_msv_h, 2)} mSv/h now · {fmt(event.event_dose_msv, 2)} mSv from this event · ends in {mmss(Math.max(0, (Date.parse(event.ends_at) - now) / 1000))}</span>
              {event.location_scale && event.location_scale !== 1 && <span className="text-xs text-muted">About {event.location_scale}× the ISS dose here. {event.location_reason}</span>}
              <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                Timing: real DONKI event {event.sep_id}
                <a href={event.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-info hover:underline">record <ArrowSquareOut className="h-3 w-3" aria-hidden /></a>
                <span className="rounded-full border border-watch/40 px-1.5 text-watch">{event.dose_note ?? 'dose simulated'}</span>
              </span>
            </div>
          ) : (
            <span className="text-soft">None active. A replay of the real 10 May 2024 storm can be started from /admin. If one starts: go to the shielded area; the Act now pop-up fires.</span>
          )}
        </div>
      </div>
    </section>
  );
}

/** Action buttons per area (they open what already exists: reaction test, log drawer, Inbox, daily check). */
function AreaButtons({ region, status }: { region: RegionId; status: Status }) {
  const navigate = useNavigate();
  const { openLog } = useRoutine();
  const { setPickedMetric } = useApp();
  const { openInbox } = useShell();
  const { alerts } = useAlerts();
  const { messages } = useHealth();
  const reviewMessage = async () => {
    const alert = alerts.find((a) => a.region === region && !a.acknowledged && (a.level === 'orange' || a.level === 'red'));
    openInbox(alert ? await messages.draftFor(alert) : null);
  };
  const list: { label: string; run(): void }[] = [];
  if (region === 'brain_mood') list.push({ label: 'Take reaction test', run: () => navigate('/reaction') }, { label: 'Log mood', run: () => openLog('mood') });
  if (region === 'immune') list.push({ label: 'Log a symptom', run: () => openLog('mood') });
  if (region === 'lungs') list.push({ label: 'See cabin details', run: () => setPickedMetric('co2_ppm') });
  if (region === 'metabolism') list.push({ label: 'Log meal and water', run: () => openLog('meal') }, { label: 'Weekly biomarkers', run: () => openLog('biomarkers') });
  if (region === 'bones_muscles') list.push({ label: 'Log exercise', run: () => openLog('exercise') });
  if (region === 'radiation') list.push({ label: 'See radiation feed', run: () => document.getElementById('radiation-feed')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) });
  if (region === 'heart' || status === 'orange' || status === 'red') list.push({ label: 'Review message to surgeon', run: () => void reviewMessage() });
  if (region === 'heart') list.push({ label: 'Measure again', run: () => navigate('/check') });
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((b, i) => <button key={b.label} type="button" onClick={b.run} className={`btn h-11 ${i === 0 ? 'btn-primary' : ''}`}>{b.label}</button>)}
    </div>
  );
}

export function WhatToDo() {
  const { persona, guidance, escalation, envKeys, envInfo } = useApp();
  const { shown, selected, liveRegions } = useHealth();
  const s = shown.find((x) => x.region === selected);
  const status: Status = s?.status ?? 'green';
  const { ticked, toggle } = useSelfCare(persona, selected ?? 'heart', status);
  if (!s || !selected) return null;
  const cls = STATUS_CLASS[status];
  const item = guidance?.regions[selected]?.[guidance.status_keys[status]];
  const steps = item?.self_care ?? [];
  const level = raiseLevel(s.advice_level, liveRegions[selected]);

  // Ladder: escalation.json levels, the location's extra steps (rover: Return to base), then Emergency mode.
  const extra = envInfo ? escalation?.extra_steps?.[envInfo.id] ?? [] : [];
  const rungs: { id: string; label: string; tag: string; advice?: string }[] = [];
  for (const l of escalation?.levels ?? []) {
    rungs.push({ id: l.id, label: l.label, tag: l.id === 'self' ? 'self-care' : l.id === 'crew' ? 'today' : l.id === 'surgeon_next' ? 'next contact' : 'now' });
    for (const x of extra.filter((e) => e.after === l.id)) rungs.push({ id: x.id, label: x.label, tag: envInfo?.label ?? '', advice: x.advice });
  }
  rungs.push({ id: 'emergency', label: 'Emergency mode', tag: 'red button' });
  const current = rungs.findIndex((r) => r.id === level);

  return (
    <div className="grid gap-6 border-t border-line pt-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-label="What to do" className="flex flex-col gap-2.5">
        <span className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-muted">
          WHAT TO DO {item && (isDraft(item.summary) || item.draft) && <DraftTag />}
          {steps.length > 0 && <span className="ml-auto font-normal tracking-normal">Today, {steps.filter((x) => ticked.includes(x)).length} of {steps.length} done</span>}
        </span>
        {item ? <span className="text-[17px] font-bold leading-snug">{undraft(item.summary)}</span> : <span className="text-sm text-muted">No guidance written for this area yet.</span>}
        <ul className="flex flex-col gap-1">
          {steps.map((step) => {
            const on = ticked.includes(step);
            return (
              <li key={step}>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(step)}
                  className="flex min-h-touch w-full items-start gap-3 rounded-control px-1 py-1.5 text-left text-[17px] hover:bg-raised/50">
                  <span className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-[1.5px] text-sm font-extrabold text-bg ${on ? 'border-ok bg-ok' : cls.border}`} aria-hidden>{on ? '✓' : ''}</span>
                  <span className={on ? 'text-muted line-through' : ''}>{undraft(step)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <AreaButtons region={selected} status={status} />
      </section>

      <section aria-label="Who to tell" className="flex flex-col gap-2">
        <span className="text-xs font-bold tracking-[0.12em] text-muted">WHO TO TELL</span>
        <ol className="flex flex-col gap-1">
          {rungs.map((r, i) => {
            const on = i === current || (r.id === 'emergency' && status === 'red');
            const past = i < current;
            return (
              <li key={r.id} aria-current={on ? 'step' : undefined}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm ${on ? `${cls.border} ${cls.soft}` : 'border-transparent'} ${on || past ? 'text-text' : 'text-muted'}`}>
                <span className={`font-mono ${on ? cls.text : past ? 'text-muted' : 'text-line-strong'}`}>{i + 1}</span>
                <span className={on ? 'font-semibold' : ''}>{r.label}</span>
                <span className={`ml-auto text-[11px] ${on ? cls.text : 'text-muted'}`}>{on ? '← you are here' : r.tag}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-soft">{adviceFor(escalation, level, envKeys)}</p>
        {rungs.filter((r, i) => r.advice && i < current).map((r) => <p key={r.id} className="text-sm text-soft"><span className="font-semibold text-text">{r.label}:</span> {undraft(r.advice)}</p>)}
        {item && (
          <dl className="flex flex-col gap-1 text-[13px]">
            <div><dt className="inline font-semibold">Crew: </dt><dd className="inline text-soft">{undraft(item.tell_crew)}</dd></div>
            <div><dt className="inline font-semibold">Flight surgeon: </dt><dd className="inline text-soft">{undraft(item.contact_surgeon)}</dd></div>
          </dl>
        )}
      </section>
    </div>
  );
}
