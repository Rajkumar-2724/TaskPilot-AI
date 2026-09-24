import express from "express";
import {
  getUsers,
  toggleUserStatus,
  changeUserRole,
  getAnalytics,
  getAllActivityLogs,
  getRiskSettings,
  updateRiskSettings,
} from "../controllers/adminController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import Task from "../models/Task.js";
import asyncHandler from "express-async-handler";

const router = express.Router();
router.use(protect, authorize("Admin"));

router.get("/users", getUsers);
router.put("/users/:id/status", toggleUserStatus);
router.put("/users/:id/role", changeUserRole);
router.get("/analytics", getAnalytics);
router.get("/activity-logs", getAllActivityLogs);
router.get("/settings/risk-thresholds", getRiskSettings);
router.put("/settings/risk-thresholds", updateRiskSettings);

router.get(
  "/projects",
  asyncHandler(async (req, res) => {
    const [projects, infraProjects] = await Promise.all([
      Project.find().populate("owner", "name email").sort("-createdAt"),
      InfrastructureProject.find().populate("projectManager", "name email").sort("-createdAt"),
    ]);
    const allProjects = [
      ...projects.map((p) => ({ ...p.toObject(), projectType: "Project", name: p.name, owner: p.owner })),
      ...infraProjects.map((p) => ({ ...p.toObject(), projectType: "InfrastructureProject", name: p.name, owner: p.projectManager })),
    ];
    res.json({ success: true, projects: allProjects });
  })
);

router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const tasks = await Task.find().populate("project", "name").populate("assignedTo", "name").sort("-createdAt");
    res.json({ success: true, tasks });
  })
);

export default router;
