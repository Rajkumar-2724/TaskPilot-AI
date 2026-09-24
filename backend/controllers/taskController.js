import asyncHandler from "express-async-handler";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import { logActivity } from "../utils/logActivity.js";
import { createNotification } from "../utils/notify.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";
import { cloudinaryEnabled } from "../config/cloudinary.js";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";
import { recordTaskHistory } from "../utils/saveTaskHistory.js";

const getProjectName = async (projectId, projectType = "Project") => {
  if (projectType === "InfrastructureProject") {
    const proj = await InfrastructureProject.findById(projectId).select("name");
    return proj ? proj.name : "Unknown Infrastructure Project";
  }
  const proj = await Project.findById(projectId).select("name");
  return proj ? proj.name : "Unknown Project";
};

const isProjectOwner = (project, user) => {
  if (user.role === "Admin") return true;
  const ownerId = project.owner?._id || project.owner || project.projectManager?._id || project.projectManager;
  if (!ownerId) return false;
  return ownerId.toString() === user._id.toString();
};

const canAccessProject = async (projectId, projectType = "Project", user) => {
  let project;
  if (projectType === "InfrastructureProject") {
    project = await InfrastructureProject.findById(projectId);
    if (!project) return null;
    if (user.role === "Admin") return project;
    const pmId = project.projectManager?._id || project.projectManager;
    if (pmId && pmId.toString() === user._id.toString()) return project;
    const isMember = (project.members || []).some((m) => (m?._id || m).toString() === user._id.toString());
    return isMember ? project : null;
  }
  project = await Project.findById(projectId);
  if (!project) return null;
  if (user.role === "Admin") return project;
  const ownerId = project.owner?._id || project.owner;
  if (!ownerId) return null;
  const uId = user._id.toString();
  const isIn =
    ownerId.toString() === uId ||
    project.members.some((m) => (m?._id || m).toString() === uId);
  return isIn ? project : null;
};

// @desc Create task
// @route POST /api/tasks
export const createTask = asyncHandler(async (req, res) => {
  const { title, description, project, projectType = "Project", assignedTo, priority, dueDate } = req.body;
  if (!title || !project) {
    res.status(400);
    throw new Error("Title and project are required");
  }

  const proj = await canAccessProject(project, projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  const ownerId = (proj.owner?._id || proj.owner || proj.projectManager?._id || proj.projectManager);
  const isOwner = ownerId && ownerId.toString() === req.user._id.toString();
  const isMember = (proj.members || []).some((m) => (m?._id || m).toString() === req.user._id.toString());
  if (!isOwner && !isMember && req.user.role !== "Admin") {
    res.status(403);
    throw new Error("You do not have access to create tasks in this project");
  }

  const task = await Task.create({
    title,
    description,
    project,
    projectType,
    assignedTo: assignedTo || undefined,
    createdBy: req.user._id,
    priority: priority || "Medium",
    dueDate,
  });

  await logActivity({
    user: req.user._id,
    project,
    projectType,
    task: task._id,
    action: "Task created",
    details: `"${task.title}" was created`,
  });

  const io = req.app.get("io");

  if (assignedTo) {
    const assignee = await User.findById(assignedTo);
    const projectName = proj.name;
    const taskLink = `/app/tasks/${task._id}`;
    if (assignee) {
      await createNotification(io, {
        user: assignedTo,
        type: "Task Assigned",
        message: `You were assigned task "${task.title}"`,
        link: taskLink,
      });
      sendEmail({
        to: assignee.email,
        subject: `New Task Assigned – TaskPilot AI`,
        html: emailTemplates.taskAssigned(
          assignee.name,
          task.title,
          task.description,
          projectName,
          task.priority,
          task.dueDate ? task.dueDate.toISOString().split("T")[0] : "Not set",
          task.status,
          req.user?.name || "System",
          taskLink
        ),
      }).catch(() => {});
    }
  }

  io?.to(`project:${project}`).emit("task:created", task);

  res.status(201).json({ success: true, task });
});

// @desc Get tasks (filterable by project, status, assignedTo, priority)
//       overdue=true  -> only overdue (due passed, not completed)
//       excludeOverdue=true -> omit overdue tasks from the result
// @route GET /api/tasks
export const getTasks = asyncHandler(async (req, res) => {
  const { project, status, assignedTo, priority, overdue, excludeOverdue } = req.query;
  const filter = {};
  const now = new Date();
  if (overdue === "true" || overdue === "1") {
    filter.status = { $ne: "Completed" };
    filter.dueDate = { $lt: now };
  } else if (excludeOverdue === "true" || excludeOverdue === "1") {
    filter.$or = [
      { status: "Completed" },
      { dueDate: { $exists: false } },
      { dueDate: { $gte: now } },
    ];
  }
  if (project) filter.project = project;
  if (status) filter.status = status;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (priority) filter.priority = priority;

  if (req.user.role !== "Admin") {
    const userId = req.user._id;
    const [projects, infraProjects] = await Promise.all([
      Project.find({ $or: [{ owner: userId }, { members: userId }] }).select("_id"),
      InfrastructureProject.find({ $or: [{ projectManager: userId }, { members: userId }] }).select("_id"),
    ]);
    const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
    if (filter.project) {
      const projectId = filter.project.toString();
      const hasAccess = allProjectIds.some((id) => id.toString() === projectId);
      filter.project = hasAccess ? filter.project : { $in: [] };
    } else {
      filter.project = { $in: allProjectIds };
    }
  }

  const tasks = await Task.find(filter)
    .populate("project", "name")
    .populate("assignedTo", "name email profilePicture")
    .populate("createdBy", "name email")
    .sort("-createdAt");

  res.json({ success: true, count: tasks.length, tasks });
});

// @desc Get single task
// @route GET /api/tasks/:id
export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate("assignedTo", "name email profilePicture")
    .populate("createdBy", "name email")
    .populate("comments.user", "name profilePicture");

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  res.json({ success: true, task });
});

