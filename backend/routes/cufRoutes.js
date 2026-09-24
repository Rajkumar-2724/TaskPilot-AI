import express from "express";
import { trainCufAnalysis, getCufAnalysis, searchProjects, runProjectCufAnalysis } from "../controllers/cufController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/analysis", getCufAnalysis);
router.post("/train", authorize("Admin"), trainCufAnalysis);
router.get("/projects/search", searchProjects);
router.post("/project-analysis", authorize("Admin"), runProjectCufAnalysis);

export default router;