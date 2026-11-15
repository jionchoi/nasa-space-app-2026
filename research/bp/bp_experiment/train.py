"""Patient-disjoint pilot with train-only normalization and a locked test split."""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import gzip
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .data import ROOT, PROTOCOL
from .model import TinyBP, preprocess, export_cpu
from .cpu import CPUModel


def grouped_split(subjects, counts, seed):
    unique = np.unique(subjects)
    if len(unique) != sum(counts):
        raise ValueError(f"Need {sum(counts)} distinct patients; got {len(unique)}")
    shuffled = np.random.default_rng(seed).permutation(unique)
    boundaries = np.cumsum([0] + list(counts))
    return {name: np.flatnonzero(np.isin(subjects, shuffled[boundaries[i]:boundaries[i+1]]))
            for i, name in enumerate(("train", "validation", "test"))}


def metrics(y, prediction, subjects):
    error = prediction - y
    per_subject = {}
    for subject in np.unique(subjects):
        rows = subjects == subject
        per_subject[str(subject)] = {"windows": int(rows.sum()), "mae_mmHg": np.mean(np.abs(error[rows]), axis=0).tolist(),
                                     "bias_mmHg": np.mean(error[rows], axis=0).tolist()}
    return {"target_order": ["SBP", "DBP"], "windows": len(y), "patients": len(per_subject),
            "invalid_pressure_order_count": int(np.sum(prediction[:, 0] <= prediction[:, 1])),
            "mae_mmHg": np.mean(np.abs(error), axis=0).tolist(), "rmse_mmHg": np.sqrt(np.mean(error ** 2, axis=0)).tolist(),
            "bias_mmHg": np.mean(error, axis=0).tolist(), "error_std_mmHg": np.std(error, axis=0).tolist(),
            "absolute_error_p95_mmHg": np.percentile(np.abs(error), 95, axis=0).tolist(),
            "within_5_mmHg_fraction": np.mean(np.abs(error) <= 5, axis=0).tolist(),
            "within_10_mmHg_fraction": np.mean(np.abs(error) <= 10, axis=0).tolist(),
            "subject_macro_mae_mmHg": np.mean([v["mae_mmHg"] for v in per_subject.values()], axis=0).tolist(),
            "per_subject": per_subject}


def predict(model, x, mean, scale):
    model.eval()
    with torch.inference_mode():
        return np.concatenate([model(part).numpy() for part in torch.from_numpy(x).split(128)]) * scale + mean


def adoption_gate(test, baseline, parameter_count, artifact_bytes, benchmark):
    gates = PROTOCOL["adoption_gate"]
    mae = np.array(test["mae_mmHg"])
    macro = np.array(test["subject_macro_mae_mmHg"])
    base = np.array(baseline["mae_mmHg"])
    macro_base = np.array(baseline["subject_macro_mae_mmHg"])
    maximum = np.array([gates["test_sbp_mae_mmHg_max"], gates["test_dbp_mae_mmHg_max"]])
    improvement = 1 - mae / base
    macro_improvement = 1 - macro / macro_base
    conditions = {
        "window_mae_within_limits": bool(np.all(mae <= maximum)),
        "subject_macro_mae_within_limits": bool(np.all(macro <= maximum)),
        "beats_train_mean_each_target_by_10_percent": bool(np.all(improvement >= gates["minimum_relative_improvement_over_train_mean_each_target"])),
        "subject_macro_beats_train_mean_each_target_by_10_percent": bool(np.all(macro_improvement >= gates["minimum_relative_improvement_over_train_mean_each_target"])),
        "parameter_budget": parameter_count <= gates["parameters_max"],
        "artifact_budget": artifact_bytes <= gates["artifact_bytes_max"],
        "cpu_latency_budget": benchmark["latency_ms"]["p95"] <= gates["cpu_end_to_end_p95_ms_max"],
        "enough_test_patients": test["patients"] >= gates["minimum_test_subjects"]}
    conditions["valid_pressure_order"] = test["invalid_pressure_order_count"] == 0
    return {"passed": all(conditions.values()), "conditions": conditions, "relative_improvement_over_mean": improvement.tolist(),
            "subject_macro_relative_improvement_over_mean": macro_improvement.tolist(),
            "service_enabled": False, "meaning": "Pilot gate only; passing is not clinical or flight certification"}


