# ML Methodology

The Python service (`ml-service/main.py`) trains XGBoost and scikit-learn models
locally and exposes them over FastAPI.

As of **v5.0.0** the primary cost/time overrun models are trained on **real
official data**: 10,623 project-month records parsed from PAIMANA (MoSPI)
Project Monitoring Division Flash Reports (FY 2025-26, Jul 2025 – Mar 2026).
The earlier demo models (`/api/predict/*`, synthetic 240-row dataset) remain as
a legacy extension.

## PAIMANA-trained models (real data)

| Endpoint | Model | Target | Data |
|---|---|---|---|
| `POST /predict/cost` | RandomForest (selected) | cost overrun vs original cost (%) | PAIMANA |
| `POST /predict/time` | XGBoost (selected) | time overrun in months | PAIMANA |
| `POST /predict/all` | both + risk blend | cost, time, risk score/category | PAIMANA |
| `GET /predict/health` | — | model availability + dataset summary | — |
| `GET /health` | — | service version + model flags | — |

### Data pipeline

| Script | Step |
|---|---|
| `scripts/download_paimana_data.py` | Downloads the 12 monthly Flash Report PDFs from the PAIMANA portal |
| `scripts/prepare_dataset.py` | Parses the "All Ongoing Projects" tables with `pdfplumber`, builds `data/paimana/paimana_dataset.csv` (10,623 rows, 2,998 distinct projects) + `paimana_dataset_meta.json` |
| `scripts/train_models.py` | Trains RF/GB/XGB candidates, project-held-out CV + next-month holdout, saves `models/paimana/{cost,time}_model/{model.pkl,model.json}` + `training_report.json` |
| `scripts/evaluate_models.py` | Re-runs CV + holdout on the saved models, writes `data/paimana/evaluation_report.json` and `data/model_metrics.json` |
| `scripts/predict.py` | CLI inference for one project from a JSON file |
| `scripts/run_pipeline.py` | End-to-end: download → prepare → train → evaluate |

**Targets**: `cost_overrun_pct = (revised − original)/original × 100`;
`time_overrun_months` = calendar-month difference between revised and original
date of commissioning. **Leakage guard**: revised figures are used *only* as
targets, never as features. Features are known at the report date (original
cost, cumulative expenditure, physical progress, duration, age,
months-remaining, and the project's ministry/sector/state).

**Validation is honest**: 3-fold GroupKFold (projects never split across train
and test) plus an out-of-time holdout of the next unseen month. The selected
model for each target is the one with the lowest CV RMSE on unseen projects.

| Target | CV (project-held-out) | OOT Mar-2026 holdout | Selected |
|---|---|---|---|
| Cost (%) | RF MAE 10.34 / RMSE 24.18 / R² 0.68 | MAE 5.60 / RMSE 12.25 / R² 0.89 | rf |
| Time (mo) | XGB MAE 4.68 / RMSE 7.78 / R² 0.92 | MAE 7.66 / RMSE 12.56 / R² 0.80 | xgb |

## Legacy demo models

| Endpoint | Model | Target |
|---|---|---|
| `POST /api/predict/cost-overrun` | `XGBoostRegressor` | cost-overrun probability (%) |
| `POST /api/predict/time-overrun` | `XGBoostRegressor` | time-overrun probability (%) |
| `POST /api/predict/risk-assessment` | ensemble | composite risk score + category |
| `POST /api/simulate/what-if` | deterministic engine | counterfactual cost/time/risk |
| `POST /api/train` | all of the above | retrains + stores metrics |

Feature set (`feature_cols.json`): original/revised cost, expenditure,
planned/actual duration, physical/financial progress, milestone counts,
delayed milestones, resource availability, contract changes & impact.

## Honest evaluation

- The legacy demo models and their metrics are labelled
  `Demo/Synthetic Dataset`.
- `train_models()` performs a 75/25 train–test split and reports, per model:
  - **MAE / RMSE / R²** for regressors (`reg_metrics`)
  - **accuracy / precision / recall / F1** for classifiers (`cls_metrics`)
- PAIMANA models report CV + out-of-time holdout metrics (MAE, RMSE, R²,
  trimmed MAPE, WMAPE); dataset label `PAIMANA (MoSPI) official project
  reports`.
- A **baseline** (predict-the-mean) is recorded where applicable so the Model
  Evaluation dashboard can show genuine improvement. Metrics are mirrored into
  MongoDB `ModelMetric` rows by the backend.

**Feature importance** is read from the trained estimator
(`model.feature_importances_`), grouped into the six risk factors
(cost, schedule, milestones, resources, financial, implementation) and
normalised — never randomised.

**Confidence** is the classifier's decision margin
(`|predict_proba − 0.5|` rescaled), not a random number.

## API integration

`backend/services/predictionService.js` maps an app `InfrastructureProject` to
the model's feature vector (`mapProjectToPaimanaFeatures`: Rs→crore conversion,
sector inferred from ministry, state normalisation, dates to `YYYY-MM`) and
calls `/predict/all`. If the Python service is unreachable it falls back to the
built-in heuristic engine and clearly reports `modelUsed: "fallback-engine"` —
it never fabricates "ML" numbers.

- `POST /api/predictions/all/:id` — runs the full PAIMANA prediction for a
  project and persists `predictedCostOverrunPct`, `predictedTimeOverrunMonths`
  etc.
- `GET /api/predictions/model-metrics` — serves the published real test
  metrics for the Benchmarking dashboard.
- Project create/update fire-and-forget a prediction refresh.

## Risk bands

Per the product spec:

| Score | Category |
|---|---|
| 0–30 | Low |
| 31–60 | Moderate |
| 61–80 | High |
| 81–100 | Critical |

## CUF data-sufficiency experiment

`POST /api/cuf/train` compares:

- **Model A** — only currently-collected CUF / register fields.
- **Model B** — CUF fields **plus** candidate variables:
  `contractorPerformance, procurementDelay, landAcquisitionDelay,
  environmentalClearanceDelay, materialPriceVariation, laborAvailability,
  weatherDisruptionDays, fundingReleaseDelay, utilityShifting,
  litigationDisputes`.

It reports MAE/RMSE/R² for both and the per-variable importance of Model B,
so stakeholders can see whether collecting extra fields actually improves
predictions. Results are written to `data/cuf_analysis.json`.
