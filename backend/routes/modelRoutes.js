import express from "express";
import { getModels, getModelMetrics, retrainModels, getEvaluationSplitInfo, getEvaluationCV, getEvaluationFeatureImportance, getEvaluationActualVsPredicted } from "../controllers/modelController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getModels);
router.get("/metrics", getModelMetrics);
router.post("/train", authorize("Admin"), retrainModels);
router.get("/evaluation/:modelType/split-info", getEvaluationSplitInfo);
router.get("/evaluation/:modelType/cross-validation", getEvaluationCV);
router.get("/evaluation/:modelType/feature-importance", getEvaluationFeatureImportance);
router.get("/evaluation/:modelType/actual-vs-predicted", getEvaluationActualVsPredicted);

export default router;