// @desc Update task
// @route PUT /api/tasks/:id
export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate("assignedTo", "name email");
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  const { title, description, priority, status, dueDate, assignedTo } = req.body;
  const previousAssignee = task.assignedTo?.toString();
  const assigneeChanged = assignedTo !== undefined && String(assignedTo) !== previousAssignee;

  if (assigneeChanged && !isProjectOwner(proj, req.user)) {
    res.status(403);
    throw new Error("Only the project owner can reassign tasks");
  }

  if (title) task.title = title;
  if (description !== undefined) task.description = description;
  if (priority) task.priority = priority;
  const validTransitions = {
    "To Do": ["In Progress"],
    "In Progress": ["Review"],
    "Review": ["Completed"],
    "Completed": [],
  };
  if (status && task.status === "Completed" && status !== "Completed") {
    res.status(400);
    throw new Error("Cannot revert a completed task to an earlier status");
  }
  if (status && task.status !== status && !validTransitions[task.status]?.includes(status)) {
    res.status(400);
    throw new Error(`Invalid status transition: ${task.status} → ${status}`);
  }
  if (status) task.status = status;
  if (dueDate) task.dueDate = dueDate;
  if (assignedTo !== undefined) task.assignedTo = assignedTo || undefined;

  await task.save();
  await logActivity({
    user: req.user._id,
    project: task.project,
    projectType: task.projectType,
    task: task._id,
    action: "Task updated",
    details: `"${task.title}" was updated`,
  });

  if (task.status === "Completed") {
    await recordTaskHistory({
      task,
      completedByUserId: req.user._id,
      completedAt: new Date(),
    });
  }

  if (assigneeChanged && task.assignedTo) {
    const assigneeUser = await User.findById(task.assignedTo);
    const projectName = task.project?.name || "Unknown Project";
    const io = req.app.get("io");
    await createNotification(io, {
      user: task.assignedTo,
      type: "Task Assigned",
      message: `You were assigned task "${task.title}"`,
      link: `/app/tasks/${task._id}`,
    });
    if (assigneeUser) {
      sendEmail({
        to: assigneeUser.email,
        subject: `Task Reassigned – TaskPilot AI`,
        html: emailTemplates.taskAssigned(
          assigneeUser.name,
          task.title,
          task.description,
          projectName,
          task.priority,
          task.dueDate ? task.dueDate.toISOString().split("T")[0] : "Not set",
          task.status,
          req.user?.name || "System",
          `/app/tasks/${task._id}`
        ),
      }).catch(() => {});
    }
  }

  res.json({ success: true, task });
});

// @desc Delete task
// @route DELETE /api/tasks/:id
export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  if (!isProjectOwner(proj, req.user)) {
    res.status(403);
    throw new Error("Only the project owner can delete tasks");
  }

  await logActivity({
    user: req.user._id,
    project: task.project._id,
    projectType: task.projectType,
    task: task._id,
    action: "Task deleted",
    details: `"${task.title}" was deleted`,
  });

  await task.deleteOne();
  res.json({ success: true, message: "Task deleted" });
});

