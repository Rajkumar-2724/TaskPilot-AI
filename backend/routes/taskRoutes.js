import express from "express";
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskPriority,
  assignTask,
  addComment,
  addAttachment,
} from "../controllers/taskController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(createTask).get(getTasks);
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);
router.put("/:id/status", updateTaskStatus);
router.put("/:id/priority", updateTaskPriority);
router.put("/:id/assign", assignTask);
router.post("/:id/comments", addComment);
router.post("/:id/attachments", upload.single("file"), addAttachment);

export default router;
