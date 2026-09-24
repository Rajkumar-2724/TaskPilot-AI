# TaskPilot AI — Intelligent Project Management System

A full-stack MERN platform for work management plus an **AI-powered
predictive & prescriptive infrastructure project monitoring system**: risk
scoring with configurable thresholds, cost/schedule overrun prediction,
risk-trend acceleration alerts, CSV import with validation, monthly
planned-vs-actual updates, CUF data-sufficiency experiments, model
evaluation, and a grounded (retrieval-based) project intelligence assistant.

> **Scope note:** this build implements the full core product — auth,
> projects, tasks, Kanban, calendar, a simplified Gantt view, real-time chat,
> notifications, email, file uploads, Gemini AI chat, infrastructure risk
> analytics, bulk data import, model/CUF dashboards, and an admin panel —
> end to end. The ML prediction service falls back to a deterministic
> in-app engine whenever the Python service is not running, and any feature
> that needs the ML service (training, CUF experiment, model registry)
> reports the dependency explicitly instead of returning fake data.

---

## Features

- JWT authentication with role-based access control (Admin / Manager / Member)
- Project CRUD with team members, status, deadlines, progress
- Task CRUD with priority, status, due dates, comments, file attachments
- Dashboard with live stats and Recharts visualizations
- Drag-and-drop Kanban board (persists to MongoDB, real-time status sync)
- Calendar view of task deadlines with overdue highlighting
- Simplified Gantt-style timeline per project
- Real-time chat per project via Socket.IO (typing indicators, message history)
- Real-time + persisted notifications
- Email notifications via Nodemailer (registration, task assignment, invites)
- File uploads via Cloudinary, with automatic local-disk fallback
- Gemini AI: task prioritization, project summaries, deadline risk,
  meeting-notes summarization, task suggestions
- Infrastructure monitoring dashboard (cost, schedule, risk KPIs)
- Risk scoring against **configurable thresholds** (defaults: 0–30 Low,
  31–60 Moderate, 61–80 High, 81–100 Critical) with admin override + audit log
- Risk **acceleration detection** (Linear-regression slope over history,
  sudden-deterioration, persistent-high-risk flags in risk trends)
- **CSV/JSON bulk import** with row-level validation (missing/invalid/
  negative/duplicate → rejected with reasons; inconsistencies → warnings)
- **Monthly project updates** + merged progress/risk timeline (`history`)
  and **planned-vs-actual** cost/schedule/progress/expenditure variances
- **Model evaluation** dashboard: stored MAE/R²/RMSE metrics vs a baseline
- **Data Sufficiency (CUF)** experiment: Model A (register fields) vs
  Model B (+ candidate variables), showing which fields are worth collecting
- **Grounded Project Intelligence** assistant: answers computed from the
  database with visible sources (risk drivers, top risks, comparisons,
  latest updates, alerts) — no invented numbers
- Admin panel: user management, role changes, system analytics, activity logs
- Dark/light mode, glassmorphism UI, fully responsive layout
- Seed scripts with 264+ demo infrastructure projects for analytics showcases

## Tech Stack

**Frontend:** React 18, Vite, React Router DOM, Bootstrap 5, Bootstrap Icons,
Axios, Socket.IO Client, Recharts, React Toastify, react-beautiful-dnd

**Backend:** Node.js, Express, MongoDB, Mongoose, JWT, bcryptjs, Socket.IO,
Multer, Cloudinary SDK, Nodemailer, Google Gemini API (via REST)

**ML Service:** FastAPI (Python), scikit-learn, pandas, numpy — served on
port **8000**; cost/time overrun regression & classifiers, risk classification,
what-if engine, model registry, and CUF data-sufficiency experiment

**Deployment:** GitHub + Render (`render.yaml` included)

## Architecture

```
Browser (React SPA)
   │  REST (axios) + WebSocket (socket.io-client)
   ▼
Express API  ──►  MongoDB (Mongoose)
   │
   ├─► Gemini API (grounded AI output, optional)
   ├─► FastAPI ML service (:8000)  ──► sklearn models + metrics JSON
   │    └  prediction, what-if, /api/train, /api/cuf/*, /api/models/*
   ├─► Cloudinary (file storage, optional)
   └─► SMTP (email, optional)
```

