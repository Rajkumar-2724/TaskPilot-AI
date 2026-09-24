import express from "express";
import { getMyTaskHistory } from "../controllers/taskHistoryController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getMyTaskHistory);

export default router;