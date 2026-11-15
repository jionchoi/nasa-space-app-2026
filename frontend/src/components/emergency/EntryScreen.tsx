import { useState } from 'react';

interface Props {
  onPick(protocolId: string): void;
  onExit(): void;
}

const CHOICES = [
  { id: 'chest_pain', label: 'Chest pain', sub: 'Pain or pressure in the chest', note: '' },
  { id: 'unresponsive', label: 'Not responding', sub: 'Not waking, not answering', note: 'Also opened by the camera or a lost pulse. You answer every step yourself.' },
];
// Not in this prototype: no protocol for these.
const OTHER = ['Heavy bleeding', 'Choking', 'Burn', 'Seizure'];

/** Emergency protocol picker (Emergency-v4): three big cards. "Something else" lists what is not covered. */
export function EntryScreen({ onPick, onExit }: Props) {
  const [other, setOther] = useState(false);
  return (
    <div className="flex flex-col gap-5 px-5 py-7 text-[#F2EEEE] sm:px-9">
      <span className="text-[13px] tracking-[0.12em] text-[#B8999C]">WHAT IS HAPPENING?</span>
      <div className="grid gap-4 md:grid-cols-3">
        {CHOICES.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c.id)}
            className="flex min-h-[200px] flex-col items-start gap-1.5 rounded-[18px] border border-[#5A2A30] bg-[#1A0A0D] px-6 py-7 text-left transition hover:border-alert hover:bg-alert/15">
            <span className="font-display text-[26px] font-bold">{c.label}</span>
            <span className="text-sm text-[#D9A9AE]">{c.sub}</span>
            {c.note && <span className="text-[11px] text-[#8A6E71]">{c.note}</span>}
          </button>
        ))}
        <button type="button" onClick={() => setOther((v) => !v)} aria-expanded={other}
          className="flex min-h-[200px] flex-col items-start gap-1.5 rounded-[18px] border border-dashed border-[#3A2226] px-6 py-7 text-left transition hover:border-[#5A2A30]">
          <span className="font-display text-[26px] font-bold">Something else</span>
          <span className="text-sm text-[#D9A9AE]">Bleeding, choking, burn, seizure…</span>
          <span className="text-[11px] text-[#8A6E71]">Not in this prototype</span>
        </button>
      </div>
      {other && (
        <div className="rounded-card border border-[#3A2226] p-4">
          <p className="mb-3 text-[#D9A9AE]">Not in this prototype: call your crew and the flight surgeon.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {OTHER.map((name) => <li key={name} className="rounded-lg border border-[#3A2226] px-4 py-3 text-[#B8999C]">{name}</li>)}
          </ul>
        </div>
      )}
      <button type="button" className="h-11 self-start rounded-full border border-[#3A2226] px-5 text-[#B8999C] hover:bg-white/5" onClick={onExit}>‹ Back to dashboard</button>
    </div>
  );
}
