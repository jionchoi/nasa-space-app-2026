// The pitch script (about 3 minutes). Each step puts the app in a known state (crew member, location, replay
// position, screen), so nothing is fumbled live. Steps only use what the app already does; they work with the
// backend off too (public build): offline mocks, the offline DONKI replay and local drafts.
import type { NavigateFunction } from 'react-router-dom';
import { replayRadiation } from '../../api/client';
import { clearCrewAlarm } from '../../lib/crewAlarm';
import { sendDemoCommand } from '../../lib/demo';
import { scenarioLabel } from '../../lib/locations';
import type { Persona, RegionId } from '../../types/contracts';

export interface DemoContext {
  setPersona(id: string): void;
  setEnv(id: string): void;
  setPlanet(planet: string): void;
  setPicked(id: RegionId | null): void;
  jumpTo(seconds: number): void;
  navigate: NavigateFunction;
  pathname: string;
  /** Current query string, e.g. "?demo=summary" ("" for none). */
  search: string;
  cv: { start(): Promise<void>; stop(): void; demoTrigger(): void };
  /** Run later (cancelled when the step changes). */
  later(fn: () => void, ms: number): void;
}

export interface DemoStep {
  /** Number shown in the bar (the pitch has 8 parts; some have two steps). */
  label: string;
  title: string;
  /** What to show and say, for the presenter only. */
  note: string;
  /** Data sources on screen in this step (real or simulated), shown in the bar next to the persona badge. */
  sources: { text: string; kind: 'real' | 'simulated' | 'estimated' }[];
  apply(ctx: DemoContext): void;
  actions?: { label: string; run(ctx: DemoContext): void }[];
}

const CHEST_PAIN = '/emergency?protocol=chest_pain&trigger=crew';
const UNRESPONSIVE = '/emergency?protocol=unresponsive&trigger=cv&preanswer=responsive:no';

/** Common start of every step: no alarm, no solar replay, detection off (unless the step turns them on). */
function reset(ctx: DemoContext, keep: { solar?: boolean; cv?: boolean } = {}) {
  clearCrewAlarm();
  if (!keep.solar) void replayRadiation('stop');
  if (!keep.cv) ctx.cv.stop();
}

/** Same crew member, location and screen as asked; `picked` is set after the persona change has settled. */
function show(ctx: DemoContext, opts: { persona: string; env: string; planet?: string; at?: number; path?: string; picked?: RegionId }) {
  ctx.setPersona(opts.persona);
  if (opts.planet) ctx.setPlanet(opts.planet);
  ctx.setEnv(opts.planet ? `${opts.env}:${opts.planet}` : opts.env);
  if (opts.at !== undefined) ctx.jumpTo(opts.at);
  if (opts.path && ctx.pathname + ctx.search !== opts.path) ctx.navigate(opts.path);
  if (opts.picked) ctx.later(() => ctx.setPicked(opts.picked!), 400);
}

