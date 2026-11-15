"""List (default) or download part of the CSA PRET open data folder into data/raw/pret/ (git-ignored).

Source: Canadian Space Agency open data, Open Government Licence - Canada
        https://donnees-data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/PRET/

Run from backend/:
    python scripts/fetch_pret.py               # print the folder tree (names, sizes, what would be downloaded)
    python scripts/fetch_pret.py --download    # download the selected files
    python scripts/fetch_pret.py --download --report --only-new   # add the Phase 3 Final Report

Walks only:
- the top level: README.txt and PRETfilestructuredescription.docx
- PRETVersions_DataAnalysisReports/ and "PRET Versions, Data, Analysis, Reports/", and inside them only
  "PRET version 4.0/" (other versions are not walked)
Selected for download: the version 4.0 PVT files only (the other five NC tests are skipped):
- Analysis Files/NC Tests/PVT/n=160 table.xlsx    (PRET's analysis table)
- Data Files/NC Tests/PVT/n=160.sav               (SPSS data file; read with pyreadstat)
- Data Files/NC Tests/PVT/n=160.xls               (backup in case the .sav cannot be read; the only .xls kept)
- Data Files/NC Tests/PVT/Raw Data/*.csv          (159 sessions with every reaction time, so we can recompute the
                                                   norms with our own rules instead of PRET's lapse definition)
Files over 200 MB are skipped. Needs: pip install -r scripts/requirements-data.txt
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests

try:  # The CSA server's certificate chain verifies against the OS store (Windows) but not certifi's bundle.
    import truststore  # pip install truststore; keeps verification ON, just uses the system's trusted roots

    truststore.inject_into_ssl()
except ImportError:
    pass

BASE = "https://donnees-data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/PRET/"
OUT = Path(__file__).resolve().parents[2] / "data" / "raw" / "pret"
TOP_FILES = {"README.txt", "PRETfilestructuredescription.docx"}
TOP_DIRS = {"PRETVersions_DataAnalysisReports/", "PRET Versions, Data, Analysis, Reports/"}
MAX_BYTES = 200 * 1024 * 1024
HEADERS = {"User-Agent": "research-data-fetch/1.0 (python-requests)"}
UNITS = {"": 1, "K": 1024, "M": 1024 ** 2, "G": 1024 ** 3, "T": 1024 ** 4}


class Listing(HTMLParser):
    """Rows of an Apache index page: (href, size text)."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[tuple[str, str]] = []
        self._cells: list[str] = []
        self._href: str | None = None
        self._in_td = False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cells, self._href = [], None
        elif tag == "td":
            self._in_td = True
            self._cells.append("")
        elif tag == "a" and self._in_td and self._href is None:
            self._href = dict(attrs).get("href")

    def handle_endtag(self, tag):
        if tag == "td":
            self._in_td = False
        elif tag == "tr" and self._href and len(self._cells) >= 4:
            self.rows.append((self._href, self._cells[3].strip()))

    def handle_data(self, data):
        if self._in_td and self._cells:
            self._cells[-1] += data


def size_bytes(text: str) -> int | None:
    m = re.fullmatch(r"([\d.]+)\s*([KMGT]?)", text.strip())
    return int(float(m.group(1)) * UNITS[m.group(2)]) if m else None


def human(n: int | None) -> str:
    if n is None:
        return "?"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return "?"


def list_dir(session: requests.Session, url: str) -> list[tuple[str, str, int | None]]:
    """(name, absolute url, size) for each entry; directories end with '/'. Skips sort links and the parent."""
    res = session.get(url, timeout=60)
    res.raise_for_status()
    parser = Listing()
    parser.feed(res.text)
    out = []
    for href, size in parser.rows:
        if href.startswith("?") or href.startswith("/") or href.startswith(".."):
            continue
        out.append((unquote(href), urljoin(url, href), size_bytes(size)))
    return out


REPORT = "pret version 4.0/reports/phase 3 final report.docx"
INCLUDE_REPORT = False  # --report


