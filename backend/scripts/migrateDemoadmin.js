import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import ActivityLog from "../models/ActivityLog.js";
import Message from "../models/Message.js";
import Reminder from "../models/Reminder.js";
import Notification from "../models/Notification.js";
import TaskHistory from "../models/TaskHistory.js";
import Setting from "../models/Setting.js";
import { RiskPrediction, RiskHistory, Alert, Recommendation, Simulation } from "../models/RiskModels.js";

dotenv.config();

const ORIGINAL_EMAIL = process.env.ORIGINAL_ADMIN_EMAIL || "rkrajubhai726@gmail.com";
const DEMO_EMAIL = process.env.DEMO_ADMIN_EMAIL || "demoadmin@gmail.com";

const run = async () => {
  await connectDB();
  console.log("[Migrate] Connected to MongoDB");

  const originalUser = await User.findOne({ email: ORIGINAL_EMAIL });
  if (!originalUser) {
    console.error(`[Migrate] Original user ${ORIGINAL_EMAIL} not found. Aborting.`);
    process.exit(1);
  }
  console.log(`[Migrate] Original user: ${originalUser.email} (ID: ${originalUser._id})`);

  let demoUser = await User.findOne({ email: DEMO_EMAIL });
  const isNew = !demoUser;

  if (isNew) {
    demoUser = new User({
      name: originalUser.name,
      email: DEMO_EMAIL,
      password: process.env.DEMO_ADMIN_PASSWORD || "changeme123",
      profilePicture: originalUser.profilePicture,
      role: "Admin",
      bio: originalUser.bio,
      phone: originalUser.phone,
      skills: [...originalUser.skills],
      department: originalUser.department,
      designation: originalUser.designation,
      isActive: true,
      isEmailVerified: true,
    });
    await demoUser.save();
    console.log(`[Migrate] Created new demo user: ${DEMO_EMAIL} (ID: ${demoUser._id})`);
  } else {
    demoUser.name = originalUser.name;
    demoUser.role = "Admin";
    demoUser.bio = originalUser.bio;
    demoUser.phone = originalUser.phone;
    demoUser.skills = [...originalUser.skills];
    demoUser.department = originalUser.department;
    demoUser.designation = originalUser.designation;
    demoUser.isActive = true;
    demoUser.isEmailVerified = true;
    if (process.env.DEMO_ADMIN_PASSWORD) {
      demoUser.password = process.env.DEMO_ADMIN_PASSWORD;
    }
    await demoUser.save();
    console.log(`[Migrate] Updated existing demo user: ${DEMO_EMAIL} (ID: ${demoUser._id})`);
  }

  const originalId = originalUser._id;
  const demoId = demoUser._id;

  // Add demoadmin as a member of all projects owned by original
  const projects = await Project.find({ owner: originalId });
  for (const proj of projects) {
    if (!proj.members.includes(demoId)) {
      proj.members.push(demoId);
      await proj.save();
    }
  }
  console.log(`[Migrate] Added demoadmin to ${projects.length} Project.members`);

  // Add demoadmin as a member of all infrastructure projects
  const infraProjects = await InfrastructureProject.find({ projectManager: originalId });
  for (const ip of infraProjects) {
    if (!ip.members.includes(demoId)) {
      ip.members.push(demoId);
      await ip.save();
    }
  }
  console.log(`[Migrate] Added demoadmin to ${infraProjects.length} InfrastructureProject.members`);

  // Reassign tasks: assignedTo = original → demo
  const tasksReassigned = await Task.updateMany(
    { assignedTo: originalId },
    { $set: { assignedTo: demoId } }
  );
  if (tasksReassigned.modifiedCount > 0) {
    console.log(`[Migrate] Reassigned ${tasksReassigned.modifiedCount} tasks assignedTo to demoadmin`);
  }

  // Add demoadmin to notification users (copies)
  const notifs = await Notification.find({ user: originalId });
  for (const n of notifs) {
    const clone = new Notification({ ...n.toObject(), user: demoId, _id: undefined, createdAt: undefined, updatedAt: undefined });
    await clone.save();
  }
  console.log(`[Migrate] Created ${notifs.length} notification copies for demoadmin`);

  // Add demoadmin activity log entries (copies)
  const logs = await ActivityLog.find({ user: originalId });
  for (const log of logs) {
    const clone = new ActivityLog({ ...log.toObject(), user: demoId, _id: undefined, createdAt: undefined, updatedAt: undefined });
    await clone.save();
  }
  console.log(`[Migrate] Created ${logs.length} activity log copies for demoadmin`);

  // Add demoadmin to message readBy
  const messages = await Message.find({ readBy: originalId });
  for (const msg of messages) {
    if (!msg.readBy.includes(demoId)) {
      msg.readBy.push(demoId);
      await msg.save();
    }
  }
  console.log(`[Migrate] Added demoadmin to ${messages.length} Message.readBy`);

  // Reassign reminders: recipientId = original → demo
  const reminders = await Reminder.find({ recipientId: originalId });
  for (const r of reminders) {
    r.recipientId = demoId;
    await r.save();
  }
  console.log(`[Migrate] Reassigned ${reminders.length} reminders to demoadmin`);

  // Reassign task history: user = original → demo
  const histories = await TaskHistory.find({ user: originalId });
  for (const h of histories) {
    h.user = demoId;
    await h.save();
  }
  const assignedHistories = await TaskHistory.find({ assignedTo: originalId });
  for (const h of assignedHistories) {
    h.assignedTo = demoId;
    await h.save();
  }
  console.log(`[Migrate] Reassigned ${histories.length} task history entries to demoadmin`);

  // Reassign settings: updatedBy = original → demo
  const settings = await Setting.find({ updatedBy: originalId });
  for (const s of settings) {
    s.updatedBy = demoId;
    await s.save();
  }
  console.log(`[Migrate] Reassigned ${settings.length} settings to demoadmin`);

  // Reassign risk simulations: createdBy = original → demo
  const sims = await Simulation.find({ createdBy: originalId });
  for (const s of sims) {
    s.createdBy = demoId;
    await s.save();
  }
  console.log(`[Migrate] Reassigned ${sims.length} risk simulations to demoadmin`);

  // Add demoadmin to alert sentTo
  const alerts = await Alert.find({ sentTo: originalId });
  for (const a of alerts) {
    if (!a.sentTo.includes(demoId)) {
      a.sentTo.push(demoId);
      await a.save();
    }
  }
  console.log(`[Migrate] Added demoadmin to ${alerts.length} Alert.sentTo`);

  console.log(`[Migrate] Migration complete!`);
  console.log(`[Migrate] Original user ID: ${originalId}`);
  console.log(`[Migrate] Demo user ID: ${demoId}`);
  console.log(`[Migrate] Original data unchanged: ${originalUser.email}`);

  await mongoose.connection.close();
};

run().catch((err) => {
  console.error("[Migrate] Fatal error:", err);
  process.exit(1);
});
