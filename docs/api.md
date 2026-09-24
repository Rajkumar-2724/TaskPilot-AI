# API Reference

Base URL: `/api`. All routes except auth require
`Authorization: Bearer <token>`. Errors are returned as
`{ success: false, message }` with a matching HTTP status code.

## Auth `/api/auth`

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/register` | No | `{name, email, password, role?}` | `201 {user, token}` |
| POST | `/login` | No | `{email, password}` | `200 {user, token}` |
| POST | `/send-otp` | No | `{email}` | `200 {message, devOtp?}` |
| POST | `/verify-otp` | No | `{email, otp}` | `200 {user, token}` |
| GET | `/me` | Yes | — | `200 {user}` |
| PUT | `/profile` | Yes | `{name?, bio?, phone?, skills?}` | `200 {user}` |
| PUT | `/change-password` | Yes | `{currentPassword, newPassword}` | `200 {message}` |
| POST | `/upload-profile` | Yes | multipart `image` | `200 {profilePicture, user}` |

## Projects (regular) `/api/projects`

| Method | Route | Auth | Body/Notes |
|---|---|---|---|
| POST | `/` | Manager/Admin | `{name, description?, deadline?, members?}` |
| GET | `/` | Yes | role-scoped listing |
| GET | `/history` | Yes | project history list |
| GET | `/:id` | Yes | `{project, tasks, activityLogs}` |
| PUT | `/:id` | Manager/Admin | `{name?, description?, status?, deadline?, progress?}` |
| DELETE | `/:id` | Manager/Admin | — |
| POST | `/:id/members` | Manager/Admin | `{userId}` or `{email}` |
| DELETE | `/:id/members/:userId` | Manager/Admin | — |
| PUT | `/:id/reassign` | Manager/Admin | reassign owner |

### Data ingestion `/api/projects`

| Method | Route | Auth | Body/Notes |
|---|---|---|---|
| POST | `/import` | Manager/Admin | multipart `file` (CSV) **or** JSON array / `{projects:[...]}` → `{success, imported, rejected, total, warnings[], failures[]}` |
| POST | `/:id/updates` | project member | `{reportingPeriod, plannedProgress?, physicalProgress?, financialProgress?, expenditure?, milestoneCompletion?, resourceAvailability?, issues?, issueCategory?, remarks?, revisedCost?, currentExpectedCompletionDate?}` → recomputes risk |
| GET | `/:id/history` | project member/Admin | `{progress[], milestones[], riskHistory[], timeline[]}` |
| GET | `/:id/planned-vs-actual` | project member/Admin | `{latest, variances, trend[], timeRemainingMonths}` |

**CSV columns** (case-insensitive aliases): `name`, `project_code`,
`sector`, `ministry`, `state`, `original_cost`, `revised_cost`,
`expenditure`, `planned_duration_months`, `actual_duration_months`,
`physical_progress`, `financial_progress`, `planned_progress`,
`total_milestones`, `completed_milestones`, `delayed_milestones`,
`resource_availability`, `planned_start_date`, `planned_end_date`,
`project_status`, `reporting_period`.

**Validation:** missing `name` / out-of-range progress (0–100) / negative
costs / duplicate codes / pre-existing codes hard-fail the row with a
reason. Later dates before earlier dates, expenditure over revised cost,
etc. produce warnings only.

## Tasks `/api/tasks`

`POST /` `{title, project, description?, assignedTo?, priority?, dueDate?}`
· `GET /` (filters `project`, `status`, `priority`, `assignedTo`) ·
`GET /:id` · `PUT /:id` · `DELETE /:id` · `PUT /:id/status` ·
`PUT /:id/priority` · `PUT /:id/assign` · `POST /:id/comments` ·
`POST /:id/attachments` (multipart `file`).

## Infrastructure `/api/infrastructure`

| Method | Route | Auth |
|---|---|---|
| POST | `/projects` | Manager/Admin |
| GET | `/projects` | Yes |
| GET | `/projects/:id` | Yes |
| PUT | `/projects/:id` | Manager/Admin |
| DELETE | `/projects/:id` | Manager/Admin |
| POST | `/projects/:id/assess-risk` | Yes |
| GET | `/projects/:id/risk-trend` | Yes (`{history, acceleration}`) |
| GET | `/projects/:id/alerts` | Yes |
| GET | `/projects/:id/recommendations` | Yes |
| POST | `/projects/:id/financial-records` | Yes |
| GET | `/projects/:id/financial-records` | Yes |
| POST | `/projects/:id/milestones` | Yes |
| POST | `/projects/:id/members` | Manager/Admin |
| DELETE | `/projects/:id/members/:userId` | Manager/Admin |
| GET | `/benchmarking` | Yes |
| GET | `/insights` | Yes |

`risk-trend` response includes the acceleration summary:

```
{ success, count, history: [{riskScore, riskCategory, trendDirection,
   riskAcceleration, slope, consecutiveIncreases, persistentHighRisk,
   recordedAt}], acceleration: {flag, slope, change, consecutiveIncreases,
   persistentHighRisk, lastScore, prevScore, points} }
```

## Predictions `/api/predictions`

| Method | Route | Notes |
|---|---|---|
| GET | `/dashboard` | prediction stats |
| POST | `/cost-overrun/:id` | captures prediction |
| POST | `/time-overrun/:id` | captures prediction |
| POST | `/all/:id` | full PAIMANA cost+time+risk prediction for a project |
| GET | `/model-metrics` | published real test metrics (PAIMANA held-out data) |
| POST | `/risk/:id` | composite assessment |
| POST | `/simulate/:id` | what-if with `{modifications}` |
| GET | `/feature-importance/:id` | measured contributions + SHAP text |
| GET | `/history` | saved predictions |

## AI `/api/ai` (Gemini, with in-app fallback)

`POST /prioritize-task`, `POST /project-summary`, `POST /deadline-risk`,
`POST /meeting-summary`, `POST /task-suggestions`, `POST /chat`.
Without `GEMINI_API_KEY` these use the built-in analytical engine.

## CUF (data sufficiency) `/api/cuf`

`GET /analysis` — returns stored comparison (`status: "not_run"` when
empty). `POST /train` — Admin only; requires the ML service; returns
`{status:"available", modelA, modelB, candidateVariables, metrics,
featureImportance, datasetLabel, samples}`.

## Models `/api/models`

`GET /` — registry from the ML service (`{models[], stored}`).
`GET /metrics` — stored `ModelMetric` rows grouped by
`comparisonGroup` (`ml`) + `baseline`, `source`, `stored`.
`POST /train` — Admin; retrains and returns metrics; `503` if ML service down.

## Assistant `/api/assistant`

`POST /query` `{message, history?}` → `{success, answer, sources[], mode}`.
`mode` is `Gemini (grounded)` or `Rule-based retrieval`. Every `source`
entry is one DB record used to produce the answer.

## Admin `/api/admin` (role `Admin`)

`GET /users?search=&role=`, `PUT /users/:id/status`, `PUT /users/:id/role`,
`GET /analytics`, `GET /activity-logs`, `GET /projects`, `GET /tasks`,
`GET /settings/risk-thresholds` → `{thresholds, source}`,
`PUT /settings/risk-thresholds` `{moderate, high, critical}` (must satisfy
`moderate < high < critical`; 0–100; audited).

## System

`GET /api/health` — `{success, time}`.
`GET /uploads/:file` — static uploads.