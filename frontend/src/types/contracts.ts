// JSON contracts. Source of truth: docs/contracts.md. Field names must match exactly.

import type { CvThresholds } from '../cv/types';

export type Status = 'green' | 'yellow' | 'orange' | 'red';
export type AdviceLevel = 'self' | 'crew' | 'surgeon_next' | 'surgeon_now';
export type AlertLevel = 'yellow' | 'orange' | 'red';
export type AlertSource = 'rules' | 'vitals' | 'emergency' | 'cv';
/** Status words shown on screen (GET /api/labels, data/labels.json). */
export type Labels = Record<Status, string>;
export type RegionId =
  | 'brain_mood' | 'heart' | 'lungs' | 'immune' | 'metabolism' | 'bones_muscles' | 'radiation';

/** WebSocket /ws/vitals, about 1 per second. */
export interface VitalsFrame {
  t: string;
  hr: number;
  hrv_rmssd: number;
  spo2: number;
  rr: number;
  signal_quality: number;
  irregular: boolean;
  source: 'replay' | 'sensor';
  /** Optional PPG details (Jian's code; added Nov 13 for unresponsive detection). Pulse wave height (AC part), same unit every frame. */
  pulse_amplitude?: number;
  /** Optional: heartbeats found in the waveform during this frame's second. */
  beats_detected?: number;
  /** Optional: steady light level (DC part); jumps when the clip comes off. */
  ppg_baseline?: number;
}

/** GET /api/status */
export interface RegionStatus {
  region: RegionId;
  status: Status;
  score: number;
  trend: number[];
  time_to_act_days: number | null;
  reason: string;
  advice_level: AdviceLevel;
}

/** "next", a step number, or "cpr". */
export type StepRoute = number | 'next' | 'cpr';

export interface ProtocolStep {
  n: number;
  /** Stable name for the step, e.g. "responsive" (used by ?preanswer=responsive:no). */
  key?: string;
  text: string;
  check?: string | null;
  red_flag: boolean;
  timer_s: number | null;
  on_yes?: StepRoute | null;
  on_no?: StepRoute | null;
  /** Equipment the step needs, e.g. ["oxygen"]. With a limited kit (the rover) the location's kit note is shown (Nov 14). */
  equipment?: string[];
}

/** backend/data/protocols/<id>.json */
/** When a live red flag fires during the protocol, go to a step (or CPR) after a short countdown the crew can cancel. */
export interface RedFlagRoute {
  /** A flag defined in thresholds.json "red_flags", e.g. "pulse_lost". */
  flag: string;
  goto: number | 'cpr';
  message: string;
  countdown_s?: number;
}

export interface Protocol {
  id: string;
  title: string;
  steps: ProtocolStep[];
  red_flags: string[];
  red_flag_routes?: RedFlagRoute[];
  draft?: string;
}

/** [low, high]: below low or above high is at least that status; null = no limit. */
export type Band = [number | null, number | null];

/** One indicator in thresholds.json: ranges and source only. How to measure moved to measurements.json (Nov 14). */
export interface ThresholdEntry {
  label?: string;
  unit: string;
  yellow?: Band | null;
  orange?: Band | null;
  red?: Band | null;
  source?: string;
  keywords?: string[];
}

/** thresholds.json "red_flags": active when `metric` is below/above the limit for `for_s` seconds with a usable signal. */
export interface RedFlagDef {
  label: string;
  metric: string;
  below?: number | null;
  above?: number | null;
  for_s?: number;
  min_signal_quality?: number | null;
  source?: string;
}
export type RedFlagTable = Record<string, RedFlagDef | string>;

/** thresholds.json: per metric entry, the "red_flags" table, the "cv" block (unresponsive detection), plus "source" and notes as strings. */
export type Thresholds = Record<string, ThresholdEntry | RedFlagTable | CvThresholds | string | undefined>;

/** A reminder in the mission schedule (environments.json "schedule"), mission time HH:MM. */
export interface ScheduleItem { id: string; time: string; text: string; action: string; mission: string }

/** A planet a location can be on (the surface rover): sets the Earth delay; advice texts come from `advice_as`. */
export interface Planet { label: string; delay_s: [number, number]; advice_as: string; advice_note?: string }

/** environments.json */
export interface Environment {
  id: string;
  label: string;
  delay_s: [number, number];
  advice_note: string;
  schedule?: ScheduleItem[];
  sleep?: { start: string; end: string };
  clock?: string;
  // Added Nov 14 for the surface rover (all optional).
  /** Default planet; the env key "rover:mars" picks another. */
  planet?: string;
  planets?: Record<string, Planet>;
  distance_to_base?: { km?: number; drive_min?: number; note?: string };
  medical_kit?: 'full' | 'limited';
  /** Equipment -> note shown on protocol steps that need it ("default" for anything else). */
  kit_notes?: Record<string, string>;
  /** Data shown as "Estimated" at this location, e.g. ["radiation", "cabin"]. */
  estimated_data?: string[];
  draft?: string;
  // Filled in by resolveEnv / GET /api/environments/{env} for a location with planets:
  key?: string;
  advice_as?: string;
  planet_label?: string;
}

