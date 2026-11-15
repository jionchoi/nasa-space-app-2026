// App-wide state: who (persona), where (environment), config files (incl. status words), and things shared
// between screens (selected region, daily check done, streak, emergencies handled).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LABELS, getDailyChecks, getEnvironments, getEscalation, getGuidance, getHealth, getLabels, getMeasurements,
  getPersonas, getRegions, getStreak, getThresholds, postEmergencyLog, setReplay, useUsingMock,
} from '../api/client';
import { envKey, envKeys as keysFor, pickForEnv, resolveEnv } from '../lib/env';
import type {
  EmergencyLogIn, Environment, EscalationConfig, Guidance, Labels, Measurements, Persona, RegionId, RegionMeta, Status,
  Streak, Thresholds,
} from '../types/contracts';

/** An emergency ended in this session. `data` is the full log, kept so it can be viewed even with the backend off. */
export interface EmergencyRecord { endedAt: string; title: string; durationS: number; localId?: string; data?: EmergencyLogIn }

interface AppState {
  persona: string;
  setPersona(id: string): void;
  personaInfo?: Persona;
  personas: Persona[];
  /** Env key sent to the backend: the location id, or "rover:moon" / "rover:mars" for the surface rover. */
  env: string;
  /** Pick a location by id (the rover keeps the planet chosen last). */
  setEnv(id: string): void;
  /** Planet for a location with planets (the rover): "moon" or "mars". */
  setPlanet(planet: string): void;
  /** The location, resolved (the rover gets its planet's delay and advice note). */
  envInfo?: Environment;
  /** Keys for per-location texts, most specific first (see lib/env.ts). */
  envKeys: string[];
  environments: Environment[];
  thresholds: Thresholds | null;
  /** measurements.json: how to measure, why we check, can it be done in space (DRAFT). */
  measurements: Measurements | null;
  /** guidance.json: what to do per region and status (DRAFT). */
  guidance: Guidance | null;
  regions: RegionMeta[];
  escalation: EscalationConfig | null;
  /** Status words from labels.json. */
  labels: Labels;
  /** Region picked on the dashboard (also set by "View" in the alerts list on any screen). */
  picked: RegionId | null;
  /** Select a body area, optionally on one of its metrics (e.g. the CO2 pill selects lungs -> co2_ppm). */
  setPicked(id: RegionId | null, metric?: string | null): void;
  /** Metric picked inside the selected area (null = the area's worst / key metric). */
  pickedMetric: string | null;
  setPickedMetric(metric: string | null): void;
  checkDoneAt: string | null;
  setCheckDoneAt(t: string | null): void;
  streak: Streak | null;
  refreshStreak(): void;
  emergencies: EmergencyRecord[];
  addEmergency(record: EmergencyRecord, log: Omit<EmergencyLogIn, 'persona'>): void;
  /** Changes when the live stream should reconnect (demo jump). */
  replayNonce: number;
  jumpTo(seconds: number): void;
}

const Ctx = createContext<AppState | null>(null);
const HEALTH_EVERY_MS = 10_000;

