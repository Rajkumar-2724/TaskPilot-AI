import asyncHandler from "express-async-handler";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import ActivityLog from "../models/ActivityLog.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import { logActivity } from "../utils/logActivity.js";
import { createNotification } from "../utils/notify.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";

const isMember = (project, userId) => {
  if (!project || !userId) return false;
  const ownerId = project.owner?._id || project.owner || project.projectManager?._id || project.projectManager;
  const uId = userId.toString();
  if (ownerId && ownerId.toString() === uId) return true;
  return project.members.some((m) => (m?._id || m).toString() === uId);
};

// @desc Create project
// @route POST /api/projects
export const createProject = asyncHandler(async (req, res) => {
  const { name, description, deadline, members, projectType = "Project" } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Project name is required");
  }

  const project = await Project.create({
    name,
    description,
    deadline,
    owner: req.user._id,
    members: members || [],
    projectType,
  });

  await logActivity({
    user: req.user._id,
    project: project._id,
    action: "Project created",
    details: `"${project.name}" was created`,
  });

  res.status(201).json({ success: true, project });
});

// @desc Get all projects visible to user (Admin sees all)
//       overdue=true -> only overdue (deadline passed, not completed/cancelled)
//       excludeOverdue=true -> omit overdue projects from the result
// @route GET /api/projects
export const getProjects = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const userId = req.user._id;
  const { overdue, excludeOverdue } = req.query;
  const now = new Date();

  const applyOverdueFilter = (base) => {
    if (overdue === "true" || overdue === "1") {
      base.status = { $nin: ["Completed", "Cancelled"] };
      base.deadline = { $lt: now };
    } else if (excludeOverdue === "true" || excludeOverdue === "1") {
      const accessOr = Array.isArray(base.$or) ? base.$or : null;
      delete base.$or;
      base.$and = [
        ...(accessOr ? [{ $or: accessOr }] : []),
        {
          $or: [
            { deadline: { $exists: false } },
            { deadline: { $gte: now } },
            { status: { $in: ["Completed", "Cancelled"] } },
          ],
        },
      ];
    }
  };
  const applyOverdueFilterInfra = (base) => {
    if (overdue === "true" || overdue === "1") {
      base.status = { $nin: ["Completed", "Cancelled"] };
      base.plannedEndDate = { $lt: now };
    } else if (excludeOverdue === "true" || excludeOverdue === "1") {
      const accessOr = Array.isArray(base.$or) ? base.$or : null;
      delete base.$or;
      base.$and = [
        ...(accessOr ? [{ $or: accessOr }] : []),
        {
          $or: [
            { plannedEndDate: { $exists: false } },
            { plannedEndDate: { $gte: now } },
            { status: { $in: ["Completed", "Cancelled"] } },
          ],
        },
      ];
    }
  };

  const baseFilter = isAdmin
    ? { status: { $ne: "Completed" } }
    : { $or: [{ owner: userId }, { members: userId }], status: { $ne: "Completed" } };
  const baseInfraFilter = isAdmin
    ? { status: { $ne: "Completed" } }
    : { $or: [{ projectManager: userId }, { members: userId }], status: { $ne: "Completed" } };

  const filter = { ...baseFilter };
  applyOverdueFilter(filter);

  const infraFilter = { ...baseInfraFilter };
  applyOverdueFilterInfra(infraFilter);

  const [projects, infraProjects] = await Promise.all([
    Project.find(filter).populate("owner", "name email profilePicture").populate("members", "name email profilePicture").sort("-createdAt"),
    InfrastructureProject.find(infraFilter).populate("projectManager", "name email profilePicture").populate("members", "name email profilePicture").sort("-createdAt"),
  ]);

  const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
  const taskCounts = allProjectIds.length > 0
    ? await Task.aggregate([
        { $match: { project: { $in: allProjectIds } } },
        { $group: { _id: { project: "$project", status: "$status" }, count: { $sum: 1 } } },
      ])
    : [];

  const taskMap = {};
  for (const tc of taskCounts) {
    const pid = tc._id.project.toString();
    if (!taskMap[pid]) taskMap[pid] = { taskCount: 0, completedTasks: 0 };
    taskMap[pid].taskCount += tc.count;
    if (tc._id.status === "Completed") taskMap[pid].completedTasks += tc.count;
  }

  const regularProjects = projects.map((p) => {
    const counts = taskMap[p._id.toString()] || { taskCount: 0, completedTasks: 0 };
    return { ...p.toObject(), taskCount: counts.taskCount, completedTasks: counts.completedTasks };
  });

  const infraProjectList = infraProjects.map((p) => {
    const counts = taskMap[p._id.toString()] || { taskCount: 0, completedTasks: 0 };
    return {
      ...p.toObject(),
      taskCount: counts.taskCount,
      completedTasks: counts.completedTasks,
      projectType: "InfrastructureProject",
      progress: p.physicalProgress || 0,
      members: p.members || [],
      owner: p.projectManager ? { _id: p.projectManager._id, name: p.projectManager.name, email: p.projectManager.email, profilePicture: p.projectManager.profilePicture } : null,
      deadline: p.plannedEndDate,
    };
  });

  const allProjects = [...regularProjects, ...infraProjectList];
  res.json({ success: true, count: allProjects.length, projects: allProjects });
});

