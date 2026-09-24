import asyncHandler from "express-async-handler";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import * as ai from "../services/aiService.js";

// @desc AI chat
// @route POST /api/ai/chat
export const chat = asyncHandler(async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    res.status(400);
    throw new Error("Message is required");
  }
  const result = await ai.chat(message, history || []);
  res.json({ success: true, result });
});

// @desc AI task prioritization
// @route POST /api/ai/prioritize-task
export const prioritizeTask = asyncHandler(async (req, res) => {
  const { taskId, title, description, dueDate, status } = req.body;
  let task = { title, description, dueDate, status };

  if (taskId) {
    const found = await Task.findById(taskId);
    if (found) task = found;
  }
  if (!task.title) {
    res.status(400);
    throw new Error("Task title (or taskId) is required");
  }

  const result = await ai.prioritizeTask(task);
  res.json({ success: true, result });
});

// @desc AI project summary
// @route POST /api/ai/project-summary
export const projectSummary = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    res.status(400);
    throw new Error("projectId is required");
  }
  const project = await Project.findById(projectId);
  const infraProject = !project ? await InfrastructureProject.findById(projectId) : null;
  const targetProject = project || infraProject;
  if (!targetProject) {
    res.status(404);
    throw new Error("Project not found");
  }
  const projectType = project ? "Project" : "InfrastructureProject";
  const tasks = await Task.find({ project: projectId, projectType });
  const result = await ai.generateProjectSummary(targetProject, tasks);
  res.json({ success: true, result });
});

// @desc AI deadline risk prediction
// @route POST /api/ai/deadline-risk
export const deadlineRisk = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    res.status(400);
    throw new Error("projectId is required");
  }
  const project = await Project.findById(projectId);
  const infraProject = !project ? await InfrastructureProject.findById(projectId) : null;
  const targetProject = project || infraProject;
  if (!targetProject) {
    res.status(404);
    throw new Error("Project not found");
  }
  const projectType = project ? "Project" : "InfrastructureProject";
  const tasks = await Task.find({ project: projectId, projectType });
  const result = await ai.predictDeadlineRisk(tasks);
  res.json({ success: true, result });
});

// @desc AI meeting notes summary
// @route POST /api/ai/meeting-summary
export const meetingSummary = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  if (!notes) {
    res.status(400);
    throw new Error("Meeting notes are required");
  }
  const result = await ai.summarizeMeetingNotes(notes);
  res.json({ success: true, result });
});

// @desc AI task suggestions
// @route POST /api/ai/task-suggestions
export const taskSuggestions = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    res.status(400);
    throw new Error("projectId is required");
  }
  const project = await Project.findById(projectId);
  const infraProject = !project ? await InfrastructureProject.findById(projectId) : null;
  const targetProject = project || infraProject;
  if (!targetProject) {
    res.status(404);
    throw new Error("Project not found");
  }
  const projectType = project ? "Project" : "InfrastructureProject";
  const tasks = await Task.find({ project: projectId, projectType });
  const result = await ai.suggestTasks(targetProject);
  res.json({ success: true, result });
});
