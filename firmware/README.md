# firmware/

**Owner: Jian.** ESP32 + MAX30102 code for the clip-on PPG sensor.

How the sensor reaches the app (no internet needed, laptop on the same local network or USB bridge):

- Connect to the backend WebSocket `ws://<laptop>:8000/ws/sensor` and send JSON messages, one of:
  - a ready VitalsFrame: `{ "hr": 72, "hrv_rmssd": 42, "spo2": 98, "rr": 14, "signal_quality": 0.92, "irregular": false }`
    (`t` and `source` are filled in by the backend), or
  - raw samples: `{ "samples": [ ... ], "fs": 100 }`. The backend buffers 10 s windows and calls
    `compute_vitals(signal, fs)` in `backend/app/ppg/`.
- If no sensor frame arrives for 3 s, the app falls back to the persona replay automatically.
- To test without hardware: `python backend/scripts/fake_sensor.py --persona A` (see the main README).