// @desc Get completed projects history for the user (scoped to owner/manager/member)
// @route GET /api/projects/history
export const getProjectHistory = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const userId = req.user._id;
  const projectFilter = isAdmin
    ? { status: "Completed" }
    : { $or: [{ owner: userId }, { members: userId }], status: "Completed" };
  const infraFilter = isAdmin
    ? { status: "Completed" }
    : { $or: [{ projectManager: userId }, { members: userId }], status: "Completed" };

  const [projects, infraProjects] = await Promise.all([
    Project.find(projectFilter)
      .populate("owner", "name email profilePicture")
      .populate("members", "name email profilePicture"),
    InfrastructureProject.find(infraFilter)
      .populate("projectManager", "name email profilePicture")
      .populate("members", "name email profilePicture"),
  ]);

  const base = [
    ...projects.map((p) => {
      const obj = p.toObject();
      return {
        ...obj,
        projectType: "Project",
        startDate: obj.startDate || null,
        deadline: obj.deadline || null,
        completedAt: obj.completedAt || obj.updatedAt || obj.createdAt,
        progress: obj.progress || 0,
        completionDate: obj.completedAt || obj.updatedAt || obj.createdAt,
      };
    }),
    ...infraProjects.map((p) => {
      const obj = p.toObject();
      return {
        ...obj,
        projectType: "InfrastructureProject",
        owner: obj.projectManager || null,
        manager: obj.projectManager || null,
        startDate: obj.plannedStartDate || null,
        deadline: obj.plannedEndDate || null,
        completedAt: obj.completedAt || obj.updatedAt || obj.createdAt,
        progress: obj.physicalProgress || 0,
        completionDate: obj.completedAt || obj.updatedAt || obj.createdAt,
      };
    }),
  ];

  const withTasks = await Promise.all(
    base.map(async (project) => {
      const tasks = await Task.find({ project: project._id, projectType: project.projectType })
        .populate("assignedTo", "name email profilePicture")
        .select("title description status priority dueDate createdAt assignedTo");
      return {
        ...project,
        taskCount: tasks.length,
        completedTaskCount: tasks.filter((t) => t.status === "Completed").length,
        tasks: tasks.map((t) => ({
          _id: t._id,
          title: t.title,
          description: t.description || "",
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          createdAt: t.createdAt,
          assignedTo: t.assignedTo,
        })),
      };
    })
  );

  const history = withTasks.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  res.json({ success: true, count: history.length, projects: history });
});

// @desc Get single project
// @route GET /api/projects/:id
export const getProject = asyncHandler(async (req, res) => {
  let project = await Project.findById(req.params.id)
    .populate("owner", "name email profilePicture")
    .populate("members", "name email profilePicture");

  let projectType = "Project";

  if (!project) {
    const infraProject = await InfrastructureProject.findById(req.params.id)
      .populate("projectManager", "name email profilePicture")
      .populate("members", "name email profilePicture");
    if (infraProject) {
      projectType = "InfrastructureProject";
      const pObj = infraProject.toObject();
      project = {
        ...pObj,
        owner: infraProject.projectManager ? { _id: infraProject.projectManager._id, name: infraProject.projectManager.name, email: infraProject.projectManager.email, profilePicture: infraProject.projectManager.profilePicture } : null,
        members: pObj.members || [],
        deadline: infraProject.plannedEndDate,
        progress: infraProject.physicalProgress || 0,
        projectType: "InfrastructureProject",
      };
    }
  }

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (req.user.role !== "Admin" && !isMember(project, req.user._id)) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  const [tasks, activityLogs] = await Promise.all([
    Task.find({ project: req.params.id, projectType }).populate("assignedTo", "name email profilePicture"),
    ActivityLog.find({ project: req.params.id, projectType }).populate("user", "name profilePicture").sort("-createdAt").limit(20),
  ]);

  if (typeof project.toObject === "function") project = project.toObject();
  project.taskCount = tasks.length;
  project.members = project.members || [];

  res.json({ success: true, project, tasks, activityLogs });
});

