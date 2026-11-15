"""One processor per subject/session/device; bounded publication and no mock failover."""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import time
import uuid

from crewsense_signals.ppg.pipeline import Pipeline
from crewsense_signals.ppg.schemas import invalidate
from crewsense_signals.ppg.sources import synthetic_batches, bidmc_batches, jsonl_batches
from .bp import BPBuffer
from .models import SessionRequest, WaveformBatch
from . import storage
from .. import store


def new_pipeline() -> Pipeline:
    """A pipeline with the pulse-rate plausibility limits from thresholds.json "plausible.hr"."""
    band = (store.thresholds().get('plausible') or {}).get('hr') or [None, None]
    return Pipeline(pulse_range_bpm=tuple(band))


def now():
    return datetime.now(timezone.utc).isoformat()


def recording_path(name: str) -> Path:
    root = os.getenv('COPILOT_RECORDINGS_DIR')
    if not root:
        raise ValueError('COPILOT_RECORDINGS_DIR is not configured')
    base = Path(root).resolve()
    p = (base / name).resolve()
    if not p.is_relative_to(base) or not p.is_file() or p.suffix not in {'.csv', '.jsonl'}:
        raise ValueError('recording must be a registered CSV or JSONL inside the recordings directory')
    if p.suffix == '.csv':
        with p.open(encoding='utf-8-sig') as handle:
            header = handle.readline()
        if 'Time [s]' not in header or 'PLETH' not in header:
            raise ValueError('CSV must contain original BIDMC Time [s] and PLETH columns')
    if p.stat().st_size > 100 * 1024 * 1024:
        raise ValueError('recording exceeds 100 MiB limit')
    return p