Auth uses stateless JWTs (`Authorization: Bearer <token>`), verified by
`middleware/authMiddleware.js`, which also enforces role-based authorization
via `authorize("Admin", ...)`.

## Folder Structure

```
TaskPilot-AI/
├── frontend/          React + Vite client
│   └── src/
│       ├── components/  layouts/  pages/  context/  services/
├── backend/           Express + MongoDB API
│   └── config/  controllers/  middleware/  models/  routes/  services/  scripts/
├── ml-service/        FastAPI + scikit-learn prediction & CUF experiments
│   ├── main.py        FastAPI app (train, predict, what-if, models, cuf)
│   ├── models/        trained .pkl artifacts
│   └── data/          synthetic dataset + model_metrics.json + cuf_analysis.json
├── docs/              architecture, API, DB, ML-methodology, deployment docs
├── README.md
├── .gitignore
└── render.yaml
```

---

## Installation

### Prerequisites
- Node.js 18+
- A MongoDB instance (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- (Optional) Cloudinary account, Gemini API key, SMTP credentials

### 1. Clone and install

```bash
git clone <your-repo-url> TaskPilot-AI
cd TaskPilot-AI

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment variables

```bash
cd backend  && cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, etc.
cd ../frontend && cp .env.example .env
```

Backend `.env` keys:

```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/taskpilot-ai
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash

ML_SERVICE_URL=http://localhost:8000

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=TaskPilot AI <no-reply@taskpilot.ai>
```

Frontend `.env` keys:

```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

**MongoDB setup:** either run `mongod` locally, or create a free cluster on
MongoDB Atlas and paste its connection string into `MONGO_URI`.

**Cloudinary setup (optional):** create a free account at cloudinary.com,
copy the Cloud Name / API Key / API Secret from the dashboard into `.env`.
Without these, uploads are stored under `backend/uploads/` and served at
`/uploads/<filename>`.

**Gemini setup (optional):** create an API key at
[Google AI Studio](https://aistudio.google.com/) and set `GEMINI_API_KEY`.
Without it, the `/api/ai/*` endpoints return `503` with a clear message
instead of crashing, and the grounded assistant answers from retrieval only.

**ML service:** the prediction/CUF/model endpoints proxy to
`ML_SERVICE_URL` (default `http://localhost:8000`); see the run steps below.
If it is not running, cost/time/risk predictions transparently use the
in-app fallback engine, while training / CUF / model-registry endpoints
return an explicit "ML service not reachable" message instead of faking data.

**Nodemailer setup (optional):** use an SMTP provider (Gmail app password,
SendGrid, Mailtrap, etc.) and fill in `SMTP_HOST/PORT/USER/PASS`. Without
these, emails are logged to the console instead of sent.

### 3. Configure ML service & seed demo data

```bash
# Python ML service (Python 3.10+)
cd ml-service
pip install -r requirements.txt
python main.py            # trains models and serves on :8000
```

```bash
# Seed base demo users/projects
cd backend && npm run seed

# Optional: seed 264 infrastructure projects (Paimana showcase dataset)
cd backend && node scripts/seedPaimana.js
```

### 4. Run locally

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev

# terminal 3 (ML predictions, model training, CUF experiment)
cd ml-service && python main.py
```

Frontend: http://localhost:5173 · Backend: http://localhost:5000/api/health

### Sample login credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@taskpilot.ai | Admin@123 |
| Manager | manager@taskpilot.ai | Manager@123 |
| Member | priya@taskpilot.ai | Member@123 |
| Member | daniel@taskpilot.ai | Member@123 |
| Member | lucia@taskpilot.ai | Member@123 |

---

## API Documentation

Base URL: `/api`. Protected routes require `Authorization: Bearer <token>`.

### Auth (`/api/auth`)

| Method | Route | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/register` | No | `{name, email, password, role?}` | `201 {user, token}` |
| POST | `/login` | No | `{email, password}` | `200 {user, token}` |
| POST | `/send-otp` | No | `{email, password}` | `200 {message, email, devOtp?}` |
| POST | `/verify-otp` | No | `{email, otp}` | `200 {user, token}` |
| GET | `/me` | Yes | — | `200 {user}` |
| PUT | `/profile` | Yes | `{name?, bio?, phone?, skills?}` | `200 {user}` |
| PUT | `/change-password` | Yes | `{currentPassword, newPassword}` | `200 {message}` |
| POST | `/upload-profile` | Yes | multipart `image` | `200 {profilePicture, user}` |

Errors: `400` validation, `401` invalid credentials / bad token, `403` deactivated account.

### Projects (`/api/projects`)

| Method | Route | Auth | Body |
|---|---|---|---|
| POST | `/` | Yes | `{name, description?, deadline?, members?}` |
| GET | `/` | Yes | — (Admin sees all; others see owned/member projects) |
| GET | `/:id` | Yes | — returns `{project, tasks}` |
| PUT | `/:id` | Yes (owner/Admin) | `{name?, description?, status?, deadline?, progress?}` |
| DELETE | `/:id` | Yes (owner/Admin) | — |
| POST | `/:id/members` | Yes (owner/Admin) | `{userId}` or `{email}` |
| DELETE | `/:id/members/:userId` | Yes (owner/Admin) | — |

Errors: `403` not authorized, `404` not found.

### Tasks (`/api/tasks`)

| Method | Route | Body |
|---|---|---|
| POST | `/` | `{title, project, description?, assignedTo?, priority?, dueDate?}` |
| GET | `/?project=&status=&priority=&assignedTo=` | — |
| GET | `/:id` | — |
| PUT | `/:id` | `{title?, description?, priority?, status?, dueDate?, assignedTo?}` |
| DELETE | `/:id` | — |
| PUT | `/:id/status` | `{status}` — used by the Kanban board |
| PUT | `/:id/priority` | `{priority}` |
| PUT | `/:id/assign` | `{assignedTo}` |
| POST | `/:id/comments` | `{text}` |
| POST | `/:id/attachments` | multipart `file` |

### Dashboard (`/api/dashboard`)

| Method | Route | Response |
|---|---|---|
| GET | `/stats` | `{stats: {...}, charts: {tasksByStatus, tasksByPriority, weeklyProductivity}}` |

### Notifications (`/api/notifications`)

`GET /`, `PUT /:id/read`, `PUT /read-all`

### Chat (`/api/messages/:projectId`)

`GET /` — history · `POST /` `{text}` — REST fallback (primary path is Socket.IO)

### Activity (`/api/activity?project=`)

`GET /` — recent activity logs

### AI (`/api/ai`) — requires `GEMINI_API_KEY`

| Route | Body | Returns |
|---|---|---|
| POST `/prioritize-task` | `{taskId}` or `{title, description}` | `{priority, reason, suggestedDeadline}` |
| POST `/project-summary` | `{projectId}` | `{summary, progress, completedWork, pendingWork, risks, recommendations}` |
| POST `/deadline-risk` | `{projectId}` | `[{taskTitle, risk, reason}]` |
| POST `/meeting-summary` | `{notes}` | `{summary, decisions[], actionItems[]}` |
| POST `/task-suggestions` | `{projectId}` | `[{title, description, priority}]` |

Without `GEMINI_API_KEY` set, these fall back to the built-in TaskPilot
smart analytical engine instead.

### Infrastructure analytics (`/api/infrastructure/projects`)

| Method | Route | Description |
|---|---|---|
| POST | `/` | Create infrastructure project |
| GET | `/` | List infrastructure projects (role-scoped) |
| GET | `/:id` | Project + financial records + activity |
| PUT | `/:id` | Update project (Manager/Admin) |
| DELETE | `/:id` | Delete project (Manager/Admin) |
| POST | `/:id/assess-risk` | Run risk assessment (recomputes score + acceleration) |
| GET | `/:id/risk-trend` | Risk history + **acceleration** summary |
| GET | `/:id/alerts` | Alerts for project |
| GET | `/:id/recommendations` | Generated interventions |
| POST | `/:id/financial-records` · GET | Revenue/expense records |
| POST | `/:id/milestones` | Add milestone |
| POST | `/:id/members` · DELETE `/:id/members/:userId` | Team management |
| GET | `/benchmarking` | Sector/ministry averages (risk distribution) |
| GET | `/insights` | AI insights report |

### Data import & updates (`/api/projects`)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/import` | Manager/Admin | CSV file (multipart `file`) **or** JSON array / `{projects:[...]}`; row-level validation, returns `{imported, rejected, warnings, failures}` |
| POST | `/:id/updates` | project member | Record a monthly update (planned/actual progress, expenditure, milestones, issues) — recomputes risk |
| GET | `/:id/history` | member/Admin | Merged progress + milestone + risk timeline |
| GET | `/:id/planned-vs-actual` | member/Admin | Progress/schedule/expenditure/cost variances + trend |

### CUF data-sufficiency (`/api/cuf`) — Admin

`GET /analysis` · `POST /train` — runs the Model A (register fields) vs
Model B (+ candidate variables) experiment and stores metrics (labelled
`Demo/Synthetic Dataset` unless real data is supplied).

### Models (`/api/models`)

`GET /` registry (from ML service), `GET /metrics` stored evaluation
metrics (baseline vs ML), `POST /train` Admin — retrain models.

### Grounded assistant (`/api/assistant`)

`POST /query` `{message, history?}` → `{answer, sources[], mode}` — computed
from the database, optionally re-phrased by Gemini when `GEMINI_API_KEY` is set.

### Admin (`/api/admin`) — requires role `Admin`

`GET /users?search=&role=`, `PUT /users/:id/status`, `PUT /users/:id/role`,
`GET /analytics`, `GET /activity-logs`, `GET /projects`, `GET /tasks`,
`GET /settings/risk-thresholds`, `PUT /settings/risk-thresholds`

## Postman Testing

1. Import the base URL `http://localhost:5000/api` as a Postman environment variable.
2. `POST /auth/login` with seeded credentials, copy the `token` from the response.
3. Set a collection-level Authorization header: `Bearer {{token}}`.
4. Exercise the endpoints above in order: projects → tasks → dashboard → AI.

---

## Deployment (Render)

This repo includes a `render.yaml` [Blueprint](https://render.com/docs/blueprint-spec)
defining two services:

1. **taskpilot-ai-backend** — Node web service (`backend/`)
2. **taskpilot-ai-frontend** — static site (`frontend/`, built with Vite)

### Steps

1. Push this project to a GitHub repository.
2. In Render, choose **New → Blueprint**, point it at your repo.
3. Render will read `render.yaml` and provision both services.
4. Fill in the env vars marked `sync: false` in the Render dashboard
   (`MONGO_URI`, `CLIENT_URL`, `GEMINI_API_KEY`, Cloudinary/SMTP keys,
   `VITE_API_URL`, `VITE_SOCKET_URL`) — point `VITE_API_URL` /
   `CLIENT_URL` at each other's deployed URLs once both services have URLs.
5. Deploy. `JWT_SECRET` is auto-generated by Render.

### GitHub setup

```bash
git init
git add .
git commit -m "Initial commit: TaskPilot AI"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

---

## Screenshots

_Add screenshots here after running the app locally:_

- `docs/screenshots/dashboard.png`
- `docs/screenshots/kanban.png`
- `docs/screenshots/chat.png`
- `docs/screenshots/ai-assistant.png`

## Future Improvements

- PDF report export (project/task summary as a downloadable PDF)
- Richer Gantt view with dependency lines and zoomable timeline (a
  dedicated charting library such as `frappe-gantt` or `dhtmlx-gantt`
  would replace the current lightweight bar view)
- Deadline-reminder cron job (currently emails are sent on assignment/
  invite, but there's no scheduled "due soon" sweep)
- Optimistic UI + code-splitting for the frontend bundle (currently a
  single ~850KB JS chunk; route-based `lazy()` imports would shrink this)
- Automated tests (Jest/Supertest for the API, Vitest/RTL for the client)
- WYSIWYG rich text for task descriptions and comments

## License

MIT — built for educational / portfolio use.
