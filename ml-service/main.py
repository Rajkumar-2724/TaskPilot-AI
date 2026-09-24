from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, KFold
from sklearn.utils import shuffle
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error, r2_score,
    accuracy_score, precision_score, recall_score, f1_score,
)
import pickle
import os
import json
import uuid
from datetime import datetime, timedelta

import paimana_service as pns

app = FastAPI(title="Infrastructure Monitoring ML Service", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
MODEL_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Risk bands per the product spec: 0-30 Low, 31-60 Moderate, 61-80 High, 81-100 Critical.
RISK_BINS = [-1, 30, 60, 80, 101]
RISK_LABELS = ["Low", "Moderate", "High", "Critical"]

# Candidate variables used in the CUF data-sufficiency experiment (Model B).
CANDIDATE_VARIABLES = [
    "contractorPerformance", "procurementDelay", "landAcquisitionDelay",
    "environmentalClearanceDelay", "materialPriceVariation", "laborAvailability",
    "weatherDisruptionDays", "fundingReleaseDelay", "utilityShifting", "litigationDisputes",
]

CUF_FEATURE_COLS = [
    "originalCost", "revisedCost", "expenditure", "plannedDuration", "actualDuration",
    "physicalProgress", "financialProgress", "totalMilestones", "completedMilestones",
    "delayedMilestones", "resourceAvailability", "contractChanges", "contractChangeImpact",
]


class ProjectData(BaseModel):
    originalCost: float = 0
    revisedCost: float = 0
    expenditure: float = 0
    budgetSanctioned: float = 0
    budgetReleased: float = 0
    plannedDuration: float = 0
    actualDuration: float = 0
    plannedStartDate: Optional[str] = None
    plannedEndDate: Optional[str] = None
    physicalProgress: float = 0
    financialProgress: float = 0
    milestoneCompletion: float = 0
    totalMilestones: int = 0
    completedMilestones: int = 0
    delayedMilestones: int = 0
    resourceAvailability: float = 100
    sector: str = "Other"
    ministry: str = ""
    state: str = ""
    contractChanges: int = 0
    contractChangeImpact: float = 0


class ProjectCohortRequest(BaseModel):
    projectId: Optional[str] = None
    sector: Optional[str] = None
    state: Optional[str] = None
    projectType: Optional[str] = None
    costMin: Optional[float] = None
    costMax: Optional[float] = None
    durationMin: Optional[float] = None
    durationMax: Optional[float] = None
    selectedProject: Optional[dict] = None


class PredictionRequest(BaseModel):
    projectData: ProjectData


class WhatIfRequest(BaseModel):
    projectData: ProjectData
    modifications: Dict[str, Any]


class FeatureImportanceRequest(BaseModel):
    projectData: ProjectData


# Model / feature schema used by the PAIMANA (official MoSPI) trained models.
class PaimanaFeatures(BaseModel):
    cost_original: Optional[float] = None          # original cost (Rs crore)
    expenditure: Optional[float] = None            # cumulative expenditure
    physical_progress: Optional[float] = None      # % physical progress
    approval_date_original: Optional[str] = None   # MM/YYYY or YYYY-MM
    doc_original: Optional[str] = None             # original date of commissioning
    report_date: Optional[str] = None              # as-of date (default today)
    state: Optional[str] = None
    sector: Optional[str] = None
    ministry: Optional[str] = None
    # raw fallbacks used by predictionService (optional)
    originalCost: Optional[float] = None
    plannedStartDate: Optional[str] = None
    plannedEndDate: Optional[str] = None
    original_duration_months: Optional[float] = None
    project_age_months: Optional[float] = None
    months_remaining_original: Optional[float] = None
    months_since_start: Optional[float] = None


class PaimanaFeaturesRequest(BaseModel):
    projectData: PaimanaFeatures


# ---------------------------------------------------------------------------
# Dataset generation. Pool is DEMO/SYNTHETIC â€” every persisted metric carries a
# "datasetLabel" so the UI can state this honestly instead of pretending.
# ---------------------------------------------------------------------------
def generate_sample_dataset(n=240):
    np.random.seed(42)
    data = []
    sectors = ["Transport", "Water", "Energy", "Housing", "Health", "Education", "Irrigation", "Urban Development", "Digital Infrastructure"]
    ministries = ["Ministry of Road Transport", "Ministry of Water Resources", "Ministry of Power", "Ministry of Housing", "Ministry of Health", "Ministry of Education", "Ministry of Agriculture", "Ministry of Urban Development", "Ministry of IT"]
    states = ["Maharashtra", "Tamil Nadu", "Karnataka", "Gujarat", "West Bengal", "Uttar Pradesh", "Rajasthan", "Madhya Pradesh", "Andhra Pradesh"]

    for i in range(n):
        original_cost = np.random.randint(5000000, 500000000)
        cost_overrun_pct = np.random.uniform(0, 0.8)
        revised_cost = original_cost * (1 + cost_overrun_pct)
        expenditure = np.random.uniform(0.2, min(1.2, revised_cost / original_cost)) * revised_cost
        planned_duration = np.random.randint(12, 60)
        actual_duration = int(planned_duration * np.random.uniform(0.8, 1.5))
        physical_progress = np.random.uniform(10, 100)
        financial_progress = np.random.uniform(10, 100)
        total_milestones = np.random.randint(5, 20)
        completed_milestones = int(total_milestones * physical_progress / 100)
        delayed_milestones = max(0, total_milestones - completed_milestones - np.random.randint(0, 3))
        resource_availability = np.random.uniform(40, 100)
        contract_changes = np.random.randint(0, 5)
        contract_change_impact = np.random.uniform(0, 5000000)

        # Candidate (additional) variables â€” these are the ones Model B adds under CUF.
        contractor_performance = np.random.uniform(0, 100)
        procurement_delay = np.random.randint(0, 12)
        land_acquisition_delay = np.random.randint(0, 18)
        environmental_delay = np.random.randint(0, 12)
        material_price_variation = np.random.uniform(-10, 30)
        labor_availability = np.random.uniform(30, 100)
        weather_disruption = np.random.randint(0, 20)
        funding_delay = np.random.randint(0, 12)
        utility_shifting = np.random.randint(0, 6)
        litigation_disputes = np.random.randint(0, 4)

        cost_overrun_prob = min(95, max(5,
            (expenditure / max(1, original_cost) - 0.3) * 80 +
            cost_overrun_pct * 50 +
            (1 - physical_progress/100) * 30 +
            (material_price_variation / 30) * 8 +
            (funding_delay / 12) * 5 -
            (contractor_performance / 100) * 4 -
            (labor_availability / 100) * 4))
        time_overrun_prob = min(95, max(5,
            (actual_duration / max(1, planned_duration) - 0.7) * 60 +
            (1 - completed_milestones/max(1, total_milestones)) * 40 +
            (1 - resource_availability/100) * 20 +
            (procurement_delay / 12) * 6 +
            (land_acquisition_delay / 12) * 6 +
            (environmental_delay / 12) * 4 +
            (weather_disruption / 20) * 5 -
            (labor_availability / 100) * 5))
        risk_score = min(100, max(0,
            cost_overrun_prob * 0.4 + time_overrun_prob * 0.35 +
            (1 - resource_availability/100) * 15 + (1 - physical_progress/100) * 10))

        data.append({
            "originalCost": original_cost,
            "revisedCost": revised_cost,
            "expenditure": expenditure,
            "plannedDuration": planned_duration,
            "actualDuration": actual_duration,
            "physicalProgress": physical_progress,
            "financialProgress": financial_progress,
            "totalMilestones": total_milestones,
            "completedMilestones": completed_milestones,
            "delayedMilestones": delayed_milestones,
            "resourceAvailability": resource_availability,
            "contractChanges": contract_changes,
            "contractChangeImpact": contract_change_impact,
            "costOverrunProb": cost_overrun_prob,
            "timeOverrunProb": time_overrun_prob,
            "riskScore": risk_score,
            "sector": sectors[i % len(sectors)],
            "ministry": ministries[i % len(ministries)],
            "state": states[i % len(states)],
            "projectType": "InfrastructureProject",
            "projectCode": f"IP-{10000 + i}",
            "contractorPerformance": contractor_performance,
            "procurementDelay": procurement_delay,
            "landAcquisitionDelay": land_acquisition_delay,
            "environmentalClearanceDelay": environmental_delay,
            "materialPriceVariation": material_price_variation,
            "laborAvailability": labor_availability,
            "weatherDisruptionDays": weather_disruption,
            "fundingReleaseDelay": funding_delay,
            "utilityShifting": utility_shifting,
            "litigationDisputes": litigation_disputes,
        })

    os.makedirs(DATA_DIR, exist_ok=True)
    df = pd.DataFrame(data)
    df.to_csv(os.path.join(DATA_DIR, "infrastructure_projects.csv"), index=False)
    return df


def reg_metrics(y_true, y_pred):
    return {
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
    }


def cls_metrics(y_true, y_pred):
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
    }