/** GET /api/alerts, pushed on /ws/alerts. Created by the backend (rules, vitals, emergency; cv later). */
export interface Alert {
  id: string;
  t: string;
  level: AlertLevel;
  region: RegionId | null;
  metric: string | null;
  message: string;
  source: AlertSource;
  acknowledged: boolean;
  message_draft_id: string | null;
  persona?: string | null;
  /** App page with more detail, e.g. "/emergency/log/12" for "Emergency handled at ...". */
  link?: string | null;
}

/** /ws/alerts messages. */
export type AlertFeedMessage =
  | { type: 'snapshot'; alerts: Alert[] }
  | { type: 'alert' | 'ack' | 'update'; alert: Alert };

/** /ws/vitals control message (frames never have a `type`). */
export interface SourceChanged { type: 'source_changed'; source: 'sensor' | 'replay' }

/** POST /api/emergency-logs */
export interface EmergencyLogIn {
  persona: string;
  protocol: string;
  title: string;
  started: string;
  ended: string;
  duration_s: number;
  log: { t: string; kind: string; text: string }[];
  /** step n -> question, answer and who answered (crew or unresponsive detection). */
  answers?: Record<string, { question: string; answer: string; by: string }>;
  /** Flight-surgeon messages sent during the emergency. */
  messages?: { id: string; text: string; status: string; sent_at: string | null; status_text?: string | null }[];
  trigger?: string | null;
}

/** GET /api/emergency-logs/{id} */
export interface EmergencyLog extends EmergencyLogIn { id: number }

/** POST /api/messages */
export interface MessageIn {
  persona: string;
  env: string;
  text: string;
  delay_s?: number;
  status?: 'draft' | 'sent' | 'delivered' | 'replied';
  alert_id?: string | null;
}

export type MessageStatus = 'draft' | 'sent' | 'delivered' | 'replied';

/** A flight-surgeon message (app/messaging.py): drafts from the escalation queue and messages sent from emergency mode. */
export interface Message {
  id: string;
  persona: string;
  t: string;
  env: string;
  text: string;
  status: MessageStatus;
  delay_s: number;
  alert_id: string | null;
  region: RegionId | null;
  source: 'alert' | 'emergency' | 'manual' | null;
  sent_at: string | null;
  reply: string | null;
  replied_at: string | null;
  updated_at: string | null;
  /** "Delivered", "Delivered after ~1.3 s", "Sent. Arrives in several minutes..." (null for drafts). */
  status_text: string | null;
}

/** GET /api/delivery/{env} */
export interface Delivery { env: string; delay_s: number; status_text: string }

/** Active replay of a real NASA DONKI solar particle event (dose simulated). */
export interface RadiationEvent {
  sep_id: string;
  sep_time: string;
  link: string;
  instruments: string[];
  flare: { flr_id: string; class?: string; note?: string } | null;
  started_at: string;
  ends_at: string;
  remaining_s: number;
  dose_rate_msv_h: number;
  event_dose_msv: number;
  alert: string;
  advice: string;
  simulated_dose: true;
  note: string;
}

/** GET /api/radiation */
export interface RadiationSummary {
  persona: string;
  daily: { day: number; msv: number }[];
  today_msv: number;
  mission_total_msv: number;
  limit_msv: number | null;
  status: Status;
  unit: string;
  event: RadiationEvent | null;
  event_available: boolean;
  fallback_spike_used: boolean;
}

export interface CabinPoint { t: string; minute: number; co2_ppm: number; temp_c: number; noise_dba: number }

/** GET /api/cabin (SIMULATED profile) */
export interface CabinSummary {
  simulated: boolean;
  source: string;
  now: CabinPoint;
  status: { co2_ppm: Status; temp_c: Status; noise_dba: Status };
  last_24h: CabinPoint[];
  co2_high_hours_24h: number;
  co2_watch_ppm: number | null;
}

export interface Streak { persona: string; current: number; best: number; last_date: string | null }
export interface DailyCheckRecord { id: number; persona: string; t: string; day: number }

/** POST /api/events */
export interface UnresponsiveEvent {
  t: string;
  /** Unresponsive detection posts one per state change (renamed from CollapseEvent on Nov 13). */
  type: 'unresponsive_suspected' | 'checkin_started' | 'ok_confirmed' | 'alarm' | 'monitoring_resumed';
  signals: { motion?: number; eyes_closed_s?: number; posture?: string; [extra: string]: unknown };
}

export interface DailyEntry {
  day: number;
  hr_rest: number;
  hrv_rmssd: number;
  spo2: number;
  rr: number;
  stand_hr_rise: number;
  sleep_h: number;
  mood: number;
  stress: number;
  symptoms: string[];
  hydration_l: number;
  exercise_min: number;
  radiation_msv: number;
  /** Blood pressure from the daily check, mmHg (Nov 14). */
  bp_sys?: number;
  bp_dia?: number;
  [derived: string]: number | string[] | boolean | undefined;
}

