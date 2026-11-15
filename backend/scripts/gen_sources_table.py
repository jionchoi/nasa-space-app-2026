"""Regenerate the README "Data" sources table from backend/data/sources.json. Offline, stdlib only.

Run from backend/:  python scripts/gen_sources_table.py
Replaces everything between the two <!-- sources-table --> markers in README.md (the markers stay).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "backend" / "data" / "sources.json"
README = ROOT / "README.md"
MARKER = "<!-- sources-table -->"


def cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def table(data: dict) -> str:
    uses = "; ".join(f"{k} = {v}" for k, v in data.get("uses", {}).items())
    rows = ["| Source | Agency | Used for | App locations | Real / simulated / estimated |", "|---|---|---|---|---|"]
    for s in data["sources"]:
        used = f"{', '.join(s['use'])}: {'; '.join(s['used_for'])}."
        if s.get("used_for_review"):
            used += f" ({s['used_for_review']})"
        if s.get("validation"):
            used += f" {s['validation']['label']}: {s['validation']['value']}."
        status = s["status"] + (f" ({s['status_note']})" if s.get("status_note") else "")
        rows.append("| " + " | ".join(cell(x) for x in (s["name"], s["agency"], used, ", ".join(s["locations"]), status)) + " |")
    return (f"Data sources (also on the in-app `/sources` page; generated from `backend/data/sources.json` by "
            f"`backend/scripts/gen_sources_table.py`). Uses: {uses}. TO FILL IN = still to be added by the owner.\n\n"
            + "\n".join(rows) + "\n")


def main() -> int:
    text = README.read_text(encoding="utf-8")
    if text.count(MARKER) != 2:
        print(f"README.md needs exactly two {MARKER} markers (found {text.count(MARKER)})")
        return 1
    a = text.index(MARKER) + len(MARKER)
    b = text.index(MARKER, a)
    new = text[:a] + "\n" + table(json.loads(SOURCES.read_text(encoding="utf-8"))) + "\n" + text[b:]
    if new != text:
        README.write_text(new, encoding="utf-8")
        print("README.md sources table updated")
    else:
        print("README.md sources table already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