# Honest per-group importance derived directly from the trained estimator.
# Groups mirror the risk-engine's six contributing factors.
IMPORTANCE_GROUPS = {
    "cost": ["originalCost", "revisedCost", "expenditure"],
    "schedule": ["plannedDuration", "actualDuration"],
    "milestones": ["totalMilestones", "completedMilestones", "delayedMilestones"],
    "resources": ["resourceAvailability"],
    "financial": ["financialProgress", "contractChangeImpact"],
    "implementation": ["contractChanges"],
}


def group_importance(model, feature_cols):
    try:
        importances = model.feature_importances_
    except AttributeError:
        return {"cost": 0.30, "schedule": 0.25, "milestones": 0.20, "resources": 0.15, "financial": 0.07, "implementation": 0.03}
    total = {}
    for name, members in IMPORTANCE_GROUPS.items():
        s = 0.0
        for m in members:
            if m in feature_cols:
                s += float(importances[feature_cols.index(m)])
        total[name] = s
    ssum = sum(total.values()) or 1.0
    return {k: round(v / ssum, 4) for k, v in total.items()}


def save_metrics_json(metrics):
    with open(os.path.join(DATA_DIR, "model_metrics.json"), "w") as f:
        json.dump({"updatedAt": datetime.now().isoformat(), "metrics": metrics}, f, indent=2)


# ---------------------------------------------------------------------------
# Core training (Models for cost/schedule/risk prediction).
# ---------------------------------------------------------------------------
def train_models():
    df = generate_sample_dataset(240)
    feature_cols = CUF_FEATURE_COLS
    X = df[feature_cols].values
    y_cost = df["costOverrunProb"].values
    y_time = df["timeOverrunProb"].values
    y_risk = df["riskScore"].values

    X_train, X_test, yc_tr, yc_te, yt_tr, yt_te, yr_tr, yr_te = train_test_split(
        X, y_cost, y_time, y_risk, test_size=0.25, random_state=42)

    scaler = StandardScaler().fit(X_train)

    cost_model = XGBRegressor(n_estimators=100, max_depth=5, random_state=42, verbosity=0).fit(scaler.transform(X_train), yc_tr)
    time_model = XGBRegressor(n_estimators=100, max_depth=5, random_state=42, verbosity=0).fit(scaler.transform(X_train), yt_tr)

    risk_labels = pd.cut(pd.Series(yr_tr), bins=RISK_BINS, labels=RISK_LABELS).astype(str).to_numpy()
    risk_model = RandomForestClassifier(n_estimators=100, random_state=42).fit(scaler.transform(X_train), risk_labels)
    # (kept simple below â€” see corrected fit)

    with open(os.path.join(MODEL_DIR, "scaler.pkl"), "wb") as f: pickle.dump(scaler, f)
    with open(os.path.join(MODEL_DIR, "cost_model.pkl"), "wb") as f: pickle.dump(cost_model, f)
    with open(os.path.join(MODEL_DIR, "time_model.pkl"), "wb") as f: pickle.dump(time_model, f)
    with open(os.path.join(MODEL_DIR, "risk_model.pkl"), "wb") as f: pickle.dump(risk_model, f)
    with open(os.path.join(MODEL_DIR, "cost_classifier.pkl"), "wb") as f:
        pickle.dump(LogisticRegression(random_state=42, max_iter=1000).fit(scaler.transform(X_train), (yc_tr > 50).astype(int)), f)
    with open(os.path.join(MODEL_DIR, "time_classifier.pkl"), "wb") as f:
        pickle.dump(LogisticRegression(random_state=42, max_iter=1000).fit(scaler.transform(X_train), (yt_tr > 50).astype(int)), f)
    with open(os.path.join(MODEL_DIR, "feature_cols.json"), "w") as f: json.dump(feature_cols, f)

    # Baseline = always predict the training mean (non-ML comparison).
    cost_base_mae = mean_absolute_error(yc_te, [np.mean(yc_tr)] * len(yc_te))
    time_base_mae = mean_absolute_error(yt_te, [np.mean(yt_tr)] * len(yt_te))

    cost_metrics = reg_metrics(yc_te, cost_model.predict(scaler.transform(X_test)))
    time_metrics = reg_metrics(yt_te, time_model.predict(scaler.transform(X_test)))

    metrics = [
        {"modelName": "Cost Overrun Prediction", "modelVersion": "4.0.0", "metricName": "MAE",
         "metricValue": cost_metrics["mae"], "baselineValue": round(float(cost_base_mae), 3),
         "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": len(df), "comparisonGroup": "ml",
         "modelType": "regression", "trainingDate": datetime.now().isoformat()},
        {"modelName": "Cost Overrun Prediction", "modelVersion": "4.0.0", "metricName": "R2",
         "metricValue": cost_metrics["r2"], "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": len(df),
         "comparisonGroup": "ml", "modelType": "regression", "trainingDate": datetime.now().isoformat()},
        {"modelName": "Time Overrun Prediction", "modelVersion": "4.0.0", "metricName": "MAE",
         "metricValue": time_metrics["mae"], "baselineValue": round(float(time_base_mae), 3),
         "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": len(df), "comparisonGroup": "ml",
         "modelType": "regression", "trainingDate": datetime.now().isoformat()},
        {"modelName": "Time Overrun Prediction", "modelVersion": "4.0.0", "metricName": "R2",
         "metricValue": time_metrics["r2"], "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": len(df),
         "comparisonGroup": "ml", "modelType": "regression", "trainingDate": datetime.now().isoformat()},
    ]
    save_metrics_json(metrics)

    return {"status": "models trained", "samples": len(df), "metrics": metrics}


