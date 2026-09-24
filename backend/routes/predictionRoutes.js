import { Router } from "express";
import {
  getPredictionDashboard,
  predictProjectCostOverrun,
  predictProjectTimeOverrun,
  assessProjectRiskPrediction,
  simulateWhatIf,
  getProjectFeatureImportance,
  getPredictionHistory,
  predictProjectAll,
  getPredictModelMetrics,
} from "../controllers/predictionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.route("/dashboard").get(protect, getPredictionDashboard);
router.route("/cost-overrun/:id").post(protect, predictProjectCostOverrun);
router.route("/time-overrun/:id").post(protect, predictProjectTimeOverrun);
router.route("/all/:id").post(protect, predictProjectAll);
router.route("/model-metrics").get(protect, getPredictModelMetrics);
router.route("/risk/:id").post(protect, assessProjectRiskPrediction);
router.route("/simulate/:id").post(protect, simulateWhatIf);
router.route("/feature-importance/:id").get(protect, getProjectFeatureImportance);
router.route("/history").get(protect, getPredictionHistory);

export default router;
