import { useState } from 'react';

interface Props {
  onPick(protocolId: string): void;
  onExit(): void;
}

const CHOICES = [
  { id: 'chest_pain', label: 'Chest pain or pressure' },
  { id: 'unresponsive', label: 'Crew member not responding' },
];
// Placeholder list: these protocols are not written yet.
const OTHER = ['Heavy bleeding', 'Choking', 'Burn', 'Seizure'];

export function EntryScreen({ onPick, onExit }: Props) {
  const [other, setOther] = useState(false);
  return (
    <div className="flex h-full min-h-[80vh] flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-7xl font-bold">What's happening?</h1>
      <div className="grid w-full max-w-5xl gap-5">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="rounded-2xl border-4 border-alert bg-alert/15 px-8 py-9 text-5xl font-bold text-text transition hover:bg-alert hover:text-bg focus:outline-none focus-visible:ring-4 focus-visible:ring-text"
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setOther((v) => !v)}
          aria-expanded={other}
          className="rounded-2xl border-4 border-line bg-panel px-8 py-7 text-4xl font-semibold transition hover:border-info"
        >
          Something else
        </button>
        {other && (
          <div className="panel p-5 text-2xl">
            <p className="mb-3 text-muted">PLACEHOLDER: these protocols are not written yet. Call your crew and the flight surgeon.</p>
            <ul className="grid grid-cols-2 gap-3">
              {OTHER.map((name) => <li key={name} className="rounded-lg border border-line px-4 py-3 text-muted">{name} (coming soon)</li>)}
            </ul>
          </div>
        )}
      </div>
      <button className="btn px-6 py-2 text-xl" onClick={onExit}>Back to dashboard</button>
    </div>
  );
}
