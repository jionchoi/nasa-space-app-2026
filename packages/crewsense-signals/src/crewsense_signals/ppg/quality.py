"""Conservative optical checks, not a validated motion/contact classifier.

Do not use beat interval regularity as a quality criterion: that would discard
the irregular pulses that a subsequent rhythm screener must examine.
"""
import numpy as np

from .schemas import Quality, RawBatch


def assess(batch: RawBatch) -> Quality:
    reasons = []
    for name, values in batch.channels.items():
        x = np.asarray(values, dtype=float)
        amplitude = float(np.ptp(x))
        if amplitude <= max(1e-10, float(np.max(np.abs(x))) * 1e-8):
            reasons.append(f"{name}:flatline_or_contact_loss")
            continue
        if batch.unit == "adc":
            if np.any(x < 0):
                reasons.append(f"{name}:invalid_adc")
            if batch.adc_max is not None:
                if np.any(x > batch.adc_max):
                    reasons.append(f"{name}:invalid_adc")
                rail_fraction = np.mean((x <= 0) | (x >= batch.adc_max))
                if rail_fraction >= 0.02:
                    reasons.append(f"{name}:adc_clipping")
        # Detect dominant broadband noise; low-frequency motion can pass this
        # preliminary check and is explicitly an unvalidated limitation.
        if len(x) >= batch.sample_rate_hz * 0.5:
            spectrum = np.abs(np.fft.rfft((x - x.mean()) * np.hanning(len(x)))) ** 2
            frequencies = np.fft.rfftfreq(len(x), 1 / batch.sample_rate_hz)
            total = spectrum[frequencies >= 0.3].sum()
            high = spectrum[frequencies >= 8].sum()
            if total > 0 and high / total > 0.60:
                reasons.append(f"{name}:high_frequency_noise")
    return Quality(status="unusable" if reasons else "usable", reasons=reasons)
