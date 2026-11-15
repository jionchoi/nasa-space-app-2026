import { Toolbox } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { mmss } from '../../lib/status';
import type { ProtocolStep } from '../../types/contracts';
import type { Answer } from './useEmergency';

interface Props {
  step: ProtocolStep;
  total: number;
  answer?: Answer;
  timerDone: boolean;
  canNext: boolean;
  canBack: boolean;
  nextLabel: string;
  finished: boolean;
  /** "Limited kit on the rover" notes for the equipment this step needs (empty with a full kit). */
  kitNotes?: string[];
  onAnswer(value: Answer): void;
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
    <div className="flex items-center gap-6">
      <span className={`font-mono text-8xl font-bold ${done ? 'text-ok' : ''}`} role="timer">{mmss(done ? 0 : left)}</span>
      {!done && !running && <button className="btn px-8 py-4 text-3xl" onClick={() => setRunning(true)}>Start</button>}
      {!done && <button className="btn px-8 py-4 text-3xl" onClick={() => { setRunning(false); onDone(); }}>Done</button>}
      {done && <span className="text-3xl font-semibold text-ok">Timer done</span>}
    </div>
  );
}

/** One action per screen, readable from 2 metres. */
export function StepView(p: Props) {
  const { step } = p;
  const big = 'rounded-2xl border-4 px-14 py-6 text-5xl font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-text';
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col gap-5 rounded-xl border-4 p-6 ${
        step.red_flag ? 'border-alert bg-alert/5' : 'border-line bg-panel'
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl font-bold text-info">Step {step.n} of {p.total}</span>
        {step.red_flag && (
          <span className="rounded-lg bg-alert px-4 py-1 text-2xl font-bold text-bg">This is a danger sign</span>
        )}
      </div>

      <p className="text-5xl font-semibold leading-tight">{step.text}</p>

      {p.kitNotes?.map((note) => (
        <p key={note} className="flex items-start gap-3 rounded-xl border-2 border-watch bg-watch/10 px-5 py-3 text-2xl font-medium text-watch">
          <Toolbox className="mt-1 h-7 w-7 shrink-0" weight="fill" aria-hidden /> {note}
        </p>
      ))}

      {step.timer_s && <StepTimer key={step.n} seconds={step.timer_s} done={p.timerDone} onDone={p.onTimerDone} />}

      {step.check && (
        <div>
          <p className="mb-3 text-4xl font-semibold text-watch">{step.check}</p>
          <div className="flex gap-5">
            <button
              onClick={() => p.onAnswer('yes')}
              aria-pressed={p.answer === 'yes'}
              className={`${big} ${p.answer === 'yes' ? 'border-text bg-text text-bg' : 'border-line bg-raised hover:border-text'}`}
            >
              YES
            </button>
            <button
              onClick={() => p.onAnswer('no')}
              aria-pressed={p.answer === 'no'}
              className={`${big} ${p.answer === 'no' ? 'border-text bg-text text-bg' : 'border-line bg-raised hover:border-text'}`}
            >
              NO
            </button>
          </div>
        </div>
      )}

      {p.finished && (
        <p className="text-3xl font-semibold text-ok">
          All steps done. Stay with them and keep watching the vitals. End the emergency when it is over.
        </p>
      )}

      <div className="mt-auto flex items-center justify-between">
        <button className="btn px-8 py-3 text-2xl" disabled={!p.canBack} onClick={p.onBack}>Back</button>
        {!p.canNext && (
          <span className="text-xl text-muted">{step.check ? 'Answer YES or NO to continue' : 'Finish the timer to continue'}</span>
        )}
        <button
          className={`btn px-12 py-4 text-3xl font-bold ${p.nextLabel === 'Next' ? 'btn-primary' : 'btn-danger'}`}
          disabled={!p.canNext || p.finished}
          onClick={p.onNext}
        >
          {p.nextLabel}
        </button>
      </div>
    </section>
  );
}
