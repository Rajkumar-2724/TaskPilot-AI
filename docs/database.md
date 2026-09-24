# Database Design

MongoDB via Mongoose. Collections are created lazily on first use.

## Core work-management

| Model | File | Purpose |
|---|---|---|
| `User` | `backend/models/User.js` | Accounts, roles, profile, OTP fields |
| `Project` | `backend/models/Project.js` | Regular projects (owner, members, progress) |
| `Task` | `backend/models/Task.js` | Tasks, status/priority, comments, attachments |
| `Notification` | `backend/models/Notification.js` | In-app notifications |
| `Message` | `backend/models/Message.js` | Project chat history |
| `ActivityLog` | `backend/models/ActivityLog.js` | Audit trail of user actions |

## Infrastructure monitoring

| Model | File | Purpose |
|---|---|---|
| `InfrastructureProject` | `backend/models/InfrastructureProject.js` | Register of infra projects (cost, schedule, milestones, risk fields, `progressHistory`) |
| `RiskHistory` | `backend/models/RiskModels.js` | Time-series risk scores + **acceleration** fields |
| `RiskPrediction` | `backend/models/RiskModels.js` | Persisted cost/time/risk predictions |
| `Alert` | `backend/models/RiskModels.js` | Generated alerts (severity, message) |
| `Recommendation` | `backend/models/RiskModels.js` | Prescriptive interventions |
| `Simulation` | `backend/models/RiskModels.js` | Saved what-if scenarios |
| `FinancialRecord` | `backend/models/InfrastructureProject.js` | Revenue/expense ledger per project |
| `Milestone` | `backend/models/InfrastructureProject.js` | Project milestones |
| `Setting` | `backend/models/Setting.js` | Key/value config (risk thresholds) |
| `ModelMetric` | `backend/models/ModelMetric.js` | Stored model evaluation metrics (one row per model+metric) |

### `InfrastructureProject.progressHistory` sub-document

Each monthly update records:

```
reportingPeriod, plannedProgress, physicalProgress, financialProgress,
expenditure, milestoneCompletion, resourceAvailability,
issues, issueCategory, remarks, recordedAt
```

### `RiskHistory` acceleration fields

`riskScore`, `riskCategory`, `trendDirection`, `riskAcceleration`,
`slope`, `consecutiveIncreases`, `persistentHighRisk`, `recordedAt`.

### `Setting` (risk thresholds)

```
key: "riskThresholds"
value: { moderate: 30, high: 60, critical: 80 }
description, updatedBy
```

## Relationships (simplified)

```
User ──owns──► Project ──has──► Task
User ──manages/member──► InfrastructureProject
InfrastructureProject ──has──► Milestone, FinancialRecord, progressHistory[]
InfrastructureProject ──has──► RiskHistory, RiskPrediction, Alert,
                               Recommendation, Simulation
ModelMetric  (independent evaluation store)
Setting      (independent config store)
```

## Indexes

- `ModelMetric`: unique on `(modelName, metricName, modelVersion)`.
- `Setting`: unique `key`.
- Standard Mongoose refs are queried by ObjectId; add compound indexes
  (e.g. `{ project: 1, recordedAt: -1 }` on `RiskHistory`) if the dataset
  grows into the millions.
