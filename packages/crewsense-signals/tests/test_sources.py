import csv
import json

import pytest

from crewsense_signals.ppg.sources import bidmc_batches, jsonl_batches, synthetic_batches


def write_csv(path, times, values):
    with path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Time [s]", " PLETH"])
        writer.writerows(zip(times, values))


def test_bidmc_rounded_timestamps_recovered_without_losing_samples(tmp_path):
    path = tmp_path / "bidmc_01_Signals.csv"
    # At 100 seconds the original CSV precision rounds to hundredths.
    write_csv(path, [f"{100 + i/125:.5g}" for i in range(250)], [1 + i / 250 for i in range(250)])
    result = list(bidmc_batches(path))
    assert len(result) == 2
    assert result[0].sample_rate_hz == 125
    assert result[1].t0_s == 101
    assert sum(r.sample_count for r in result) == 250
    assert result[0].source == "public_replay"
    assert result[0].simulated is False


def test_bidmc_missing_rows_rejected_instead_of_silently_resampled(tmp_path):
    path = tmp_path / "bad.csv"
    write_csv(path, [i / 125 + (0.1 if i >= 100 else 0) for i in range(250)], [1.] * 250)
    with pytest.raises(ValueError, match="125 Hz grid"):
        list(bidmc_batches(path))


def test_recorded_live_is_not_labelled_live_on_replay(tmp_path):
    data = next(synthetic_batches()).model_dump()
    data.update(source="live", simulated=False)
    path = tmp_path / "recording.jsonl"
    path.write_text(json.dumps(data) + "\n")
    result = next(jsonl_batches(path))
    assert result.source == "recorded_live"
    assert result.simulated is False


def test_bad_jsonl_reports_line_number(tmp_path):
    path = tmp_path / "bad.jsonl"
    path.write_text("\n{}\n")
    with pytest.raises(ValueError, match="line 2"):
        list(jsonl_batches(path))
