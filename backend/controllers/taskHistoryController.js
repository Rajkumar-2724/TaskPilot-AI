import asyncHandler from "express-async-handler";
import TaskHistory from "../models/TaskHistory.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { recordTaskHistory } from "../utils/saveTaskHistory.js";
import { TASK_HISTORY_RETENTION_DAYS } from "../config/constants.js";

const backfillForUser = async (userId) => {
  const existingTaskIds = await TaskHistory.find({ user: userId }).distinct("task");
  const completed = await Task.find({
    status: "Completed",
    $or: [{ assignedTo: userId }, { createdBy: userId }],
    _id: { $nin: existingTaskIds },
  });

  for (const task of completed) {
    await recordTaskHistory({
      task,
      completedByUserId: task.assignedTo || task.createdBy || userId,
      completedAt: task.completedAt || task.updatedAt,
    });
  }

  return completed.length;
};

// @desc Get the current user's completed task history
// @route GET /api/history
export const getMyTaskHistory = asyncHandler(async (req, res) => {
  let userId = req.user._id;

  if (req.query.userId && req.user.role === "Admin") {
    const targetUser = await User.findById(req.query.userId).select("_id");
    if (targetUser) userId = targetUser._id;
  }

  try {
    await backfillForUser(userId);
  } catch (err) {
    console.error("[TaskHistory] backfill error:", err.message);
  }

  const cutoff = new Date(Date.now() - TASK_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const history = await TaskHistory.find({
    user: userId,
    $or: [
      { completedAt: { $gte: cutoff } },
      { completedAt: null, createdAt: { $gte: cutoff } },
    ],
  })
    .populate("task", "title status")
    .populate("assignedTo", "name email profilePicture")
    .populate("completedBy", "name profilePicture")
    .sort("-completedAt -createdAt");

  res.json({
    success: true,
    count: history.length,
    retentionDays: TASK_HISTORY_RETENTION_DAYS,
    userId: userId.toString(),
    history,
  });
});