def run(output: Path):
    seed = PROTOCOL["seed"]
    torch.manual_seed(seed)
    np.random.seed(seed)
    torch.set_num_threads(PROTOCOL["training"]["cpu_threads"])
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / "data/raw/vitaldb_bp/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    selected = manifest["selected"]
    if len(selected) != PROTOCOL["subjects_target"]:
        raise ValueError("Incomplete pilot cohort; do not silently change protocol")
    raw, targets, people, cases, starts = [], [], [], [], []
    for entry in selected:
        path = ROOT / entry["windows_path"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Changed dataset: {path}")
        for key, channel in (("ecg", "SNUADC/ECG_II"), ("ppg", "SNUADC/PLETH"), ("art", "SNUADC/ART")):
            source = json.loads(gzip.decompress((path.parent / f"{key}.json.gz").read_bytes()))
            for item in source.get("entry", []):
                r = item["resource"]
                if r["subject"]["reference"] != entry["subject"] or r["code"].get("text") != channel:
                    raise ValueError("Patient/channel mismatch in cached source")
                sample = r["valueSampledData"]
                if sample["period"] != 2 or sample["dimensions"] != 1:
                    raise ValueError("Unexpected original sampling contract")
                if key == "art" and sample["origin"].get("unit") != "mmHg":
                    raise ValueError("ART labels not expressed in mmHg")
        with np.load(path, allow_pickle=False) as data:
            raw.append(data["x"])
            targets.append(data["y"])
            people.extend([entry["subject"]] * len(data["x"]))
            cases.extend([entry["caseid"]] * len(data["x"]))
            starts.extend(data["start_s"])
    raw, y, subjects = np.concatenate(raw), np.concatenate(targets), np.array(people)
    x = np.stack([preprocess(a) for a in raw])
    splits = grouped_split(subjects, [PROTOCOL[k] for k in ("train_subjects", "validation_subjects", "test_subjects")], seed)
    split_ids = {k: sorted(np.unique(subjects[v]).tolist()) for k, v in splits.items()}
    split_path = output / "patient_split.json"
    split_path.write_text(json.dumps({"seed": seed, "subjects": split_ids}, indent=2) + "\n")
    train, validation, test = (splits[k] for k in ("train", "validation", "test"))
    mean, scale = y[train].mean(axis=0), y[train].std(axis=0)
    if np.any(scale <= 0):
        raise ValueError("Degenerate training labels")
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(TensorDataset(torch.from_numpy(x[train]), torch.from_numpy((y[train] - mean) / scale)),
                        batch_size=PROTOCOL["training"]["batch_size"], shuffle=True, generator=generator)
    model = TinyBP().cpu()
    optimizer = torch.optim.AdamW(model.parameters(), lr=PROTOCOL["training"]["learning_rate"], weight_decay=0.001)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
    loss_fn = nn.MSELoss()
    best, best_epoch, wait, history, best_state = float("inf"), 0, 0, [], None
    started = time.perf_counter()
    for epoch in range(PROTOCOL["training"]["max_epochs"]):
        model.train()
        losses = []
        for batch_x, batch_y in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(batch_x), batch_y)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        prediction = predict(model, x[validation], mean, scale)
        validation_mae = np.mean(np.abs(prediction - y[validation]), axis=0)
        # Model selection uses validation only. Test labels are never consulted here.
        score = float(np.mean(validation_mae / scale))
        history.append({"epoch": epoch + 1, "train_normalized_mse": float(np.mean(losses)), "validation_mae_mmHg": validation_mae.tolist()})
        print(f"epoch {epoch+1:03d}: train_mse={np.mean(losses):.4f}, validation MAE SBP={validation_mae[0]:.3f} DBP={validation_mae[1]:.3f}", flush=True)
        scheduler.step(score)
        if score < best - 1e-5:
            best, best_epoch, wait, best_state = score, epoch + 1, 0, deepcopy(model.state_dict())
        else:
            wait += 1
        if wait >= PROTOCOL["training"]["patience"]:
            break
    training_seconds = time.perf_counter() - started
    model.load_state_dict(best_state)
    model.eval()
    training_artifact = output / "tiny_bp.pt"
    torch.save({"state_dict": model.state_dict(), "target_mean": mean.tolist(), "target_scale": scale.tolist(),
                "architecture": "TinyBP_v1", "protocol": PROTOCOL["protocol_version"], "sample_rate_hz": 125,
                "window_samples": 1024, "channels": ["ECG", "PPG"], "adoption_approved": False}, training_artifact)
    artifact = output / "tiny_bp_cpu.npz"
    export_cpu(model, mean, scale, artifact)
    cpu_model = CPUModel(artifact)
    with torch.inference_mode():
        parity_x = x[validation[:min(100, len(validation))]]
        torch_y = model(torch.from_numpy(parity_x)).numpy() * scale + mean
    numpy_y = np.stack([cpu_model.forward_normalized(a) for a in parity_x]) * scale + mean
    parity_max_error = float(np.max(np.abs(torch_y - numpy_y)))
    if parity_max_error > 0.001:
        raise ValueError(f"CPU export changed predictions by {parity_max_error} mmHg")
    sample = output / "sample_ecg_ppg.npz"
    np.savez_compressed(sample, x=raw[test[0]])  # Only input waveforms; no ABP or BP labels.
    benchmark = json.loads(subprocess.check_output([sys.executable, "-m", "bp_experiment.benchmark", "--model", str(artifact), "--sample", str(sample)], cwd=ROOT, text=True))
    parameter_count = sum(p.numel() for p in model.parameters())
    evaluations = {}
    for name, rows in splits.items():
        # Final metrics use the actual deployment implementation, not training backend.
        prediction = np.stack([cpu_model.forward_normalized(a) for a in x[rows]]) * scale + mean
        evaluations[name] = {"cnn": metrics(y[rows], prediction, subjects[rows]),
                             "train_mean_baseline": metrics(y[rows], np.broadcast_to(mean, y[rows].shape), subjects[rows]),
                             "target_summary_mmHg": {"min": y[rows].min(axis=0).tolist(), "max": y[rows].max(axis=0).tolist(), "mean": y[rows].mean(axis=0).tolist(), "std": y[rows].std(axis=0).tolist()}}
        if name == "test":
            lines = ["subject,caseid,start_s,true_sbp,true_dbp,predicted_sbp,predicted_dbp"]
            for idx, pred in zip(rows, prediction):
                lines.append(f"{subjects[idx]},{cases[idx]},{starts[idx]},{y[idx,0]},{y[idx,1]},{pred[0]},{pred[1]}")
            (output / "test_predictions.csv").write_text("\n".join(lines) + "\n")
    gate = adoption_gate(evaluations["test"]["cnn"], evaluations["test"]["train_mean_baseline"], parameter_count, artifact.stat().st_size, benchmark)
    report = {"created_at_utc": datetime.now(timezone.utc).isoformat(), "protocol": PROTOCOL,
              "source_file_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                     for name in ("model.py", "cpu.py", "preprocessing.py", "data.py", "train.py", "benchmark.py", "protocol.json")},
              "source": "Original VitalDB official FHIR API, 96 unique surgical patients; not PulseDB or a Shallow U-Net reproduction",
              "source_contract_audit": "All selected source chunks checked for patient, channel, 500Hz and mmHg reference units before training",
              "architecture": "Own TinyBP_v1: five strided 1D convolutions, adaptive pooling to 8 bins, 32-unit regression head",
              "parameters": parameter_count, "artifact_bytes": artifact.stat().st_size,
              "export_parity_max_abs_mmHg": parity_max_error, "training_backend": str(torch.__version__),
              "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(), "artifact_path": str(artifact.relative_to(ROOT)),
              "patient_split": split_ids, "dataset_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
              "evaluations": evaluations, "benchmark": benchmark, "best_epoch": best_epoch, "training_seconds": training_seconds,
              "training_history": history, "adoption": gate, "platform": platform.platform(),
              "limitations": ["Small convenience cohort selected by available channels and quality, one hospital, anesthetized surgical patients",
                              "Window-based current BP estimates; not future BP forecasts or clinical validation",
                              "No test-person calibration; no age, case ID, patient ID, ABP, or BP labels in model inputs",
                              "Label quality exclusions affect cohort and coverage; artifact detection is unvalidated",
                              "Original 500Hz windows downsampled independently; filtering uses only the completed past window",
                              "Power and flight hardware not measured; NumPy/SciPy/Python runtime memory is included in isolated process RSS",
                              "License notices differ between current API spec and dataset page; no raw redistribution or commercial clearance asserted"]}
    report_path = ROOT / "validation/bp_cpu_pilot.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    (ROOT / "data/manifests/vitaldb_bp_pilot.manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"report": str(report_path), "parameters": parameter_count, "artifact_bytes": artifact.stat().st_size,
                      "test_mae": evaluations["test"]["cnn"]["mae_mmHg"], "baseline_mae": evaluations["test"]["train_mean_baseline"]["mae_mmHg"],
                      "benchmark": benchmark, "adoption": gate}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "output/bp_cpu")
    args = parser.parse_args()
    if (ROOT / "validation/bp_cpu_pilot.json").exists():
        raise SystemExit("Pilot report already exists. Do not repeatedly tune against the held-out test; use a new protocol/cohort for another experiment.")
    run(args.output.resolve())


if __name__ == "__main__":
    main()
