import express from "express";
import { generatePDFReport } from "../controllers/reportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);

router.get("/project/:projectId/pdf-report", generatePDFReport);

export default router;