"""Batch-one CPU inference without importing PyTorch or scikit-learn."""
import json
from pathlib import Path
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from .preprocessing import preprocess


class CPUModel:
    def __init__(self, path: str | Path):
        with np.load(path, allow_pickle=False) as data:
            self.metadata = json.loads(str(data["metadata"]))
            self.weights = {k: data[k].copy() for k in data.files if k != "metadata"}
        if self.metadata.get("architecture") != "TinyBP_numpy_v1" or self.metadata.get("preprocessing") != "window_filters_zscore_v1":
            raise ValueError("Unsupported CPU artifact")
        if self.metadata.get("sample_rate_hz") != 125 or self.metadata.get("samples") != 1024 or self.metadata.get("channels") != ["ECG", "PPG"]:
            raise ValueError("Wrong input contract")
        if any(not np.isfinite(v).all() for v in self.weights.values()):
            raise ValueError("Nonfinite model artifact")

    def forward_normalized(self, x):
        a = np.asarray(x, dtype=np.float32)
        if a.shape != (2, 1024):
            raise ValueError("Expected normalized ECG+PPG shape (2,1024)")
        for i in range(5):
            w, b = self.weights[f"conv_{i}_weight"], self.weights[f"conv_{i}_bias"]
            kernel = w.shape[-1]
            padded = np.pad(a, ((0, 0), (kernel // 2, kernel // 2)))
            windows = sliding_window_view(padded, kernel, axis=1)[:, ::2, :]
            matrix = windows.transpose(1, 0, 2).reshape(windows.shape[1], -1)
            a = np.maximum(matrix @ w.reshape(w.shape[0], -1).T + b, 0).T
        a = a.reshape(64, 8, 4).mean(axis=2).reshape(-1)
        a = np.maximum(self.weights["linear_0_weight"] @ a + self.weights["linear_0_bias"], 0)
        return self.weights["linear_1_weight"] @ a + self.weights["linear_1_bias"]

    def predict(self, raw):
        prediction = self.forward_normalized(preprocess(raw)) * self.weights["target_scale"] + self.weights["target_mean"]
        if not np.isfinite(prediction).all() or prediction[0] <= prediction[1]:
            raise ValueError("Invalid blood pressure prediction")
        return prediction