class Session:
    def __init__(self, req: SessionRequest):
        self.id = uuid.uuid4().hex
        self.req = req
        self.pipeline = new_pipeline()
        self.bp = None
        if req.enable_research_bp:
            self.bp = BPBuffer()
            if self.bp.model is None:
                raise ValueError(f'Optional research BP unavailable: {self.bp.disabled_reason}')
        self.latest = None
        self.state = 'starting'
        self.error = None
        self.lock = asyncio.Lock()
        self.queues = set()
        self.history = deque(maxlen=20000)
        self.bp_history = deque(maxlen=2000)
        self.tasks = []
        self.ingesting = False
        self.stopped = False
        self.last_at = time.monotonic()
        self.created_at = now()
        self.signature = None
        self.last_sequence = None
        self.next_t = None
        self.file = recording_path(req.recording) if req.input in {'bidmc', 'recording'} else None
        self.recording_hash = hashlib.sha256(self.file.read_bytes()).hexdigest() if self.file else None

    def info(self):
        return {'id': self.id, 'subject_id': self.req.subject_id, 'device_id': self.req.device_id,
                'mode': self.req.mode, 'input': self.req.input, 'source': self.req.source,
                'recording': self.req.recording,
                'enable_research_bp': self.req.enable_research_bp,
                'simulated': self.req.source == 'synthetic', 'status': self.state,
                'error': self.error, 'created_at': self.created_at, 'recording_sha256': self.recording_hash,
                'latest': self.latest.model_dump(mode='json') if self.latest else None,
                'blood_pressure': self.bp.result if self.bp else None}

    def message(self):
        return {'message_type': 'signal_session', **self.info()}

    def publish(self):
        payload = self.message()
        for q in tuple(self.queues):
            if q.full():
                q.get_nowait()
            q.put_nowait(payload)

    def subscribe(self):
        q = asyncio.Queue(maxsize=2)
        self.queues.add(q); q.put_nowait(self.message())
        return q

    async def process(self, batch: WaveformBatch):
        async with self.lock:
            if self.stopped or self.state in {'ended', 'error'}:
                raise ValueError('session is closed; create a new session')
            if (batch.subject_id, batch.session_id, batch.device_id, batch.source) != (
                    self.req.subject_id, self.id, self.req.device_id, self.req.source):
                raise ValueError('batch identity or source does not match registered session')
            b = batch.ppg_batch()
            signature = (b.sample_rate_hz, b.unit, tuple(sorted(b.channels)), b.adc_max)
            if self.signature is not None and signature != self.signature:
                raise ValueError('device format changed; create a new session')
            if self.last_sequence is not None and b.sequence <= self.last_sequence:
                raise ValueError('duplicate or out-of-order batch')
            if self.next_t is not None and b.t0_s < self.next_t - .25/b.sample_rate_hz:
                raise ValueError('overlapping or backward samples')
            if self.state == 'stale':
                self.pipeline = new_pipeline()
                if self.bp is not None:
                    self.bp.reset('source_stale')
            result = await asyncio.to_thread(self.pipeline.process, b)
            self.signature, self.last_sequence, self.next_t = signature, b.sequence, b.end_s
            if self.bp is not None:
                self.bp.result = await asyncio.to_thread(self.bp.process, batch, result.quality)
                if self.bp.result.get('status') == 'research_unvalidated':
                    if not self.bp_history or self.bp_history[-1]['measured_end_s'] != self.bp.result['measured_end_s']:
                        self.bp_history.append(dict(self.bp.result))
            self.latest, self.state = result, 'running'
            self.last_at = time.monotonic()
            # Preserve measured output for checks, not raw waveforms.
            self.history.append(result.model_copy(update={'waveform': {}}, deep=True))
            self.publish()

    async def invalidate(self, state, error=None, watchdog=False):
        async with self.lock:
            if watchdog and (self.state != "running" or time.monotonic() - self.last_at <= 3):
                return
            self.state, self.error = state, error
            if self.latest is not None:
                self.latest = invalidate(self.latest, state)
            if self.bp is not None:
                self.bp.reset(f'source_{state}')
            self.publish()
            storage.save_session(self)

    async def watchdog(self):
        while not self.stopped:
            await asyncio.sleep(.25)
            if self.state == 'running' and time.monotonic() - self.last_at > 3:
                await self.invalidate('stale', watchdog=True)

    def batches(self):
        if self.req.input == 'synthetic':
            return synthetic_batches(self.req.duration_s, scenario=self.req.scenario)
        if self.req.input == 'bidmc':
            return bidmc_batches(self.file)
        return jsonl_batches(self.file)

    async def replay(self):
        try:
            iterator = iter(self.batches())
            deadline = time.monotonic()
            async with self.lock:
                self.state = 'starting'
            while not self.stopped:
                b = await asyncio.to_thread(next, iterator, None)
                if b is None:
                    await self.invalidate('ended'); return
                if b.source != self.req.source:
                    raise ValueError('recording source differs from requested source')
                deadline += b.sample_count / b.sample_rate_hz / self.req.speed
                await asyncio.sleep(max(0, deadline-time.monotonic()))
                data = b.model_dump() | {'subject_id': self.req.subject_id, 'session_id': self.id,
                                        'device_id': self.req.device_id}
                await self.process(WaveformBatch.model_validate(data))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.invalidate('error', type(exc).__name__ + ': ' + str(exc))

    async def start(self):
        storage.save_session(self)
        self.tasks.append(asyncio.create_task(self.watchdog()))
        if self.req.input != 'ingest':
            self.tasks.append(asyncio.create_task(self.replay()))

    async def stop(self):
        self.stopped = True
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await self.invalidate('ended')


class Registry:
    def __init__(self):
        self.sessions = {}

    def get(self, sid):
        if sid not in self.sessions:
            raise KeyError('session not active in this process')
        return self.sessions[sid]

    async def create(self, req):
        active = [s for s in self.sessions.values() if not s.stopped and s.state not in {'ended','error'}]
        if len(active) >= 8:
            raise ValueError('maximum 8 active sessions; stop an existing session')
        if any(s.req.device_id == req.device_id for s in active):
            raise ValueError('device already belongs to an active session')
        for key,s in list(self.sessions.items()):
            if len(self.sessions) >= 32 and (s.stopped or s.state in {'ended','error'}):
                await s.stop(); del self.sessions[key]
        session = Session(req)
        self.sessions[session.id] = session
        await session.start()
        return session

    async def close(self):
        for s in list(self.sessions.values()):
            await s.stop()
        self.sessions.clear()


registry = Registry()
