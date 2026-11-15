import { useEffect, useRef, useState } from 'react';
import { audioOut } from '../../lib/sound';
import { fmt, mmss } from '../../lib/status';
import type { CprConfig, VitalsFrame } from '../../types/contracts';

interface Props {
  config: CprConfig | null;
  latest?: VitalsFrame;
  onLog(text: string): void;
  onBack(): void;
  /** "Pulse is back": log it and return to the steps. */
  onPulseBack(): void;
}

/** CPR rhythm guide: metronome (pulsing circle + Web Audio click), compression counter, switch-rescuer timer. */
export function CprGuide({ config, latest, onLog, onBack, onPulseBack }: Props) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'compress' | 'breaths'>('compress');
  const [count, setCount] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [beat, setBeat] = useState(0);
  const [switchLeft, setSwitchLeft] = useState(config?.switch_rescuer_s ?? 120);
  const audio = useRef<AudioContext | null>(null);
  const counter = useRef(0);
  // Metronome rate: starts at cpr.json rate_per_min; the stepper stays inside rate_range_per_min (100-120).
  const [rate, setRate] = useState(config?.rate_per_min ?? 110);
  useEffect(() => { if (config) setRate(config.rate_per_min); }, [config]);
  const [lo, hi] = config?.rate_range_per_min ?? [config?.rate_per_min ?? 110, config?.rate_per_min ?? 110];
  const step = (d: number) => setRate((r) => { const next = Math.max(lo, Math.min(hi, r + d)); if (next !== r) onLog(`Metronome set to ${next} per minute`); return next; });

  const click = () => {
    if (!audio.current) return;
    const { ctx, out } = audioOut();  // shared output: the global mute silences the metronome too
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  };

  useEffect(() => {
    if (!running || phase !== 'compress' || !config) return;
    const id = setInterval(() => {
      click();
      setBeat((b) => b + 1);
      counter.current += 1;
      setCount(counter.current);
      if (counter.current >= config.compressions) {
        counter.current = 0;
        setCycles((c) => c + 1);
        setPhase('breaths');
      }
    }, 60_000 / rate);
    return () => clearInterval(id);
  }, [running, phase, config, rate]);

  useEffect(() => {
    if (!running || phase !== 'breaths' || !config) return;
    const id = setTimeout(() => { setCount(0); setPhase('compress'); }, config.breaths_pause_s * 1000);
    return () => clearTimeout(id);
  }, [running, phase, config]);

  useEffect(() => {
    if (!running || !config) return;
    const id = setInterval(() => setSwitchLeft((s) => (s <= 1 ? config.switch_rescuer_s : s - 1)), 1000);
    return () => clearInterval(id);
  }, [running, config]);


  if (!config) return <section className="panel grid flex-1 place-items-center text-2xl text-muted">Loading CPR guide…</section>;

  const toggle = () => {
    if (!running) {
      audio.current = audioOut().ctx;  // started by this click, so the browser allows sound
      setSwitchLeft(config.switch_rescuer_s);
    }
    onLog(running ? `CPR stopped after ${cycles} cycles` : 'CPR started');
    setRunning(!running);
  };
  const switchNow = running && switchLeft > config.switch_rescuer_s - 6 && cycles > 0;

  return (
    <section aria-label="CPR guide" className="flex min-h-0 flex-1 flex-col gap-5">
      <span className="text-[13px] tracking-[0.12em] text-alert">CPR · CREW MEMBER NOT RESPONDING</span>
      <div className="flex flex-wrap items-center gap-10">
        <div key={beat} className={`flex h-[230px] w-[230px] flex-col items-center justify-center rounded-full border-[3px] border-alert bg-alert/15 ${running && phase === 'compress' ? 'animate-beat' : 'opacity-60'}`}>
          <span className="font-mono text-[64px] font-semibold leading-none">{phase === 'compress' ? count : '…'}</span>
          <span className="text-sm text-[#F3B7BD]">of {config.compressions} · then {config.breaths} breaths</span>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[30px] font-bold">{phase === 'compress' ? (running ? 'Push with the beat' : 'Press Start, then push with the beat') : `Give ${config.breaths} breaths`}</span>
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => step(-5)} disabled={rate <= lo} aria-label="Slower" className="h-11 w-11 rounded-control border border-[#5A2A30] text-xl hover:bg-white/5 disabled:opacity-40">−</button>
            <span className="font-mono text-[22px]">{rate}</span><span className="text-[#B8999C]">per minute ({lo}–{hi})</span>
            <button type="button" onClick={() => step(5)} disabled={rate >= hi} aria-label="Faster" className="h-11 w-11 rounded-control border border-[#5A2A30] text-xl hover:bg-white/5 disabled:opacity-40">+</button>
          </span>
          <span className={`text-base ${switchNow ? 'animate-zone font-bold text-watch' : ''}`}>
            {switchNow ? 'SWITCH RESCUER NOW' : <>Switch rescuer in <span className="font-mono text-watch">{mmss(switchLeft)}</span> (every {Math.round(config.switch_rescuer_s / 60)} min)</>}
          </span>
          <span className="text-sm text-[#B8999C]">Cycle {cycles + 1} · heart rate now <span className="font-mono text-[#F2EEEE]">{latest ? fmt(latest.hr, 0) : '--'}</span> bpm</span>
        </div>
      </div>
      <div className="max-w-[860px] rounded-card border border-dashed border-[#5A4A12] px-4 py-3 text-[15px] text-[#F5DE8A]">
        <b>Microgravity position (DRAFT, medical lead to confirm):</b>
        <ul className="mt-1 list-disc space-y-1 pl-5">{config.microgravity_tips.map((tip) => <li key={tip}>{tip.replace(/^DRAFT:\s*/, '')}</li>)}</ul>
      </div>
      <span className="flex-1" />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="h-14 rounded-[14px] border border-[#3A2226] px-6 text-[#B8999C] hover:bg-white/5" onClick={onBack}>‹ Back to steps</button>
        <button type="button" className={`h-14 rounded-[14px] px-8 text-lg font-extrabold ${running ? 'border border-[#F2EEEE]' : 'bg-alert text-white'}`} onClick={toggle}>
          {running ? 'Stop' : 'Start'}
        </button>
        <button type="button" className="h-14 rounded-[14px] bg-[#F2EEEE] px-6 font-extrabold text-[#0A0506]" onClick={() => { if (running) setRunning(false); onPulseBack(); }}>Pulse is back</button>
      </div>
    </section>
  );
}
