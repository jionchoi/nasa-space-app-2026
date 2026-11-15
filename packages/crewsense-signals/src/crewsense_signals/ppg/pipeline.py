from collections import deque
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.signal import butter, find_peaks, sosfilt, sosfilt_zi

from .quality import assess
from .schemas import Metric, Quality, RawBatch, Snapshot


class Pipeline:
    """One immutable subject/session/source context and a causal filter.

    A discontinuity clears filter and interval history; no interval is bridged
    over a missing or unusable segment. Values use only samples already seen.
    """

    def __init__(self, hr_window_s=8.0, prv_window_s=60.0, settle_s=2.0):
        if not 4 <= hr_window_s <= prv_window_s <= 300 or settle_s < 0:
            raise ValueError("require 4 <= HR window <= PRV window <= 300 and settle >= 0")
        self.hr_window_s = hr_window_s
        self.prv_window_s = prv_window_s
        self.settle_s = settle_s
        self.context = None
        self.last_sequence = None
        self.expected_t0 = None
        self.times = deque()
        self.filtered = deque()
        self.sos = None
        self.zi = None
        self.segment_start = None

    def _reset(self):
        self.times.clear()
        self.filtered.clear()
        self.zi = None
        self.segment_start = None

    def process(self, batch: RawBatch) -> Snapshot:
        context = (batch.subject_id, batch.session_id, batch.source, batch.simulated,
                   batch.sample_rate_hz, batch.unit, tuple(sorted(batch.channels)), batch.adc_max)
        if self.context is not None and context != self.context:
            raise ValueError("context changed: create a new Pipeline for a new session or device format")
        if self.last_sequence is not None and batch.sequence <= self.last_sequence:
            raise ValueError("duplicate or out-of-order batch")
        if self.expected_t0 is not None and batch.t0_s < self.expected_t0 - 0.25 / batch.sample_rate_hz:
            raise ValueError("overlapping or backward sample timestamps")
        self.context = context
        gap = self.expected_t0 is not None and (
            abs(batch.t0_s - self.expected_t0) > 0.25 / batch.sample_rate_hz
            or batch.sequence != self.last_sequence + 1
        )
        self.last_sequence = batch.sequence
        self.expected_t0 = batch.end_s
        if gap:
            self._reset()
        quality = assess(batch)
        now = datetime.now(timezone.utc)
        waveform = {}
        if quality.status != "usable":
            self._reset()
        else:
            fs = batch.sample_rate_hz
            if self.sos is None:
                self.sos = butter(2, [0.3, 5.0], btype="bandpass", fs=fs, output="sos")
            channel = "ir" if "ir" in batch.channels else "ppg"
            raw = np.asarray(batch.channels[channel], dtype=float)
            if self.zi is None:
                self.zi = sosfilt_zi(self.sos) * raw[0]
                self.segment_start = batch.t0_s
            filtered, self.zi = sosfilt(self.sos, raw, zi=self.zi)
            times = batch.t0_s + np.arange(len(raw)) / fs
            self.times.extend(times)
            self.filtered.extend(filtered)
            cutoff = batch.end_s - self.prv_window_s - self.settle_s - 2
            while self.times and self.times[0] < cutoff:
                self.times.popleft()
                self.filtered.popleft()
            # Keep network output bounded independently of input batch size.
            stride = max(1, int(np.ceil(len(raw) / 256)))
            waveform = {"time_s": times[::stride].tolist(), "ppg": raw[::stride].tolist(),
                        "filtered_ppg": filtered[::stride].tolist()}
        metrics = {
            "pulse_rate_bpm": self._metric(batch, quality, now, self.hr_window_s, "pulse"),
            "ppg_rmssd_ms": self._metric(batch, quality, now, self.prv_window_s, "prv"),
        }
        spo2_status = "unvalidated" if {"red", "ir"} <= batch.channels.keys() else "unsupported_channel"
        metrics["spo2_pct"] = Metric(
            unit="%", status=spo2_status, reason="requires_raw_red_ir_and_validated_calibration",
            method="not_implemented", measured_start_s=batch.t0_s, measured_end_s=batch.end_s,
            window_s=0, valid_window_s=0, computed_at_utc=now, valid_until_utc=now,
        )
        if gap:
            quality = Quality(status="unknown", reasons=["sample_gap", *quality.reasons])
            for metric in metrics.values():
                if metric.status in {"valid", "warming_up"}:
                    metric.value = None
                    metric.status = "gap"
                    metric.reason = "history_reset_after_sample_gap"
        return Snapshot(
            subject_id=batch.subject_id, session_id=batch.session_id, source=batch.source,
            simulated=batch.simulated, sequence=batch.sequence, data_end_s=batch.end_s,
            observed_at_utc=now, quality=quality, metrics=metrics, waveform=waveform,
            capabilities={"pulse_rate": "prototype", "ppg_rmssd": "prototype_prv_not_ecg_hrv",
                          "spo2": spo2_status, "rhythm": "not_implemented",
                          "red_flags": "disabled_no_reviewed_rules"},
        )

    def _metric(self, batch, quality, now, window, kind):
        duration = 0.0 if self.segment_start is None else max(
            0.0, batch.end_s - self.segment_start - self.settle_s)
        metric = Metric(
            unit="bpm" if kind == "pulse" else "ms", status="warming_up",
            reason="need_contiguous_usable_samples", method="causal_butterworth_peak_intervals_v1",
            measured_start_s=max(batch.t0_s if self.segment_start is None else self.segment_start,
                                 batch.end_s - window),
            measured_end_s=batch.end_s, window_s=window, valid_window_s=min(window, duration),
            computed_at_utc=now, valid_until_utc=now + timedelta(seconds=3),
        )
        if quality.status != "usable":
            metric.status = "poor_quality"
            metric.reason = ",".join(quality.reasons)
            return metric
        if duration + 1e-6 < window:
            return metric
        t = np.asarray(self.times)
        x = np.asarray(self.filtered)
        # A margin allows peak prominence to be determined at the left edge;
        # only complete intervals in the requested window enter the result.
        mask = t >= batch.end_s - window - 1.0
        t, x = t[mask], x[mask]
        peaks, _ = find_peaks(
            x, distance=max(1, int(batch.sample_rate_hz * 0.25)),
            prominence=max(1e-12, float(np.std(x)) * 0.6),
        )
        peak_times = t[peaks]
        peak_times = peak_times[peak_times >= batch.end_s - window]
        if len(peak_times) < (4 if kind == "prv" else 3):
            metric.status = "insufficient_beats"
            metric.reason = "too_few_detected_pulses_not_a_diagnosis"
            return metric
        intervals_ms = np.diff(peak_times) * 1000
        # Do not discard variable intervals just because they are irregular.
        value = (60000 / float(np.median(intervals_ms)) if kind == "pulse"
                 else float(np.sqrt(np.mean(np.diff(intervals_ms) ** 2))))
        metric.value = round(value, 3)
        metric.status = "valid"
        metric.reason = None
        return metric
