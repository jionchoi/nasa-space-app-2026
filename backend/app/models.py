"""Pydantic models for the JSON contracts in docs/contracts.md. Field names must match exactly."""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

Status = Literal["green", "yellow", "orange", "red"]
AlertLevel = Literal["yellow", "orange", "red"]
AlertSource = Literal["rules", "vitals", "emergency", "cv"]
AdviceLevel = Literal["self", "crew", "surgeon_next", "surgeon_now"]
StepRoute = Union[int, Literal["next", "cpr"]]
Band = Optional[list[Optional[float]]]


class VitalsFrame(BaseModel):
    t: str
    hr: float
    hrv_rmssd: float
    spo2: float
    rr: float
    signal_quality: float = Field(ge=0, le=1)
    irregular: bool
    source: Literal["replay", "sensor"]
    # Optional PPG waveform details (added Nov 13 for unresponsive detection; old senders can leave them out):
    # pulse_amplitude: pulse wave height (AC part), any unit, as long as it is the same unit every frame.
    # beats_detected: heartbeats found in the waveform during this frame's second.
    # ppg_baseline: the steady light level (DC part); jumps when the clip is taken off.
    pulse_amplitude: Optional[float] = Field(default=None, ge=0)
    beats_detected: Optional[int] = Field(default=None, ge=0)
    ppg_baseline: Optional[float] = None


class RegionStatus(BaseModel):
    region: str
    status: Status
    score: int = Field(ge=0, le=100)
    trend: list[float]
    time_to_act_days: Optional[int]
    reason: str
    advice_level: AdviceLevel
    # Status of each metric of the region that has a value today, as judged here (bands plus the personal reaction-time
    # rule). The "All metrics" list shows these; the browser does not judge daily metrics itself (Nov 14).
    metric_status: dict[str, Status] = {}


class ProtocolStep(BaseModel):
    n: int
    key: Optional[str] = None  # stable name for a step, e.g. "responsive" (used by ?preanswer=responsive:no)
    text: str
    check: Optional[str] = None
    red_flag: bool = False
    timer_s: Optional[int] = None
    on_yes: Optional[StepRoute] = None
    on_no: Optional[StepRoute] = None
    # Equipment the step needs, e.g. ["oxygen"]. With a limited kit (environments.json "medical_kit": "limited") the app
    # shows that location's kit_notes for it (added Nov 14).
    equipment: list[str] = []


class RedFlagRoute(BaseModel):
    """When a live red flag (defined in thresholds.json "red_flags") fires, go to a step or CPR after a countdown."""
    model_config = ConfigDict(extra="allow")
    flag: str
    goto: StepRoute
    message: str
    countdown_s: int = Field(default=5, ge=0, le=30)


