import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { AppHeader } from '../common/AppHeader';

interface Props {
  steps: string[];
  current: number;
  onCancel(): void;
  children: ReactNode;
}

/** Full-screen frame for the daily check: the shared header with a step-progress row, and cancel. */
export function CheckShell({ steps, current, onCancel, children }: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader noVitals>
        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2.5">
          <div className="shrink-0 leading-tight">
            <h1 className="text-sm font-semibold">Daily check</h1>
            <p className="text-xs text-muted">Step {current + 1} of {steps.length} · {steps[current]}</p>
          </div>
          <ol className="flex flex-1 items-center gap-1.5" role="progressbar" aria-valuemin={1}
            aria-valuemax={steps.length} aria-valuenow={current + 1}>
            {steps.map((name, i) => (
              <li key={name} className="flex flex-1 flex-col gap-1">
                <span className={`h-1 rounded-full transition-colors duration-500 ${i <= current ? 'bg-info' : 'bg-white/10'}`} />
                <span className={`text-[11px] ${i === current ? 'text-text' : 'text-muted'}`}>{name}</span>
              </li>
            ))}
          </ol>
          <button className="btn h-8 gap-1.5 px-3" onClick={() => window.confirm('Cancel the daily check? Nothing will be saved.') && onCancel()}>
            <X className="h-4 w-4" aria-hidden /> Cancel
          </button>
        </div>
      </AppHeader>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
        {children}
      </main>
    </div>
  );
}

export function SkipButton({ onSkip }: { onSkip(): void }) {
  return (
    <button className="btn bg-transparent text-muted hover:text-text" onClick={onSkip}>
      Skip measurement <span className="badge bg-watch/10 text-watch ring-watch/25">demo shortcut</span>
    </button>
  );
}
