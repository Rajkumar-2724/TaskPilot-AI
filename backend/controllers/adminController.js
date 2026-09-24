import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import Task from "../models/Task.js";
import ActivityLog from "../models/ActivityLog.js";
import { riskSettingsPublic, setRiskThresholds } from "../services/settingsService.js";
import { logActivity } from "../utils/logActivity.js";

// @desc Get all users (search + filter)
// @route GET /api/admin/users
export const getUsers = asyncHandler(async (req, res) => {
  const { search, role } = req.query;
  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (role) filter.role = role;

  const users = await User.find(filter).sort("-createdAt");
  res.json({ success: true, count: users.length, users });
});

// @desc Toggle user active status
// @route PUT /api/admin/users/:id/status
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc Change user role
// @route PUT /api/admin/users/:id/role
export const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!["Admin", "Manager", "Member"].includes(role)) {
    res.status(400);
    throw new Error("Invalid role");
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.role = role;
  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc System-wide analytics
// @route GET /api/admin/analytics
export const getAnalytics = asyncHandler(async (req, res) => {
  const [userCount, projectCount, infraProjectCount, taskCount, adminCount, managerCount, memberCount] =
    await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      InfrastructureProject.countDocuments(),
      Task.countDocuments(),
      User.countDocuments({ role: "Admin" }),
      User.countDocuments({ role: "Manager" }),
      User.countDocuments({ role: "Member" }),
    ]);

  const tasksByStatus = await Task.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const projectsByStatus = await Project.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    analytics: {
      userCount,
      projectCount,
      infraProjectCount,
      taskCount,
      roleBreakdown: { adminCount, managerCount, memberCount },
      tasksByStatus,
      projectsByStatus,
    },
  });
});

// @desc Get recent activity logs (system-wide)
// @route GET /api/admin/activity-logs
export const getAllActivityLogs = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find()
    .populate("user", "name profilePicture")
    .populate("project", "name")
    .populate("task", "title")
    .sort("-createdAt")
    .limit(200);
  res.json({ success: true, logs });
});

// @desc Get risk configuration (thresholds)
// @route GET /api/admin/settings/risk-thresholds
export const getRiskSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, ...riskSettingsPublic() });
});

// @desc Update risk thresholds (Admin)
// @route PUT /api/admin/settings/risk-thresholds
export const updateRiskSettings = asyncHandler(async (req, res) => {
  const { moderate, high, critical } = req.body || {};
  const thresholds = await setRiskThresholds(
    { moderate, high, critical },
    req.user._id
  );
  await logActivity({
    user: req.user._id,
    action: "Risk thresholds updated",
    details: `Risk thresholds set to Moderate>${thresholds.moderate}, High>${thresholds.high}, Critical>${thresholds.critical}`,
  });
  res.json({ success: true, thresholds, source: "database" });
});
