// v4 Inbox (drawer from the right, every page): the alerts (View / Acknowledge / Open emergency / Open log) and the
// message to the flight surgeon, auto-drafted from the current data by a rule-based template. Replaces the v1 bell
// dropdown and the messages drawer; their drafts and sent messages are kept below the composer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAssistStatus, polishText, useUsingMock } from '../../api/client';
import { tickedToday } from '../../hooks/useSelfCare';
import { useDemo, useDemoCommand } from '../../lib/demo';
import { ASTRONAUT_NAME, currentLocation, locationEntries } from '../../lib/locations';
import { STATUS_CLASS } from '../../lib/status';
import { buildSurgeonDraft } from '../../lib/surgeonDraft';
import { useAlerts } from '../../state/AlertsContext';
import { linkText, useApp } from '../../state/AppContext';
import { useHealth } from '../../state/HealthContext';
import { useShell } from '../../state/ShellContext';
import type { Alert, AlertSource, RegionId } from '../../types/contracts';
import { DeliveryStatus } from '../common/DeliveryStatus';
import { MessageCard } from '../dashboard/MessageCard';

const SOURCE_LABEL: Record<AlertSource, string> = { rules: 'Body check', vitals: 'Live vitals', emergency: 'Emergency', cv: 'Camera' };

function AlertRow({ alert, onView, onAck, onOpen }: { alert: Alert; onView(r: RegionId): void; onAck(id: string): void; onOpen(path: string): void }) {
  const { labels, regions } = useApp();
  const cls = STATUS_CLASS[alert.level];
  const title = regions.find((r) => r.id === alert.region)?.label ?? SOURCE_LABEL[alert.source];
  const handled = alert.source === 'emergency';
  return (
    <li className={`flex flex-col gap-1.5 rounded-control border border-l-[3px] p-3 ${handled ? 'border-line-strong border-l-muted' : `${cls.edge} ${cls.border}`} ${alert.acknowledged ? 'opacity-60' : ''}`}>
      <span className="flex items-baseline gap-2">
        <span className={`text-xs font-bold uppercase ${handled ? 'text-muted' : cls.text}`}>{handled ? 'Handled' : labels[alert.level]}</span>
        <span className="font-semibold">{title}</span>
        <span className="ml-auto font-mono text-[11px] text-muted" title="Mission time (GMT)">{alert.t.slice(11, 16)} GMT</span>
      </span>
      <span className="text-[13px] text-soft">{alert.message}</span>
      <span className="text-[11px] text-muted">{SOURCE_LABEL[alert.source]}{alert.message_draft_id ? ' · message drafted' : ''}</span>
      <span className="flex flex-wrap gap-2">
        {alert.region && <button type="button" className="btn h-9 min-h-0 px-3 text-xs" onClick={() => onView(alert.region!)}>View</button>}
        {alert.link && <button type="button" className="btn h-9 min-h-0 px-3 text-xs" onClick={() => onOpen(alert.link!)}>Open log</button>}
        {alert.acknowledged
          ? <span className="self-center text-[11px] text-muted">✓ Seen</span>
          : <button type="button" className="btn h-9 min-h-0 px-3 text-xs" onClick={() => onAck(alert.id)}>Acknowledge</button>}
        {alert.level === 'red' && !handled && (
          <button type="button" className="btn btn-danger h-9 min-h-0 bg-alert px-3 text-xs" onClick={() => onOpen('/emergency')}>Open emergency</button>
        )}
      </span>
    </li>
  );
}

