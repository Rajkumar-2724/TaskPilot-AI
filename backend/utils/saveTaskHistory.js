import TaskHistory from "../models/TaskHistory.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

const getProjectName = async (projectId, projectType = "Project") => {
  if (!projectId) return "Unknown Project";
  try {
    if (projectType === "InfrastructureProject") {
      const proj = await InfrastructureProject.findById(projectId).select("name");
      return proj ? proj.name : "Unknown Infrastructure Project";
    }
    const proj = await Project.findById(projectId).select("name");
    return proj ? proj.name : "Unknown Project";
  } catch {
    return "Unknown Project";
  }
};

const resolveId = (value) => value?._id || value || undefined;

export const recordTaskHistory = async ({
  task,
  completedByUserId,
  completedAt = new Date(),
  useAssignedUser = true,
}) => {
  if (!task?._id) return;

  const users = [];
  if (useAssignedUser) {
    const assignedId = resolveId(task.assignedTo);
    if (assignedId) users.push(assignedId.toString());
  }
  if (completedByUserId) users.push(completedByUserId.toString());
  const uniqueUsers = [...new Set(users)];
  if (uniqueUsers.length === 0) return;

  const projectId = resolveId(task.project);
  const projectName = await getProjectName(projectId, task.projectType || "Project");

  const docs = uniqueUsers.map((user) => ({
    user,
    task: task._id,
    project: projectId,
    projectType: task.projectType || "Project",
    projectName,
    title: task.title,
    description: task.description || "",
    priority: task.priority || "Medium",
    status: "Completed",
    assignedTo: resolveId(task.assignedTo),
    createdBy: resolveId(task.createdBy),
    completedBy: completedByUserId,
    dueDate: task.dueDate,
    completedAt,
  }));

  try {
    await TaskHistory.insertMany(docs, { ordered: false });
  } catch (err) {
    if (err.code === 11000) {
      return;
    }
    console.error("[TaskHistory] record error:", err.message);
  }
};