import type { PvtResult } from './contracts';
export type SignalMode = 'demo' | 'measurement' | 'research';
export type SignalSource = 'synthetic' | 'public_replay' | 'recorded_live' | 'live';
export interface Metric {
  value: number | null; unit: string; status: string; reason: string | null; method: string;
  measured_start_s: number; measured_end_s: number; window_s: number; valid_window_s: number;
  computed_at_utc: string; valid_until_utc: string;
}
export interface Snapshot {
  message_type: 'vitals'; subject_id: string; session_id: string; source: SignalSource; simulated: boolean;
  sequence: number; stream_status: string; observed_at_utc: string; data_end_s: number;
  quality: { status: string; reasons: string[]; method: string };
  metrics: Record<string, Metric>; capabilities: Record<string, string>;
  waveform: Record<string, number[]>;
}
export interface ResearchBP {
  systolic_mmHg: number | null; diastolic_mmHg: number | null; status: string; reason: string | null;
  method: string; valid_until_utc?: string; measured_start_s?: number; measured_end_s?: number;
  model_version?: string; artifact_sha256?: string; assessment_enabled: false;
}
export interface SignalSession {
  id: string; subject_id: string; device_id: string; mode: 'measurement' | 'research';
  recording?: string; input: string; source: SignalSource; simulated: boolean; status: string; error: string | null;
  created_at: string; latest: Snapshot | null; enable_research_bp: boolean; blood_pressure: ResearchBP | null;
}
export interface SessionOptions {
  subject_id: string; device_id: string; mode: 'measurement' | 'research';
  input: 'synthetic' | 'bidmc' | 'recording' | 'ingest'; source: SignalSource;
  enable_research_bp?: boolean; recording?: string; duration_s?: number; speed?: number; scenario?: string;
}
export interface SignalCheckRequest {
  check_id: string; session_id: string; seated_start_s: number; seated_end_s: number;
  stand_start_s: number | null; stand_end_s: number | null;
  bp_sys: number | null; bp_dia: number | null;
  pvt?: PvtResult | null; answers: Record<string, number>; temp_c: number | null; glucose_mmol: number | null;
}
export interface SignalCheckResult {
  id: string; session_id: string; subject_id: string; source: SignalSource; simulated: boolean;
  created_at: string; metrics: Record<string, { value: number | null; status: string; unit?: string; reason?: string }>;
  cuff: { systolic_mmHg: number; diastolic_mmHg: number; method: string } | null;
  blood_pressure_research: ResearchBP | null; posture_change_bpm: number | null;
  assessment: 'not_assessed'; score: null; notes: string[];
  manual: { answers: Record<string, number>; temp_c: number | null; glucose_mmol: number | null };
}
