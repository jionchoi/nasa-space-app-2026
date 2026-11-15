from __future__ import annotations

from typing import Literal
from pydantic import Field, model_validator
from crewsense_signals.ppg.schemas import Model, RawBatch, Source
from ..models import PvtResult


class SessionRequest(Model):
    subject_id: str = Field(min_length=1, max_length=100)
    device_id: str = Field(min_length=1, max_length=100)
    mode: Literal['measurement', 'research'] = 'measurement'
    input: Literal['synthetic', 'bidmc', 'recording', 'ingest'] = 'ingest'
    source: Source = 'live'
    enable_research_bp: bool = False
    recording: str | None = Field(default=None, max_length=200)
    duration_s: int = Field(default=300, ge=15, le=3600)
    speed: float = Field(default=1, gt=0, le=20)
    scenario: Literal['clean', 'dropout', 'noise', 'irregular'] = 'clean'

    @model_validator(mode='after')
    def source_matches_input(self):
        if self.enable_research_bp and self.mode != 'research':
            raise ValueError('optional BP model requires research mode')
        expected = {'synthetic': 'synthetic', 'bidmc': 'public_replay', 'recording': 'recorded_live', 'ingest': 'live'}
        if self.source != expected[self.input]:
            raise ValueError(f'{self.input} requires source={expected[self.input]}')
        if self.mode == 'measurement' and self.source == 'synthetic':
            raise ValueError('synthetic signals require research mode')
        if self.input in {'bidmc', 'recording'} and not self.recording:
            raise ValueError('select a server-registered recording')
        return self


class WaveformBatch(Model):
    """Atomic synchronized channels with one sample clock, no inferred alignment."""
    subject_id: str
    session_id: str
    device_id: str
    source: Source
    simulated: bool
    sequence: int = Field(ge=0)
    t0_s: float = Field(ge=0)
    sample_rate_hz: float = Field(ge=25, le=1000)
    unit: Literal['arbitrary', 'adc'] = 'arbitrary'
    channels: dict[str, list[float]]
    adc_max: float | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def validate_channels(self):
        if set(self.channels) - {'ppg', 'ir', 'red', 'ecg'}:
            raise ValueError('unsupported waveform channel')
        self.ppg_batch()  # NASA validation, including finite values and sample limits
        if 'ecg' in self.channels:
            import math
            if len(self.channels['ecg']) != len(next(iter(self.ppg_batch().channels.values()))):
                raise ValueError('ECG and PPG must be synchronized and equal length')
            if not all(math.isfinite(x) for x in self.channels['ecg']):
                raise ValueError('ECG samples must be finite')
        return self

    def ppg_batch(self) -> RawBatch:
        return RawBatch.model_validate({k: v for k, v in self.model_dump().items() if k != 'device_id'} | {
            'channels': {k: v for k, v in self.channels.items() if k != 'ecg'}})


class CheckRequest(Model):
    check_id: str = Field(min_length=8, max_length=100)
    session_id: str
    seated_start_s: float = Field(ge=0)
    seated_end_s: float = Field(gt=0)
    stand_start_s: float | None = Field(default=None, ge=0)
    stand_end_s: float | None = Field(default=None, gt=0)
    bp_sys: int | None = Field(default=None, ge=60, le=250)
    bp_dia: int | None = Field(default=None, ge=30, le=150)
    pvt: PvtResult | None = None
    answers: dict[str, float] = Field(default_factory=dict)
    temp_c: float | None = Field(default=None, ge=30, le=43)
    glucose_mmol: float | None = Field(default=None, ge=1, le=33.3)

    @model_validator(mode='after')
    def valid_intervals(self):
        if self.seated_end_s <= self.seated_start_s:
            raise ValueError('seated interval is empty')
        if (self.stand_start_s is None) != (self.stand_end_s is None):
            raise ValueError('standing interval needs both boundaries')
        if self.stand_start_s is not None and not (self.seated_end_s <= self.stand_start_s < self.stand_end_s):
            raise ValueError('standing must follow seated measurement')
        if (self.bp_sys is None) != (self.bp_dia is None):
            raise ValueError('blood pressure requires both values')
        if self.bp_sys is not None and self.bp_sys <= self.bp_dia:
            raise ValueError('systolic must exceed diastolic')
        return self
