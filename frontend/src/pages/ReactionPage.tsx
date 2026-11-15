import { ArrowLeft, CheckCircle } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getQuestionnaire, postForm, useUsingMock } from '../api/client';
import { AppHeader } from '../components/common/AppHeader';
import { ReactionTest } from '../components/check/ReactionTest';
import { useDaily } from '../hooks/useStatus';
import { pvtBaseline } from '../lib/metrics';
import { useApp } from '../state/AppContext';
import type { PvtResult, Questionnaire } from '../types/contracts';

/** The reaction test on its own (opened from the brain and mood panel). The result feeds brain and mood today. */
export default function ReactionPage() {
  const { persona } = useApp();
  const usingMock = useUsingMock();
  const [config, setConfig] = useState<Questionnaire | null>(null);
  const [saved, setSaved] = useState<'idle' | 'ok' | 'failed'>('idle');
  const [round, setRound] = useState(0);
  const daily = useDaily(persona, saved);
  const baseline = useMemo(() => pvtBaseline(daily), [daily]);
  useEffect(() => { getQuestionnaire().then(setConfig); }, []);

  const save = async (result: PvtResult) => {
    const res = await postForm(persona, 'pvt', result as unknown as Record<string, unknown>);
    setSaved(res?.ok ? 'ok' : 'failed');
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
        {!config ? <p className="text-muted">Loading…</p> : saved === 'idle' ? (
          <ReactionTest key={round} config={config.pvt} baseline={baseline} onDone={save} doneLabel="Save result" />
        ) : (
          <>
            {saved === 'ok' ? (
              <p className="flex items-center gap-2 text-2xl font-semibold"><CheckCircle className="h-7 w-7 text-ok" weight="fill" aria-hidden /> Saved. It now counts for brain and mood today.</p>
            ) : (
              <p className="text-xl text-watch">{usingMock ? 'The backend is off, so the result was not saved.' : 'Could not save the result.'}</p>
            )}
            <div className="flex gap-3">
              <Link to="/" className="btn btn-primary gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard</Link>
              <button className="btn" onClick={() => { setSaved('idle'); setRound((r) => r + 1); }}>Take it again</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
