import express from "express";
import { getActivityLogs, getRecentActivity } from "../controllers/activityController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/recent", protect, getRecentActivity);
router.get("/", protect, getActivityLogs);

export default router;
