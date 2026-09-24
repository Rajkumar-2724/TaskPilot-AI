import asyncHandler from "express-async-handler";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import Task from "../models/Task.js";
import User from "../models/User.js";

export const getDashboardStats = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const userId = req.user._id;
  const projectFilter = isAdmin ? {} : { $or: [{ owner: userId }, { members: userId }] };
  const infraFilter = isAdmin ? {} : { $or: [{ projectManager: userId }, { members: userId }] };

  const [projects, infraProjects] = await Promise.all([
    Project.find(projectFilter).select("_id status members owner"),
    InfrastructureProject.find(infraFilter).select("_id status projectManager members"),
  ]);

  const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
  const taskFilter = isAdmin ? {} : { project: { $in: allProjectIds } };

  const [taskStats, teamMemberCount] = await Promise.all([
    Task.aggregate([
      { $match: taskFilter },
      {
        $group: {
          _id: { status: "$status", priority: "$priority" },
          count: { $sum: 1 },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $ne: ["$status", "Completed"] }, { $lt: ["$dueDate", new Date()] }] }, 1, 0],
            },
          },
        },
      },
    ]),
    isAdmin
      ? User.countDocuments()
      : (async () => {
          const ids = new Set();
          projects.forEach((p) => {
            if (p.owner) ids.add((p.owner._id || p.owner).toString());
            (p.members || []).forEach((m) => ids.add((m._id || m).toString()));
          });
          infraProjects.forEach((p) => {
            if (p.projectManager) ids.add((p.projectManager._id || p.projectManager).toString());
            (p.members || []).forEach((m) => ids.add((m._id || m).toString()));
          });
          return ids.size;
        })(),
  ]);

  let totalTasks = 0, pending = 0, inProgress = 0, review = 0, completed = 0, overdue = 0;
  const priorityMap = { Low: 0, Medium: 0, High: 0, Critical: 0 };

  for (const ts of taskStats) {
    totalTasks += ts.count;
    if (ts._id.status === "To Do") pending += ts.count;
    else if (ts._id.status === "In Progress") inProgress += ts.count;
    else if (ts._id.status === "Review") review += ts.count;
    else if (ts._id.status === "Completed") completed += ts.count;
    overdue += ts.overdue;
    if (priorityMap[ts._id.priority] !== undefined) priorityMap[ts._id.priority] += ts.count;
  }

  const now = new Date();
  const weekDates = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    weekDates.push({ dateObj: day, label: day.toLocaleDateString("en-US", { weekday: "short" }) });
  }

  const weeklyTasks = totalTasks > 0
    ? await Task.aggregate([
        { $match: { ...taskFilter, status: "Completed", createdAt: { $gte: new Date(now.getTime() - 7 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
    : [];
  const weeklyMap = {};
  for (const wt of weeklyTasks) weeklyMap[wt._id] = wt.count;
  const weekly = weekDates.map((d) => {
    const dt = d.dateObj;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    return { name: d.label, tasks: weeklyMap[key] || 0 };
  });

  const productivity = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  res.json({
    success: true,
    stats: {
      totalProjects: projects.length + infraProjects.length,
      activeProjects: projects.filter((p) => p.status === "Active").length + infraProjects.filter((p) => p.status === "Active").length,
      totalTasks, pendingTasks: pending, inProgressTasks: inProgress, completedTasks: completed, overdueTasks: overdue,
      teamMembers: teamMemberCount,
      productivity,
      projectBreakdown: { workManagement: projects.length, infrastructure: infraProjects.length },
    },
    charts: {
      tasksByStatus: [
        { name: "To Do", value: pending },
        { name: "In Progress", value: inProgress },
        { name: "Review", value: review },
        { name: "Completed", value: completed },
      ],
      tasksByPriority: Object.entries(priorityMap).map(([name, value]) => ({ name, value })),
      weeklyProductivity: weekly,
    },
  });
});
