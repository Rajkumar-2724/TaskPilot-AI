import ActivityLog from "../models/ActivityLog.js";

export const logActivity = async ({ user, project, task, projectType = "Project", action, details = "" }) => {
  try {
    await ActivityLog.create({ user, project, task, projectType, action, details });
  } catch (err) {
    console.error("[ActivityLog] failed:", err.message);
  }
};