class Protocol(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    title: str
    steps: list[ProtocolStep]
    red_flags: list[str]
    red_flag_routes: list[RedFlagRoute] = []


class ThresholdEntry(BaseModel):
    """One indicator: ranges and source only. `unit` is required. How to measure, why we check and the equipment moved
    to measurements.json (Changes, Nov 14)."""
    model_config = ConfigDict(extra="allow")
    label: Optional[str] = None
    unit: str
    yellow: Band = None
    orange: Band = None
    red: Band = None
    source: Optional[str] = None
    keywords: Optional[list[str]] = None


class RedFlagDef(BaseModel):
    """thresholds.json "red_flags": a flag is active when `metric` is below/above the limit for `for_s` seconds."""
    model_config = ConfigDict(extra="allow")
    label: str
    metric: str
    below: Optional[float] = None
    above: Optional[float] = None
    for_s: float = Field(default=3, ge=0)
    min_signal_quality: Optional[float] = None
    source: Optional[str] = None


class Thresholds(RootModel[dict[str, Union[ThresholdEntry, dict, str]]]):
    """Metrics (ThresholdEntry), the "red_flags" table (RedFlagDef per flag), "daily_targets", "cv" and "_..." notes."""


class ScheduleItem(BaseModel):
    """A reminder in the mission schedule, at mission time (GMT) HH:MM."""
    id: str
    time: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    text: str
    action: str
    mission: str


class Planet(BaseModel):
    """A planet a location can be on (the surface rover). Sets the Earth delay; advice texts are taken from `advice_as`."""
    label: str
    subtitle: Optional[str] = None  # v4 sidebar line under the location name
    delay_s: list[float] = Field(min_length=2, max_length=2)
    advice_as: str
    advice_note: Optional[str] = None
    radiation_feed: Optional[dict[str, str]] = None  # {"file", "estimate"}: dose for the rover on this planet


class Environment(BaseModel):
    id: str
    label: str
    subtitle: Optional[str] = None  # v4 sidebar line under the location name, e.g. "Low Earth orbit · microgravity"
    delay_s: list[float] = Field(min_length=2, max_length=2)
    advice_note: str
    schedule: list[ScheduleItem] = []
    sleep: Optional[dict[str, str]] = None  # {"start": "22:00", "end": "06:00"}: unresponsive detection does not ask during these hours
    clock: Optional[str] = None
    # Added Nov 14 for the surface rover (all optional). The env key "rover:mars" picks a planet; "rover" uses `planet`.
    planet: Optional[str] = None
    planets: Optional[dict[str, Planet]] = None
    distance_to_base: Optional[dict[str, Any]] = None  # {"km", "drive_min", "note"}
    medical_kit: Optional[Literal["full", "limited"]] = None
    kit_notes: Optional[dict[str, str]] = None  # equipment -> note shown on protocol steps that need it
    estimated_data: list[str] = []  # data shown as "Estimated" here, e.g. ["radiation", "cabin"]
    # Dose rate at this location (app/radiation_feed.py): {"file": RadLab JSON, "estimate": thresholds dose_estimates key}
    radiation_feed: Optional[dict[str, str]] = None
    draft: Optional[str] = None


class GuidanceItem(BaseModel):
    """guidance.json: what to do for one region and status (DRAFT content, Yenna writes it)."""
    model_config = ConfigDict(extra="allow")
    summary: str
    self_care: list[str]
    tell_crew: str
    contact_surgeon: str
    prevention: list[str]


class Guidance(BaseModel):
    model_config = ConfigDict(extra="allow")
    status_keys: dict[Status, str]
    regions: dict[str, dict[str, GuidanceItem]]


class CanDoInSpace(BaseModel):
    possible: bool
    note: str


class MeasurementInfo(BaseModel):
    """measurements.json: one entry per metric in thresholds.json (same key)."""
    model_config = ConfigDict(extra="allow")
    how_to_measure: list[str] = Field(min_length=1)
    why_check: str
    can_do_in_space: CanDoInSpace


class Measurements(BaseModel):
    model_config = ConfigDict(extra="allow")
    metrics: dict[str, MeasurementInfo]


class EventSignals(BaseModel):
    """What the frontend sends with an UnresponsiveEvent (Nov 14: matched to frontend/src). Three senders:
    - source "cv" (cv/useUnresponsiveDetection.ts): limb_motion, body_drift, nbp, eyes_closed_s, score, pulse,
      from, to, reason, text (one event per detector state change)
    - source "crew_alarm" (components/common/CrewAlarm.tsx): origin, reason, text
    - source "emergency" (components/emergency/useEmergency.ts): protocol, kind, text (emergency log entries)
    Unknown extra fields are still accepted and stored, so an older or newer sender is never rejected."""
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    source: Optional[Literal["cv", "crew_alarm", "emergency"]] = None
    # Camera detection numbers (all body-relative; see docs/cv-explained.md)
    limb_motion: Optional[float] = None    # hand / elbow speed relative to the torso, shoulder widths per second
    body_drift: Optional[float] = None     # whole-body drift speed in the picture (shoulder widths or radians per second)
    nbp: Optional[float] = None            # neutral body posture score 0-1
    eyes_closed_s: Optional[float] = None  # seconds both eyes have been closed
    score: Optional[float] = None          # combined unresponsive score 0-1
    pulse: Optional[Literal["ok", "lost", "clip_off", "no_data"]] = None  # finger clip status at that moment
    from_state: Optional[str] = Field(default=None, alias="from")  # detector state change, e.g. CHECK_IN -> ALARM
    to_state: Optional[str] = Field(default=None, alias="to")
    reason: Optional[str] = None
    text: Optional[str] = None             # plain sentence for the event log
    origin: Optional[str] = None           # crew alarm: what raised it ("cv", "app", ...)
    protocol: Optional[str] = None         # emergency log: protocol id
    kind: Optional[str] = None             # emergency log: entry kind (step, answer, vital, message, end, ...)


class UnresponsiveEvent(BaseModel):
    t: str
    # Unresponsive detection posts one event per state change (renamed from CollapseEvent on Nov 13).
    type: Literal["unresponsive_suspected", "checkin_started", "ok_confirmed", "alarm", "monitoring_resumed"]
    signals: EventSignals = EventSignals()


class DailyEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    day: int
    hr_rest: float
    hrv_rmssd: float
    spo2: float
    rr: float
    stand_hr_rise: float
    sleep_h: float
    mood: int = Field(ge=1, le=5)
    stress: int = Field(ge=1, le=5)
    symptoms: list[str]
    hydration_l: float
    exercise_min: float
    radiation_msv: float
    bp_sys: Optional[float] = None  # mmHg, from the daily check (added Nov 14)
    bp_dia: Optional[float] = None


class Persona(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    description: str
    simulated: bool
    mission_day: int
    daily: list[DailyEntry]
    stream: list[VitalsFrame]
    event_start_s: Optional[int] = None
    unresponsive_s: Optional[int] = None


class PvtResult(BaseModel):
    """Reaction-time test (psychomotor vigilance style). median_ms = median of hits; lapses = RT >= lapse_ms
    (questionnaire.json pvt); lapse_rate_pct = lapses / n x 100. A "demo" result is never compared or judged."""
    median_ms: float = Field(ge=100, le=5000)
    lapses: int = Field(ge=0)
    lapse_rate_pct: Optional[float] = Field(default=None, ge=0, le=100)
    false_starts: int = Field(ge=0)
    n: int = Field(ge=1)
    duration_s: int = Field(ge=10, le=600)
    version: Literal["full", "demo"] = "full"
    reaction_ms: list[float] = []

    @model_validator(mode="after")
    def _fill_rate(self):
        if self.lapse_rate_pct is None:
            self.lapse_rate_pct = round(100 * self.lapses / self.n, 1)
        return self


class MealForm(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    size: Literal["small", "normal", "large"] = "normal"
    water_l: float = Field(default=0, ge=0, le=3)
    notes: str = Field(default="", max_length=300)


class ExerciseForm(BaseModel):
    minutes: int = Field(ge=1, le=300)
    type: Literal["treadmill", "bike", "resistance", "other"] = "other"
    notes: str = Field(default="", max_length=300)


class BiomarkerForm(BaseModel):
    """Weekly biomarkers. Blood pressure moved to the daily check (Nov 14); old bp fields sent here are ignored."""
    body_mass_kg: float = Field(ge=30, le=200)
    notes: str = Field(default="", max_length=300)


class SelfCareForm(BaseModel):
    """Self-care items ticked today on a region's "What to do" card (guidance.json). The latest one per region wins."""
    region: str = Field(min_length=1, max_length=40)
    status: Status
    ticked: list[str] = Field(default=[], max_length=20)


class MoodForm(BaseModel):
    """v4 log drawer "Mood and symptoms": a 1-10 mood and the symptoms felt now (questionnaire symptom ids).
    Display and timeline only: it does not change any status (the daily check questions still feed brain and mood)."""
    mood: int = Field(ge=1, le=10)
    symptoms: list[str] = Field(default=[], max_length=10)
    notes: str = Field(default="", max_length=300)


# Known form kinds are validated; other kinds are stored as given.
FORM_MODELS = {"meal": MealForm, "exercise": ExerciseForm, "biomarkers": BiomarkerForm, "pvt": PvtResult,
               "self_care": SelfCareForm, "mood": MoodForm}


class CheckRequest(BaseModel):
    persona: str = "A"
    seated_frames: list[VitalsFrame] = Field(min_length=1)
    stand_frames: list[VitalsFrame] = []
    answers: dict[str, float] = {}
    temp_c: Optional[float] = Field(default=None, ge=30, le=43)
    glucose_mmol: Optional[float] = Field(default=None, ge=1, le=33.3)
    pvt: Optional[PvtResult] = None
    # Blood pressure from the cuff (added Nov 14). Typing-mistake limits as in questionnaire.json entry_limits.
    bp_sys: Optional[int] = Field(default=None, ge=60, le=250)
    bp_dia: Optional[int] = Field(default=None, ge=30, le=150)

    @model_validator(mode="after")
    def _bp_pair(self) -> "CheckRequest":
        if (self.bp_sys is None) != (self.bp_dia is None):
            raise ValueError("Blood pressure needs both numbers, or neither")
        if self.bp_sys is not None and self.bp_dia >= self.bp_sys:
            raise ValueError("The bottom blood pressure number must be lower than the top one")
        return self


class CheckResult(BaseModel):
    day: int
    summary: dict[str, Any]
    comparison: list[dict[str, Any]]
    before: list[RegionStatus]
    after: list[RegionStatus]
    changed: list[dict[str, str]]
    advice: dict[str, str]
    notes: list[str]


class Labels(RootModel[dict[Status, str]]):
    """Status words shown on screen (data/labels.json)."""


class Alert(BaseModel):
    id: str
    t: str
    level: AlertLevel
    region: Optional[str] = None
    metric: Optional[str] = None
    message: str
    source: AlertSource
    acknowledged: bool = False
    message_draft_id: Optional[str] = None
    persona: Optional[str] = None
    link: Optional[str] = None  # app page for more detail, e.g. "/emergency/log/12"


class EmergencyLogIn(BaseModel):
    persona: str = "A"
    protocol: str
    title: str
    started: str
    ended: str
    duration_s: float = Field(ge=0)
    log: list[dict[str, Any]] = []
    answers: dict[str, Any] = {}  # step n -> {"question", "answer", "by"}
    messages: list[dict[str, Any]] = []  # flight-surgeon messages sent during the emergency
    trigger: Optional[str] = None  # "crew", "cv" (unresponsive detection), "alarm" (crew alarm)


class MessageIn(BaseModel):
    persona: str = "A"
    env: str = "iss"
    text: str = Field(min_length=1)
    delay_s: float = Field(default=0, ge=0)
    status: Literal["draft", "sent", "delivered", "replied"] = "sent"
    alert_id: Optional[str] = None


class FormIn(BaseModel):
    persona: str = "A"
    kind: str = Field(min_length=1, max_length=40)
    data: dict[str, Any]


class MessageEdit(BaseModel):
    text: str = Field(min_length=1)


class MessageSend(BaseModel):
    env: str = "iss"
    text: Optional[str] = None


class DraftRequest(BaseModel):
    env: str = "iss"


class ReplayRequest(BaseModel):
    action: Literal["start", "stop"] = "start"
    minutes: Optional[float] = Field(default=None, gt=0, le=240)

