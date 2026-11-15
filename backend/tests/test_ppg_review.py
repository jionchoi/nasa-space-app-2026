"""PPG review (docs/ppg-review.md, section 3): robustness of the merged PPG pipeline and signal runtime.

Normal tests record what the code does today. Tests marked xfail(strict=True) are REQUIREMENTS FROM THE REVIEW THAT
ARE NOT MET YET: they fail now on purpose; when a fix lands they start passing and strict mode makes the run fail,
so the marker gets removed. No production code is changed by this file.
"""
import asyncio
import time
import tracemalloc

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.signals import runtime
from app.signals.models import SessionRequest, WaveformBatch
from app.signals.runtime import Session
from crewsense_signals.ppg.pipeline import Pipeline
from crewsense_signals.ppg.schemas import RawBatch

FS = 125


def pulse(fs=FS, seconds=20, bpm=72, amp=0.12, noise=0.0007, seed=0):
    """Same shape as the package's synthetic waveform: a pulse plus a small second harmonic and a little noise."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * fs)) / fs
    phase = 2 * np.pi * bpm / 60 * t
    return 1 + amp * (np.sin(phase) + 0.22 * np.sin(2 * phase - 0.7)) + rng.normal(0, noise, len(t))


def run(x, fs=FS, shift=None, unit="arbitrary", adc_max=None):
    """Feed 1 s batches; returns [(end_s, status, value, quality reasons)] for pulse_rate_bpm."""
    pipe, rows = Pipeline(), []
    for seq, start in enumerate(range(0, len(x) - fs + 1, fs)):
        b = RawBatch(subject_id="s", session_id="s", source="synthetic", simulated=True, sequence=seq,
                     t0_s=start / fs + (shift(seq) if shift else 0), sample_rate_hz=fs, unit=unit, adc_max=adc_max,
                     channels={"ppg": x[start:start + fs].tolist()})
        snap = pipe.process(b)
        m = snap.metrics["pulse_rate_bpm"]
        rows.append((round(b.end_s, 1), m.status, m.value, snap.quality.reasons, snap))
    return rows


def statuses(rows, start, end):
    return {r[1] for r in rows if start < r[0] <= end}


def any_pulse_lost(rows):
    """pulse_lost would have to appear somewhere in a snapshot: a metric, an alert or a status. Nothing emits it today."""
    return any("pulse_lost" in r[4].model_dump_json() for r in rows)


# ---------- inputs ----------

def test_clean_signal_gives_pulse_after_warm_up():
    rows = run(pulse(seconds=20))
    assert statuses(rows, 0, 9) == {"warming_up"}  # 8 s window + 2 s settling: first value at 10 s
    assert all(r[1] == "valid" and r[2] == pytest.approx(72, abs=1) for r in rows if r[0] >= 10)


def test_noise_only_is_poor_signal_at_125_hz():
    rows = run(1 + np.random.default_rng(1).normal(0, 0.1, FS * 20))
    assert statuses(rows, 0, 20) == {"poor_quality"}
    assert all("high_frequency_noise" in r[3][0] for r in rows)


def test_noise_only_at_25_hz_passes_the_quality_check():
    """Finding: at 25 Hz little of the spectrum lies above 8 Hz, so the noise check fires only on some batches; the
    others count as usable. No number appeared within 20 s because each rejected batch restarts the warm-up."""
    rows = run(1 + np.random.default_rng(1).normal(0, 0.1, 25 * 20), fs=25)
    assert statuses(rows, 0, 20) == {"poor_quality", "warming_up"}


def test_flat_line_is_poor_signal_never_pulse_lost():
    rows = run(np.ones(FS * 12))
    assert statuses(rows, 0, 12) == {"poor_quality"}
    assert all(r[3] == ["ppg:flatline_or_contact_loss"] for r in rows)
    assert not any_pulse_lost(rows)


def test_flat_with_sensor_noise_is_poor_signal():
    rows = run(1 + np.random.default_rng(2).normal(0, 0.0007, FS * 12))
    assert statuses(rows, 0, 12) == {"poor_quality"}
    assert all(r[3] == ["ppg:high_frequency_noise"] for r in rows)


def test_clipping_is_only_detected_for_adc_input():
    clipped = np.clip(pulse(amp=0.4), 0.9, 1.1)
    assert "poor_quality" not in statuses(run(clipped), 0, 20)  # unit "arbitrary": no clipping check
    adc = np.clip((pulse(amp=0.4) - 0.8) * 2500, 0, 1023)  # sits on both rails for a large share of samples
    rows = run(adc, unit="adc", adc_max=1023)
    assert statuses(rows, 0, 20) == {"poor_quality"} and all("ppg:adc_clipping" in r[3] for r in rows)


def motion_burst():
    x = pulse(seconds=30)
    t = np.arange(len(x)) / FS
    return x + ((t > 12) & (t < 16)) * 1.5 * np.sin(2 * np.pi * 1.7 * t)  # 4 s arm movement at 1.7 Hz


def test_motion_burst_is_poor_signal_never_a_wrong_valid_pulse():
    """Fixed Nov 15 (was: ~103 bpm shown as valid for ~9 s)."""
    rows = run(motion_burst())
    assert not [r for r in rows if r[1] == "valid" and abs(r[2] - 72) > 5]
    burst = [r for r in rows if 12 < r[0] <= 16]
    assert burst and all(r[1] == "poor_quality" and r[3] == ["ppg:motion_artifact"] for r in burst)
    assert rows[-1][1] == "valid" and rows[-1][2] == pytest.approx(72, abs=1)  # back after the warm-up


def pulse_stops(seconds_stopped):
    x = pulse(seconds=30)
    t = np.arange(len(x)) / FS
    stop = (t >= 14) & (t < 14 + seconds_stopped)
    x[stop] = 1 + np.random.default_rng(3).normal(0, 0.0007, stop.sum())  # clip on, no pulse wave
    return x


def test_pulse_stopping_with_clip_on_is_reported_as_poor_signal_today():
    rows = run(pulse_stops(4))
    assert statuses(rows, 15, 18) == {"poor_quality"}
    assert not any_pulse_lost(rows)


@pytest.mark.xfail(strict=True, reason="REVIEW: no pulse_lost exists; 4 s without beats at good contact must raise it")
def test_four_seconds_without_beats_with_good_contact_raises_pulse_lost():
    assert any_pulse_lost(run(pulse_stops(4)))


def test_three_seconds_without_beats_must_not_raise_pulse_lost():
    assert not any_pulse_lost(run(pulse_stops(3)))


@pytest.mark.parametrize("gap_s", [3, 4])
def test_timestamp_gap_resets_and_rewarms_without_any_alarm(gap_s):
    rows = run(pulse(seconds=30), shift=lambda seq: gap_s if seq >= 12 else 0)
    after = [r for r in rows if r[0] > 12]
    assert after[0][1] == "gap" and after[0][3][0] == "sample_gap"
    assert {r[1] for r in after[1:9]} == {"warming_up"}  # ~10 s with no number after any gap
    assert after[-1][1] == "valid"
    assert not any_pulse_lost(rows)


def test_nan_and_short_buffers_are_rejected():
    base = dict(subject_id="s", session_id="s", source="synthetic", simulated=True, sequence=0, t0_s=0,
                sample_rate_hz=FS)
    with pytest.raises(ValidationError, match="finite"):
        RawBatch(**base, channels={"ppg": [float("nan")] * FS})
    with pytest.raises(ValidationError, match="8..10000"):
        RawBatch(**base, channels={"ppg": [1.0] * 7})
    RawBatch(**base, channels={"ppg": [1.0] * 8})  # 8 samples is the minimum


@pytest.mark.parametrize("fs", [25, 50, 100, 125, 250])
def test_sample_rates(fs):
    rows = run(pulse(fs=fs, seconds=20), fs=fs)
    assert rows[-1][1] == "valid" and rows[-1][2] == pytest.approx(72, abs=1.5)


def test_sample_rate_below_25_hz_is_rejected():
    with pytest.raises(ValidationError):
        RawBatch(subject_id="s", session_id="s", source="synthetic", simulated=True, sequence=0, t0_s=0,
                 sample_rate_hz=20, channels={"ppg": [1.0] * 20})


@pytest.mark.parametrize("bpm", [20, 235])
def test_impossible_pulse_rates_are_invalid_never_a_value(bpm):
    """Fixed Nov 15: outside 25-220 bpm (thresholds.json plausible.hr in the app) -> out_of_range, no value."""
    rows = run(pulse(seconds=25, bpm=bpm))
    assert all(r[2] is None or 25 <= r[2] <= 220 for r in rows)
    assert "out_of_range" in {r[1] for r in rows}


def test_units():
    snap = run(pulse(seconds=12))[-1][4]
    assert snap.metrics["pulse_rate_bpm"].unit == "bpm" and snap.metrics["ppg_rmssd_ms"].unit == "ms"
    assert snap.metrics["spo2_pct"].unit == "%" and snap.metrics["spo2_pct"].value is None  # never computed
    assert set(snap.metrics) == {"pulse_rate_bpm", "ppg_rmssd_ms", "spo2_pct"}  # no breathing, rhythm or pulse_lost


# ---------- runtime: disconnect, event loop, latency, memory ----------

def ingest_request():
    return SessionRequest(subject_id="crew-r", device_id="dev-r", mode="measurement", input="ingest", source="live")


def batch_for(session, seq, x, fs=FS):
    return WaveformBatch(subject_id=session.req.subject_id, session_id=session.id, device_id=session.req.device_id,
                         source="live", simulated=False, sequence=seq, t0_s=seq * len(x) / fs, sample_rate_hz=fs,
                         channels={"ppg": list(map(float, x))})


def test_disconnect_and_reconnect_mid_stream():
    async def scenario():
        s, x = Session(ingest_request()), pulse(seconds=30)
        for seq in range(15):
            await s.process(batch_for(s, seq, x[seq * FS:(seq + 1) * FS]))
        assert s.latest.metrics["pulse_rate_bpm"].value == pytest.approx(72, abs=1)
        s.last_at = time.monotonic() - 5  # no data for 5 s: what the watchdog sees
        await s.invalidate("stale", watchdog=True)
        assert s.state == "stale" and all(m.value is None for m in s.latest.metrics.values())
        for seq in range(17, 30):  # reconnect: sequence and time continue after a 2 s hole
            await s.process(batch_for(s, seq, x[seq * FS:(seq + 1) * FS]))
            if seq == 17:
                assert s.latest.metrics["pulse_rate_bpm"].status == "warming_up"  # fresh pipeline
        assert s.state == "running" and s.latest.metrics["pulse_rate_bpm"].status == "valid"
    asyncio.run(scenario())


def test_websocket_disconnect_marks_stale_and_reconnect_is_accepted():
    with TestClient(app) as client:
        info = client.post("/api/v2/signal-sessions", json={"subject_id": "crew-ws", "device_id": "dev-ws",
                                                            "mode": "measurement", "input": "ingest", "source": "live"}).json()
        sid, x = info["id"], pulse(seconds=5)

        def send(ws, seq):
            ws.send_text(WaveformBatch(subject_id="crew-ws", session_id=sid, device_id="dev-ws", source="live",
                                       simulated=False, sequence=seq, t0_s=float(seq), sample_rate_hz=FS,
                                       channels={"ppg": x[seq * FS:(seq + 1) * FS].tolist()}).model_dump_json())
            return ws.receive_json()

        with client.websocket_connect(f"/ws/v2/ingest?session_id={sid}") as ws:
            assert send(ws, 0)["ok"] and send(ws, 1)["ok"]
        assert client.get(f"/api/v2/signal-sessions/{sid}").json()["status"] == "stale"
        with client.websocket_connect(f"/ws/v2/ingest?session_id={sid}") as ws:
            assert send(ws, 2)["ok"]
            assert client.get(f"/api/v2/signal-sessions/{sid}").json()["status"] == "running"
        client.post(f"/api/v2/signal-sessions/{sid}/stop")


def test_processing_runs_off_the_event_loop(monkeypatch):
    called = []
    real = asyncio.to_thread

    async def spy(fn, *args, **kwargs):
        called.append(getattr(fn, "__name__", str(fn)))
        return await real(fn, *args, **kwargs)

    monkeypatch.setattr(runtime.asyncio, "to_thread", spy)

    async def scenario():
        s = Session(ingest_request())
        await s.process(batch_for(s, 0, pulse(seconds=1)))
    asyncio.run(scenario())
    assert called == ["process"]  # Pipeline.process goes to a worker thread


def test_processing_time_per_batch_is_small():
    pipe, x, times = Pipeline(), pulse(seconds=60), []
    for seq in range(60):
        b = RawBatch(subject_id="s", session_id="s", source="synthetic", simulated=True, sequence=seq, t0_s=float(seq),
                     sample_rate_hz=FS, channels={"ppg": x[seq * FS:(seq + 1) * FS].tolist()})
        start = time.perf_counter()
        pipe.process(b)
        times.append(time.perf_counter() - start)
    assert np.percentile(times, 99) < 0.05  # far below the ~1 s added by 1 s batches


def test_pipeline_memory_flat_over_ten_minutes():
    pipe, x = Pipeline(), pulse(seconds=600)
    tracemalloc.start()
    marks = {}
    for seq in range(600):
        pipe.process(RawBatch(subject_id="s", session_id="s", source="synthetic", simulated=True, sequence=seq,
                              t0_s=float(seq), sample_rate_hz=FS, channels={"ppg": x[seq * FS:(seq + 1) * FS].tolist()}))
        if seq in (120, 599):
            marks[seq] = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()
    assert len(pipe.times) <= (60 + 2 + 2) * FS  # buffer capped at the PRV window
    assert marks[599] - marks[120] < 256 * 1024


def test_session_history_grows_one_snapshot_per_batch_up_to_its_cap():
    async def scenario():
        s, x = Session(ingest_request()), pulse(seconds=30)
        for seq in range(30):
            await s.process(batch_for(s, seq, x[seq * FS:(seq + 1) * FS]))
        assert len(s.history) == 30 and s.history.maxlen == 20000  # ~5.5 h at 1 batch/s before it stops growing
    asyncio.run(scenario())
