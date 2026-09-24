# TaskPilot AI — Frontend

React 18 + Vite + Bootstrap 5 client for TaskPilot AI.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # point at your backend
npm run dev              # http://localhost:5173
```

## Environment variables

```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Structure

```
src/
├── components/    # ProtectedRoute, NotificationBell, ...
├── context/       # Auth, Theme, Socket providers
├── layouts/       # DashboardLayout (sidebar + mobile nav)
├── pages/         # one file per route
├── services/      # axios instance (api.js)
├── App.jsx
├── main.jsx
└── global.css     # glassmorphism theme, dark/light variables
```

## Notes

- Dark/light mode toggles a `data-theme` attribute on `<html>`; all styling
  is done through CSS custom properties in `global.css`.
- The Kanban board uses `react-beautiful-dnd` and persists moves via
  `PUT /api/tasks/:id/status`.
- Chat and notifications use `socket.io-client`; the JWT is passed via
  `auth: { token }` on connection.