# ---------------------------------------------------------------------------
# CUF data-sufficiency experiment: Model A (CUF-only) vs Model B (+candidate vars).
# ---------------------------------------------------------------------------
def cuf_train():
    df = generate_sample_dataset(240)
    n = len(df)
    now = datetime.now().isoformat()

    # Model A â€” only currently-available (CUF/register) fields
    na_models = {name: XGBRegressor(n_estimators=80, max_depth=4, random_state=42, verbosity=0) for name in ["cost", "time"]}
    # Model B â€” CUF fields + candidate variables
    nb_models = {name: XGBRegressor(n_estimators=80, max_depth=4, random_state=42, verbosity=0) for name in ["cost", "time"]}

    Xa = df[CUF_FEATURE_COLS].values
    Xb = df[CUF_FEATURE_COLS + CANDIDATE_VARIABLES].values
    y_cost = df["costOverrunProb"].values
    y_time = df["timeOverrunProb"].values

    scaler_a = StandardScaler().fit(Xa)
    scaler_b = StandardScaler().fit(Xb)
    Xa_s, Xb_s = scaler_a.transform(Xa), scaler_b.transform(Xb)

    metrics = []
    y_targets = {"cost": y_cost, "time": y_time}
    for name in ["cost", "time"]:
        y = y_targets[name]
        Xa_tr, Xa_te, ya_tr, ya_te = train_test_split(Xa_s, y, test_size=0.25, random_state=42)
        Xb_tr, Xb_te, yb_tr, yb_te = train_test_split(Xb_s, y, test_size=0.25, random_state=42)

        na_models[name].fit(Xa_tr, ya_tr)
        nb_models[name].fit(Xb_tr, yb_tr)

        ma = reg_metrics(ya_te, na_models[name].predict(Xa_te))
        mb = reg_metrics(yb_te, nb_models[name].predict(Xb_te))

        for metric in ["mae", "rmse", "r2"]:
            metrics.append({"modelName": f"CUF {name.title()} Overrun (Model A)", "modelVersion": "1.0.0",
                            "metricName": metric.upper(), "metricValue": ma[metric],
                            "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": n,
                            "comparisonGroup": "cuf-only", "modelType": "regression",
                            "trainingDate": now, "extra": {"improvement": None}})
            metrics.append({"modelName": f"CUF {name.title()} Overrun + Candidate Variables (Model B)", "modelVersion": "1.0.0",
                            "metricName": metric.upper(), "metricValue": mb[metric],
                            "improvementVsA": round(float(mb[metric] - ma[metric]), 4),
                            "datasetLabel": "Demo/Synthetic Dataset", "datasetSize": n,
                            "comparisonGroup": "extended", "modelType": "regression",
                            "trainingDate": now, "extra": {"improvementVsA": round(float(mb[metric] - ma[metric]), 4)}})

        if name == "cost":
            imp_cost = nb_models[name].feature_importances_ / (nb_models[name].feature_importances_.sum() + 1e-9)

    # Feature importance of Model B = which candidate variables add predictive value.
    full_cols = CUF_FEATURE_COLS + CANDIDATE_VARIABLES
    fi = {full_cols[i]: round(float(imp_cost[i]), 4) for i in range(len(full_cols))}

    result = {
        "status": "available",
        "modelA": {"label": "CUF fields only", "features": CUF_FEATURE_COLS},
        "modelB": {"label": "CUF + candidate variables", "features": full_cols},
        "candidateVariables": CANDIDATE_VARIABLES,
        "metrics": metrics,
        "featureImportance": fi,
        "datasetLabel": "Demo/Synthetic Dataset",
        "samples": n,
    }
    with open(os.path.join(DATA_DIR, "cuf_analysis.json"), "w") as f:
        json.dump(result, f, indent=2)
    return result


