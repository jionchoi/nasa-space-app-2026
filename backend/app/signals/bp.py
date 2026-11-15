"""Gated research BP. Never publishes into health assessment or emergency rules."""
from __future__ import annotations

from collections import deque
import hashlib
import json
import os
from pathlib import Path

CONDITIONS = {
    'window_mae_within_limits', 'subject_macro_mae_within_limits',
    'beats_train_mean_each_target_by_10_percent', 'subject_macro_beats_train_mean_each_target_by_10_percent',
    'parameter_budget', 'artifact_budget', 'cpu_latency_budget', 'enough_test_patients', 'valid_pressure_order',
}


def research_bp_enabled():
    return os.getenv('COPILOT_ENABLE_RESEARCH_BP', '').lower() in {'1', 'true', 'yes'}


def configured_model():
    if not research_bp_enabled():
        return None, 'feature_disabled'

    artifact, report = os.getenv('COPILOT_BP_MODEL'), os.getenv('COPILOT_BP_REPORT')
    if not artifact or not report:
        return None, 'model_not_configured'
    try:
        p = Path(artifact)
        info = json.loads(Path(report).read_text())
        adoption = info['adoption']
        if adoption.get('passed') is not True or not all(adoption['conditions'].get(k) is True for k in CONDITIONS):
            return None, 'pilot_adoption_failed'
        if p.stat().st_size > 4 * 1024 * 1024 or hashlib.sha256(p.read_bytes()).hexdigest() != info['artifact_sha256']:
            return None, 'artifact_hash_or_size_mismatch'
        try:
            from crewsense_bp.cpu import CPUModel
        except ImportError:
            return None, 'optional_dependency_missing'
        return CPUModel(p), None
    except (OSError, ValueError, KeyError, TypeError):
        return None, 'invalid_model_or_report'


class BPBuffer:
    def __init__(self):
        self.model, self.disabled_reason = configured_model()
        self.ecg, self.ppg = deque(), deque()
        self.context = None
        self.next_t = None
        self.sequence = None
        self.result = self.unavailable(self.disabled_reason or 'ecg_required')

    def unavailable(self, reason):
        return {'systolic_mmHg': None, 'diastolic_mmHg': None, 'status': 'unavailable',
                'reason': reason, 'method': 'ecg_ppg_model', 'service_enabled': False,
                'assessment_enabled': False}

    def reset(self, reason):
        self.ecg.clear(); self.ppg.clear()
        self.result = self.unavailable(reason)

    def process(self, batch, quality):
        import numpy as np
        b = batch.ppg_batch()
        context = (b.sample_rate_hz, b.unit, tuple(sorted(batch.channels)))
        discontinuity = self.context is not None and (
            self.context != context or batch.sequence != self.sequence + 1
            or abs(batch.t0_s - self.next_t) > .25 / b.sample_rate_hz)
        self.context, self.next_t, self.sequence = context, b.end_s, b.sequence
        if discontinuity:
            self.reset('sample_gap_or_context_change')
        if self.model is None:
            return self.unavailable(self.disabled_reason)
        if 'ecg' not in batch.channels or 'ppg' not in batch.channels:
            self.reset('synchronized_ecg_ppg_required'); return self.result
        if b.sample_rate_hz != 125 or quality.status != 'usable':
            self.reset('requires_125hz_usable_synchronized_input'); return self.result
        self.ecg.extend(batch.channels['ecg']); self.ppg.extend(batch.channels['ppg'])
        while len(self.ppg) >= 1024:
            raw = np.array([[self.ecg.popleft() for _ in range(1024)],
                            [self.ppg.popleft() for _ in range(1024)]])
            try:
                values = self.model.predict(raw)
                end = b.end_s - len(self.ppg) / 125
                from datetime import datetime, timezone, timedelta
                self.result = {'systolic_mmHg': float(values[0]), 'diastolic_mmHg': float(values[1]),
                    'status': 'research_unvalidated', 'reason': None, 'method': 'ecg_ppg_model',
                    'model_version': self.model.metadata['architecture'],
                    'artifact_sha256': hashlib.sha256(Path(os.environ['COPILOT_BP_MODEL']).read_bytes()).hexdigest(),
                    'measured_start_s': end - 1024/125, 'measured_end_s': end, 'window_s': 1024/125,
                    'valid_until_utc': (datetime.now(timezone.utc)+timedelta(seconds=3)).isoformat(),
                    'service_enabled': False, 'assessment_enabled': False}
            except (ValueError, KeyError, FloatingPointError):
                self.reset('invalid_input_or_prediction')
        return self.result
