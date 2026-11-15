import numpy as np
import pytest
from pydantic import ValidationError

from crewsense_signals.ppg.pipeline import Pipeline
from crewsense_signals.ppg.schemas import RawBatch, invalidate
from crewsense_signals.ppg.sources import synthetic_batches


@pytest.mark.parametrize("bpm", [35, 45, 72, 150, 220])
def test_known_pulse_rate_over_a_wide_range(bpm):
    p = Pipeline()
    results = [p.process(b) for b in synthetic_batches(duration_s=25, bpm=bpm)]
    assert results[0].metrics["pulse_rate_bpm"].value is None
    assert results[-1].metrics["pulse_rate_bpm"].value == pytest.approx(bpm, abs=2.5)
    assert results[-1].simulated is True


def test_prv_needs_a_full_contiguous_window_and_is_not_labelled_ecg_hrv():
    p = Pipeline()
    results = [p.process(b) for b in synthetic_batches(duration_s=65)]
    assert results[60].metrics["ppg_rmssd_ms"].value is None
    assert results[61].metrics["ppg_rmssd_ms"].status == "valid"
    assert results[61].metrics["ppg_rmssd_ms"].value < 12
    assert "ecg_hrv" not in results[-1].metrics


def test_flat_signal_invalidates_current_vitals_then_rewarms():
    p = Pipeline()
    results = [p.process(b) for b in synthetic_batches(90, scenario="dropout")]
    assert results[24].metrics["pulse_rate_bpm"].status == "valid"
    assert results[25].quality.status == "unusable"
    assert results[25].metrics["pulse_rate_bpm"].value is None
    assert results[30].metrics["pulse_rate_bpm"].status == "warming_up"
    assert results[38].metrics["pulse_rate_bpm"].value is None
    assert results[39].metrics["pulse_rate_bpm"].status == "valid"
    assert results[-1].metrics["ppg_rmssd_ms"].value is None


def test_noise_is_not_reported_as_a_valid_measurement():
    p = Pipeline()
    results = [p.process(b) for b in synthetic_batches(40, scenario="noise")]
    assert results[26].quality.status == "unusable"
    assert results[26].metrics["pulse_rate_bpm"].value is None


def test_irregular_intervals_do_not_fail_optical_quality_for_being_irregular():
    p = Pipeline()
    results = [p.process(b) for b in synthetic_batches(65, scenario="irregular")]
    assert all(r.quality.status == "usable" for r in results)
    assert results[-1].metrics["ppg_rmssd_ms"].value > 12
    assert results[-1].alerts == []  # No unreviewed clinical rhythm rule.


def test_gap_clears_history_and_never_bridges_intervals():
    p = Pipeline()
    batches = list(synthetic_batches(80))
    for b in batches[:65]:
        p.process(b)
    after = p.process(batches[67])
    assert after.quality.reasons == ["sample_gap"]
    assert after.metrics["ppg_rmssd_ms"].value is None
    assert after.metrics["pulse_rate_bpm"].status == "gap"
    assert p.process(batches[68]).metrics["pulse_rate_bpm"].status == "warming_up"


def test_context_or_repeated_samples_cannot_poison_a_running_session():
    p = Pipeline()
    b = next(synthetic_batches())
    p.process(b)
    with pytest.raises(ValueError, match="duplicate"):
        p.process(b)
    with pytest.raises(ValueError, match="context"):
        p.process(b.model_copy(update={"subject_id": "someone-else", "sequence": 1, "t0_s": 1}))


def test_overlap_is_rejected_before_state_changes():
    p = Pipeline()
    batches = list(synthetic_batches(3))
    p.process(batches[0])
    with pytest.raises(ValueError, match="overlapping"):
        p.process(batches[1].model_copy(update={"t0_s": 0.5}))
    assert p.process(batches[1]).quality.status == "usable"


def test_only_past_data_and_stateful_filtering_used():
    batches = list(synthetic_batches(12))
    p = Pipeline()
    joined = []
    for b in batches:
        joined.extend(p.process(b).waveform["filtered_ppg"])
    # A different transport packetization must not change the causal filter.
    q = Pipeline()
    split = []
    for b in batches:
        values = b.channels["ppg"]
        for j, (a, z) in enumerate([(0, 62), (62, 125)]):
            small = b.model_copy(update={"sequence": b.sequence * 2 + j,
                                        "t0_s": b.t0_s + a / 125,
                                        "channels": {"ppg": values[a:z]}})
            split.extend(q.process(small).waveform["filtered_ppg"])
    np.testing.assert_allclose(joined, split, rtol=1e-10, atol=1e-10)


@pytest.mark.parametrize("update", [
    {"channels": {"ppg": [float("nan")] * 125}},
    {"channels": {"ppg": [1.] * 125, "red": [1.] * 124}},
    {"simulated": False}, {"sample_rate_hz": 0},
])
def test_invalid_input_fails_explicitly(update):
    data = next(synthetic_batches()).model_dump()
    data.update(update)
    with pytest.raises(ValidationError):
        RawBatch.model_validate(data)


def test_spo2_never_fabricated_and_ended_values_are_cleared():
    p = Pipeline()
    for b in synthetic_batches(15):
        result = p.process(b)
    assert result.metrics["spo2_pct"].status == "unsupported_channel"
    assert result.metrics["spo2_pct"].value is None
    stopped = invalidate(result, "ended")
    assert all(m.value is None for m in stopped.metrics.values())
    assert stopped.quality.status == "unknown"
    assert result.metrics["pulse_rate_bpm"].value is not None


def test_two_optical_channels_are_still_not_calibrated_spo2():
    data = next(synthetic_batches()).model_dump()
    x = data["channels"]["ppg"]
    data["channels"] = {"red": x, "ir": x}
    result = Pipeline().process(RawBatch.model_validate(data))
    assert result.metrics["spo2_pct"].status == "unvalidated"
    assert result.metrics["spo2_pct"].value is None


def test_adc_saturation_rejected():
    data = next(synthetic_batches()).model_dump()
    data.update(unit="adc", adc_max=262143, channels={"ir": [262143.] * 120 + [250000.] * 5})
    result = Pipeline().process(RawBatch.model_validate(data))
    assert result.quality.status == "unusable"
    assert result.metrics["pulse_rate_bpm"].value is None
