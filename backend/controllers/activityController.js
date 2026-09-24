import asyncHandler from "express-async-handler";
import ActivityLog from "../models/ActivityLog.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import Task from "../models/Task.js";

// @desc Get activity logs (optionally filtered by project, scoped to user)
// @route GET /api/activity
export const getActivityLogs = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.project) {
    filter.project = req.query.project;
  } else if (req.user.role !== "Admin") {
    const userId = req.user._id;
    const [projects, infraProjects] = await Promise.all([
      Project.find({ $or: [{ owner: userId }, { members: userId }] }).select("_id"),
      InfrastructureProject.find({ $or: [{ projectManager: userId }, { members: userId }] }).select("_id"),
    ]);
    const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
    filter.project = { $in: allProjectIds };
  }

  const logs = await ActivityLog.find(filter)
    .populate("user", "name profilePicture")
    .populate("project", "name")
    .populate("task", "title")
    .sort("-createdAt")
    .limit(100);

  res.json({ success: true, logs });
});

// @desc Get current user's recent projects and tasks (user-specific)
// @route GET /api/activity/recent
export const getRecentActivity = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const uid = userId.toString();
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 50);

  // Only projects where the user is actually owner/manager/member
  const [projects, infraProjects] = await Promise.all([
    Project.find({ $or: [{ owner: userId }, { members: userId }] })
      .populate("owner", "name email profilePicture")
      .populate("members", "name email profilePicture"),
    InfrastructureProject.find({ $or: [{ projectManager: userId }, { members: userId }] })
      .populate("projectManager", "name email profilePicture")
      .populate("members", "name email profilePicture"),
  ]);

  // The user's own recent activity
  const logs = await ActivityLog.find({ user: userId })
    .select("project projectType task createdAt")
    .sort("-createdAt")
    .limit(500);

  const projectLast = {};
  const taskLast = {};
  const loggedTaskIds = [];
  for (const log of logs) {
    if (log.project) {
      const key = log.project.toString();
      if (!projectLast[key]) projectLast[key] = log.createdAt;
    }
    if (log.task) {
      const key = log.task.toString();
      if (!taskLast[key]) {
        taskLast[key] = log.createdAt;
        loggedTaskIds.push(log.task);
      }
    }
  }

  const getRole = (project, type) => {
    if (type === "InfrastructureProject") {
      const pm = project.projectManager?._id || project.projectManager;
      if (pm && pm.toString() === uid) return "Project Manager";
    } else {
      const owner = project.owner?._id || project.owner;
      if (owner && owner.toString() === uid) return "Owner";
    }
    const isMember = (project.members || []).some((m) => (m?._id || m).toString() === uid);
    if (isMember) return "Member";
    return "Viewer";
  };

  const accessibleProjectIds = new Set();
  const projectNameMap = {};

  const recentProjects = [
    ...projects.map((p) => ({ project: p, type: "Project" })),
    ...infraProjects.map((p) => ({ project: p, type: "InfrastructureProject" })),
  ]
    .map(({ project, type }) => {
      const id = project._id.toString();
      accessibleProjectIds.add(id);
      projectNameMap[id] = project.name;
      const deadline = type === "Project" ? project.deadline : project.plannedEndDate;
      return {
        _id: project._id,
        name: project.name,
        description: project.description || "",
        status: project.status,
        projectType: type,
        role: getRole(project, type),
        lastActivity: projectLast[id] || project.updatedAt || project.createdAt,
        deadline: deadline || null,
        createdAt: project.createdAt,
        progress: type === "Project" ? project.progress || 0 : project.physicalProgress || 0,
        projectCode: project.projectCode || null,
        sector: project.sector || null,
        ministry: project.ministry || null,
        owner: type === "Project" ? project.owner : project.projectManager,
        membersCount: (project.members || []).length,
      };
    })
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    .slice(0, limit);

  // Tasks the user created, is assigned to, or has worked on
  const taskOr = [{ assignedTo: userId }, { createdBy: userId }];
  if (loggedTaskIds.length) taskOr.push({ _id: { $in: loggedTaskIds } });

  const tasks = await Task.find({ $or: taskOr })
    .populate("assignedTo", "name email profilePicture")
    .populate("createdBy", "name email profilePicture");

  // Resolve project names for tasks whose project the user is not a member of
  const missingProjectIds = [
    ...new Set(tasks.map((t) => t.project.toString()).filter((pid) => !projectNameMap[pid])),
  ];
  if (missingProjectIds.length) {
    const [missingProjects, missingInfra] = await Promise.all([
      Project.find({ _id: { $in: missingProjectIds } }).select("name"),
      InfrastructureProject.find({ _id: { $in: missingProjectIds } }).select("name"),
    ]);
    for (const p of [...missingProjects, ...missingInfra]) projectNameMap[p._id.toString()] = p.name;
  }

  const recentTasks = tasks
    .filter((task) => {
      const assigneeId = (task.assignedTo?._id || task.assignedTo)?.toString();
      const creatorId = (task.createdBy?._id || task.createdBy)?.toString();
      return (
        assigneeId === uid ||
        creatorId === uid ||
        accessibleProjectIds.has(task.project.toString())
      );
    })
    .map((task) => ({
      _id: task._id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      project: { _id: task.project, name: projectNameMap[task.project.toString()] || "Unknown Project" },
      projectType: task.projectType,
      assignedTo: task.assignedTo || null,
      createdBy: task.createdBy || null,
      assignedDate: task.createdAt,
      dueDate: task.dueDate || null,
      startDate: task.startDate || null,
      lastActivity: taskLast[task._id.toString()] || task.updatedAt || task.createdAt,
      isAssignee: (task.assignedTo?._id || task.assignedTo)?.toString() === uid,
      commentsCount: (task.comments || []).length,
      attachmentsCount: (task.attachments || []).length,
    }))
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    .slice(0, limit);

  res.json({
    success: true,
    user: { _id: userId, name: req.user.name, role: req.user.role },
    recentProjects,
    recentTasks,
  });
});
