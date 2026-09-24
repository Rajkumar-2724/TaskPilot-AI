"""Inference wrapper around the PAIMANA-trained cost / time overrun models.

The models here are the *real*, official-data trained pipelines saved by
scripts/train_models.py under models/paimana/. Loading is lazy and cached so
the FastAPI app starts fast and only pays the load cost on first prediction.
"""

import json
import os

import joblib
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PAIMANA_ROOT = os.path.join(BASE_DIR, "models", "paimana")

# Matches FEATURE_COLS in scripts/train_models.py
FEATURE_COLS = [
    "cost_original", "expenditure", "physical_progress",
    "expenditure_ratio_orig", "progress_minus_expenditure",
    "original_duration_months", "project_age_months",
    "months_remaining_original", "months_since_start",
    "state", "sector", "ministry",
]

REQUIRED = ["cost_original", "expenditure", "physical_progress"]
NSTATE = ["state", "sector", "ministry"]

_cache = {"cost": None, "time": None}


def _load(kind):
    if _cache[kind] is None:
        d = os.path.join(PAIMANA_ROOT, kind + "_model")
        pipe = joblib.load(os.path.join(d, "model.pkl"))
        with open(os.path.join(d, "model.json")) as f:
            meta = json.load(f)
        _cache[kind] = (pipe, meta)
    return _cache[kind]


def available():
    return os.path.exists(os.path.join(PAIMANA_ROOT, "cost_model", "model.pkl")) and \
        os.path.exists(os.path.join(PAIMANA_ROOT, "time_model", "model.pkl"))


def normalize_features(data):
    """Map an arbitrary input dict to the model's canonical feature vector.

    Mirrors the feature engineering in scripts/prepare_dataset.py so that
    callers can pass raw project measures and still get a valid inference.
    """
    def num(key, dflt=None):
        v = data.get(key)
        if v is None and key in data:
            v = None
        try:
            f = float(v) if v is not None else dflt
            return None if np.isnan(f) else f
        except (TypeError, ValueError):
            return dflt

    out = {}
    orig = num("cost_original", num("originalCost", 0.0) or 0.0)
    exp = num("expenditure", 0.0)
    prog = num("physical_progress", num("physicalProgress", 0.0) or 0.0)
    out["cost_original"] = orig or 0.0
    out["expenditure"] = exp or 0.0
    out["physical_progress"] = prog if prog is not None else 0.0

    if orig and orig > 0 and exp:
        out["expenditure_ratio_orig"] = exp / orig * 100.0
    else:
        out["expenditure_ratio_orig"] = 0.0
    out["progress_minus_expenditure"] = (
        out["physical_progress"] - (out["expenditure_ratio_orig"] or 0.0))

    def months_from(a, b):
        if not a or not b:
            return None
        try:
            pa, pb = pd.Period(str(a), freq="M"), pd.Period(str(b), freq="M")
            return int(pa.ordinal - pb.ordinal)
        except Exception:  # noqa: BLE001
            return None

    app_key = "approval_date_original" if "approval_date_original" in data else "plannedStartDate"
    doc_key = "doc_original" if "doc_original" in data else "plannedEndDate"
    out["original_duration_months"] = months_from(
        data.get(doc_key), data.get(app_key)) if doc_key in data and app_key in data else \
        num("original_duration_months", 12.0)
    # as-of-date (report/reference date)
    ref = data.get("report_date") or data.get("referenceDate") or pd.Timestamp.now().strftime("%Y-%m")
    out["project_age_months"] = months_from(ref, data.get(app_key) or
                                            data.get("plannedStartDate")) if app_key in data else \
        num("project_age_months", 0.0)
    out["months_remaining_original"] = months_from(
        data.get(doc_key) or data.get("plannedEndDate"), ref) if doc_key in data else \
        num("months_remaining_original", 0.0)
    out["months_since_start"] = num("months_since_start", 8)

    for c in NSTATE:
        v = data.get(c) or ("UNKNOWN" if c == "ministry" else "")
        if c == "state":
            v = (v or "").strip() or "UNKNOWN"
        elif c == "sector":
            v = v or "Water Resources"
        out[c] = v
    return out


def _df(data):
    row = normalize_features(data)
    for c in FEATURE_COLS:
        if c not in row:
            row[c] = 0.0
    return pd.DataFrame([{c: row[c] for c in FEATURE_COLS}])


def predict_cost_pct(data):
    """Predicted cost overrun in percentage points of original cost."""
    pipe, meta = _load("cost")
    df = _df(data)
    pred = float(np.clip(pipe.predict(df)[0], -90.0, 300.0))
    orig_cost = float(data.get("cost_original", data.get("originalCost", 0)) or 0)
    return {
        "prediction": round(pred, 2),
        "predictedFinalCost": float(round(orig_cost * (1 + pred / 100.0), 2)),
        "unit": "percentage points vs original cost",
        "model": meta["label"],
        "version": meta["version"],
        "source": "PAIMANA (MoSPI) official project reports",
    }


def predict_time_months(data):
    """Predicted time overrun in months (revised - original DOC)."""
    pipe, meta = _load("time")
    df = _df(data)
    pred = float(np.clip(pipe.predict(df)[0], -36.0, 120.0))
    return {
        "prediction": round(pred, 2),
        "unit": "months of delay (negative = ahead of schedule)",
        "model": meta["label"],
        "version": meta["version"],
        "source": "PAIMANA (MoSPI) official project reports",
    }


def predict_all(data):
    cost = predict_cost_pct(data)
    time_ = predict_time_months(data)

    # Risk bands kept compatible with the existing product spec 0-100 scale.
    c = max(0.0, min(100.0, cost["prediction"]))
    t = max(0.0, min(100.0, time_["prediction"]))
    risk = round(0.55 * c + 0.45 * t, 1)
    if risk <= 30:
        cat = "Low"
    elif risk <= 60:
        cat = "Moderate"
    elif risk <= 80:
        cat = "High"
    else:
        cat = "Critical"

    return {
        "costOverrunPct": cost["prediction"],
        "predictedFinalCost": cost["predictedFinalCost"],
        "timeOverrunMonths": time_["prediction"],
        "riskScore": risk,
        "riskCategory": cat,
        "costModel": cost["model"],
        "timeModel": time_["model"],
        "version": cost["version"],
        "source": "PAIMANA (MoSPI) official project reports",
    }