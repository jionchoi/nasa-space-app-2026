"""Explicit research inference; never inject unapproved BP into the live service."""
import argparse
import json

import numpy as np
from .cpu import CPUModel


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", required=True)
    p.add_argument("--input", required=True, help="NPZ containing x with shape (2,1024), ECG then PPG at 125Hz")
    p.add_argument("--research", action="store_true", required=True)
    args = p.parse_args()
    model = CPUModel(args.model)
    try:
        raw = np.load(args.input, allow_pickle=False)["x"]
        values = model.predict(raw)
        result = {"sbp_mmHg": float(values[0]), "dbp_mmHg": float(values[1]), "status": "research_unvalidated", "window_s": 1024/125, "service_enabled": False}
    except ValueError as exc:
        result = {"sbp_mmHg": None, "dbp_mmHg": None, "status": "unavailable", "reason": str(exc)}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
