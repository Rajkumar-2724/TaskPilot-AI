import express from "express";
import {
  createProject,
  getProjects,
  getProjectHistory,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  reassignProjectOwner,
} from "../controllers/projectController.js";
import { importProjects, importUpload, addProjectUpdate, getProjectHistory as getProjectHistoryTimeline, getPlannedVsActual } from "../controllers/dataIngestionController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(authorize("Manager", "Admin"), createProject).get(getProjects);
router.get("/history", getProjectHistory);
router.post("/import", authorize("Manager", "Admin"), importUpload.single("file"), importProjects);
router.post("/:id/updates", addProjectUpdate);
router.get("/:id/history", getProjectHistoryTimeline);
router.get("/:id/planned-vs-actual", getPlannedVsActual);
router.route("/:id").get(getProject).put(updateProject).delete(authorize("Manager", "Admin"), deleteProject);
router.post("/:id/members", authorize("Manager", "Admin"), addMember);
router.delete("/:id/members/:userId", authorize("Manager", "Admin"), removeMember);
router.put("/:id/reassign", authorize("Manager", "Admin"), reassignProjectOwner);

export default router;