def selected(rel_path: str) -> bool:
    """PRET version 4.0, NC Tests/PVT only: .xlsx, .sav, raw .csv, and the one .xls backup (n=160.xls).
    With --report also the Phase 3 Final Report (documents the PVT settings)."""
    low = rel_path.lower()
    if INCLUDE_REPORT and low.endswith(REPORT):
        return True
    if "/pret version 4.0/" not in f"/{low}" or "/nc tests/pvt/" not in low:
        return False
    name = low.rsplit("/", 1)[-1]
    return low.endswith((".xlsx", ".sav", ".csv")) or name == "n=160.xls"


def wanted_dir(name: str) -> bool:
    """Only walk PRET version 4.0 among the version folders."""
    return not name.lower().startswith("pret version ") or name.lower().startswith("pret version 4.0")


def walk(session, url: str, rel: str, depth: int, plan: list, lines: list) -> None:
    time.sleep(0.2)  # be gentle with the server
    for name, child, size in list_dir(session, url):
        path = rel + name
        indent = "  " * depth
        if name.endswith("/"):
            if not wanted_dir(name):
                lines.append(f"{indent}{name}  (not walked)")
                continue
            lines.append(f"{indent}{name}")
            walk(session, child, path, depth + 1, plan, lines)
            continue
        mark = ""
        if selected(path):
            if size is not None and size > MAX_BYTES:
                mark = "  [SKIP: over 200 MB]"
            else:
                mark = "  [DOWNLOAD]"
                plan.append((path, child, size))
        lines.append(f"{indent}{name}  ({human(size)}){mark}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--download", action="store_true", help="download the selected files (default: list only)")
    ap.add_argument("--report", action="store_true", help="also the PRET v4.0 Phase 3 Final Report (.docx, ~4 MB)")
    ap.add_argument("--only-new", action="store_true", help="skip files that already exist in data/raw/pret/")
    args = ap.parse_args()
    global INCLUDE_REPORT
    INCLUDE_REPORT = args.report
    session = requests.Session()
    session.headers.update(HEADERS)

    plan: list[tuple[str, str, int | None]] = []
    lines = ["PRET/"]
    for name, url, size in list_dir(session, BASE):
        if name in TOP_FILES:
            ok = size is None or size <= MAX_BYTES
            lines.append(f"  {name}  ({human(size)})  {'[DOWNLOAD]' if ok else '[SKIP: over 200 MB]'}")
            if ok:
                plan.append((name, url, size))
        elif name in TOP_DIRS:
            lines.append(f"  {name}")
            walk(session, url, name, 2, plan, lines)
    found = {line.strip().split("  (")[0] for line in lines[:]}
    for missing in sorted(TOP_FILES - found):
        lines.append(f"  (not found at top level: {missing})")
    shown = [ln for ln in lines if "[DOWNLOAD]" in ln or "[SKIP" in ln or ln.rstrip().endswith("/")
             or "(not walked)" in ln or "not found" in ln]
    print("\n".join(shown))  # folders and selected files only (the raw-data folders hold thousands of CSVs)
    total = sum(s or 0 for _, _, s in plan)
    print(f"\nSelected: {len(plan)} files, about {human(total)} (sizes from the listing are rounded).")

    if not args.download:
        print("List only. Re-run with --download to fetch them into data/raw/pret/.")
        return 0
    for rel, url, _ in plan:
        target = OUT / rel
        if args.only_new and target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with session.get(url, stream=True, timeout=120) as res:
            res.raise_for_status()
            length = int(res.headers.get("Content-Length") or 0)
            if length > MAX_BYTES:
                print(f"skip {rel}: {human(length)} is over 200 MB")
                continue
            with target.open("wb") as fh:
                for chunk in res.iter_content(1 << 16):
                    fh.write(chunk)
        print(f"saved {target.relative_to(OUT.parents[2])} ({human(target.stat().st_size)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
