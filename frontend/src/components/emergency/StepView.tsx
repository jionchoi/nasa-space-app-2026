import { useEffect, useState } from 'react';
import { mmss } from '../../lib/status';
import type { ProtocolStep, ReferencesConfig } from '../../types/contracts';
import type { Answer } from './useEmergency';

interface Props {
  step: ProtocolStep;
  /** 0-based position, for the progress bar. */
  index: number;
  total: number;
  answer?: Answer;
  timerDone: boolean;
  canNext: boolean;
  canBack: boolean;
  nextLabel: string;
  finished: boolean;
  /** "Limited kit on the rover" notes for the equipment this step needs (empty with a full kit). */
  kitNotes?: string[];
  /** Scientific References, to link the step's cited sources (REF IDs). */
  references?: ReferencesConfig | null;
  onAnswer(value: Answer): void;
  /** Follow a link on the step (CL10 -> chest-pain protocol). */
  onLink?(to: string): void;
  /** CPR steps (CL07, CL13): reopen the CPR guide. */
  onOpenCpr?(): void;
  onTimerDone(): void;
  onNext(): void;
  onBack(): void;
}

function StepTimer({ seconds, done, onDone }: { seconds: number; done: boolean; onDone(): void }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (running && left === 0) {
      setRunning(false);
      onDone();
    }
  }, [left, running, onDone]);

  return (
    <div className="flex flex-wrap items-center gap-3 self-start rounded-card border border-[#5A2A30] px-4 py-2">
      <span aria-hidden>⏱</span>
      <span className={`font-mono text-3xl ${done ? 'text-ok' : ''}`} role="timer">{mmss(done ? 0 : left)}</span>
      <span className="text-sm text-[#D9A9AE]">{done ? 'Timer done' : running ? 'remaining' : 'timer'}</span>
      {!done && !running && <button type="button" className="btn h-11 border-[#5A2A30]" onClick={() => setRunning(true)}>Start</button>}
      {!done && <button type="button" className="btn h-11 border-[#5A2A30]" onClick={() => { setRunning(false); onDone(); }}>Done</button>}
    </div>
  );
}

/** One action per screen, readable from 2 metres (Emergency-v4). */
export function StepView(p: Props) {
  const { step } = p;
  return (
    <section aria-label={`Step ${step.n} of ${p.total}`} className={`flex min-h-0 flex-1 flex-col gap-5 ${step.red_flag ? 'rounded-panel border-2 border-alert/60 p-4' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] tracking-[0.12em] text-[#B8999C]">{step.id ? `${step.id} · ` : ''}STEP {step.n} OF {p.total}</span>
        <span className="flex gap-1.5" aria-hidden>
          {Array.from({ length: p.total }, (_, k) => (
            <span key={k} className={`h-1.5 w-[26px] rounded-sm ${k < p.index ? 'bg-[#FF8A95]' : k === p.index ? 'bg-[#F2EEEE]' : 'bg-[#3A2226]'}`} />
          ))}
        </span>
        {step.red_flag && <span className="rounded-full bg-alert px-3 py-0.5 text-sm font-bold text-white">This is a danger sign</span>}
      </div>

      {step.urgency && (
        <p className="self-start rounded-full border border-alert/60 bg-alert/10 px-3 py-1 text-sm font-semibold text-[#FFB3BB]">Urgency: {step.urgency}</p>
      )}
      {step.check && step.check === step.text
        ? <p className="max-w-[900px] font-display text-[40px] font-bold leading-[1.15]">{step.check}</p>
        : <>
          <p className="max-w-[900px] font-display text-[40px] font-bold leading-[1.15]">{step.text}</p>
          {step.check && <p className="max-w-[820px] text-[22px] text-[#F5DE8A]">{step.check}</p>}
        </>}
      {step.type === 'end' && <p className="text-lg text-[#F5DE8A]">End of this protocol path. The case is not closed automatically.</p>}
      {step.links?.map((l) => (
        <button key={l.to} type="button" onClick={() => p.onLink?.(l.to)} className="self-start rounded-2xl border-2 border-[#F2EEEE] px-5 py-3 text-lg font-bold hover:bg-white/10">{l.label}</button>
      ))}
      {p.onOpenCpr && <button type="button" onClick={p.onOpenCpr} className="self-start rounded-2xl bg-alert px-5 py-3 text-lg font-extrabold text-white">Open the CPR guide (metronome)</button>}
      {!!step.refs?.length && (
        <p className="text-sm text-[#B8999C]">
          Sources: {step.refs.map((id, i) => {
            const ref = p.references?.references.find((r) => r.id === id);
            const code = step.sources?.[i];
            const text = `${id}${code ? ` (${code})` : ''}`;
            return <span key={id + i}>{i ? ' · ' : ''}{ref?.url
              ? <a href={ref.url} target="_blank" rel="noreferrer" className="underline hover:text-white" title={ref.title}>{text}</a>
              : <span title={ref?.title}>{text}</span>}</span>;
          })}
        </p>
      )}

      {step.timer_s && <StepTimer key={step.n} seconds={step.timer_s} done={p.timerDone} onDone={p.onTimerDone} />}

      {p.kitNotes?.map((note) => (
        <p key={note} className="self-start rounded-card border border-[#5A4A12] bg-watch/10 px-4 py-2 text-sm text-[#F5DE8A]">Rover · limited kit: {note}</p>
      ))}

      {p.finished && (
        <p className="text-2xl font-semibold text-ok">All steps done. Stay with them and keep watching the vitals. End the emergency when it is over.</p>
      )}

      <span className="flex-1" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="h-[60px] rounded-[14px] border border-[#3A2226] px-6 text-[17px] text-[#B8999C] hover:bg-white/5 disabled:opacity-40" disabled={!p.canBack} onClick={p.onBack}>‹ Back</button>
        <span className="flex-1" />
        {step.check ? (
          <>
            {(['no', 'yes'] as const).map((v) => (
              <button key={v} type="button" onClick={() => p.onAnswer(v)} aria-pressed={p.answer === v}
                className={`h-[72px] min-w-[180px] rounded-2xl border-2 text-[22px] font-extrabold ${p.answer === v ? 'border-[#F2EEEE] bg-[#F2EEEE] text-[#0A0506]' : 'border-[#F2EEEE] hover:bg-white/10'}`}>
                {v === 'yes' ? 'Yes' : 'No'}
              </button>
            ))}
            {p.answer && (
              <button type="button" disabled={!p.canNext || p.finished} onClick={p.onNext}
                className={`h-[72px] min-w-[200px] rounded-2xl text-xl font-extrabold disabled:opacity-40 ${p.nextLabel === 'Start CPR' ? 'bg-alert text-white' : 'bg-[#F2EEEE] text-[#0A0506]'}`}>
                {p.nextLabel}
              </button>
            )}
          </>
        ) : (
          <button type="button" disabled={!p.canNext || p.finished} onClick={p.onNext}
            className={`h-[72px] min-w-[240px] rounded-2xl text-xl font-extrabold disabled:opacity-40 ${p.nextLabel === 'Start CPR' ? 'bg-alert text-white' : 'bg-[#F2EEEE] text-[#0A0506]'}`}>
            {p.nextLabel}
          </button>
        )}
      </div>
      {!p.canNext && !p.finished && <span className="text-right text-sm text-[#B8999C]">{step.check ? 'Answer Yes or No to continue' : 'Finish the timer to continue'}</span>}
    </section>
  );
}
