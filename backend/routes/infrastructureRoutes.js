import { Router } from "express";
import {
  createInfrastructureProject,
  getInfrastructureProjects,
  getInfrastructureProject,
  updateInfrastructureProject,
  deleteInfrastructureProject,
  assessProjectRisk,
  getRiskTrend,
  getProjectAlerts,
  getProjectRecommendations,
  getBenchmarkingData,
  getAIInsights,
  createFinancialRecord,
  createMilestone,
  getFinancialRecords,
  addInfrastructureMember,
  removeInfrastructureMember,
} from "../controllers/infrastructureController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.route("/projects")
  .post(protect, authorize("Manager", "Admin"), createInfrastructureProject)
  .get(protect, getInfrastructureProjects);

router.route("/projects/:id")
  .get(protect, getInfrastructureProject)
  .put(protect, authorize("Manager", "Admin"), updateInfrastructureProject)
  .delete(protect, authorize("Manager", "Admin"), deleteInfrastructureProject);

router.route("/projects/:id/assess-risk").post(protect, assessProjectRisk);
router.route("/projects/:id/risk-trend").get(protect, getRiskTrend);
router.route("/projects/:id/alerts").get(protect, getProjectAlerts);
router.route("/projects/:id/recommendations").get(protect, getProjectRecommendations);
router.route("/projects/:id/financial-records").post(protect, createFinancialRecord).get(protect, getFinancialRecords);
router.route("/projects/:id/milestones").post(protect, createMilestone);
router.route("/projects/:id/members").post(protect, authorize("Manager", "Admin"), addInfrastructureMember);
router.route("/projects/:id/members/:userId").delete(protect, authorize("Manager", "Admin"), removeInfrastructureMember);

router.route("/benchmarking").get(protect, getBenchmarkingData);
router.route("/insights").get(protect, getAIInsights);

export default router;
