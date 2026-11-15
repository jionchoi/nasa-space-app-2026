import { useEffect, useRef, useState } from 'react';
import { fmt, mmss } from '../../lib/status';
import type { CprConfig, VitalsFrame } from '../../types/contracts';

interface Props {
  config: CprConfig | null;
  latest?: VitalsFrame;
  onLog(text: string): void;
  onBack(): void;
}

/** CPR rhythm guide: metronome (pulsing circle + Web Audio click), compression counter, switch-rescuer timer. */
export function CprGuide({ config, latest, onLog, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'compress' | 'breaths'>('compress');
  const [count, setCount] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [beat, setBeat] = useState(0);
  const [switchLeft, setSwitchLeft] = useState(config?.switch_rescuer_s ?? 120);
  const audio = useRef<AudioContext | null>(null);
  const counter = useRef(0);

  const click = () => {
    const ctx = audio.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain).connect(ctx.destination);
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
    }, 60_000 / config.rate_per_min);
    return () => clearInterval(id);
  }, [running, phase, config]);

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

  useEffect(() => () => { void audio.current?.close(); }, []);

  if (!config) return <section className="panel grid flex-1 place-items-center text-2xl text-muted">Loading CPR guide…</section>;

  const toggle = () => {
    if (!running) {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      setSwitchLeft(config.switch_rescuer_s);
    }
    onLog(running ? `CPR stopped after ${cycles} cycles` : 'CPR started');
    setRunning(!running);
  };
  const switchNow = running && switchLeft > config.switch_rescuer_s - 6 && cycles > 0;

  return (
    <section className="flex min-h-0 flex-1 gap-5 rounded-xl border-4 border-alert bg-alert/5 p-5">
      <div className="flex flex-1 flex-col items-center justify-between gap-3">
        <h2 className="text-5xl font-bold">CPR: push hard and fast</h2>
        <div className="flex items-center gap-10">
          <div className="grid h-56 w-56 place-items-center">
            <div key={beat} className={`grid h-48 w-48 place-items-center rounded-full bg-alert text-bg ${running && phase === 'compress' ? 'animate-beat' : 'opacity-50'}`}>
              <span className="font-mono text-7xl font-bold">{phase === 'compress' ? count : '…'}</span>
            </div>
          </div>
          <div className="text-left">
            <p className="text-5xl font-bold">{phase === 'compress' ? 'PUSH' : `GIVE ${config.breaths} BREATHS`}</p>
            <p className="mt-1 text-2xl text-muted">{config.compressions} compressions, then {config.breaths} breaths</p>
            <p className="text-2xl text-muted">{config.rate_per_min} pushes per minute · cycle {cycles + 1}</p>
            <p className={`mt-2 font-mono text-3xl font-semibold ${switchNow ? 'animate-zone text-watch' : ''}`}>
              {switchNow ? 'SWITCH RESCUER NOW' : `Switch rescuer in ${mmss(switchLeft)}`}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between">
          <button className="btn px-8 py-3 text-2xl" onClick={onBack}>Back to steps</button>
          <button className={`btn px-14 py-4 text-4xl font-bold ${running ? '' : 'btn-danger'}`} onClick={toggle}>
            {running ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-3">
        <div className="panel px-4 py-3">
          <div className="label">Heart rate, live</div>
          <span className="font-mono text-6xl font-bold">{latest ? fmt(latest.hr, 0) : '--'}</span>
          <span className="ml-2 text-xl text-muted">bpm</span>
        </div>
        <div className="panel min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="label mb-1">In weightlessness</div>
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-snug">
            {config.microgravity_tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
      </aside>
    </section>
  );
}
