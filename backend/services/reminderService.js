import Reminder from "../models/Reminder.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import User from "../models/User.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";

const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function getDaysRemaining(dueDate) {
  const now = new Date();
  const due = new Date(dueDate);

  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUTC = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());

  const diffMs = dueUTC - nowUTC;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

function getProjectLink(entityType, entityId) {
  if (entityType === "InfrastructureProject") return `/infrastructure/${entityId}`;
  if (entityType === "Project") return `/projects/${entityId}`;
  return `/tasks/${entityId}`;
}

async function getProjectRecipients(project) {
  const recipients = [];
  const ownerId = project.owner?._id || project.owner || project.projectManager?._id || project.projectManager;
  if (ownerId) {
    const owner = await User.findById(ownerId).select("name email").lean();
    if (owner) recipients.push(owner);
  }
  if (project.members) {
    for (const memberId of project.members) {
      const member = await User.findById(memberId).select("name email").lean();
      if (member && !recipients.find((r) => r._id.toString() === memberId.toString())) {
        recipients.push(member);
      }
    }
  }
  return recipients;
}

async function sendTaskReminder(task) {
  if (!task.dueDate) return;

  const daysRemaining = getDaysRemaining(task.dueDate);
  if (daysRemaining < 0 || daysRemaining > 3) return;

  const assignedTo = task.assignedTo;
  if (!assignedTo || !assignedTo.email) return;
  if (task.status === "Completed") return;

  const existing = await Reminder.findOne({
    entityType: "Task",
    entityId: task._id,
    recipientId: assignedTo._id,
    reminderDay: daysRemaining,
  });
  if (existing) return;

  const projectName = task.project?.name || "Unknown Project";
  const taskLink = `/tasks/${task._id}`;

  const html = emailTemplates.taskDeadlineReminder(
    assignedTo.name,
    task.title,
    task.dueDate,
    daysRemaining,
    task.status,
    task.priority,
    projectName,
    taskLink
  );

  const result = await sendEmail({
    to: assignedTo.email,
    subject: daysRemaining === 0
      ? `URGENT: "${task.title}" is due TODAY`
      : `Deadline Reminder: "${task.title}" due in ${daysRemaining} day(s)`,
    html,
  });

  await Reminder.create({
    entityType: "Task",
    entityId: task._id,
    recipientId: assignedTo._id,
    reminderDay: daysRemaining,
    dueDate: task.dueDate,
  });
  console.log(`[Reminder] ${result.sent ? "Sent" : "Logged"} ${daysRemaining}-day reminder for task "${task.title}" to ${assignedTo.email}`);
}

async function sendProjectReminder(project, projectType) {
  const deadline = project.deadline || project.plannedEndDate;
  if (!deadline) return;

  const daysRemaining = getDaysRemaining(deadline);
  if (daysRemaining < 0 || daysRemaining > 3) return;

  const status = project.status;
  if (status === "Completed" || status === "Cancelled") return;

  const recipients = await getProjectRecipients(project);
  if (recipients.length === 0) return;

  const projectLink = getProjectLink(projectType, project._id);
  const projectName = project.name || "Unknown Project";

  for (const recipient of recipients) {
    if (!recipient || !recipient.email) continue;

    const existing = await Reminder.findOne({
      entityType: projectType,
      entityId: project._id,
      recipientId: recipient._id,
      reminderDay: daysRemaining,
    });
    if (existing) continue;

    const html = emailTemplates.projectDeadlineReminder(
      recipient.name,
      projectName,
      projectType,
      deadline,
      daysRemaining,
      status,
      projectLink
    );

    const result = await sendEmail({
      to: recipient.email,
      subject: daysRemaining === 0
        ? `URGENT: "${projectName}" is due TODAY`
        : `Deadline Reminder: "${projectName}" due in ${daysRemaining} day(s)`,
      html,
    });

    await Reminder.create({
      entityType: projectType,
      entityId: project._id,
      recipientId: recipient._id,
      reminderDay: daysRemaining,
      dueDate: deadline,
    });
    console.log(`[Reminder] ${result.sent ? "Sent" : "Logged"} ${daysRemaining}-day reminder for project "${projectName}" to ${recipient.email}`);
  }
}

export const runReminderCheck = async () => {
  try {
    console.log("[Reminder] Running reminder check...");

    const tasks = await Task.find({
      status: { $ne: "Completed" },
      dueDate: { $exists: true, $ne: null },
    })
      .populate("assignedTo", "name email");

    const tasksWithProject = [];
    for (const task of tasks) {
      if (task.projectType === "InfrastructureProject") {
        await task.populate({ path: "project", model: "InfrastructureProject", select: "name" });
      } else {
        await task.populate({ path: "project", model: "Project", select: "name" });
      }
      tasksWithProject.push(task);
    }

    let taskRemindersSent = 0;
    for (const task of tasksWithProject) {
      try {
        await sendTaskReminder(task);
        taskRemindersSent++;
      } catch (err) {
        console.error(`[Reminder] Task ${task._id} error:`, err.message);
      }
    }

    const projects = await Project.find({
      status: { $nin: ["Completed", "Cancelled"] },
      deadline: { $exists: true, $ne: null },
    }).select("name deadline owner members status");

    let projectRemindersSent = 0;
    for (const project of projects) {
      try {
        await sendProjectReminder(project, "Project");
        projectRemindersSent++;
      } catch (err) {
        console.error(`[Reminder] Project ${project._id} error:`, err.message);
      }
    }

    const infraProjects = await InfrastructureProject.find({
      status: { $nin: ["Completed", "Cancelled"] },
      plannedEndDate: { $exists: true, $ne: null },
    }).select("name plannedEndDate projectManager members status");

    let infraRemindersSent = 0;
    for (const infraProject of infraProjects) {
      try {
        await sendProjectReminder(infraProject, "InfrastructureProject");
        infraRemindersSent++;
      } catch (err) {
        console.error(`[Reminder] InfraProject ${infraProject._id} error:`, err.message);
      }
    }

    console.log(`[Reminder] Check complete: ${taskRemindersSent} tasks, ${projectRemindersSent} projects, ${infraRemindersSent} infra projects processed`);
  } catch (err) {
    console.error("[Reminder] Error in reminder check:", err.message);
  }
};

export const startReminderJob = () => {
  console.log("[Reminder] Starting reminder job...");
  runReminderCheck();
  setInterval(runReminderCheck, CHECK_INTERVAL_MS);
  console.log(`[Reminder] Reminder job running every ${CHECK_INTERVAL_MS / 60000} minutes`);
};

export { sendTaskReminder, sendProjectReminder };
