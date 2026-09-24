import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";

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
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = (ioInstance = null) => {
  const app = express();
  if (ioInstance) {
    app.set("io", ioInstance);
  }

  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    /^https:\/\/.*\.vercel\.app$/,
  ];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some((allowed) =>
        allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
      );
      if (isAllowed) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  }));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(mongoSanitize());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: { success: false, message: "Too many attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, message: "Too many AI requests, please slow down" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  const healthHandler = (req, res) => {
    res.json({
      success: true,
      message: "TaskPilot AI – Predictive Infrastructure Monitoring System",
      time: new Date().toISOString(),
      serverless: !ioInstance,
    });
  };

  app.get("/api/health", healthHandler);
  app.get("/health", healthHandler);

  const registerRoutes = (prefix = "/api") => {
    app.use(`${prefix}/auth`, authLimiter, authRoutes);
    app.use(`${prefix}/projects`, projectRoutes);
    app.use(`${prefix}/tasks`, taskRoutes);
    app.use(`${prefix}/dashboard`, dashboardRoutes);
    app.use(`${prefix}/notifications`, notificationRoutes);
    app.use(`${prefix}/messages`, messageRoutes);
    app.use(`${prefix}/activity`, activityRoutes);
    app.use(`${prefix}/ai`, aiLimiter, aiRoutes);
    app.use(`${prefix}/admin`, adminRoutes);
    app.use(`${prefix}/infrastructure`, infrastructureRoutes);
    app.use(`${prefix}/predictions`, predictionRoutes);
    app.use(`${prefix}/reports`, reportRoutes);
    app.use(`${prefix}/leaderboard`, leaderboardRoutes);
    app.use(`${prefix}/history`, historyRoutes);
    app.use(`${prefix}/cuf`, cufRoutes);
    app.use(`${prefix}/models`, modelRoutes);
    app.use(`${prefix}/assistant`, assistantRoutes);
  };

  registerRoutes("/api");
  registerRoutes("");

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
