import { ArrowSquareOut } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { getSources } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { Card } from '../components/common/Card';
import { DraftTag } from '../components/dashboard/GuidanceCard';
import { useReferences } from '../hooks/useMedical';
import type { DataSource, SourcesConfig } from '../types/contracts';

const STATUS_BADGE: Record<DataSource['status'], { text: string; cls: string }> = {
  real: { text: 'Real', cls: 'bg-info/10 text-info ring-info/25' },
  estimated: { text: 'Estimated', cls: 'bg-watch/10 text-watch ring-watch/25' },
  simulated: { text: 'Simulated', cls: 'bg-white/[0.05] text-muted ring-white/10' },
};
const USE_LABEL: Record<string, string> = { replay: 'Replay', test: 'Test', thresholds: 'Thresholds', reference: 'Reference' };
const TO_FILL = 'TO FILL IN';

/** A value a team member still has to add is shown in amber, never as if it were a result. */
function Pending({ text }: { text: string }) {
  return text.includes(TO_FILL)
    ? <span className="rounded-full border border-watch/40 px-2 py-0.5 text-xs text-watch">{text}</span>
    : <>{text}</>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-soft [text-wrap:pretty]">{children}</dd>
    </div>
  );
}

/** /sources: every data source with its agency, what we use it for, the app locations it applies to and whether it is
 *  real, simulated or estimated (backend/data/sources.json; the README Data table is generated from the same file). */
export default function Sources() {
  const [data, setData] = useState<SourcesConfig | null>(null);
  useEffect(() => { getSources().then(setData); }, []);
  const uses = data?.uses ?? {};
  const references = useReferences();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
        <div>
          <p role="note" className="mb-3 rounded-lg border border-watch/40 bg-watch/10 px-3 py-2 text-sm font-semibold text-watch">Research prototype · not clinically validated</p>
          <h1 className="text-2xl font-semibold tracking-tight">Data sources</h1>
          <p className="mt-1 text-sm text-muted">Where the numbers on screen come from. Real files are stored in the app, so everything works without a connection.</p>
          {Object.keys(uses).length > 0 && (
            <p className="mt-2 text-xs text-muted">{Object.entries(uses).map(([k, v]) => `${USE_LABEL[k] ?? k}: ${v}`).join(' · ')}</p>
          )}
        </div>
        {(data?.sources ?? []).map((s) => {
          const badge = STATUS_BADGE[s.status];
          return (
            <Card key={s.id} label={s.name ?? s.title} inner="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{s.name ?? s.title}</h2>
                <span className={`badge ${badge.cls}`}>{badge.text}</span>
                {(s.use ?? []).map((u) => <span key={u} className="badge bg-white/[0.05] text-soft ring-white/10">{USE_LABEL[u] ?? u}</span>)}
                {s.draft && <DraftTag />}
              </div>
              <dl className="flex flex-col gap-2">
                <Row label="Agency">{s.agency ?? s.provider}</Row>
                <Row label="What">{s.what}</Row>
                <Row label="Used for">{s.used_for.join('; ')}{s.used_for_review && <> <span className="rounded-full border border-watch/40 px-2 py-0.5 text-xs text-watch">{s.used_for_review}</span></>}</Row>
                <Row label="App locations">{s.locations.join(', ')}</Row>
                <Row label="Real or not">{badge.text}{s.status_note ? `: ${s.status_note}` : ''}</Row>
                {s.validation && <Row label={s.validation.label}><Pending text={s.validation.value} /></Row>}
                {s.location_note && <Row label="Why everywhere">{s.location_note}</Row>}
                {s.units && <Row label="Units">{s.units}{s.unit_source ? <span className="text-muted"> ({s.unit_source})</span> : null}</Row>}
                {s.licence && <Row label="Licence">{s.licence}</Row>}
                {s.owner && <Row label="Owner">{s.owner}</Row>}
                {s.file && <Row label="File"><code className="font-mono text-xs">{s.file}</code>{s.converter && <span className="text-muted"> from <code className="font-mono text-xs">{s.converter}</code></span>}</Row>}
                {s.url_note && <Row label="Link"><Pending text={s.url_note} /></Row>}
                <Row label="On screen">"{s.badge}"</Row>
              </dl>
              {s.urls.length > 0 && (
                <div className="flex flex-col gap-1">
                  {s.urls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-info hover:underline">
                      {url.length > 90 ? `${url.slice(0, 90)}…` : url} <ArrowSquareOut className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        <section aria-labelledby="refs-title" className="mt-4 flex flex-col gap-3">
          <div>
            <h2 id="refs-title" className="text-xl font-semibold tracking-tight">Medical references</h2>
            <p className="mt-1 text-sm text-muted">The medical lead's Scientific References (REF-01 to REF-{String(references?.references.length ?? 0).padStart(2, '0')}), cited by the threshold rules and the emergency protocols. The rules are proposed and not clinically validated.</p>
          </div>
          {(references?.references ?? []).map((r) => (
            <Card key={r.id} label={r.id} inner="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-info">{r.id}</span>
                <span className="text-sm font-semibold">{r.title}</span>
              </div>
              <dl className="flex flex-col gap-1.5">
                <Row label="Who, when">{r.authors}, {r.year} · {r.type}</Row>
                <Row label="Used for">Indicators {r.indicators.join(', ')}</Row>
                <Row label="Reported values">{r.values}</Row>
                <Row label="Checked">{r.verification}</Row>
              </dl>
              {r.url
                ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-info hover:underline">{r.url} <ArrowSquareOut className="h-3 w-3 shrink-0" aria-hidden /></a>
                : <span className="self-start rounded-full border border-watch/40 px-2 py-0.5 text-xs text-watch">No link yet: {r.url_note}</span>}
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
