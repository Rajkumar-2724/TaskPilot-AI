#!/usr/bin/env python3
"""Make cost / time overrun predictions from the trained PAIMANA models.

Usage:
    python scripts/predict.py --input '{"project_id": "N1", "state": "Bihar",
        "sector": "Roads & Highways", "ministry": "Ministry of Road Transport & Highways",
        "cost_original": 1200.0, "expenditure": 300.0,
        "physical_progress": 25.0, "original_duration_months": 36,
        "project_age_months": 12, "months_remaining_original": 24,
        "months_since_start": 8}'
    python scripts/predict.py --input input.json   (or a JSON file)
"""

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd
import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_models import COST_DIR, FEATURE_COLS, TIME_DIR  # noqa: E402


def load_model(dir_name):
    pipe = joblib.load(os.path.join(dir_name, "model.pkl"))
    with open(os.path.join(dir_name, "model.json")) as f:
        meta = json.load(f)
    return pipe, meta


def prepare_input(data, meta):
    row = {}
    for c in FEATURE_COLS:
        row[c] = data.get(c)
    for c in ["state", "sector", "ministry"]:
        if row.get(c) is None:
            row[c] = "UNKNOWN"
    return pd.DataFrame([row])


def report(pipe, meta, df_row):
    pred = float(pipe.predict(df_row)[0])
    return {
        "model": meta["label"],
        "target": meta["target"],
        "version": meta["version"],
        "prediction": round(pred, 3),
        "unit": "% points" if meta["target"] == "cost_overrun_pct" else "months",
        "modelFile": meta.get("modelFile"),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True, help="JSON string or path to JSON file")
    ap.add_argument("--cost", action="store_true")
    ap.add_argument("--time", action="store_true")
    args = ap.parse_args(argv)

    raw = args.input
    if os.path.exists(raw):
        with open(raw) as f:
            data = json.load(f)
    else:
        data = json.loads(raw)

    results = {}
    want_cost = args.cost or not args.time
    want_time = args.time or not args.cost

    if want_cost:
        pipe, meta = load_model(COST_DIR)
        results["cost_overrun"] = report(pipe, meta, prepare_input(data, meta))
    if want_time:
        pipe, meta = load_model(TIME_DIR)
        results["time_overrun"] = report(pipe, meta, prepare_input(data, meta))

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())