// REST client. Every call falls back to src/mock/ when the backend is unreachable, and the shared mock flag
// (useUsingMock) tells the UI to show "Offline: mock data". WebSockets live in ./live.ts.
import type {
  Alert, CabinSummary, CheckRequest, CheckResult, CprConfig, DailyCheckRecord, DailyEntry, EmergencyLogIn,
  Delivery, EmergencyLog, Environment, MissionsResponse, EscalationConfig, Guidance, Labels, Measurements, Message, MessageIn, Persona, Protocol, Questionnaire, RadiationSummary,
  RegionsConfig, RegionStatus, Streak, Thresholds, UnresponsiveEvent,
} from '../types/contracts';
import mockCheck from '../mock/checkResult.json';
import mockCabin from '../mock/cabin.json';
import mockCpr from '../mock/cpr.json';
import mockDaily from '../mock/daily.json';
import mockDeliveryTable from '../mock/delivery.json';
import mockEnvironments from '../mock/environments.json';
import mockEscalation from '../mock/escalation.json';
import mockGuidance from '../mock/guidance.json';
import mockMeasurements from '../mock/measurements.json';
import mockLabels from '../mock/labels.json';
import mockMissions from '../mock/missions.json';
import mockPersonas from '../mock/personas.json';
import mockProtocols from '../mock/protocols.json';
import mockQuestionnaire from '../mock/questionnaire.json';
import mockRadiation from '../mock/radiation.json';
import mockRegions from '../mock/regions.json';
import mockStatus from '../mock/status.json';
import mockThresholds from '../mock/thresholds.json';
import { API_URL, setMock } from './mockFlag';

export { API_URL, usingMock, useUsingMock } from './mockFlag';
export { connectAlerts, connectVitals, setReplay, useVitalsSource, type VitalsConnection } from './live';

/** Labels from the mock file, so status words are never empty before the backend answers. */
export const DEFAULT_LABELS = mockLabels as Labels;

const pick = <T,>(table: unknown, key: string): T => {
  const t = table as Record<string, T>;
  return t[key] ?? t.A ?? Object.values(t)[0];
};

