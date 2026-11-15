import { Minus, Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { undraft } from '../../lib/env';
import type { Question } from '../../types/contracts';

interface Props {
  questions: Question[];
  answers: Record<string, number>;
  onAnswer(id: string, value: number): void;
  onDone(): void;
  /** measurements.json why_check per daily field, shown under questions that have a `field`. */
  whyFor?(field: string): string | undefined;
}

/** One question per screen, big buttons, keys 1-5 (Enter confirms a number). */
export function QuestionsStep({ questions, answers, onAnswer, onDone, whyFor }: Props) {
  const [index, setIndex] = useState(0);
  const q = questions[index];
  const [number, setNumber] = useState(q.default ?? 0);

  const advance = () => (index + 1 < questions.length ? setIndex(index + 1) : onDone());
  const next = (value: number) => {
    onAnswer(q.id, value);
    advance();
  };
  const step = (delta: number) =>
    setNumber((n) => Math.min(q.max ?? 24, Math.max(q.min ?? 0, n + delta * (q.step ?? 1))));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (q.type === 'scale' && /^[1-5]$/.test(e.key) && Number(e.key) <= (q.labels?.length ?? 5)) next(Number(e.key));
      if (q.type === 'number') {
        if (e.key === 'Enter') next(number);
        if (e.key === 'ArrowUp' || e.key === '+') step(1);
        if (e.key === 'ArrowDown' || e.key === '-') step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <p className="label">Question {index + 1} of {questions.length}{q.optional ? ' · optional' : ''}</p>
      <h2 className="text-4xl font-semibold leading-tight">{q.text}</h2>
      {q.field && whyFor?.(q.field) && <p className="-mt-3 max-w-2xl text-base text-muted">{undraft(whyFor(q.field))}</p>}

      {q.type === 'scale' ? (
        <div className="grid w-full grid-cols-5 gap-3">
          {(q.labels ?? []).map((label, i) => (
            <button
              key={label}
              onClick={() => next(i + 1)}
              className={`panel flex flex-col items-center gap-2 px-2 py-6 transition hover:border-info hover:bg-raised ${
                answers[q.id] === i + 1 ? 'border-info bg-raised' : ''
              }`}
            >
              <span className="font-mono text-5xl font-semibold">{i + 1}</span>
              <span className="text-lg">{label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <button className="btn h-20 w-20" onClick={() => step(-1)} aria-label="Less"><Minus className="h-8 w-8" aria-hidden /></button>
          <div className="min-w-[220px]">
            <span className="font-mono text-8xl font-semibold">{number}</span>
            <span className="ml-2 text-2xl text-muted">{q.unit}</span>
          </div>
          <button className="btn h-20 w-20" onClick={() => step(1)} aria-label="More"><Plus className="h-8 w-8" aria-hidden /></button>
          <button className="btn btn-primary ml-4 px-8 py-4 text-xl" onClick={() => next(number)}>Next</button>
        </div>
      )}

      <p className="text-sm text-muted">
        {q.type === 'scale' ? 'Press a key from 1 to 5, or tap a button.' : 'Use the plus and minus buttons, then press Enter or Next.'}
      </p>
      <div className="flex gap-2">
        <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        {q.optional && <button className="btn bg-transparent text-muted hover:text-text" onClick={advance}>Skip this question</button>}
      </div>
    </>
  );
}
