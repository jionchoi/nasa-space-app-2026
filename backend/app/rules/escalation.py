"""Status -> advice level (data/escalation.json). The environment changes the text, not the level."""
from __future__ import annotations

LEVEL_ORDER = ["self", "crew", "surgeon_next", "surgeon_now"]


def advice_level(status: str, regions_yellow_or_worse: int, cfg: dict) -> str:
    level = cfg["status_to_level"][status]
    if status == "yellow" and regions_yellow_or_worse >= cfg.get("crew_if_regions_yellow", 2):
        level = "crew"
    return level


def advice_text(level: str, env: str, cfg: dict) -> str:
    """The level's advice for this location. The rover ("rover:mars") uses its planet's text (store.env_keys)."""
    from .. import store  # local import: rules stay free of file access at import time

    for item in cfg["levels"]:
        if item["id"] == level:
            return store.pick_for_env(item["advice"], env) or ""
    return ""


def overall_level(statuses: list[dict]) -> str:
    return max((s["advice_level"] for s in statuses), key=LEVEL_ORDER.index, default="self")
