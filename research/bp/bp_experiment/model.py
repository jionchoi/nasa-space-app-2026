"""Own small CNN implementation. No Shallow U-Net code or weights are copied."""
from __future__ import annotations

import numpy as np
import torch
from torch import nn
from .preprocessing import preprocess


class TinyBP(nn.Module):
    def __init__(self):
        super().__init__()
        blocks = []
        previous = 2
        for width, kernel in ((16, 9), (24, 7), (48, 5), (64, 5), (64, 3)):
            blocks.extend([nn.Conv1d(previous, width, kernel, stride=2, padding=kernel // 2),
                           nn.BatchNorm1d(width), nn.ReLU()])
            previous = width
        self.features = nn.Sequential(*blocks, nn.AdaptiveAvgPool1d(8))
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(64 * 8, 32), nn.ReLU(), nn.Dropout(0.1), nn.Linear(32, 2))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


def load_model(path):
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    model = TinyBP().cpu().eval()
    model.load_state_dict(checkpoint["state_dict"])
    return model, np.array(checkpoint["target_mean"], dtype=np.float32), np.array(checkpoint["target_scale"], dtype=np.float32)


def predict_window(model, raw, mean, scale) -> np.ndarray:
    x = preprocess(raw)
    with torch.inference_mode():
        prediction = model(torch.from_numpy(x[None])).numpy()[0] * scale + mean
    if not np.isfinite(prediction).all() or prediction[0] <= prediction[1]:
        raise ValueError("Invalid blood pressure prediction")
    return prediction


def export_cpu(model, mean, scale, path):
    """Fold evaluation BatchNorm into convolution weights; no quantization."""
    import json
    if model.training:
        raise ValueError("Export requires evaluation mode")
    arrays = {}
    for i in range(5):
        conv, norm = model.features[3*i], model.features[3*i+1]
        factor = norm.weight.detach() / torch.sqrt(norm.running_var + norm.eps)
        arrays[f"conv_{i}_weight"] = (conv.weight.detach() * factor[:, None, None]).numpy()
        arrays[f"conv_{i}_bias"] = ((conv.bias.detach() - norm.running_mean) * factor + norm.bias.detach()).numpy()
    for i, index in enumerate((1, 4)):
        layer = model.head[index]
        arrays[f"linear_{i}_weight"] = layer.weight.detach().numpy()
        arrays[f"linear_{i}_bias"] = layer.bias.detach().numpy()
    arrays["target_mean"] = np.asarray(mean, dtype=np.float32)
    arrays["target_scale"] = np.asarray(scale, dtype=np.float32)
    arrays["metadata"] = np.array(json.dumps({"architecture": "TinyBP_numpy_v1", "preprocessing": "window_filters_zscore_v1",
        "sample_rate_hz": 125, "samples": 1024, "channels": ["ECG", "PPG"], "research_only": True}))
    np.savez_compressed(path, **arrays)
