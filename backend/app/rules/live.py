"""Judge one live VitalsFrame against thresholds.json (used for red flags and tests)."""
from __future__ import annotations

from .judge import judge, worst
from .regions import region_list


def frame_status(frame: dict, thresholds: dict, regions_cfg: dict) -> dict:
    """{"vitals": {field: status}, "regions": {region_id: status}} for the live-driven regions."""
    vitals: dict[str, str] = {}
    regions: dict[str, str] = {}
    for region in region_list(regions_cfg):
        fields = region.get("live_metrics", [])
        for field in fields:
            entry = thresholds.get(field)
            if isinstance(entry, dict) and frame.get(field) is not None:
                vitals[field] = judge(float(frame[field]), entry)
        if fields:
            regions[region["id"]] = worst([vitals[f] for f in fields if f in vitals])
    return {"vitals": vitals, "regions": regions}
