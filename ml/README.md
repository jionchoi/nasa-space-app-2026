# ml/

**Owner: Jian** (with Jion for wiring into the backend).

Forecasting and anomaly models: notebooks, training scripts and experiments.

- What runs in the app today lives in `backend/app/rules/forecast.py`: a straight-line fit for "time to act" and an
  Isolation Forest for "unusual for you". Prototype better models here, then move the final version into
  `backend/app/rules/` so the app keeps running offline with no extra services.
- Models must read thresholds from `backend/data/thresholds.json`; never hard-code medical limits.
- Large datasets go in `data/raw/` (git-ignored), not here.