/** backend/data/personas/<id>.json. GET /api/personas returns it without daily and stream. */
export interface Persona {
  id: string;
  name: string;
  description: string;
  simulated: boolean;
  mission_day: number;
  event_start_s?: number;
  unresponsive_s?: number;
  daily?: DailyEntry[];
  stream?: VitalsFrame[];
}

// ---- Config files served as-is (not team contracts, but typed for the UI) ----

export interface RegionMeta {
  id: RegionId;
  label: string;
  /** One plain sentence on what this body part or system does (DRAFT). */
  function?: string;
  metrics: string[];
  /** Cabin values shown with the region (not used for its status), e.g. co2_ppm. */
  context_metrics?: string[];
  key_metric: string;
  live_metrics: string[];
  spaceflight_note: string;
}
export interface RegionsConfig { regions: RegionMeta[] }

export interface EscalationLevel { id: AdviceLevel; label: string; advice: Record<string, string> }
/** A ladder step for one location only (e.g. "Return to base" on the rover). Shown only; never an advice level. */
export interface ExtraStep { id: string; label: string; after: AdviceLevel; advice: string; draft?: string }
export interface EscalationConfig {
  levels: EscalationLevel[];
  link: Record<string, { pill: string; sent: string } | string>;
  extra_steps?: Record<string, ExtraStep[]>;
}

/** guidance.json (DRAFT): what to do for one region and status. */
export interface GuidanceItem {
  summary: string;
  self_care: string[];
  tell_crew: string;
  contact_surgeon: string;
  prevention: string[];
  draft?: string;
}
export interface Guidance {
  /** App status -> key used in `regions` (green -> nominal, ...). */
  status_keys: Record<Status, string>;
  regions: Record<string, Record<string, GuidanceItem>>;
}

/** measurements.json (DRAFT): one entry per metric in thresholds.json. */
export interface MeasurementInfo {
  how_to_measure: string[];
  why_check: string;
  can_do_in_space: { possible: boolean; note: string };
  draft?: string;
}
export interface Measurements { metrics: Record<string, MeasurementInfo> }

export interface Question {
  id: string;
  type: 'number' | 'scale';
  region: RegionId;
  optional?: boolean;
  draft?: string;
  text: string;
  /** Daily field the answer goes into (sleep_h, mood, stress). */
  field?: string;
  labels?: string[];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number;
}
export interface Questionnaire {
  measurement: {
    seated_s: number;
    stand_s: number;
    breaths_per_min: number;
    signal_hold_s: number;
    pause_after_bad_s: number;
    hints: { after_s: number; text: string }[];
  };
  prepare: { instruction: string; checklist: string[] };
  stand_text: { gravity: string; microgravity: string; microgravity_envs: string[] };
  questions: Question[];
  /** Typing-mistake limits for manual entry (not medical ranges). */
  entry_limits: {
    temp_c: EntryLimit;
    glucose_mmol: EntryLimit;
    glucose_mgdl: EntryLimit;
    bp_sys: EntryLimit;
    bp_dia: EntryLimit;
    mgdl_per_mmol: number;
  };
  pvt: PvtConfig;
}

export interface EntryLimit { min: number; max: number; step: number; unit: string }

export interface PvtConfig {
  duration_s: number;
  demo_duration_s: number;
  gap_s: [number, number];
  lapse_ms: number;
  no_response_ms: number;
}

/** Reaction-time test result (psychomotor vigilance style). */
export interface PvtResult {
  median_ms: number;
  lapses: number;
  false_starts: number;
  n: number;
  duration_s: number;
  version: 'full' | 'demo';
  reaction_ms: number[];
}

export interface Mission { id: string; label: string; done: boolean; detail: string; action: string }
export interface MissionsResponse {
  missions: Mission[];
  targets: { water_l: number; meals: number; exercise_min: number };
  streak: Streak;
}

export type LogKind = 'meal' | 'exercise' | 'biomarkers';

export interface CprConfig {
  rate_per_min: number;
  compressions: number;
  breaths: number;
  breaths_pause_s: number;
  switch_rescuer_s: number;
  microgravity_tips: string[];
}

export interface CheckComparison {
  metric: string;
  label: string;
  unit: string;
  value: number;
  baseline: number | null;
  delta: number | null;
  status: Status;
  text: string;
}
export interface CheckRequest {
  persona: string;
  seated_frames: VitalsFrame[];
  stand_frames: VitalsFrame[];
  answers: Record<string, number>;
  temp_c?: number | null;
  glucose_mmol?: number | null;
  pvt?: PvtResult | null;
  /** Blood pressure (both or neither), mmHg. */
  bp_sys?: number | null;
  bp_dia?: number | null;
}
export interface CheckResult {
  day: number;
  summary: Record<string, unknown>;
  comparison: CheckComparison[];
  before: RegionStatus[];
  after: RegionStatus[];
  changed: { region: RegionId; from: Status; to: Status }[];
  advice: { level: AdviceLevel; text: string };
  notes: string[];
}