export function InboxDrawer() {
  const { panel, close, openInbox, inboxFocus } = useShell();
  const app = useApp();
  const { persona, personaInfo, environments, env, regions, thresholds, labels, escalation, envKeys, setPicked } = app;
  const { shown, daily, latest, cabin, messages } = useHealth();
  const { alerts, ack } = useAlerts();
  const { active: demo } = useDemo();
  const usingMock = useUsingMock();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = panel === 'inbox';

  const location = currentLocation(locationEntries(environments), env)?.name ?? env;
  const template = useCallback(() => buildSurgeonDraft({
    name: ASTRONAUT_NAME, day: personaInfo?.mission_day, location, statuses: shown, regions, daily, thresholds, latest, cabin, labels,
    ticked: Object.fromEntries(shown.map((s) => [s.region, tickedToday(persona, s.region, s.status)]).filter(([, t]) => (t as string[]).length)),
  }), [personaInfo, location, shown, regions, daily, thresholds, latest, cabin, labels, persona]);

  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPolish, setCanPolish] = useState(false);

  // Fresh template every time the Inbox opens, unless the astronaut has edited it.
  useEffect(() => { if (open && !dirty) setText(template()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDirty(false); setSentId(null); }, [persona]);
  // "Polish wording" only when the backend has a key and internet; otherwise the button is simply not shown.
  useEffect(() => {
    if (!open || usingMock) { setCanPolish(false); return; }
    let live = true;
    getAssistStatus().then((s) => { if (live) setCanPolish(!!s?.available); });
    return () => { live = false; };
  }, [open, usingMock]);

  const target = messages.drafts.find((m) => m.id === inboxFocus) ?? null;
  const sent = messages.messages.find((m) => m.id === sentId) ?? null;
  const otherDrafts = messages.drafts.filter((m) => m.id !== target?.id);
  const history = messages.messages.filter((m) => m.status !== 'draft' && m.id !== sentId);
  const sortedAlerts = useMemo(() => [...alerts].sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || b.t.localeCompare(a.t)), [alerts]);

  const send = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    if (target) { await messages.send(target.id, text); setSentId(target.id); } else setSentId(await messages.compose(text));
    setBusy(false);
    setDirty(false);
  }, [text, target, messages]);

  const polish = async () => {
    setBusy(true);
    const better = await polishText(text);
    setBusy(false);
    if (better) { setText(better); setDirty(true); } else setCanPolish(false);
  };

  // Demo mode (moved here from the v1 dashboard): open the heart draft once its alert exists, send it, close.
  const [demoRegion, setDemoRegion] = useState<string | null>(null);
  useDemoCommand(['openDraft', 'sendDraft', 'closeDrawer'], (command) => {
    if (command.kind === 'openDraft') setDemoRegion(command.region);
    if (command.kind === 'closeDrawer') close();
    if (command.kind === 'sendDraft') void send();
  });
  useEffect(() => {
    if (!demoRegion) return;
    const alert = alerts.find((a) => a.region === demoRegion && !a.acknowledged && (a.level === 'orange' || a.level === 'red'));
    if (!alert) return;
    setDemoRegion(null);
    setDirty(false);
    setSentId(null);
    void messages.draftFor(alert).then((id) => { setText(template()); openInbox(id); });
  }, [demoRegion, alerts, messages, openInbox, template]);

  const view = (region: RegionId) => { setPicked(region); close(); if (pathname !== '/') navigate('/'); };
  const go = (path: string) => { close(); navigate(path); };

  return (
    <div className={`fixed inset-0 z-[45] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={close} />
      <aside role="dialog" aria-label="Inbox"
        className={`absolute bottom-0 right-0 top-0 flex w-[min(480px,100vw)] flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-5 transition-[transform,visibility] duration-300 ease-out ${
          open ? 'visible translate-x-0' : 'invisible translate-x-full'}`}>
        <div className="flex items-center">
          <h2 className="font-display text-xl font-bold">Inbox</h2>
          <span className="flex-1" />
          <button type="button" onClick={close} aria-label="Close Inbox" className="grid h-10 w-10 place-items-center rounded-control border border-line-strong hover:bg-raised">✕</button>
        </div>

        <section aria-label="Alerts" className="flex flex-col gap-2">
          <span className="text-[11px] tracking-[0.12em] text-muted">ALERTS · {alerts.filter((a) => !a.acknowledged).length} OPEN</span>
          {sortedAlerts.length === 0
            ? <p className="text-sm text-muted">Nothing needs attention right now.</p>
            : <ul className="flex flex-col gap-2">{sortedAlerts.map((a) => <AlertRow key={a.id} alert={a} onView={view} onAck={ack} onOpen={go} />)}</ul>}
        </section>

        <section aria-label="Message to flight surgeon" className="flex flex-col gap-2">
          <span className="flex items-baseline gap-2 text-[11px] tracking-[0.12em] text-muted">
            MESSAGE TO FLIGHT SURGEON
            <span className="ml-auto tracking-normal">{messages.drafts.length} {messages.drafts.length === 1 ? 'draft' : 'drafts'}</span>
          </span>
          <div className="flex flex-col gap-2 rounded-card border border-line-strong p-3">
            <span className="text-[11px] text-info">✦ Auto-drafted from your data · check and edit before sending</span>
            <label className="sr-only" htmlFor="surgeon-message">Message to the flight surgeon</label>
            <textarea id="surgeon-message" value={text} rows={10} onChange={(e) => { setText(e.target.value); setDirty(true); }}
              className="w-full resize-y rounded-lg border border-line bg-inset p-2.5 text-[13px] leading-relaxed text-text focus:border-info focus:outline-none" />
            <span className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary h-10 min-h-0" disabled={busy || !text.trim()} onClick={() => void send()}>
                {busy ? 'Working…' : 'Send to surgeon'}
              </button>
              <button type="button" className="btn h-10 min-h-0 text-xs" onClick={() => { setText(template()); setDirty(false); }} title="Build the message again from the current data">
                ↻ Rebuild from data
              </button>
              {canPolish && (
                <button type="button" className="btn btn-accent h-10 min-h-0 text-xs" disabled={busy} onClick={() => void polish()} title="Rewrites the wording with Claude (online only). Facts stay the same; check before sending.">
                  Polish wording
                </button>
              )}
              <span className="text-xs text-muted">Delivery: {linkText(escalation, envKeys).pill.replace(/^Flight surgeon link:\s*/i, '')}</span>
            </span>
            {target && <span className="text-[11px] text-muted">Sends as the draft for the {regions.find((r) => r.id === target.region)?.label ?? 'open'} alert.</span>}
            {sent && <DeliveryStatus message={sent} onSimulateReply={demo ? () => void messages.reply(sent.id) : undefined} />}
          </div>
        </section>

        {otherDrafts.length > 0 && (
          <details className="rounded-card border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Other drafts ({otherDrafts.length})</summary>
            <div className="mt-3 flex flex-col gap-3">
              {otherDrafts.map((m) => (
                <MessageCard key={m.id} message={m} focused={false} onEdit={(t) => messages.edit(m.id, t)} onSend={(t) => messages.send(m.id, t)}
                  onReply={demo ? () => messages.reply(m.id) : undefined} />
              ))}
            </div>
          </details>
        )}
        {history.length > 0 && (
          <details className="rounded-card border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Sent earlier ({history.length})</summary>
            <div className="mt-3 flex flex-col gap-3">
              {history.map((m) => (
                <MessageCard key={m.id} message={m} focused={false} onEdit={() => undefined} onSend={() => undefined}
                  onReply={demo ? () => messages.reply(m.id) : undefined} />
              ))}
            </div>
          </details>
        )}
      </aside>
    </div>
  );
}
