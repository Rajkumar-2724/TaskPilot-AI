import express from "express";
import { queryAssistant } from "../controllers/assistantController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.post("/query", queryAssistant);

export default router;