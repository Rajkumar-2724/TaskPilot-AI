import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

const onlineUsers = new Map(); // userId -> Set(socketId)

export const initSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error("User not found"));
      if (!user.isActive) return next(new Error("Account deactivated"));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    io.emit("presence:online", Array.from(onlineUsers.keys()));

    socket.on("project:join", (projectId) => {
      socket.join(`project:${projectId}`);
    });

    socket.on("project:leave", (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on("chat:send", async ({ projectId, text, projectType }) => {
      if (!projectId || !text) return;
      try {
        let resolvedType = projectType;
        if (!resolvedType) {
          const proj = await Project.findById(projectId);
          resolvedType = proj ? "Project" : "InfrastructureProject";
        }
        const message = await Message.create({
          project: projectId,
          projectType: resolvedType,
          sender: socket.user._id,
          text,
          readBy: [socket.user._id],
        });
        const populated = await message.populate("sender", "name profilePicture");
        io.to(`project:${projectId}`).emit("chat:message", populated);
      } catch (err) {
        socket.emit("chat:error", { message: err.message });
      }
    });

    socket.on("chat:typing", ({ projectId, isTyping }) => {
      socket.to(`project:${projectId}`).emit("chat:typing", {
        userId,
        name: socket.user.name,
        isTyping,
      });
    });

    socket.on("disconnect", () => {
      const set = onlineUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) onlineUsers.delete(userId);
      }
      io.emit("presence:online", Array.from(onlineUsers.keys()));
    });
  });
};