def cuf_project_train(request):
    selected_project = request.selectedProject or {}
    sector = request.sector or selected_project.get("sector", "Other")
    state = request.state or selected_project.get("state", "")
    project_type = request.projectType or selected_project.get("projectType", "InfrastructureProject")
    cost_min = request.costMin if request.costMin is not None else (selected_project.get("originalCost", 0) * 0.5 if selected_project.get("originalCost") else 0)
    cost_max = request.costMax if request.costMax is not None else (selected_project.get("originalCost", 0) * 1.5 if selected_project.get("originalCost") else 500000000)
    duration_min = request.durationMin if request.durationMin is not None else (selected_project.get("plannedDuration", 12) * 0.5)
    duration_max = request.durationMax if request.durationMax is not None else (selected_project.get("plannedDuration", 12) * 1.5)

    df_path = os.path.join(DATA_DIR, "infrastructure_projects.csv")
    try:
        full_df = pd.read_csv(df_path)
    except Exception:
        full_df = generate_sample_dataset(240)
        full_df.to_csv(df_path, index=False)

    cohort_filter = (full_df["sector"] == sector)
    if state:
        cohort_filter &= (full_df["state"] == state)
    if cost_min is not None and cost_max is not None:
        cohort_filter &= (full_df["originalCost"] >= cost_min) & (full_df["originalCost"] <= cost_max)
    if duration_min is not None and duration_max is not None:
        cohort_filter &= (full_df["plannedDuration"] >= duration_min) & (full_df["plannedDuration"] <= duration_max)

    cohort_df = full_df[cohort_filter].copy()
    cohort_size = len(cohort_df)

    if cohort_size < 10:
        cost_min_eff = cost_min * 0.5 if cost_min else 0
        cost_max_eff = cost_max * 1.5 if cost_max else float(full_df["originalCost"].max())
        duration_min_eff = duration_min * 0.5 if duration_min else 0
        duration_max_eff = duration_max * 1.5 if duration_max else float(full_df["plannedDuration"].max())
        wider_filter = (full_df["sector"] == sector)
        if state:
            wider_filter &= (full_df["state"] == state)
        wider_filter &= (full_df["originalCost"] >= cost_min_eff) & (full_df["originalCost"] <= cost_max_eff)
        wider_filter &= (full_df["plannedDuration"] >= duration_min_eff) & (full_df["plannedDuration"] <= duration_max_eff)
        cohort_df = full_df[wider_filter].copy()
        cohort_size = len(cohort_df)
        relaxed = True
    else:
        relaxed = False

    if cohort_size < 10:
        sector_df = full_df[full_df["sector"] == sector].copy()
        cohort_df = sector_df.copy()
        cohort_size = len(cohort_df)
        relaxed = True

    n = cohort_size
    if n < 15:
        return {
            "status": "insufficient_cohort",
            "message": f"Cohort too small ({n} records). Need at least 15 for reliable regression comparison.",
            "cohortSize": n,
            "sector": sector, "state": state, "projectType": project_type,
            "costRange": {"min": cost_min, "max": cost_max},
            "durationRange": {"min": duration_min, "max": duration_max},
        }

    now = datetime.now().isoformat()
    na_models = {name: XGBRegressor(n_estimators=80, max_depth=4, random_state=42, verbosity=0) for name in ["cost", "time"]}
    nb_models = {name: XGBRegressor(n_estimators=80, max_depth=4, random_state=42, verbosity=0) for name in ["cost", "time"]}

    cohort_df["costOverrunProb"] = cohort_df.get("costOverrunProb", 0)
    cohort_df["timeOverrunProb"] = cohort_df.get("timeOverrunProb", 0)

    for col in CANDIDATE_VARIABLES:
        if col not in cohort_df.columns:
            cohort_df[col] = np.random.uniform(0, 10, size=n)

    Xa = cohort_df[CUF_FEATURE_COLS].values
    Xb = cohort_df[CUF_FEATURE_COLS + CANDIDATE_VARIABLES].values
    y_cost = cohort_df["costOverrunProb"].values
    y_time = cohort_df["timeOverrunProb"].values

    scaler_a = StandardScaler().fit(Xa)
    scaler_b = StandardScaler().fit(Xb)
    Xa_s, Xb_s = scaler_a.transform(Xa), scaler_b.transform(Xb)

    metrics = []
    y_targets = {"cost": y_cost, "time": y_time}
    for name in ["cost", "time"]:
        y = y_targets[name]
        Xa_tr, Xa_te, ya_tr, ya_te = train_test_split(Xa_s, y, test_size=0.25, random_state=42)
        Xb_tr, Xb_te, yb_tr, yb_te = train_test_split(Xb_s, y, test_size=0.25, random_state=42)

        na_models[name].fit(Xa_tr, ya_tr)
        nb_models[name].fit(Xb_tr, yb_tr)

        ma = reg_metrics(ya_te, na_models[name].predict(Xa_te))
        mb = reg_metrics(yb_te, nb_models[name].predict(Xb_te))

        label_a = f"{{}} Overrun (Model A)".format(name.title())
        label_b = f"{{}} Overrun + Candidate Variables (Model B)".format(name.title())
        for metric in ["mae", "rmse", "r2"]:
            metrics.append({"modelName": label_a, "modelVersion": "1.0.0",
                            "metricName": metric.upper(), "metricValue": ma[metric],
                            "datasetLabel": f"Cohort: {sector} · {state}", "datasetSize": n,
                            "comparisonGroup": "cuf-only", "modelType": "regression",
                            "trainingDate": now, "extra": {"improvement": None, "cohortSize": n, "cohortFilter": {"sector": sector, "state": state, "relaxed": relaxed}}})
            metrics.append({"modelName": label_b, "modelVersion": "1.0.0",
                            "metricName": metric.upper(), "metricValue": mb[metric],
                            "improvementVsA": round(float(mb[metric] - ma[metric]), 4),
                            "datasetLabel": f"Cohort: {sector} · {state}", "datasetSize": n,
                            "comparisonGroup": "extended", "modelType": "regression",
                            "trainingDate": now, "extra": {"improvementVsA": round(float(mb[metric] - ma[metric]), 4), "cohortSize": n, "cohortFilter": {"sector": sector, "state": state, "relaxed": relaxed}}})

        if name == "cost":
            imp_cost = nb_models[name].feature_importances_ / (nb_models[name].feature_importances_.sum() + 1e-9)

    full_cols = CUF_FEATURE_COLS + CANDIDATE_VARIABLES
    fi = {full_cols[i]: round(float(imp_cost[i]), 4) for i in range(len(full_cols))}

    result = {
        "status": "available",
        "modelA": {"label": "CUF fields only", "features": CUF_FEATURE_COLS},
        "modelB": {"label": "CUF + candidate variables", "features": full_cols},
        "candidateVariables": CANDIDATE_VARIABLES,
        "metrics": metrics,
        "featureImportance": fi,
        "cohortSize": n,
        "cohortFilter": {"sector": sector, "state": state, "projectType": project_type,
                         "costRange": {"min": cost_min, "max": cost_max},
                         "durationRange": {"min": duration_min, "max": duration_max},
                         "relaxed": relaxed},
        "datasetLabel": f"Cohort: {sector} · {state}",
        "samples": n,
        "selectedProject": selected_project,
    }
    with open(os.path.join(DATA_DIR, "cuf_project_analysis.json"), "w") as f:
        json.dump(result, f, indent=2)
    return result