async function request<T>(path: string, fallback: () => T, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(API_URL + path, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as T;
    setMock(false);
    return data;
  } catch {
    setMock(true);
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
const post = (body?: unknown): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

// ---- content (JSON files) ----
export const getHealth = () => request<{ ok: boolean }>('/api/health', () => ({ ok: false }));
export const getLabels = () => request<Labels>('/api/labels', () => DEFAULT_LABELS);
export const getStatus = (persona: string, env = 'iss') =>
  request<RegionStatus[]>(`/api/status?persona=${persona}&env=${env}`, () => pick(mockStatus, persona));
export const getDaily = (persona: string) =>
  request<DailyEntry[]>(`/api/persona/${persona}/daily`, () => pick(mockDaily, persona));
export const getPersonas = () => request<Persona[]>('/api/personas', () => mockPersonas as Persona[]);
export const getProtocol = (id: string) =>
  request<Protocol>(`/api/protocols/${id}`, () => pick(mockProtocols, id));
export const getEnvironments = () =>
  request<Environment[]>('/api/environments', () => mockEnvironments as unknown as Environment[]);
export const getThresholds = () => request<Thresholds>('/api/thresholds', () => mockThresholds as unknown as Thresholds);
export const getRegions = () => request<RegionsConfig>('/api/regions', () => mockRegions as RegionsConfig);
export const getEscalation = () =>
  request<EscalationConfig>('/api/escalation', () => mockEscalation as unknown as EscalationConfig);
export const getQuestionnaire = () =>
  request<Questionnaire>('/api/questionnaire', () => mockQuestionnaire as unknown as Questionnaire);
export const getGuidance = () => request<Guidance>('/api/guidance', () => mockGuidance as unknown as Guidance);
export const getMeasurements = () =>
  request<Measurements>('/api/measurements', () => mockMeasurements as unknown as Measurements);
export const getCpr = () => request<CprConfig>('/api/cpr', () => mockCpr as CprConfig);
export const postCheck = (body: CheckRequest, env: string) =>
  request<CheckResult>(`/api/check?env=${env}`, () => mockCheck as unknown as CheckResult, post(body));

// ---- stored records (SQLite) ----
export const postEvent = (event: UnresponsiveEvent, persona?: string) =>
  request<{ ok: boolean }>(`/api/events${persona ? `?persona=${persona}` : ''}`, () => ({ ok: false }), post(event));
export const getAlerts = (persona: string) => request<Alert[] | null>(`/api/alerts?persona=${persona}`, () => null);
export const ackAlert = (id: string) => request<Alert | null>(`/api/alerts/${id}/ack`, () => null, post());
export const postEmergencyLog = (body: EmergencyLogIn) =>
  request<{ ok: boolean; id?: number; link?: string }>('/api/emergency-logs', () => ({ ok: false }), post(body));
export const getEmergencyLog = (id: string) => request<EmergencyLog | null>(`/api/emergency-logs/${id}`, () => null);
// ---- flight-surgeon messages (shared service for emergency mode and the escalation queue) ----
/** Delivery delay and status text for an environment (midpoint of its delay range). */
export const mockDelivery = (env: string): Delivery => pick(mockDeliveryTable as unknown as Record<string, Delivery>, env);
export const postMessage = (body: MessageIn) =>
  request<(Message & { ok: boolean }) | null>('/api/messages', () => null, post(body));
export const getMessages = (persona: string) => request<Message[] | null>(`/api/messages?persona=${persona}`, () => null);
export const editMessage = (id: string, text: string) =>
  request<Message | null>(`/api/messages/${id}`, () => null, { ...post({ text }), method: 'PATCH' });
export const sendMessage = (id: string, env: string, text?: string) =>
  request<Message | null>(`/api/messages/${id}/send`, () => null, post({ env, text }));
export const replyMessage = (id: string) => request<Message | null>(`/api/messages/${id}/reply`, () => null, post());
export const draftForAlert = (alertId: string, env: string) =>
  request<Message | null>(`/api/alerts/${alertId}/draft`, () => null, post({ env }));

// ---- environment: radiation (DONKI replay) and cabin (simulated) ----
export const getRadiation = (persona: string, env: string) =>
  request<RadiationSummary>(`/api/radiation?persona=${persona}&env=${env}`, () => pick(mockRadiation, persona));
export const replayRadiation = (action: 'start' | 'stop', minutes?: number) =>
  request<{ ok: boolean } | null>('/api/radiation/replay', () => null, post({ action, minutes }));
export const getCabin = () => request<CabinSummary>('/api/cabin', () => mockCabin as unknown as CabinSummary);
export const getDailyChecks = (persona: string) =>
  request<DailyCheckRecord[]>(`/api/daily-checks?persona=${persona}`, () => []);
export const postForm = (persona: string, kind: string, data: Record<string, unknown>) =>
  request<{ ok: boolean; id?: number } | null>('/api/forms', () => null, post({ persona, kind, data }));
export const getForms = <T,>(persona: string, kind: string) =>
  request<{ id: number; t: string; kind: string; data: T }[] | null>(`/api/forms?persona=${persona}&kind=${kind}`, () => null);
// Mock: an empty day (nothing logged), saved from GET /api/missions, so the routine card shows with the backend off.
export const getMissions = (persona: string) =>
  request<MissionsResponse | null>(`/api/missions?persona=${persona}`, () => ({ ...(mockMissions as unknown as MissionsResponse), streak: { persona, current: 0, best: 0, last_date: null } }));
export const getStreak = (persona: string) =>
  request<Streak>(`/api/streaks/${persona}`, () => ({ persona, current: 0, best: 0, last_date: null }));

// ---- admin ----
export interface AdminSummary { db: string; counts: Record<string, number>; sensor_live: boolean }
export const getAdminSummary = () => request<AdminSummary | null>('/api/admin/summary', () => null);
export const resetDemoData = () => request<{ ok: boolean } | null>('/api/admin/reset', () => null, post());