// Demo options from the URL: ?persona=C&env=mars&start=170&speed=2
const params = new URLSearchParams(window.location.search);
const num = (key: string) => (params.get(key) !== null && !Number.isNaN(Number(params.get(key))) ? Number(params.get(key)) : null);
setReplay({ start: num('start'), speed: num('speed') });

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function AppProvider({ children }: { children: ReactNode }) {
  const usingMock = useUsingMock();
  const [persona, setPersonaId] = useState(params.get('persona') ?? 'A');
  const [env, setEnvKey] = useState(params.get('env') ?? 'iss');
  const [planet, setPlanetId] = useState<string | null>(params.get('env')?.split(':')[1] ?? null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [measurements, setMeasurements] = useState<Measurements | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [regions, setRegions] = useState<RegionMeta[]>([]);
  const [escalation, setEscalation] = useState<EscalationConfig | null>(null);
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);
  const [picked, setPickedId] = useState<RegionId | null>(null);
  const [pickedMetric, setPickedMetric] = useState<string | null>(null);
  const setPicked = useCallback((id: RegionId | null, metric: string | null = null) => { setPickedId(id); setPickedMetric(metric); }, []);
  const [checkDoneAt, setCheckDoneAt] = useState<string | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [emergencies, setEmergencies] = useState<EmergencyRecord[]>([]);
  const [replayNonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    const keep = <T,>(set: (v: T) => void) => (v: T) => { if (live) set(v); };
    getPersonas().then(keep(setPersonas));
    getEnvironments().then(keep(setEnvironments));
    getThresholds().then(keep(setThresholds));
    getMeasurements().then(keep(setMeasurements));
    getGuidance().then(keep(setGuidance));
    getRegions().then(keep((r) => setRegions(r.regions)));
    getEscalation().then(keep(setEscalation));
    getLabels().then(keep(setLabels));
    return () => { live = false; };
  }, [usingMock]);

  // The "On-board" indicator: keep checking that the local backend answers (it never needs the internet).
  useEffect(() => {
    const id = setInterval(() => { void getHealth(); }, HEALTH_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  const refreshStreak = useCallback(() => { getStreak(persona).then(setStreak); }, [persona]);

  // Today's daily check and the streak come from the local database, so they survive a restart.
  useEffect(() => {
    let live = true;
    setCheckDoneAt(null);
    setPicked(null);
    getDailyChecks(persona).then((rows) => {
      if (live && rows[0] && isToday(rows[0].t)) setCheckDoneAt(rows[0].t);
    });
    getStreak(persona).then((s) => { if (live) setStreak(s); });
    return () => { live = false; };
  }, [persona, usingMock]);

  const addEmergency = useCallback((record: EmergencyRecord, log: Omit<EmergencyLogIn, 'persona'>) => {
    const data = { persona, ...log };
    setEmergencies((list) => [{ ...record, localId: `local-${Date.parse(record.endedAt)}`, data }, ...list]);
    void postEmergencyLog(data);
  }, [persona]);
  const jumpTo = useCallback((seconds: number) => {
    setReplay({ start: seconds });
    setNonce((n) => n + 1);
  }, []);

  // A location with planets (the rover) is sent as "rover:<planet>"; before environments load, keep the id as given.
  const setEnv = useCallback((id: string) => {
    const found = environments.find((e) => e.id === id);
    setEnvKey(found ? envKey(found, planet) : id);
  }, [environments, planet]);
  const setPlanet = useCallback((p: string) => {
    setPlanetId(p);
    setEnvKey((key) => {
      const found = environments.find((e) => e.id === key.split(':')[0]);
      return found?.planets ? envKey(found, p) : key;
    });
  }, [environments]);
  // "?env=rover" (no planet) becomes "rover:<default planet>" once the environments are known.
  useEffect(() => {
    const found = environments.find((e) => e.id === env.split(':')[0]);
    if (found?.planets && env !== envKey(found, env.split(':')[1] ?? planet)) setEnvKey(envKey(found, env.split(':')[1] ?? planet));
  }, [environments, env, planet]);
  const envInfo = useMemo(() => resolveEnv(environments, env), [environments, env]);
  const envKeys = useMemo(() => keysFor(env, envInfo), [env, envInfo]);

  const value = useMemo<AppState>(() => ({
    persona, setPersona: setPersonaId, personas, personaInfo: personas.find((p) => p.id === persona),
    env, setEnv, setPlanet, envInfo, envKeys, environments, measurements, guidance,
    thresholds, regions, escalation, labels, picked, setPicked, pickedMetric, setPickedMetric, checkDoneAt, setCheckDoneAt, streak, refreshStreak,
    emergencies, addEmergency, replayNonce, jumpTo,
  }), [persona, personas, env, setEnv, setPlanet, envInfo, envKeys, environments, measurements, guidance, thresholds,
    regions, escalation, labels, picked, setPicked, pickedMetric, checkDoneAt, streak, refreshStreak, emergencies, addEmergency, replayNonce, jumpTo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Status word for a status, from labels.json (e.g. "Act now" for red). */
export function useStatusLabel(): (status: Status) => string {
  const { labels } = useApp();
  return useCallback((status: Status) => labels[status] ?? status, [labels]);
}

/** Advice text for a level in the current location (`envKeys` from useApp: the rover uses its planet's text). */
export function adviceFor(escalation: EscalationConfig | null, level: string, envKeys: string[]): string {
  const item = escalation?.levels.find((l) => l.id === level);
  return item ? pickForEnv(item.advice, envKeys) ?? '' : '';
}

export function linkText(escalation: EscalationConfig | null, envKeys: string[]): { pill: string; sent: string } {
  const entry = pickForEnv(escalation?.link, envKeys);
  return entry && typeof entry === 'object' ? entry : { pill: 'Flight surgeon link', sent: 'Sent' };
}