export const DEMO_STEPS: DemoStep[] = [
  {
    label: '1', title: 'ISS: a healthy crew member',
    note: 'Body map all Nominal. Radiation panel: real ISS dose rate with South Atlantic Anomaly spikes. Cabin air card: real ISS telemetry.',
    sources: [{ text: 'Real: NASA RadLab DOSTEL1 (ISS)', kind: 'real' }, { text: 'Real: NASA EDA cabin telemetry (RR-23)', kind: 'real' }],
    apply: (ctx) => { reset(ctx); show(ctx, { persona: 'A', env: 'iss', at: 0, path: '/', picked: 'radiation' }); },
  },
  {
    label: '2', title: 'Daily check: compared with real data',
    note: 'Summary of the 5-minute check: reaction time vs the CSA reference group, glucose next to the Inspiration4 crew.',
    sources: [{ text: 'Real: CSA PRET reference group', kind: 'real' }, { text: 'Real: NASA OSDR OSD-575 (Inspiration4)', kind: 'real' }],
    apply: (ctx) => { reset(ctx); show(ctx, { persona: 'A', env: 'iss', path: '/check?demo=summary' }); },
  },
  {
    label: '3', title: 'Slow drift: the heart reaches Warning',
    note: 'Persona B: heart at Warning with the time-to-act forecast, the guidance checklist, and the auto-drafted message to the flight surgeon.',
    sources: [{ text: "Guidance: Yenna's text (DRAFT)", kind: 'estimated' }],
    apply: (ctx) => {
      reset(ctx);
      show(ctx, { persona: 'B', env: 'iss', at: 0, path: '/', picked: 'heart' });
      ctx.later(() => sendDemoCommand({ kind: 'openDraft', region: 'heart' }), 1200);
    },
  },
  {
    label: '4a', title: 'Mars transit: the same message is delayed',
    note: 'Location Mars transit, message sent: "Arrives in several minutes". The advice changes for the delay.',
    sources: [],
    apply: (ctx) => {
      reset(ctx);
      show(ctx, { persona: 'B', env: 'mars', path: '/', picked: 'heart' });
      ctx.later(() => sendDemoCommand({ kind: 'openDraft', region: 'heart' }), 900);
      ctx.later(() => sendDemoCommand({ kind: 'sendDraft' }), 2200);
    },
  },
  {
    label: '4b', title: 'Surface rover on Mars',
    note: 'Radiation panel: real Curiosity dose rate on Mars. The ladder adds "Return to base".',
    sources: [{ text: 'Real: NASA RadLab Curiosity RAD (Mars surface)', kind: 'real' }],
    apply: (ctx) => {
      reset(ctx);
      sendDemoCommand({ kind: 'closeDrawer' });
      show(ctx, { persona: 'B', env: 'rover', planet: 'mars', path: '/', picked: 'radiation' });
    },
  },
  {
    label: '5', title: 'Solar storm: real NASA DONKI event',
    note: 'Replay of the real May 2024 solar particle event. Radiation goes to Act now, shelter alert. The dose is simulated.',
    sources: [{ text: 'Real: NASA DONKI event timing', kind: 'real' }, { text: 'Simulated: dose during the event', kind: 'simulated' }],
    apply: (ctx) => {
      reset(ctx, { solar: true });
      show(ctx, { persona: 'B', env: 'mars', path: '/', picked: 'radiation' });
      void replayRadiation('start', 5);
    },
  },
  {
    label: '6a', title: 'Acute event: vitals get worse',
    note: 'Persona C: heart rate climbs, oxygen falls. Watch the vitals strip turn red.',
    sources: [],
    apply: (ctx) => { reset(ctx); show(ctx, { persona: 'C', env: 'mars', at: 170, path: '/' }); },
  },
  {
    label: '6b', title: 'Pulse lost: red flags, then CPR',
    note: 'Emergency mode: red flags light up; when the pulse is lost the protocol jumps to CPR with the metronome.',
    sources: [],
    apply: (ctx) => { reset(ctx); show(ctx, { persona: 'C', env: 'mars', at: 440, path: CHEST_PAIN }); },
    actions: [{
      label: 'Jump to CPR',
      run: (ctx) => { ctx.navigate('/'); ctx.later(() => ctx.navigate(`${CHEST_PAIN}&goto=cpr`), 80); },
    }],
  },
  {
    label: '7', title: 'Unresponsive crew member detection',
    note: 'Go still with your arms floating up (camera), or use the demo trigger: "Are you OK?", then the crew alarm and the unresponsive protocol.',
    sources: [{ text: 'On-device camera, no video stored', kind: 'real' }],
    apply: (ctx) => { reset(ctx, { cv: true }); show(ctx, { persona: 'A', env: 'mars', at: 0, path: '/' }); },
    actions: [
      { label: 'Start camera', run: (ctx) => { void ctx.cv.start(); } },
      { label: 'Demo trigger', run: (ctx) => ctx.cv.demoTrigger() },
    ],
  },
  {
    label: '8', title: 'End of emergency: summary and delayed message',
    note: 'The message to the flight surgeon is sent (several minutes to Mars), then the emergency ends with its summary.',
    sources: [],
    apply: (ctx) => {
      clearCrewAlarm();
      void replayRadiation('stop');
      ctx.setPersona('A');
      ctx.setEnv('mars');
      const onEmergency = ctx.pathname.startsWith('/emergency');
      if (!onEmergency) ctx.navigate(UNRESPONSIVE);
      const wait = onEmergency ? 200 : 1800;
      ctx.later(() => sendDemoCommand({ kind: 'sendSurgeonMessage' }), wait);
      ctx.later(() => { sendDemoCommand({ kind: 'endEmergency' }); ctx.cv.stop(); }, wait + 1500);
    },
  },
];

/** The scenario badge: persona C is a simulated recording until Jian's real clinical recording replaces it. */
export function personaBadge(persona: Persona | undefined): { text: string; kind: 'real' | 'simulated' } | null {
  if (!persona) return null;
  const recording = (persona as Persona & { recording?: string }).recording;
  if (recording === 'real') return { text: `Real clinical recording (${persona.name})`, kind: 'real' };
  if (persona.id === 'C') return { text: 'Simulated recording', kind: 'simulated' };
  return persona.simulated ? { text: `Simulated scenario: ${scenarioLabel(persona.id)}`, kind: 'simulated' } : { text: persona.name, kind: 'real' };
}
