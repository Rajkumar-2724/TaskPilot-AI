# Architecture

TaskPilot AI is composed of three independently runnable services plus a
MongoDB database.

```
┌──────────────────────────────────────────────────────────────────────┐
│  React SPA (frontend/)  ·  Vite · Bootstrap · Recharts · Socket.IO     │
│   Pages: Dashboard, Monitoring, Projects, ProjectAnalysis (12 tabs),   │
│          Data Import, Data Sufficiency, Model Evaluation, AI Assistant │
└───────────────┬────────────────────────────────────────────────────────┘
                │  REST (axios, Bearer JWT)  +  WebSocket (socket.io)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Express API (backend/)                                                │
│   Routes → Controllers → Services → Mongoose models                    │
│   • authMiddleware (JWT + RBAC: Admin / Manager / Member)              │
│   • riskEngine: scoring, thresholds, acceleration, recommendations     │
│   • settingsService: configurable risk thresholds (Setting collection) │
│   • dataIngestionController: CSV/JSON import, monthly updates,         │
│     history, planned-vs-actual                                         │
│   • assistantService: grounded retrieval + optional Gemini re-phrasing │
│   • predictionService / mlClient: proxy to the ML service              │
└───────┬───────────────────────────┬──────────────────────┬────────────┘
        │ Mongoose                  │ HTTP                 │ optional
        ▼                           ▼                      ▼
  MongoDB (projects, tasks,   FastAPI ML service     Gemini API
  risk history, alerts,       (ml-service/, :8000)   Cloudinary / SMTP
  recommendations, settings,  sklearn models +
  model metrics)              metrics JSON
```

## Key design decisions

- **Graceful degradation.** `predictionService` uses a deterministic
  in-app fallback engine when the Python service is offline. Training /
  CUF / model-registry endpoints do **not** fake results — they return a
  `503` with an actionable message.
- **Honest metrics.** Model evaluation metrics and feature importances are
  computed from the actual trained estimators (hold-out split) and labelled
  `Demo/Synthetic Dataset`. Nothing is presented as real-government data.
- **Configurable thresholds.** Risk bands (defaults 0–30 / 31–60 / 61–80 /
  81–100) live in a `Setting` document, cached in `settingsService`, and are
  editable by Admins with an activity-log entry.
- **Retrieval-grounded assistant.** The assistant always computes an answer
  from MongoDB first and returns the exact source records; Gemini (if
  configured) only re-phrases that grounded answer.
