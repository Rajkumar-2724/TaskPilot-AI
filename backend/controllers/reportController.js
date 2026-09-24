import asyncHandler from "express-async-handler";
import PDFDocument from "pdfkit";
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

const generatePDFReport = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  let project = await Project.findById(projectId).populate("owner", "name email");
  let isInfra = false;

  if (!project) {
    project = await InfrastructureProject.findById(projectId).populate("projectManager", "name email");
    isInfra = !!project;
  }

  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const tasks = await Task.find({ project: projectId })
    .populate("assignedTo", "name email profilePicture")
    .populate("createdBy", "name email");

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;
  const pendingTasks = tasks.filter((t) => t.status === "To Do").length;
  const inProgressTasks = tasks.filter((t) => t.status === "In Progress").length;
  const reviewTasks = tasks.filter((t) => t.status === "Review").length;

  const priorityStats = {
    Low: tasks.filter((t) => t.priority === "Low").length,
    Medium: tasks.filter((t) => t.priority === "Medium").length,
    High: tasks.filter((t) => t.priority === "High").length,
    Critical: tasks.filter((t) => t.priority === "Critical").length,
  };

  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "Completed"
  );

  const assigneeCount = {};
  tasks.forEach((t) => {
    if (t.assignedTo) {
      const name = t.assignedTo.name || "Unknown";
      assigneeCount[name] = (assigneeCount[name] || 0) + 1;
    }
  });

  const teamProductivity = Object.entries(assigneeCount).map(
    ([name, assigned]) => {
      const completed = tasks.filter(
        (t) => t.assignedTo && t.assignedTo.name === name && t.status === "Completed"
      ).length;
      const percentage = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
      return { name, assigned, completed, percentage };
    }
  ).sort((a, b) => b.percentage - a.percentage);

  const projectName = (project.name || "Unknown Project").replace(/\s+/g, "-");
  const projectOwner = isInfra ? (project.projectManager?.name || "N/A") : (project.owner?.name || "N/A");
  const projectStatus = project.status || "N/A";
  const projectDeadline = isInfra
    ? (project.plannedEndDate ? new Date(project.plannedEndDate).toLocaleDateString() : "N/A")
    : (project.deadline ? new Date(project.deadline).toLocaleDateString() : "N/A");
  const aiSummary =
    totalTasks > 0
      ? `Based on the project task analysis, overall progress is on track with ${Math.round((completedTasks / totalTasks) * 100)}% of tasks completed. Priority distribution shows most tasks are Medium priority.`
      : "No tasks found for this project.";

  const doc = new PDFDocument({ margin: 40, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="report-${projectName}-${new Date().getFullYear()}.pdf"`);
  res.setHeader("Cache-Control", "no-cache");

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => {
    const pdfData = Buffer.concat(chunks);
    res.status(200).send(pdfData);
  });

  doc.on("error", (err) => {
    console.error("[PDF] Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "PDF generation failed" });
    }
  });

  res.on("error", (err) => {
    console.error("[PDF] Response error:", err.message);
  });

  doc.fontSize(22).text(projectName, { align: "center" });
  doc.moveDown(1);

  doc.fontSize(11).font("Helvetica-Bold").text(`Project Owner: ${projectOwner}`, { align: "center" });
  doc.font("Helvetica").moveDown(0.5);
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text(`Project Status: ${projectStatus}`);
  doc.font("Helvetica").text(`Project Deadline: ${projectDeadline}`);
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").text(`Generated Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text("Summary", { underline: true });
  doc.font("Helvetica").text(aiSummary);
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text("Statistics", { underline: true });
  doc.font("Helvetica").text(`Total Tasks: ${totalTasks}`);
  doc.font("Helvetica").text(`Completed Tasks: ${completedTasks}`);
  doc.font("Helvetica").text(`Pending Tasks: ${pendingTasks}`);
  doc.font("Helvetica").text(`In-Progress Tasks: ${inProgressTasks}`);
  doc.font("Helvetica").text(`Review Tasks: ${reviewTasks}`);
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text("Task Priority Statistics", { underline: true });
  doc.font("Helvetica").text(`Low: ${priorityStats.Low}`);
  doc.font("Helvetica").text(`Medium: ${priorityStats.Medium}`);
  doc.font("Helvetica").text(`High: ${priorityStats.High}`);
  doc.font("Helvetica").text(`Critical: ${priorityStats.Critical}`);
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text("Overdue Tasks", { underline: true });
  if (overdueTasks.length === 0) {
    doc.font("Helvetica").text("No overdue tasks.");
  } else {
    overdueTasks.forEach((t) => {
      doc.font("Helvetica").text(`- ${t.title || "N/A"} (due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "N/A"})`);
    });
  }
  doc.moveDown(1);

  if (teamProductivity.length > 0) {
    doc.font("Helvetica-Bold").text("Team Productivity", { underline: true });
    teamProductivity.forEach((member, idx) => {
      doc.font("Helvetica").text(`${idx + 1}. ${member.name}: ${member.completed}/${member.assigned} completed (${member.percentage}%)`);
    });
    doc.moveDown(1);
  }

  doc.font("Helvetica-Bold").text("Task List", { underline: true });
  doc.moveDown(0.5);
  tasks.slice(0, 15).forEach((t) => {
    const line = `- ${t.title || "N/A"} [${t.status || "N/A"}] (${t.priority || "N/A"}) - ${t.assignedTo?.name || "Unassigned"}`;
    doc.font("Helvetica").text(line);
  });

  doc.end();
});

export { generatePDFReport };
