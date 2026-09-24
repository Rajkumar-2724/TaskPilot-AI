import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import { initSocket } from "./services/socketService.js";
import { detectEmergingRisks } from "./services/alertService.js";
import { startReminderJob } from "./services/reminderService.js";
import { startRetentionJob } from "./services/retentionService.js";
import { initSettings } from "./services/settingsService.js";

import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import infrastructureRoutes from "./routes/infrastructureRoutes.js";
import predictionRoutes from "./routes/predictionRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import cufRoutes from "./routes/cufRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";

const app = express();
const server = http.createServer(app);

const isLocalDevOrigin = (origin) => !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL || "http://localhost:5173",
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    ],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  transports: ["websocket", "polling"],
  allowEIO3: true,
});
app.set("io", io);

app.use(cors({
  origin: [
    process.env.CLIENT_URL || "http://localhost:5173",
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ],
  credentials: true,
}));
app.use(helmet());
app.use(mongoSanitize());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many AI requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "TaskPilot AI – Predictive Infrastructure Monitoring System", time: new Date().toISOString() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/infrastructure", infrastructureRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/cuf", cufRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/assistant", assistantRoutes);

app.use(notFound);
app.use(errorHandler);

initSocket(io);

const PORT = process.env.PORT || 5000;

let listenRetries = 3;

const getPortHolderPid = () => {
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8", timeout: 3000 });
    const re = new RegExp(`^\\s*TCP\\s+\\S+:${PORT}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
    const line = out.split("\n").find((l) => re.test(l.trim()));
    if (!line) return null;
    const m = line.trim().match(re);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
};

const freePortHolder = (pid) => {
  if (!pid) return "none";
  try {
    const info = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
      { encoding: "utf8", timeout: 4000 }
    ).trim();
    const parentPid = (() => {
      try {
        return parseInt(
          execSync(
            `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
            { encoding: "utf8", timeout: 4000 }
          ).trim(),
          10
        );
      } catch {
        return null;
      }
    })();
    if (parentPid) {
      try {
        const parentCmd = execSync(
          `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${parentPid}').CommandLine"`,
          { encoding: "utf8", timeout: 4000 }
        ).trim();
        if (parentCmd.includes("nodemon")) return "active";
      } catch {
        return "none";
      }
    }
    if (info.includes("server.js")) {
      process.kill(pid);
      return "killed";
    }
  } catch {
    return "none";
  }
  return "none";
};

const startListening = () => {
  server.listen(PORT, () => {
    console.log(`[Server] Infrastructure Monitoring System backend running on port ${PORT}`);
    listenRetries = 3;
    setTimeout(() => {
      detectEmergingRisks(io).catch((err) => {
        console.error("[Server] detectEmergingRisks failed:", err.message);
      });
    }, 1000);
    startReminderJob();
    startRetentionJob();
  });
};

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const holder = getPortHolderPid();
    const action = holder ? freePortHolder(holder) : "none";
    if (action === "killed") {
      listenRetries -= 1;
      if (listenRetries > 0) {
        console.warn(`[Server] Port ${PORT} held by stale process ${holder}. Closed it and retrying...`);
        setTimeout(startListening, 300);
      }
    }
    if (action !== "killed" || listenRetries <= 0) {
      console.error(
        action === "active"
          ? `[Server] Port ${PORT} is already in use by another active backend instance (PID ${holder}). Stop it first, then restart.`
          : `[Server] Port ${PORT} is in use by process ${holder || "unknown"}. Stop it first, then restart.`
      );
      process.exit(1);
    }
  } else {
    console.error("[Server] Server error:", err.message);
  }
});

const startServer = async () => {
  try { await initSettings(); } catch {}
  startListening();
};

connectDB().then(startServer).catch((err) => {
  console.error("[Server] Unexpected startup error, starting server anyway:", err.message);
  startServer();
});

const gracefulShutdown = (signal) => {
  console.log(`[Server] Received ${signal}. Closing server gracefully...`);
  server.close(() => {
    console.log("[Server] Closed HTTP server.");
    process.exit(0);
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGUSR2", () => {
  server.close(() => {
    process.kill(process.pid, "SIGUSR2");
  });
});

process.on("unhandledRejection", (err) => {
  console.error(`[UnhandledRejection] ${err.message}`);
});
