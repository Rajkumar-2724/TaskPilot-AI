import asyncHandler from "express-async-handler";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

const getTeamLeaderboard = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  let taskFilter = {};

  if (!isAdmin) {
    const userId = req.user._id;
    const [projects, infraProjects] = await Promise.all([
      Project.find({ $or: [{ owner: userId }, { members: userId }] }).select("_id"),
      InfrastructureProject.find({ $or: [{ projectManager: userId }, { members: userId }] }).select("_id"),
    ]);
    const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
    taskFilter = { project: { $in: allProjectIds } };
  }

  const tasks = await Task.find(taskFilter)
    .populate("assignedTo", "name email profilePicture")
    .populate("createdBy", "name email");

  const userStats = {};

  tasks.forEach((t) => {
    if (t.assignedTo) {
      const userId = t.assignedTo._id.toString();
      const userName = t.assignedTo.name || "Unknown";
      if (!userStats[userId]) {
        userStats[userId] = {
          userId,
          name: userName,
          profilePicture: t.assignedTo.profilePicture || null,
          assigned: 0,
          completed: 0,
          pending: 0,
          inProgress: 0,
          review: 0,
        };
      }
      userStats[userId].assigned += 1;
      switch (t.status) {
        case "Completed":
          userStats[userId].completed += 1;
          break;
        case "To Do":
          userStats[userId].pending += 1;
          break;
        case "In Progress":
          userStats[userId].inProgress += 1;
          break;
        case "Review":
          userStats[userId].review += 1;
          break;
      }
    }
  });

  const leaderboard = Object.values(userStats).map((user) => ({
    rank: 0,
    _id: user.userId,
    name: user.name,
    profilePicture: user.profilePicture,
    assignedTasks: user.assigned,
    completedTasks: user.completed,
    pendingTasks: user.pending,
    inProgressTasks: user.inProgress,
    reviewTasks: user.review,
    completionPercentage: user.assigned > 0 ? Math.round((user.completed / user.assigned) * 100) : 0,
    productivityScore: user.assigned > 0 ? Math.round((user.completed / user.assigned) * 100) + user.review * 15 : user.review * 15,
  }));

  leaderboard.sort((a, b) => (b.productivityScore || 0) - (a.productivityScore || 0));

  leaderboard.forEach((member, index) => {
    member.rank = index + 1;
  });

  res.json({ success: true, leaderboard });
});

export { getTeamLeaderboard };