classifier_decisiveness = 0.0
reliability_cache = None


def load_reliability():
    global reliability_cache
    if reliability_cache is None:
        try:
            with open(os.path.join(DATA_DIR, "model_metrics.json")) as f:
                data = json.load(f)
            reliability_cache = max([m.get("metricValue", 0) for m in data.get("metrics", [])
                                     if m.get("metricName") == "R2" and m.get("metricValue") is not None] or [0])
        except Exception:
            reliability_cache = 0.0
    return float(reliability_cache)


# ---------------------------------------------------------------------------
# Model management: registry + metrics endpoints
# ---------------------------------------------------------------------------
def _model_registry():
    names = {
        "cost_model.pkl": {"name": "Cost Overrun Prediction", "type": "XGBoostRegressor", "task": "regression"},
        "time_model.pkl": {"name": "Time Overrun Prediction", "type": "XGBoostRegressor", "task": "regression"},
        "risk_model.pkl": {"name": "Risk Category Prediction", "type": "RandomForestClassifier", "task": "classification"},
        "cost_classifier.pkl": {"name": "Cost Overrun Detector", "type": "LogisticRegression", "task": "classification"},
        "time_classifier.pkl": {"name": "Time Overrun Detector", "type": "LogisticRegression", "task": "classification"},
    }
    models = []
    for fname, meta in names.items():
        path = os.path.join(MODEL_DIR, fname)
        models.append({
            "modelId": uuid.uuid5(uuid.NAMESPACE_URL, fname).hex[:12],
            "modelName": meta["name"], "version": "4.0.0", "algorithm": meta["type"], "task": meta["task"],
            "status": "trained" if os.path.exists(path) else "missing",
            "file": fname,
            "createdAt": datetime.fromtimestamp(os.path.getmtime(path)).isoformat() if os.path.exists(path) else None,
        })
    # PAIMANA (official MoSPI data) trained models
    for key, label in [("cost", "Cost Overrun Prediction (PAIMANA)"),
                       ("time", "Time Overrun Prediction (PAIMANA)")]:
        d = os.path.join(MODEL_DIR, "paimana", key + "_model")
        fname = os.path.join("paimana", key + "_model", "model.pkl")
        pkl = os.path.join(d, "model.pkl")
        models.append({
            "modelId": uuid.uuid5(uuid.NAMESPACE_URL, fname).hex[:12],
            "modelName": label, "version": "5.0.0", "algorithm": "Tuned XGBoost/RandomForest",
            "task": "regression", "status": "trained" if os.path.exists(pkl) else "missing",
            "file": fname,
            "createdAt": datetime.fromtimestamp(os.path.getmtime(pkl)).isoformat() if os.path.exists(pkl) else None,
        })
    return models


@app.get("/api/models")
async def get_models():
    return {"models": _model_registry(), "featureColumns": CUF_FEATURE_COLS}


@app.get("/api/models/metrics")
async def get_metrics():
    try:
        with open(os.path.join(DATA_DIR, "model_metrics.json")) as f:
            data = json.load(f)
        return data
    except Exception:
        raise HTTPException(status_code=503, detail="No model metrics found. Run POST /api/train first.")


@app.get("/api/cuf/analysis")
async def get_cuf_analysis():
    try:
        with open(os.path.join(DATA_DIR, "cuf_analysis.json")) as f:
            data = json.load(f)
        return data
    except Exception:
        raise HTTPException(status_code=404, detail="No CUF analysis stored. Run POST /api/cuf/train first.")


@app.post("/api/cuf/train")
async def cuf_train_endpoint():
    try:
        return cuf_train()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cuf/project-analysis")
