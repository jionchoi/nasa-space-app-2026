from datetime import datetime
from typing import Literal

import math
from pydantic import BaseModel, ConfigDict, Field, model_validator

Source = Literal["synthetic", "public_replay", "recorded_live", "live"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RawBatch(Model):
    subject_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    source: Source
    simulated: bool
    sequence: int = Field(ge=0)
    t0_s: float = Field(ge=0)
    sample_rate_hz: float = Field(ge=25, le=1000)
    unit: Literal["arbitrary", "adc"] = "arbitrary"
    channels: dict[str, list[float]]
    adc_max: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def check_samples(self):
        if self.simulated != (self.source == "synthetic"):
            raise ValueError("synthetic must be labelled simulated; measured sources must not be")
        if not self.channels or not (set(self.channels) & {"ppg", "ir"}):
            raise ValueError("a ppg or ir channel is required")
        if set(self.channels) - {"ppg", "ir", "red"}:
            raise ValueError("supported channels: ppg, ir, red")
        lengths = {len(v) for v in self.channels.values()}
        if len(lengths) != 1 or not 8 <= next(iter(lengths)) <= 10000:
            raise ValueError("channels must have equal lengths (8..10000 samples)")
        if any(not math.isfinite(x) for values in self.channels.values() for x in values):
            raise ValueError("samples must be finite")
        return self

    @property
    def sample_count(self) -> int:
        return len(next(iter(self.channels.values())))

    @property
    def end_s(self) -> float:
        return self.t0_s + self.sample_count / self.sample_rate_hz


class Quality(Model):
    status: Literal["usable", "unusable", "unknown"]
    reasons: list[str] = Field(default_factory=list)
    method: str = "optical_checks_v1_unvalidated"


class Metric(Model):
    value: float | None = None
    unit: str
    status: str
    reason: str | None = None
    method: str
    measured_start_s: float
    measured_end_s: float
    window_s: float
    valid_window_s: float
    computed_at_utc: datetime
    valid_until_utc: datetime


class Snapshot(Model):
    message_type: Literal["vitals"] = "vitals"
    schema_version: str = "1.0"
    subject_id: str
    session_id: str
    source: Source
    simulated: bool
    sequence: int
    stream_status: Literal["running", "ended", "stale", "error"] = "running"
    observed_at_utc: datetime
    data_end_s: float
    quality: Quality
    metrics: dict[str, Metric]
    alerts: list[dict] = Field(default_factory=list)
    waveform: dict[str, list[float]] = Field(default_factory=dict)
    capabilities: dict[str, str] = Field(default_factory=dict)


def invalidate(snapshot: Snapshot, status: Literal["ended", "stale", "error"]) -> Snapshot:
    """Never leave a last valid number looking current after the source stops."""
    result = snapshot.model_copy(deep=True)
    result.stream_status = status
    result.quality = Quality(status="unknown", reasons=[f"source_{status}"])
    result.waveform = {}
    for metric in result.metrics.values():
        metric.value = None
        metric.status = status
        metric.reason = f"source_{status}"
        metric.valid_until_utc = snapshot.observed_at_utc
    return result
