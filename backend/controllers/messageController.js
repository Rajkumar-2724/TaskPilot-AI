import asyncHandler from "express-async-handler";
import Message from "../models/Message.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

const findProject = async (projectId) => {
  const [project, infraProject] = await Promise.all([
    Project.findById(projectId),
    InfrastructureProject.findById(projectId),
  ]);
  if (project) return { project, projectType: "Project" };
  if (infraProject) return { project: infraProject, projectType: "InfrastructureProject" };
  return null;
};

// @desc Get chat history for a project
// @route GET /api/messages/:projectId
export const getMessages = asyncHandler(async (req, res) => {
  const result = await findProject(req.params.projectId);
  if (!result) {
    res.status(404);
    throw new Error("Project not found");
  }

  const messages = await Message.find({ project: req.params.projectId })
    .populate("sender", "name profilePicture")
    .sort("createdAt")
    .limit(200);

  res.json({ success: true, messages });
});

// @desc Send a message (REST fallback; primary path is Socket.IO)
// @route POST /api/messages/:projectId
export const sendMessage = asyncHandler(async (req, res) => {
  const { text, projectType } = req.body;
  if (!text) {
    res.status(400);
    throw new Error("Message text is required");
  }

  let resolvedType = projectType;
  if (!resolvedType) {
    const result = await findProject(req.params.projectId);
    if (!result) {
      res.status(404);
      throw new Error("Project not found");
    }
    resolvedType = result.projectType;
  }

  const message = await Message.create({
    project: req.params.projectId,
    projectType: resolvedType,
    sender: req.user._id,
    text,
    readBy: [req.user._id],
  });
  const populated = await message.populate("sender", "name profilePicture");

  const io = req.app.get("io");
  io?.to(`project:${req.params.projectId}`).emit("chat:message", populated);

  res.status(201).json({ success: true, message: populated });
});
