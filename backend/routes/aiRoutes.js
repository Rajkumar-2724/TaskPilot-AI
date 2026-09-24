import express from "express";
import {
  prioritizeTask,
  projectSummary,
  deadlineRisk,
  meetingSummary,
  taskSuggestions,
  chat,
} from "../controllers/aiController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);
router.post("/prioritize-task", prioritizeTask);
router.post("/project-summary", projectSummary);
router.post("/deadline-risk", deadlineRisk);
router.post("/meeting-summary", meetingSummary);
router.post("/task-suggestions", taskSuggestions);
router.post("/chat", chat);

export default router;
