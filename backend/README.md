# TaskPilot AI — Backend

Node.js + Express + MongoDB + Socket.IO API for TaskPilot AI.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in your own values
npm run dev             # nodemon, http://localhost:5000
```

## Seed sample data

Requires `MONGO_URI` in `.env` to point at a running MongoDB instance.

```bash
npm run seed
```

Creates 1 Admin, 1 Manager, 3 Members, 3 projects, 18 tasks, sample notifications,
activity logs and chat messages. Credentials are printed to the console and are
also listed in the root README.

## Environment variables

See `.env.example`. AI (Gemini), Cloudinary, and SMTP are all optional —
the app runs correctly without them:
- No `GEMINI_API_KEY` → AI endpoints use the built-in smart analytical fallback engine.
- No Cloudinary credentials → uploads are stored on local disk under `/uploads` and served statically.
- No SMTP credentials → emails are logged to the console instead of sent.

## Project structure

```
backend/
├── config/        # DB + Cloudinary configuration
├── controllers/    # Route handler logic
├── middleware/     # auth, error handling, file uploads
├── models/         # Mongoose schemas
├── routes/         # Express routers
├── services/       # email, AI (Gemini), Socket.IO
├── utils/          # token generation, activity logging, notifications
├── scripts/seed.js # sample data seeder
└── server.js        # entry point
```

## API summary

All routes are prefixed with `/api`. Protected routes require
`Authorization: Bearer <token>`.

| Area | Base path |
|---|---|
| Auth | `/api/auth` |
| Projects | `/api/projects` |
| Tasks | `/api/tasks` |
| Dashboard | `/api/dashboard` |
| Notifications | `/api/notifications` |
| Chat (REST fallback) | `/api/messages/:projectId` |
| Activity logs | `/api/activity` |
| AI (Gemini) | `/api/ai` |
| Admin | `/api/admin` |

See the root `README.md` for full endpoint-by-endpoint documentation and
Postman testing instructions.

## Socket.IO events

Client connects with `auth: { token }`.

- `project:join` / `project:leave` — join/leave a project's chat room
- `chat:send` `{ projectId, text }` → broadcasts `chat:message`
- `chat:typing` `{ projectId, isTyping }` → broadcasts `chat:typing`
- `notification:new` — pushed to `user:<id>` room when a notification is created
- `task:statusUpdated` — pushed to `project:<id>` room on Kanban drag/drop
- `presence:online` — broadcast list of currently connected user IDs
