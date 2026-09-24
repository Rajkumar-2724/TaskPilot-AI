import Notification from "../models/Notification.js";

// getIO is injected from server.js at runtime via app locals to avoid circular imports
export const createNotification = async (io, { user, type, message, link = "" }) => {
  const notification = await Notification.create({ user, type, message, link });
  if (io) {
    io.to(`user:${user.toString()}`).emit("notification:new", notification);
  }
  return notification;
};
