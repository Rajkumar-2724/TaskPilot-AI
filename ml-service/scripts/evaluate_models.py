#!/usr/bin/env python3
"""Evaluate the trained PAIMANA cost / time overrun models.

Produces:
  * a model-comparison table (RandomForest vs GradientBoosting vs XGBoost)
  * out-of-time (next report month) metrics for the *production* models
  * data/paimana/evaluation_report.json  (full detail)
  * data/model_metrics.json              (consumed by the benchmarking UI)

Usage:
    python scripts/evaluate_models.py
"""

import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_models import (  # noqa: E402
    BEST_PARAMS_CACHE, COST_DIR, COST_LIMITS, COST_TARGET, FEATURE_COLS,
    TIME_DIR, TIME_LIMITS, TIME_TARGET, VERSION, build_dataset, cv_scores,
    load_data, make_pipeline, make_model, metrics, next_month_eval,
)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")


def main():
    df = load_data()
    reports = {}
    for target, label, out_dir, limits in [
        (COST_TARGET, "Cost Overrun (%)", COST_DIR, COST_LIMITS),
        (TIME_TARGET, "Time Overrun (months)", TIME_DIR, TIME_LIMITS),
    ]:
        key = "_cost_ok" if target == COST_TARGET else "_time_ok"
        sub = df[df[key]].copy()
        print("\n================ %s ================" % label)
        # load tuned XGBoost params from production metadata (fallback: default)
        with open(os.path.join(out_dir, "model.json")) as f:
            meta = json.load(f)
        xgb_params = meta.get("xgbTunedParams", {})

        cv = {}
        for kind in ["rf", "gb", "xgb"]:
            c = cv_scores(sub, target, kind, n_splits=3, quick=True)
            cv[kind] = c
            print("  CV %-4s MAE=%.3f RMSE=%.3f R2=%.3f MAPE=%s" % (
                kind, c["mae"], c["rmse"], c["r2"],
                ("%.2f%%" % c["mape"]) if c.get("mape") is not None else "NA"))

        best_kind = meta.get("selectedModel", min(cv, key=lambda k: cv[k]["rmse"]))
        test_month = sub["report_month"].max()
        # production model re-fit on train-only months -> out-of-time metrics
        pipe = make_pipeline(make_model(best_kind, xgb_params if best_kind == "xgb" else None))
        metr, n_tr, n_va = next_month_eval(sub, target, pipe, test_month)
        print("  OOT(%s) %s model MAE=%.3f RMSE=%.3f R2=%.3f MAPE=%s" % (
            test_month, best_kind, metr["mae"], metr["rmse"], metr["r2"],
            ("%.2f%%" % metr["mape"]) if metr.get("mape") is not None else "NA"))

        reports[target] = {
            "label": label, "model": best_kind, "version": VERSION,
            "cv": cv, "selectedBy": "min RMSE (project-held-out CV)",
            "nextMonthHoldout": {
                "testMonth": test_month, "trainRows": int(n_tr),
                "testRows": int(n_va), "metrics": metr,
            },
            "featureCols": FEATURE_COLS,
            "limits": list(limits),
            "trainedParams": meta.get("xgbTunedParams", {}),
        }

    with open(os.path.join(DATA_DIR, "paimana", "evaluation_report.json"), "w") as f:
        json.dump(reports, f, indent=2)

    # published metrics for the benchmarking UI / leaderboard
    legacy_metrics = []
    now = pd.Timestamp.now().isoformat()
    for target, label in [(COST_TARGET, "Cost Overrun Prediction"), (TIME_TARGET, "Time Overrun Prediction")]:
        r = reports[target]
        oot = r["nextMonthHoldout"]["metrics"]
        for m in ["MAE", "RMSE", "R2"]:
            legacy_metrics.append({
                "modelName": f"{label} (PAIMANA)",
                "modelVersion": f"{r['model']}|{VERSION}", "metricName": m,
                "metricValue": oot.get(m.lower()), "baselineValue": None,
                "datasetLabel": "PAIMANA (MoSPI) official project reports",
                "datasetSize": oot.get("n"), "comparisonGroup": "ml",
                "modelType": "regression", "trainingDate": now,
            })
        for cv in ["rf", "gb", "xgb"]:
            m = r["cv"][cv]
            legacy_metrics.append({
                "modelName": f"{label} {cv.upper()} (project-held-out CV)",
                "modelVersion": VERSION, "metricName": "RMSE",
                "metricValue": m["rmse"], "baselineValue": None,
                "datasetLabel": "PAIMANA (MoSPI) official project reports",
                "datasetSize": r["nextMonthHoldout"]["testRows"], "comparisonGroup": "cv",
                "modelType": "regression", "trainingDate": now,
            })
    published = {
        "source": "PAIMANA (MoSPI) project monitoring data",
        "version": VERSION,
        "updatedAt": now,
        "metrics": legacy_metrics,
        "models": {
            "costOverrun": reports[COST_TARGET],
            "timeOverrun": reports[TIME_TARGET],
        },
    }
    with open(os.path.join(DATA_DIR, "model_metrics.json"), "w") as f:
        json.dump(published, f, indent=2)
    print("\nWrote evaluation_report.json and data/model_metrics.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())