// @desc Update project
// @route PUT /api/projects/:id
export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.owner?._id || project.owner).toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can update this project");
  }

  const { name, description, status, deadline, progress } = req.body;

  if (status) {
    const validProjectStatuses = ["Planning", "Active", "On Hold", "Completed", "Cancelled"];
    if (!validProjectStatuses.includes(status)) {
      res.status(400);
      throw new Error(`Invalid project status`);
    }
    const validTransitions = {
      "Planning": ["Active"],
      "Active": ["On Hold", "Completed"],
      "On Hold": ["Active"],
      "Completed": [],
      "Cancelled": [],
    };
    const previousStatus = project.status;
    if (previousStatus === "Completed" || previousStatus === "Cancelled") {
      res.status(400);
      throw new Error(`Cannot change status of a ${previousStatus.toLowerCase()} project`);
    }
    if (previousStatus !== status && !validTransitions[previousStatus]?.includes(status)) {
      res.status(400);
      throw new Error(`Invalid status transition: ${previousStatus} → ${status}`);
    }
    project.status = status;
    if (status === "Completed" && previousStatus !== "Completed") {
      project.completedAt = new Date();
    }
  }
  if (name) project.name = name;
  if (description !== undefined) project.description = description;
  if (deadline) project.deadline = deadline;
  if (progress !== undefined) project.progress = progress;

  await project.save();
  await logActivity({
    user: req.user._id,
    project: project._id,
    action: "Project updated",
    details: `"${project.name}" was updated`,
  });

  res.json({ success: true, project });
});

// @desc Delete project
// @route DELETE /api/projects/:id
export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.owner?._id || project.owner).toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can delete this project");
  }

  await Task.deleteMany({ project: project._id });
  await project.deleteOne();

  res.json({ success: true, message: "Project deleted" });
});

// @desc Add member
// @route POST /api/projects/:id/members
export const addMember = asyncHandler(async (req, res) => {
  const { userId, email } = req.body;
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.owner?._id || project.owner).toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can add members");
  }

  const user = userId ? await User.findById(userId) : await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (project.members.some((m) => (m?._id || m).toString() === user._id.toString())) {
    res.status(400);
    throw new Error("User is already a member of this project");
  }

  project.members.push(user._id);
  await project.save();

  const io = req.app.get("io");
  await createNotification(io, {
    user: user._id,
    type: "Project Invitation",
    message: `You've been added to project "${project.name}"`,
    link: `/app/projects/${project._id}`,
  });
  sendEmail({
    to: user.email,
    subject: `You Have Been Added to a Project – TaskPilot AI`,
    html: emailTemplates.projectInvite(
      user.name,
      project.name,
      project.description,
      req.user?.name || "System",
      project.status,
      `/app/projects/${project._id}`
    ),
  }).catch(() => {});
  io?.to(`project:${project._id}`).emit("project:memberAdded", { projectId: project._id, user: user._id });

  await logActivity({
    user: req.user._id,
    project: project._id,
    action: "Member added",
    details: `${user.name} was added to the project`,
  });

  res.json({ success: true, project });
});

// @desc Remove member
// @route DELETE /api/projects/:id/members/:userId
export const removeMember = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.owner?._id || project.owner).toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can remove members");
  }

  project.members = project.members.filter((m) => (m?._id || m).toString() !== req.params.userId);
  await project.save();

  res.json({ success: true, project });
});

// @desc Reassign a project to a new owner/manager (supports regular + infrastructure)
// @route PUT /api/projects/:id/reassign
export const reassignProjectOwner = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400);
    throw new Error("Please provide the new owner's user id");
  }
  const newOwner = await User.findById(userId);
  if (!newOwner) {
    res.status(404);
    throw new Error("User not found");
  }

  let project = await Project.findById(req.params.id);

  if (project) {
    const currentOwnerId = (project.owner?._id || project.owner).toString();
    if (req.user.role !== "Admin" && currentOwnerId !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Only the project owner or an admin can reassign this project");
    }
    if (userId !== currentOwnerId && !project.members.some((m) => (m?._id || m).toString() === userId)) {
      project.members.push(newOwner._id);
    }
    project.owner = newOwner._id;
    await project.save();
    await logActivity({
      user: req.user._id,
      project: project._id,
      action: "Project reassigned",
      details: `"${project.name}" was reassigned to ${newOwner.name}`,
    });
    const io = req.app.get("io");
    await createNotification(io, {
      user: newOwner._id,
      type: "Project Assigned",
      message: `You are now the owner of project "${project.name}"`,
      link: `/app/projects/${project._id}`,
    });
    return res.json({ success: true, message: "Project reassigned", project });
  }

  project = await InfrastructureProject.findById(req.params.id);

  if (project) {
    const currentPmId = (project.projectManager?._id || project.projectManager)?.toString?.() || "";
    if (req.user.role !== "Admin" && currentPmId !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Only the project manager or an admin can reassign this project");
    }
    if (!project.members.some((m) => (m?._id || m).toString() === userId)) {
      project.members.push(newOwner._id);
    }
    project.projectManager = newOwner._id;
    await project.save();
    await logActivity({
      user: req.user._id,
      project: project._id,
      projectType: "InfrastructureProject",
      action: "Project reassigned",
      details: `"${project.name}" was reassigned to ${newOwner.name}`,
    });
    const io = req.app.get("io");
    await createNotification(io, {
      user: newOwner._id,
      type: "Project Assigned",
      message: `You are now the project manager of "${project.name}"`,
      link: `/app/projects/${project._id}`,
    });
    return res.json({ success: true, message: "Project reassigned", project });
  }

  res.status(404);
  throw new Error("Project not found");
});
