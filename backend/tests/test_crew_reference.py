"""Nov 14: real crew reference values (NASA OSDR OSD-575, Inspiration4), shown as in the file."""
import csv
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "nasa" / "osd575" / \
    "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv"


def test_crew_reference_endpoint(client):
    ref = client.get("/api/crew-reference").json()
    assert ref["source"] == "NASA OSDR OSD-575, Inspiration4 (4 civilian crew, 3-day flight)" and ref["licence"] == "CC0"
    assert [c["id"] for c in ref["crew"]] == ["C001", "C002", "C003", "C004"]
    assert ref["display"] == {"pre_flight": "L-3", "post_flight": "R+1"}
    g = ref["analytes"]["glucose"]
    assert g["units"] == "mg/dL" and g["range"] == ["65", "99"]
    assert ref["analytes"]["sodium"]["units"] == ref["analytes"]["potassium"]["units"] == "mmol/L"
    assert any(s["id"] == "osd575" for s in client.get("/api/sources").json()["sources"])


def test_values_are_exactly_as_in_the_file(client):
    if not RAW.exists():  # raw data is git-ignored; the check runs where it was downloaded
        return
    ref = client.get("/api/crew-reference").json()
    names = {a["name"]: k for k, a in ref["analytes"].items()}
    for row in csv.DictReader(RAW.open(encoding="utf-8")):
        if row["ANALYTE"] in names:
            assert ref["analytes"][names[row["ANALYTE"]]]["values"][row["SUBJECT_ID"]][row["timepoint"]] == row["VALUE"]
