# Data resources

Rule (from CLAUDE.md): check the challenge Resources tab first. When data arrives, write a converter into our
JSON shapes, add a row here, change the on-screen badge from "Simulated" to the real source, and keep the fallback.

| Data | From | Format | Used in | Owner | Status |
|---|---|---|---|---|---|
| Personas A, B, C (daily values + 10-minute vitals stream) | `backend/scripts/make_personas.py` (simulated, fixed seed) | JSON, `backend/data/personas/` | Body map, trends, live vitals, emergency demo | Jion (numbers: Yenna) | In use, PLACEHOLDER physiology |
| Thresholds per metric | Placeholder values | JSON, `backend/data/thresholds.json` | All status colors, forecast, red flags | Yenna | PLACEHOLDER, needs sources |
| Emergency protocols (chest pain, crew member not responding), CPR guide | Draft text | JSON, `backend/data/protocols/`, `cpr.json` | Emergency mode | Yenna | DRAFT |
| Questionnaire (8 questions) | Draft text | JSON, `backend/data/questionnaire.json` | Daily check | Yenna | DRAFT |
| Challenge Resources tab (astronaut PPG / vitals) | Space Apps challenge page | Unknown | Would replace personas as the main source | Jion | To check |
| Inspiration4 crew Apple Watch HR, HRV, SpO2 | NASA OSDR | Summary values | How persona B's numbers shift in flight | Jian / Yenna | To check if downloadable |
| Earth PPG recordings | PhysioNet and similar | Waveforms | `compute_vitals()` → persona stream via `app/ppg/adapter.py` | Jian | Not started |
| Solar events | NASA DONKI API (https://api.nasa.gov/DONKI, SEP endpoint; the FLR endpoint returned 404 on Nov 13, 2026), fetched once by `backend/scripts/fetch_donki.py` | JSON: `backend/data/space_weather/donki_2024-05-01_2024-05-31.json` (raw, 14 SEP events) and `event.json` | Radiation region replay, shelter alert | Jion | In use: real event `2024-05-10T13:35:00-SEP-001` (GOES-P SEISS >10 MeV, May 2024 solar storm). Timing and ids real, **dose rate simulated** |
| Radiation dose rates | Curiosity RAD, published papers | Published values | Radiation thresholds and daily dose | Yenna | Not started |
| Medical guidelines | NASA-STD-3001, NASA HRP, published papers | Documents | `thresholds.json`, `protocols/*.json` | Yenna | Not started |
| Body map illustration | Mikael Häggström, ["Female shadow anatomy without labels"](https://commons.wikimedia.org/wiki/File:Female_shadow_anatomy_without_labels.png) (Wikimedia Commons) | PNG, trimmed and converted to WebP (`frontend/src/assets/body/body-full.webp`) | Dashboard body map (full-length figure) | Jion | In use. Public domain |
| UI fonts and icons | Geist / Geist Mono (`@fontsource-variable`), Phosphor Icons (`@phosphor-icons/react`) | npm packages, bundled locally | Whole frontend | Jion | In use. SIL OFL 1.1 (fonts), MIT (icons) |
| Cabin environment (CO2, temperature, noise) | Simulated 24 h profile, `backend/scripts/make_cabin.py` | JSON, `backend/data/cabin.json` | Cabin panel, lungs and brain-and-mood context | Jion (ranges: Yenna) | In use, SIMULATED |
