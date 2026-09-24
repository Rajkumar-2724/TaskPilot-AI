#!/usr/bin/env python3
"""Train cost-overrun and time-overrun models on the PAIMANA dataset.

Three candidate models per target:
  * RandomForestRegressor
  * GradientBoostingRegressor
  * XGBRegressor (primary; hyper-parameter tuned via RandomizedSearchCV)

Evaluation is honest and leakage-safe:
  * comparison on project-held-out GroupKFold (generalisation to new projects)
  * plus an out-of-time holdout (last report month) for the selected model

Guidance notes that are enforced / documented here:
  * targets are built from the *revised* (latest sanctioned/estimated) figures,
    which are NEVER used as features (they would leak the targets)
  * rows are project x month snapshots; folds group by project id

Usage:
    python scripts/train_models.py [--quick]
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERE = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.dirname(HERE)
DATA_DIR = os.path.join(ML_DIR, "data")
MODELS_DIR = os.path.join(ML_DIR, "models")

DATASET_CSV = os.path.join(DATA_DIR, "paimana", "paimana_dataset.csv")
OUT_ROOT = os.path.join(MODELS_DIR, "paimana")

COST_DIR = os.path.join(OUT_ROOT, "cost_model")
TIME_DIR = os.path.join(OUT_ROOT, "time_model")

VERSION = "5.0.0"

BEST_PARAMS_CACHE = {}

FEATURE_COLS = [
    # numeric, known as of report month (leakage-free)
    "cost_original",
    "expenditure",
    "physical_progress",
    "expenditure_ratio_orig",
    "progress_minus_expenditure",
    "original_duration_months",
    "project_age_months",
    "months_remaining_original",
    "months_since_start",
    # categorical
    "state",
    "sector",
    "ministry",
]

COST_TARGET = "cost_overrun_pct"
TIME_TARGET = "time_overrun_months"

COST_LIMITS = (-100.0, 500.0)
TIME_LIMITS = (-120.0, 240.0)


def load_data():
    df = pd.read_csv(DATASET_CSV)
    df = df[df["cost_original"].notna() & (df["cost_original"] > 0)]
    df = df[df["approval_date_original"].notna() & df["doc_original"].notna()]
    first_month = df["report_month"].min()
    def _period_int(s):
        return np.array([pd.Period(x, freq="M").ordinal for x in s])
    df["months_since_start"] = (
        _period_int(df["report_month"]) - _period_int([first_month])
    ).astype(int)
    for col in ["state", "sector", "ministry"]:
        df[col] = df[col].fillna("UNKNOWN").astype(str)

    # drop obvious source-data outliers for the training targets
    cost_ok = df[COST_TARGET].notna() & (df[COST_TARGET] >= COST_LIMITS[0]) & (df[COST_TARGET] <= COST_LIMITS[1])
    time_ok = df[TIME_TARGET].notna() & (df[TIME_TARGET] >= TIME_LIMITS[0]) & (df[TIME_TARGET] <= TIME_LIMITS[1])
    df["_cost_ok"] = cost_ok.fillna(False)
    df["_time_ok"] = time_ok.fillna(False)
    return df


def build_dataset(df, target):
    idx = df.index
    X = df[FEATURE_COLS].copy()
    y = df[target]
    return X, y, idx


def make_categorical_mask():
    return [c for c in ["state", "sector", "ministry"]]


def make_pipeline(model):
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    cat_cols = ["state", "sector", "ministry"]
    num_cols = [c for c in FEATURE_COLS if c not in cat_cols]

    pre = ColumnTransformer([
        ("num", Pipeline([
            ("imp", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), num_cols),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
    ])
    return Pipeline([("pre", pre), ("model", model)])


def tree_params(kind):
    if kind == "rf":
        return {
            "n_estimators": 300, "min_samples_leaf": 2,
            "n_jobs": -1, "random_state": 42, "max_features": 0.5,
        }
    if kind == "gb":
        return {
            "n_estimators": 300, "learning_rate": 0.04, "max_depth": 3,
            "min_samples_leaf": 2, "random_state": 42,
        }
    if kind == "xgb":
        return {
            "n_estimators": 400, "learning_rate": 0.05, "max_depth": 6,
            "subsample": 0.9, "colsample_bytree": 0.9, "reg_lambda": 1.0,
            "random_state": 42, "tree_method": "hist", "verbosity": 0,
        }


def make_model(kind, extra=None):
    if kind == "rf":
        from sklearn.ensemble import RandomForestRegressor
        p = tree_params("rf")
        p.update(extra or {})
        return RandomForestRegressor(**p)
    if kind == "gb":
        from sklearn.ensemble import GradientBoostingRegressor
        p = tree_params("gb")
        p.update(extra or {})
        return GradientBoostingRegressor(**p)
    if kind == "xgb":
        from xgboost import XGBRegressor
        p = tree_params("xgb")
        p.update(extra or {})
        return XGBRegressor(**p)
    raise ValueError(kind)


def metrics(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    n = len(y_true)
    if n == 0:
        return {}
    err = y_true - y_pred
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    ss_res = float(np.sum(err ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else float("nan")
    mape = None
    # trimmed MAPE: tiny-magnitude targets are excluded (they explode the ratio)
    absy = np.abs(y_true)
    nz = absy[absy > 0]
    if nz.size:
        thr = max(float(np.percentile(nz, 25)), 1.0)
        mask = absy > thr
        if mask.any():
            mape = float(np.mean(np.abs(err[mask] / y_true[mask])) * 100.0)
    wmape = None
    if absy.sum() > 0:
        wmape = float(np.sum(np.abs(err)) / np.sum(absy) * 100.0)
    return {"n": int(n), "mae": mae, "rmse": rmse, "r2": r2, "mape": mape, "wmape": wmape}


def group_folds_for(idx_projects, n_splits=3, seed=7):
    """Return list of (train_idx, val_idx) split by project (no project leakage)."""
    from numpy.random import default_rng
    projects = np.asarray(idx_projects)
    uniq = sorted(set(projects.tolist()))
    rng = default_rng(seed)
    rng.shuffle(uniq)
    folds = []
    base = len(uniq) // n_splits
    for k in range(n_splits):
        val_p = set(uniq[k * base:(k + 1) * base] if k < n_splits - 1 else uniq[k * base:])
        val_mask = np.array([p in val_p for p in projects])
        val = np.where(val_mask)[0]
        tr = np.where(~val_mask)[0]
        folds.append((tr, val))
    return folds


def cv_scores(df, target, kind, n_splits=3, quick=False):
    """Project-grouped CV metrics averaged over folds."""
    X, y, idx = build_dataset(df, target)
    projects = df["project_id"].fillna(df["legacy_code"]).fillna(df["sl_no"]).astype(str).values
    from sklearn.metrics import r2_score
    from sklearn.model_selection import cross_validate
    pipe = make_pipeline(make_model(kind))
    folds = group_folds_for(projects, n_splits=n_splits)
    scores = {"mae": [], "rmse": [], "r2": [], "mape": [], "wmape": []}
    for tr, va in folds:
        pipe.fit(X.iloc[tr], y.iloc[tr])
        yp = pipe.predict(X.iloc[va])
        m = metrics(y.iloc[va], yp)
        for k in scores:
            if m.get(k) is not None:
                scores[k].append(m[k])
    out = {k: float(np.mean(v)) if v else float("nan") for k, v in scores.items()}
    out["splits"] = str(n_splits)
    return out


def next_month_eval(df, target, model_pipe, test_month):
    """Out-of-time evaluation on the newest report month."""
    tr = df[df["report_month"] < test_month]
    va = df[df["report_month"] == test_month]
    Xtr, ytr, _ = build_dataset(tr, target)
    Xva, yva, _ = build_dataset(va, target)
    model_pipe.fit(Xtr, ytr)
    yp = model_pipe.predict(Xva)
    return metrics(yva, yp), tr.shape[0], va.shape[0]


def tune_xgb(df, target, quick=False):
    """RandomizedSearchCV on a reduced search space (project-grouped folds)."""
    from scipy.stats import randint, uniform
    from sklearn.model_selection import RandomizedSearchCV
    from xgboost import XGBRegressor

    X, y, idx = build_dataset(df, target)
    projects = df["project_id"].fillna(df["legacy_code"]).fillna(df["sl_no"]).astype(str).values
    param_space = {
        "model__n_estimators": randint(100, 500),
        "model__max_depth": randint(3, 10),
        "model__learning_rate": uniform(0.01, 0.15),
        "model__subsample": uniform(0.7, 0.3),
        "model__colsample_bytree": uniform(0.6, 0.4),
        "model__reg_lambda": uniform(0.0, 3.0),
    }
    n_iter = 12 if quick else 24
    folds = group_folds_for(projects, n_splits=3)
    model = make_model("xgb")
    pipe = make_pipeline(model)
    rs = RandomizedSearchCV(
        pipe, param_space, n_iter=n_iter,
        cv=[(f[0], f[1]) for f in folds],
        scoring="neg_root_mean_squared_error",
        n_jobs=-1, random_state=42, refit=False,
    )
    rs.fit(X, y)
    best = rs.best_params_
    return {k.split("model__")[-1]: (int(v) if isinstance(v, (int, np.integer)) else float(v))
            for k, v in best.items()}


def run_target(df, target, label, out_dir, quick=False):
    print("\n================== %s (%s) ==================" % (label, target))
    sub = df[df["_" + ("cost" if target == COST_TARGET else "time") + "_ok"]].copy()
    print("usable rows:", sub.shape[0])

    os.makedirs(out_dir, exist_ok=True)
    report = {"target": target, "label": label, "version": VERSION,
              "generatedAt": datetime.now().isoformat(),
              "featureCols": FEATURE_COLS,
              "rows": int(sub.shape[0]),
              "leakageGuard": {
                  "excludedFeatures": ["cost_revised", "doc_revised", "approval_date_revised",
                                        "cost_overrun_amt", COST_TARGET, TIME_TARGET],
                  "reason": "revised figures are used only to build targets; including them as "
                            "features would leak the answer.",
              }}

    # 1) tune XGBoost per target
    t0 = time.time()
    if target not in BEST_PARAMS_CACHE:
        BEST_PARAMS_CACHE[target] = tune_xgb(sub, target, quick)
    best_xgb = BEST_PARAMS_CACHE[target]
    report["xgbTunedParams"] = {k: best_xgb[k] for k in best_xgb}
    report["xgbTuneSeconds"] = round(time.time() - t0, 1)

    # 2) CV scores for all three models (project-held-out)
    cv = {}
    for kind in ["rf", "gb", "xgb"]:
        c = cv_scores(sub, target, kind, n_splits=3, quick=quick)
        cv[kind] = c
        print("  CV %-4s MAE=%.3f RMSE=%.3f R2=%.3f MAPE=%s" % (
            kind, c["mae"], c["rmse"], c["r2"],
            ("%.2f%%" % c["mape"]) if c.get("mape") is not None else "NA"))
    report["cv"] = cv

    # 3) select best by RMSE on project-held-out
    best_kind = min(cv, key=lambda k: cv[k]["rmse"])
    report["selectedModel"] = best_kind
    report["selectionRule"] = "min RMSE on project-grouped CV (generalization to unseen projects)"

    # 4) next-month out-of-time evaluation for the selected model
    test_month = sub["report_month"].max()
    pipe = make_pipeline(make_model(best_kind, best_xgb if best_kind == "xgb" else None))
    metr, n_tr, n_va = next_month_eval(sub, target, pipe, test_month)
    report["nextMonthHoldout"] = {
        "testMonth": test_month, "trainRows": int(n_tr), "testRows": int(n_va),
        "metrics": metr,
    }
    print("  OOT(%s mono) MAE=%.3f RMSE=%.3f R2=%.3f MAPE=%s" % (
        test_month, metr["mae"], metr["rmse"], metr["r2"],
        ("%.2f%%" % metr["mape"]) if metr.get("mape") is not None else "NA"))

    # 5) fit the production model on ALL usable rows and save
    X, y, _ = build_dataset(sub, target)
    pred_pipe = make_pipeline(make_model(best_kind, best_xgb if best_kind == "xgb" else None))
    pred_pipe.fit(X, y)

    import joblib
    model_file = os.path.join(out_dir, "model.pkl")
    joblib.dump(pred_pipe, model_file)

    report["modelFile"] = os.path.relpath(model_file, ML_DIR)

    # feature importances
    imp = feature_importance(pred_pipe, X, target)
    report["featureImportance"] = imp

    with open(os.path.join(out_dir, "model.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("  saved %s" % out_dir)
    return report


def feature_importance(pipe, X, target):
    m = pipe.named_steps["model"]
    cat_cols = ["state", "sector", "ministry"]
    num_cols = [c for c in FEATURE_COLS if c not in cat_cols]
    pre = pipe.named_steps["pre"]
    try:
        # build a mapping model-feature-name -> original column
        # numeric block pass-through: same names
        cats = pre.named_transformers_["cat"]
        cat_names = list(cats.get_feature_names_out(cat_cols))
        names = num_cols + cat_names
        fi = m.feature_importances_
        mapping = defaultdict(float)
        for n, v in zip(names, fi):
            base = n.split("_")[0] if any(n.startswith(c + "_") for c in cat_cols) else n
            # reconcile one-hot prefixes
            if base in cat_cols:
                mapping[base] += v
            else:
                mapping[n] = v
        top = sorted(mapping.items(), key=lambda kv: -kv[1])[:20]
        return [{"feature": k, "importance": round(float(v), 5)} for k, v in top]
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--quick", action="store_true", help="Fewer tuning iterations / folds.")
    args = ap.parse_args(argv)

    df = load_data()
    print("loaded %d rows; months: %s" % (len(df), sorted(df["report_month"].unique())))
    print("rows w/ cost target:", int(df["_cost_ok"].sum()),
          " rows w/ time target:", int(df["_time_ok"].sum()))
    print("cost outliers dropped:", int((df[COST_TARGET].notna() & ~df["_cost_ok"]).sum().item()),
          " time outliers dropped:", int((df[TIME_TARGET].notna() & ~df["_time_ok"]).sum().item()))

    cost_report = run_target(df, COST_TARGET, "Cost Overrun (%)", COST_DIR, quick=args.quick)
    time_report = run_target(df, TIME_TARGET, "Time Overrun (months)", TIME_DIR, quick=args.quick)

    with open(os.path.join(OUT_ROOT, "training_report.json"), "w") as f:
        json.dump({"version": VERSION, "generatedAt": datetime.now().isoformat(),
                   "cost": cost_report, "time": time_report,
                   "modelSelection": {
                       "cost": cost_report["selectedModel"],
                       "time": time_report["selectedModel"],
                   }}, f, indent=2)
    print("\nDone. See", OUT_ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())