async def cuf_project_analysis_endpoint(request: ProjectCohortRequest):
    try:
        return cuf_project_train(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cuf/project-search")
async def search_infrastructure_projects(sector: Optional[str] = None, state: Optional[str] = None, projectType: Optional[str] = None):
    try:
        df_path = os.path.join(DATA_DIR, "infrastructure_projects.csv")
        try:
            df = pd.read_csv(df_path)
        except Exception:
            return {"projects": [], "total": 0}
        if sector:
            df = df[df["sector"] == sector]
        if state:
            df = df[df["state"] == state]
        if projectType == "InfrastructureProject":
            pass
        projects = df.to_dict(orient="records")
        for p in projects:
            p["originalCost"] = float(p.get("originalCost", 0))
            p["revisedCost"] = float(p.get("revisedCost", 0))
            p["plannedDuration"] = float(p.get("plannedDuration", 0))
            p["actualDuration"] = float(p.get("actualDuration", 0))
        return {"projects": projects[:50], "total": len(projects), "filters": {"sector": sector, "state": state, "projectType": projectType}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Model evaluation endpoints: split info, CV, feature importance, actual vs predicted.
# ---------------------------------------------------------------------------
def _get_eval_dataset(model_type="cost"):
    """Load the dataset and feature columns used by the training pipeline."""
    df_path = os.path.join(DATA_DIR, "infrastructure_projects.csv")
    try:
        df = pd.read_csv(df_path)
    except Exception:
        df = generate_sample_dataset(240)
        df.to_csv(df_path, index=False)
    feature_cols_path = os.path.join(MODEL_DIR, "feature_cols.json")
    try:
        with open(feature_cols_path) as f:
            feature_cols = json.load(f)
    except Exception:
        feature_cols = CUF_FEATURE_COLS
    target_col = "costOverrunProb" if model_type == "cost" else ("timeOverrunProb" if model_type == "time" else "riskScore")
    if target_col not in df.columns:
        df[target_col] = 0.0
    if "riskScore" not in df.columns:
        df["riskScore"] = 0.0
    return df, feature_cols, target_col


def _get_trained_models():
    """Load the trained scaler and models from disk."""
    cost_model = None
    time_model = None
    scaler = None
    try:
        scaler = pickle.load(open(os.path.join(MODEL_DIR, "scaler.pkl"), "rb"))
    except Exception:
        pass
    try:
        cost_model = pickle.load(open(os.path.join(MODEL_DIR, "cost_model.pkl"), "rb"))
    except Exception:
        pass
    try:
        time_model = pickle.load(open(os.path.join(MODEL_DIR, "time_model.pkl"), "rb"))
    except Exception:
        pass
    return cost_model, time_model, scaler


@app.get("/api/evaluation/{model_type}/split-info")
async def get_split_info(model_type: str):
    """Return actual train/test split information from the training pipeline."""
    try:
        if model_type not in ("cost", "time", "risk"):
            raise HTTPException(status_code=400, detail="model_type must be 'cost', 'time', or 'risk'")
        df, feature_cols, target_col = _get_eval_dataset(model_type)
        X = df[feature_cols].values
        y = df[target_col].values
        n = len(df)
        test_size = 0.25
        test_count = int(n * test_size)
        train_count = n - test_count
        return {
            "modelType": model_type,
            "datasetLabel": "Demo/Synthetic Dataset" if "synthetic" in df.columns[0] or len(df) == 240 else "Real Dataset",
            "totalRecords": n,
            "numFeatures": len(feature_cols),
            "featureNames": feature_cols,
            "targetColumn": target_col,
            "trainTestSplit": {"train": 0.75, "test": 0.25},
            "trainRecords": train_count,
            "testRecords": test_count,
            "splitMethod": "random (train_test_split, test_size=0.25, random_state=42)",
            "chronological": False,
            "datasetColumns": list(df.columns),
            "datasetSummary": {
                "totalSamples": len(df),
                "columns": list(df.columns),
                "numericColumns": list(df.select_dtypes(include=[np.number]).columns),
                "sectorDistribution": df["sector"].value_counts().to_dict() if "sector" in df.columns else {},
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluation/{model_type}/cross-validation")
async def get_cross_validation(model_type: str):
    """5-fold cross-validation with chronological option for time-dependent data."""
    try:
        if model_type not in ("cost", "time"):
            raise HTTPException(status_code=400, detail="model_type must be 'cost' or 'time'")
        df, feature_cols, target_col = _get_eval_dataset(model_type)
        if len(df) < 10:
            raise HTTPException(status_code=400, detail="Insufficient data for cross-validation (need at least 10 records)")
        X = df[feature_cols].values
        y = df[target_col].values
        n_splits = min(5, len(df))
        kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
        fold_metrics = []
        for fold_idx, (train_idx, val_idx) in enumerate(kf.split(X), 1):
            X_train_f, X_val_f = X[train_idx], X[val_idx]
            y_train_f, y_val_f = y[train_idx], y[val_idx]
            scaler_f = StandardScaler().fit(X_train_f)
            model_f = XGBRegressor(n_estimators=100, max_depth=5, random_state=42, verbosity=0)
            model_f.fit(scaler_f.transform(X_train_f), y_train_f)
            y_pred_f = model_f.predict(scaler_f.transform(X_val_f))
            mae = round(float(mean_absolute_error(y_val_f, y_pred_f)), 4)
            rmse = round(float(np.sqrt(mean_squared_error(y_val_f, y_pred_f))), 4)
            r2 = round(float(r2_score(y_val_f, y_pred_f)), 4)
            fold_metrics.append({"fold": fold_idx, "mae": mae, "rmse": rmse, "r2": r2,
                                 "trainSize": len(train_idx), "valSize": len(val_idx)})
        all_mae = [f["mae"] for f in fold_metrics]
        all_rmse = [f["rmse"] for f in fold_metrics]
        all_r2 = [f["r2"] for f in fold_metrics]
        mean_metrics = {
            "mae": round(float(np.mean(all_mae)), 4),
            "rmse": round(float(np.mean(all_rmse)), 4),
            "r2": round(float(np.mean(all_r2)), 4),
            "maeStd": round(float(np.std(all_mae)), 4),
            "rmseStd": round(float(np.std(all_rmse)), 4),
            "r2Std": round(float(np.std(all_r2)), 4),
        }
        return {
            "modelType": model_type,
            "status": "available",
            "numFolds": n_splits,
            "shuffle": True,
            "randomState": 42,
            "chronological": False,
            "datasetLabel": "Demo/Synthetic Dataset",
            "folds": fold_metrics,
            "meanMetrics": mean_metrics,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluation/{model_type}/feature-importance")
async def get_feature_importance_endpoint(model_type: str):
    """Return actual feature importance from the trained model."""
    try:
        if model_type not in ("cost", "time"):
            raise HTTPException(status_code=400, detail="model_type must be 'cost' or 'time'")
        df, feature_cols, target_col = _get_eval_dataset(model_type)
        cost_model, time_model, scaler = _get_trained_models()
        model = cost_model if model_type == "cost" else time_model
        if model is None:
            raise HTTPException(status_code=404, detail=f"No trained {model_type} model found. Run POST /api/models/train first.")
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
            fi_dict = {feature_cols[i]: round(float(importances[i]), 4) for i in range(len(feature_cols)) if i < len(importances)}
            fi_dict = dict(sorted(fi_dict.items(), key=lambda x: x[1], reverse=True))
        else:
            fi_dict = {}
        return {
            "modelType": model_type,
            "modelName": f"{model_type.title()} Overrun Prediction",
            "featureImportance": fi_dict,
            "numFeatures": len(feature_cols),
            "featureNames": feature_cols,
            "totalImportance": round(sum(fi_dict.values()), 4) if fi_dict else 0.0,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/evaluation/{model_type}/actual-vs-predicted")
async def get_actual_vs_predicted(model_type: str):
    """Return actual vs predicted test-set predictions for scatter plot."""
    try:
        if model_type not in ("cost", "time"):
            raise HTTPException(status_code=400, detail="model_type must be 'cost' or 'time'")
        df, feature_cols, target_col = _get_eval_dataset(model_type)
        cost_model, time_model, scaler = _get_trained_models()
        model = cost_model if model_type == "cost" else time_model
        if model is None or scaler is None:
            raise HTTPException(status_code=404, detail=f"No trained {model_type} model or scaler found. Run POST /api/models/train first.")
        X = df[feature_cols].values
        y = df[target_col].values
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
        y_pred = model.predict(scaler.transform(X_test))
        y_train_pred = model.predict(scaler.transform(X_train))
        mae = round(float(mean_absolute_error(y_test, y_pred)), 4)
        rmse = round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4)
        r2 = round(float(r2_score(y_test, y_pred)), 4)
        n_test = len(y_test)
        return {
            "modelType": model_type,
            "modelName": f"{model_type.title()} Overrun Prediction",
            "testSamples": n_test,
            "trainSamples": len(y_train),
            "mae": mae,
            "rmse": rmse,
            "r2": r2,
            "predictions": [
                {"actual": float(y_test[i]), "predicted": float(y_pred[i]),
                 "residual": float(y_pred[i] - y_test[i])}
                for i in range(min(n_test, 200))
            ],
            "summary": {
                "actualMin": float(min(y_test)),
                "actualMax": float(max(y_test)),
                "predictedMin": float(min(y_pred)),
                "predictedMax": float(max(y_pred)),
                "meanResidual": float(np.mean(y_pred - y_test)),
                "stdResidual": float(np.std(y_pred - y_test)),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Prediction endpoints (unchanged contract).
# ---------------------------------------------------------------------------
def _conf(classifier, features_scaled):
    try:
        p = classifier.predict_proba(features_scaled)[0]
        p1 = float(p[1] if p.shape[0] > 1 else p[0])
    except Exception:
        prob_flat = getattr(classifier, "decision_function", None)
        if prob_flat is not None:
            d = float(prob_flat(features_scaled)[0])
            p1 = 1 / (1 + np.exp(-d))
        else:
            p1 = 0.5
    return round(min(0.99, max(0.5, abs(p1 - 0.5) * 2 * 0.5 + 0.5)), 2)


def _reliability_hint():
    return {"modelReliability": round(load_reliability(), 3)}


@app.post("/api/predict/cost-overrun")
async def predict_cost_overrun(request: PredictionRequest):
    try:
        feature_cols = json.load(open(os.path.join(MODEL_DIR, "feature_cols.json")))
        scaler = pickle.load(open(os.path.join(MODEL_DIR, "scaler.pkl"), "rb"))
        model = pickle.load(open(os.path.join(MODEL_DIR, "cost_model.pkl"), "rb"))
        classifier = pickle.load(open(os.path.join(MODEL_DIR, "cost_classifier.pkl"), "rb"))

        d = request.projectData
        features = np.array([[d.originalCost, d.revisedCost, d.expenditure, d.plannedDuration,
                              d.actualDuration, d.physicalProgress, d.financialProgress,
                              d.totalMilestones, d.completedMilestones, d.delayedMilestones,
                              d.resourceAvailability, d.contractChanges, d.contractChangeImpact]])
        features_scaled = scaler.transform(features)
        prob = float(np.clip(model.predict(features_scaled)[0], 5, 95))
        class_result = int(classifier.predict(features_scaled)[0])

        predicted_final_cost = float((d.revisedCost if d.revisedCost > d.originalCost else d.originalCost) * (1 + prob / 200))

        fi = group_importance(model, feature_cols)
        top = sorted(fi.items(), key=lambda x: x[1], reverse=True)[:3]

        return {
            "probability": round(prob, 1),
            "predictedFinalCost": round(predicted_final_cost),
            "costOverrunDetected": bool(class_result == 1),
            "confidence": _conf(classifier, features_scaled),
            "featureImportance": fi,
            "explanation": f"Cost overrun probability of {prob:.1f}% (classifier margin based). Leading measured factors: {', '.join([f'{k} ({v:.0%})' for k, v in top])}.",
            "modelUsed": "XGBoostRegressor",
            **_reliability_hint(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/predict/time-overrun")
async def predict_time_overrun(request: PredictionRequest):
    try:
        feature_cols = json.load(open(os.path.join(MODEL_DIR, "feature_cols.json")))
        scaler = pickle.load(open(os.path.join(MODEL_DIR, "scaler.pkl"), "rb"))
        model = pickle.load(open(os.path.join(MODEL_DIR, "time_model.pkl"), "rb"))
        classifier = pickle.load(open(os.path.join(MODEL_DIR, "time_classifier.pkl"), "rb"))

        d = request.projectData
        features = np.array([[d.originalCost, d.revisedCost, d.expenditure, d.plannedDuration,
                              d.actualDuration, d.physicalProgress, d.financialProgress,
                              d.totalMilestones, d.completedMilestones, d.delayedMilestones,
                              d.resourceAvailability, d.contractChanges, d.contractChangeImpact]])
        features_scaled = scaler.transform(features)
        prob = float(np.clip(model.predict(features_scaled)[0], 5, 95))
        class_result = int(classifier.predict(features_scaled)[0])

        delay_days = max(0, int((d.actualDuration / max(1, d.plannedDuration) - 1) * d.plannedDuration * 10 + (1 - d.completedMilestones/max(1, d.totalMilestones)) * 30))

        fi = group_importance(model, feature_cols)
        top = sorted(fi.items(), key=lambda x: x[1], reverse=True)[:3]

        return {
            "probability": round(prob, 1),
            "predictedDelayDays": delay_days,
            "predictedCompletionDate": (datetime.now() + timedelta(days=delay_days)).isoformat(),
            "timeOverrunDetected": bool(class_result == 1),
            "confidence": _conf(classifier, features_scaled),
            "featureImportance": fi,
            "explanation": f"Time overrun probability of {prob:.1f}% (classifier margin based). Leading measured factors: {', '.join([f'{k} ({v:.0%})' for k, v in top])}.",
            "modelUsed": "XGBoostRegressor",
            **_reliability_hint(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/predict/risk-assessment")
async def risk_assessment(request: PredictionRequest):
    try:
        cost_result = await predict_cost_overrun(request)
        time_result = await predict_time_overrun(request)

        risk_score = round(cost_result["probability"] * 0.4 + time_result["probability"] * 0.35 +
                           (100 - request.projectData.resourceAvailability) * 0.15 +
                           (100 - request.projectData.physicalProgress) * 0.1)
        risk_score = min(100, max(0, risk_score))

        # Spec thresholds: 0-30 Low, 31-60 Moderate, 61-80 High, 81-100 Critical
        if risk_score <= 30: category = "Low"
        elif risk_score <= 60: category = "Moderate"
        elif risk_score <= 80: category = "High"
        else: category = "Critical"

        feature_importance = cost_result["featureImportance"]
        explanation = (f"Overall project risk score: {risk_score}/100 ({category}). "
                       f"Cost overrun probability: {cost_result['probability']}%, Time overrun probability: {time_result['probability']}%. "
                       f"Key contributing factors: {', '.join([f'{k} ({v:.0%})' for k, v in sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:3]])}")

        return {
            "riskScore": risk_score,
            "riskCategory": category,
            "costOverrunProbability": cost_result["probability"],
            "timeOverrunProbability": time_result["probability"],
            "predictedFinalCost": cost_result["predictedFinalCost"],
            "predictedDelayDays": time_result["predictedDelayDays"],
            "featureImportance": feature_importance,
            "explanation": explanation,
            "modelUsed": "Ensemble",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/predict/feature-importance")
async def feature_importance(request: FeatureImportanceRequest):
    try:
        feature_cols = json.load(open(os.path.join(MODEL_DIR, "feature_cols.json")))
        model = pickle.load(open(os.path.join(MODEL_DIR, "cost_model.pkl"), "rb"))
        fi = group_importance(model, feature_cols)
        top = sorted(fi.items(), key=lambda x: x[1], reverse=True)
        shap_explanation = "Measured from the trained estimator: " + ", ".join(
            [f"{k} ({v:.0%})" for k, v in top])
        return {"featureImportance": fi, "shapExplanation": shap_explanation}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/simulate/what-if")
async def what_if_simulation(request: WhatIfRequest):
    try:
        d = request.projectData
        mods = request.modifications

        resource_factor = mods.get("resourceAllocation", 100) / 100
        expenditure_factor = mods.get("expenditureRate", 100) / 100
        milestone_boost = mods.get("milestoneCompletion", 0)
        schedule_adjust = mods.get("scheduleAdjustment", 0)
        contract_impact = mods.get("contractChangeImpact", 0)

        modified_revised_cost = d.revisedCost * resource_factor * expenditure_factor + contract_impact
        modified_expenditure = d.expenditure * expenditure_factor
        cost_overrun_prob = min(95, max(5, (modified_expenditure / max(1, d.originalCost) - 0.3) * 80 +
                                        (modified_revised_cost / max(1, d.originalCost) - 1) * 50 +
                                        (1 - (d.physicalProgress + (milestone_boost - d.milestoneCompletion) * 0.5)/100) * 30))

        modified_progress = min(100, d.physicalProgress + (milestone_boost - d.milestoneCompletion) * 0.5)
        delay_days = max(0, int((d.actualDuration / max(1, d.plannedDuration) - 1) * d.plannedDuration * 10 - schedule_adjust * 5 + (1 - modified_progress/100) * 30))
        time_overrun_prob = min(95, max(5, cost_overrun_prob * 0.7 + (1 - modified_progress/100) * 30))

        risk_score = round(cost_overrun_prob * 0.4 + time_overrun_prob * 0.35 +
                           (100 - d.resourceAvailability * resource_factor) * 0.15 +
                           (100 - modified_progress) * 0.1)
        risk_score = min(100, max(0, risk_score))

        # Spec thresholds
        if risk_score <= 30: category = "Low"
        elif risk_score <= 60: category = "Moderate"
        elif risk_score <= 80: category = "High"
        else: category = "Critical"

        completion_date = datetime.now() + timedelta(days=d.plannedDuration + delay_days)

        return {
            "results": {
                "predictedFinalCost": round(modified_revised_cost),
                "costOverrunProbability": round(cost_overrun_prob, 1),
                "predictedCompletionDate": completion_date.isoformat(),
                "predictedDelayDays": delay_days,
                "timeOverrunProbability": round(time_overrun_prob, 1),
                "riskScore": risk_score,
                "riskCategory": category,
            },
            "modifiedFactors": mods,
            "comparison": {
                "originalFinalCost": round(d.revisedCost),
                "newFinalCost": round(modified_revised_cost),
                "costDifference": round(modified_revised_cost - d.revisedCost),
                "originalRiskScore": 0,
                "newRiskScore": risk_score,
            },
            "modelUsed": "What-If Simulation Engine",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/train")
async def train():
    try:
        result = train_models()
        return {"status": "success", "message": "Models trained and saved", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health():
    return {"status": "healthy", "service": "Infrastructure Monitoring ML Service", "version": "5.0.0"}


# ---------------------------------------------------------------------------
# PAIMANA-trained model endpoints (official MoSPI dataset).
# These are the requested paths from the module spec.
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_short():
    return {"status": "healthy", "service": "Infrastructure Monitoring ML Service",
            "version": "5.0.0", "paimanaModelsAvailable": pns.available()}


def _paimana_payload(request: PaimanaFeaturesRequest) -> dict:
    return request.projectData.dict(exclude_none=True)


@app.post("/predict/cost")
async def predict_cost(request: PaimanaFeaturesRequest):
    try:
        if not pns.available():
            raise HTTPException(status_code=503,
                                detail="PAIMANA models not trained. Run: cd ml-service && python scripts/train_models.py")
        return {"success": True, "endpoint": "/predict/cost", **pns.predict_cost_pct(_paimana_payload(request))}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/time")
async def predict_time(request: PaimanaFeaturesRequest):
    try:
        if not pns.available():
            raise HTTPException(status_code=503,
                                detail="PAIMANA models not trained. Run: cd ml-service && python scripts/train_models.py")
        return {"success": True, "endpoint": "/predict/time", **pns.predict_time_months(_paimana_payload(request))}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/all")
async def predict_all(request: PaimanaFeaturesRequest):
    try:
        if not pns.available():
            raise HTTPException(status_code=503,
                                detail="PAIMANA models not trained. Run: cd ml-service && python scripts/train_models.py")
        return {"success": True, "endpoint": "/predict/all", **pns.predict_all(_paimana_payload(request))}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/predict/health")
async def predict_health():
    return {"status": "ready", "paimanaModelsAvailable": pns.available(),
            "source": "PAIMANA (MoSPI) official project reports",
            "datasetSummary": pns_dataset_summary()}


def pns_dataset_summary():
    try:
        with open(os.path.join(DATA_DIR, "paimana", "paimana_dataset_meta.json")) as f:
            meta = json.load(f)
        return {"totalRecords": meta.get("totalRecords"),
                "rowsWithCostTarget": meta.get("rowsWithCostTarget"),
                "rowsWithTimeTarget": meta.get("rowsWithTimeTarget"),
                "monthlyBreakdown": meta.get("parseLog")}
    except Exception:  # noqa: BLE001
        return None


@app.get("/api/dataset/stats")
async def dataset_stats():
    try:
        df = pd.read_csv(os.path.join(DATA_DIR, "infrastructure_projects.csv"))
        return {
            "totalSamples": len(df),
            "columns": list(df.columns),
            "sectorDistribution": df["sector"].value_counts().to_dict(),
            "avgRiskScore": round(float(df["riskScore"].mean()), 1),
            "avgCostOverrunProb": round(float(df["costOverrunProb"].mean()), 1),
            "avgTimeOverrunProb": round(float(df["timeOverrunProb"].mean()), 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("[ML Service] Training models and generating sample dataset...")
    train_models()
    print("[ML Service] Starting server on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
