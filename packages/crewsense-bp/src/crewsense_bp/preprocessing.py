"""Shared window-local preprocessing; NumPy/SciPy only."""
import numpy as np
from scipy.signal import butter, sosfiltfilt

SAMPLE_RATE = 125
WINDOW = 1024
FILTERS = (butter(3, [0.5, 40], btype="bandpass", fs=SAMPLE_RATE, output="sos"),
           butter(3, [0.5, 12], btype="bandpass", fs=SAMPLE_RATE, output="sos"))


def preprocess(raw: np.ndarray) -> np.ndarray:
    """Use only this completed past window, identically offline and online."""
    a = np.asarray(raw, dtype=np.float64)
    if a.shape != (2, WINDOW) or not np.isfinite(a).all():
        raise ValueError("Expected finite synchronized ECG+PPG, shape (2, 1024), 125Hz")
    out = []
    for channel, sos in zip(a, FILTERS):
        if np.ptp(channel) <= 1e-8 or np.unique(channel).size < 20:
            raise ValueError("Flat or highly quantized input")
        _, counts = np.unique(channel, return_counts=True)
        if counts.max() / len(channel) > 0.25:
            raise ValueError("Input stuck or clipped")
        filtered = sosfiltfilt(sos, channel)
        std = filtered.std()
        if std < 1e-8:
            raise ValueError("No usable waveform")
        out.append(np.clip((filtered - filtered.mean()) / std, -8, 8))
    return np.asarray(out, dtype=np.float32)