// @desc Update task status (used by Kanban drag/drop)
// @route PUT /api/tasks/:id/status
export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ["To Do", "In Progress", "Review", "Completed"];
  if (!valid.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${valid.join(", ")}`);
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  const previousStatus = task.status;
  if (previousStatus === "Completed" && status !== "Completed") {
    res.status(400);
    throw new Error("Cannot revert a completed task to an earlier status");
  }

  const validTransitions = {
    "To Do": ["In Progress"],
    "In Progress": ["Review"],
    "Review": ["Completed"],
    "Completed": [],
  };

  if (!validTransitions[previousStatus]?.includes(status)) {
    if (previousStatus === status) {
      return res.json({ success: true, task, message: "Status unchanged" });
    }
    res.status(400);
    throw new Error(`Invalid status transition: ${previousStatus} → ${status}`);
  }

  task.status = status;
  await task.save();

  await logActivity({
    user: req.user._id,
    project: task.project,
    projectType: task.projectType,
    task: task._id,
    action: "Task status changed",
    details: `"${task.title}": ${previousStatus} → ${status}`,
  });

  if (status === "Completed") {
    await recordTaskHistory({
      task,
      completedByUserId: req.user._id,
      completedAt: new Date(),
    });
  }

  const io = req.app.get("io");
  if (status === "Completed" && task.assignedTo) {
    await createNotification(io, {
      user: task.assignedTo,
      type: "Task Completed",
      message: `Task "${task.title}" marked as completed`,
      link: `/app/tasks/${task._id}`,
    });
  }

  io?.to(`project:${task.project.toString()}`).emit("task:statusUpdated", {
    taskId: task._id,
    status,
  });

  res.json({ success: true, task });
});

// @desc Update task priority
// @route PUT /api/tasks/:id/priority
export const updateTaskPriority = asyncHandler(async (req, res) => {
  const { priority } = req.body;
  const valid = ["Low", "Medium", "High", "Critical"];
  if (!valid.includes(priority)) {
    res.status(400);
    throw new Error(`Priority must be one of: ${valid.join(", ")}`);
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  task.priority = priority;
  await task.save();

  await logActivity({
    user: req.user._id,
    project: task.project,
    projectType: task.projectType,
    task: task._id,
    action: "Task priority updated",
    details: `"${task.title}" priority changed to ${priority}`,
  });

  res.json({ success: true, task });
});

// @desc Assign task
// @route PUT /api/tasks/:id/assign
export const assignTask = asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;
  const task = await Task.findById(req.params.id)
    .populate("assignedTo", "name email");
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  if (!isProjectOwner(proj, req.user)) {
    res.status(403);
    throw new Error("Only the project owner can assign tasks");
  }

  const previousAssignee = task.assignedTo;
  task.assignedTo = assignedTo || undefined;
  await task.save();

  if (assignedTo && assignedTo !== previousAssignee) {
    const assigneeUser = await User.findById(assignedTo);
    const projectName = task.project?.name || "Unknown Project";
    const io = req.app.get("io");
    await createNotification(io, {
      user: assignedTo,
      type: "Task Assigned",
      message: `You were assigned task "${task.title}"`,
      link: `/app/tasks/${task._id}`,
    });
    if (assigneeUser) {
      sendEmail({
        to: assigneeUser.email,
        subject: `New Task Assigned – TaskPilot AI`,
        html: emailTemplates.taskAssigned(
          assigneeUser.name,
          task.title,
          task.description,
          projectName,
          task.priority,
          task.dueDate ? task.dueDate.toISOString().split("T")[0] : "Not set",
          task.status,
          req.user?.name || "System",
          `/app/tasks/${task._id}`
        ),
      }).catch(() => {});
    }
  }

  res.json({ success: true, task });
});

// @desc Add comment
// @route POST /api/tasks/:id/comments
export const addComment = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text) {
    res.status(400);
    throw new Error("Comment text is required");
  }
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  task.comments.push({ user: req.user._id, text });
  await task.save();

  await logActivity({
    user: req.user._id,
    project: task.project,
    projectType: task.projectType,
    task: task._id,
    action: "Comment added",
    details: `Comment added on "${task.title}"`,
  });

  const populated = await Task.findById(task._id).populate("comments.user", "name profilePicture");
  res.status(201).json({ success: true, comments: populated.comments });
});

// @desc Add attachment
// @route POST /api/tasks/:id/attachments
export const addAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (task.projectType === "InfrastructureProject") {
    await task.populate({ path: "project", model: "InfrastructureProject" });
  } else {
    await task.populate({ path: "project", model: "Project" });
  }

  const proj = await canAccessProject(task.project._id, task.projectType, req.user);
  if (!proj) {
    res.status(403);
    throw new Error("You do not have access to this project");
  }

  let url;
  if (cloudinaryEnabled) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "taskpilot-ai/attachments",
      resource_type: "auto",
    });
    url = result.secure_url;
  } else {
    url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  }

  task.attachments.push({ url, name: req.file.originalname, uploadedBy: req.user._id });
  await task.save();

  await logActivity({
    user: req.user._id,
    project: task.project,
    projectType: task.projectType,
    task: task._id,
    action: "File uploaded",
    details: `File "${req.file.originalname}" uploaded to "${task.title}"`,
  });

  res.status(201).json({ success: true, attachments: task.attachments });
});
