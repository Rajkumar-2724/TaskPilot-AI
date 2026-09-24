import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import ActivityLog from "../models/ActivityLog.js";
import Message from "../models/Message.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

dotenv.config();

const KEEP_EMAILS = ["siva3@gmail.com", "siva1@gmail.com", "rkrajubhai726@gmail.com"];

const run = async () => {
  await connectDB();

  // 1. Find users to keep
  const keepUsers = await User.find({ email: { $in: KEEP_EMAILS } });
  const keepIds = keepUsers.map((u) => u._id);
  console.log(`[Reset] Found ${keepUsers.length} users to keep:`);
  keepUsers.forEach((u) => console.log(`  - ${u.email} (${u.role})`));

  if (keepUsers.length < KEEP_EMAILS.length) {
    const found = keepUsers.map((u) => u.email);
    const missing = KEEP_EMAILS.filter((e) => !found.includes(e));
    console.warn(`[Reset] WARNING: Missing users: ${missing.join(", ")}`);
  }

  // 2. Delete everything
  console.log("[Reset] Clearing all data...");
  const deleteResult = await Promise.all([
    User.deleteMany({ _id: { $nin: keepIds } }),
    Project.deleteMany(),
    Task.deleteMany(),
    Notification.deleteMany(),
    ActivityLog.deleteMany(),
    Message.deleteMany(),
    InfrastructureProject.deleteMany(),
  ]);
  console.log(`[Reset] Deleted: ${deleteResult[0].deletedCount} users, ${deleteResult[1].deletedCount} projects, ${deleteResult[2].deletedCount} tasks, ${deleteResult[3].deletedCount} notifications, ${deleteResult[4].deletedCount} activity logs, ${deleteResult[5].deletedCount} messages, ${deleteResult[6].deletedCount} infra projects`);

  // 3. Determine owner (use rkrajubhai726@gmail.com or first kept user)
  const owner = keepUsers.find((u) => u.email === "rkrajubhai726@gmail.com") || keepUsers[0];
  const otherUsers = keepUsers.filter((u) => u._id.toString() !== owner._id.toString());

  // Helper: dates
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const in2Months = new Date();
  in2Months.setMonth(in2Months.getMonth() + 2);
  const in3Months = new Date();
  in3Months.setMonth(in3Months.getMonth() + 3);

  // 4. Create 2 Infrastructure Projects
  console.log("[Reset] Creating infrastructure projects...");
  const infra1 = await InfrastructureProject.create({
    name: "Smart Water Distribution System - Chennai",
    projectCode: "SWDS-2026-001",
    description: "Implementation of smart water distribution and monitoring system across Chennai city with IoT-based leak detection and automated billing.",
    sector: "Water",
    ministry: "Ministry of Jal Shakti",
    state: "Tamil Nadu",
    district: "Chennai",
    originalCost: 12500000000,
    revisedCost: 14200000000,
    expenditure: 3500000000,
    plannedDuration: 24,
    plannedStartDate: new Date(),
    plannedEndDate: in2Months,
    physicalProgress: 25,
    financialProgress: 28,
    totalMilestones: 8,
    completedMilestones: 2,
    resourceAvailability: 90,
    milestones: [
      { title: "Pipeline Survey", status: "Completed", completionPercentage: 100 },
      { title: "Pump Station Setup", status: "In Progress", completionPercentage: 40 },
      { title: "Smart Meters Installation", status: "Not Started", completionPercentage: 0 },
    ],
    riskScore: 38,
    riskCategory: "Moderate",
    projectManager: owner._id,
    tags: ["Water", "Smart City"],
  });

  const infra2 = await InfrastructureProject.create({
    name: "Solar Power Plant - Rajasthan",
    projectCode: "SPP-2026-002",
    description: "Construction of 500MW solar power plant in Rajasthan with grid-connected battery storage system.",
    sector: "Energy",
    ministry: "Ministry of New and Renewable Energy",
    state: "Rajasthan",
    district: "Jodhpur",
    originalCost: 28000000000,
    revisedCost: 32500000000,
    expenditure: 4200000000,
    plannedDuration: 18,
    plannedStartDate: new Date(),
    plannedEndDate: in3Months,
    physicalProgress: 15,
    financialProgress: 18,
    totalMilestones: 10,
    completedMilestones: 1,
    resourceAvailability: 85,
    milestones: [
      { title: "Land Preparation", status: "Completed", completionPercentage: 100 },
      { title: "Solar Panel Installation", status: "In Progress", completionPercentage: 20 },
      { title: "Grid Connection", status: "Not Started", completionPercentage: 0 },
    ],
    riskScore: 52,
    riskCategory: "High",
    projectManager: owner._id,
    tags: ["Solar Energy", "Renewable"],
  });

  // 5. Create 1 Regular Project
  console.log("[Reset] Creating regular project...");
  const memberIds = otherUsers.map((u) => u._id);
  const regularProject = await Project.create({
    name: "AI Workflow Automation Platform",
    description: "Build an internal AI-powered platform to automate repetitive project management workflows, task assignments, and reporting.",
    owner: owner._id,
    members: memberIds,
    status: "Active",
    deadline: nextMonth,
    progress: 20,
  });

  // 6. Create some tasks for the regular project
  console.log("[Reset] Creating tasks...");
  const taskData = [
    { title: "Set up project repository and CI/CD", priority: "High", status: "Completed", assignedTo: owner._id },
    { title: "Design database schema for workflows", priority: "Medium", status: "In Progress", assignedTo: otherUsers[0]?._id || owner._id },
    { title: "Build task automation engine", priority: "Critical", status: "To Do", assignedTo: otherUsers[1]?._id || owner._id },
    { title: "Create dashboard UI for monitoring", priority: "Medium", status: "To Do", assignedTo: owner._id },
    { title: "Write API documentation", priority: "Low", status: "To Do", assignedTo: otherUsers[0]?._id || owner._id },
  ];
  const tasks = await Task.insertMany(
    taskData.map((t, i) => ({
      ...t,
      project: regularProject._id,
      projectType: "Project",
      createdBy: owner._id,
      dueDate: new Date(Date.now() + (i + 1) * 5 * 24 * 60 * 60 * 1000),
    }))
  );

  // 7. Summary
  console.log("\n[Reset] Done! Summary:");
  console.log("  Users kept:");
  keepUsers.forEach((u) => console.log(`    - ${u.email} (${u.role})`));
  console.log(`\n  Infrastructure Projects:`);
  console.log(`    1. ${infra1.name} — Original: ₹${(infra1.originalCost / 100000000).toFixed(1)}Cr, Revised: ₹${(infra1.revisedCost / 100000000).toFixed(1)}Cr, Due: ${infra1.plannedEndDate.toDateString()}`);
  console.log(`    2. ${infra2.name} — Original: ₹${(infra2.originalCost / 100000000).toFixed(1)}Cr, Revised: ₹${(infra2.revisedCost / 100000000).toFixed(1)}Cr, Due: ${infra2.plannedEndDate.toDateString()}`);
  console.log(`\n  Regular Project:`);
  console.log(`    1. ${regularProject.name} — Due: ${regularProject.deadline.toDateString()}`);
  console.log(`    Tasks: ${tasks.length}`);

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("[Reset] Failed:", err);
  process.exit(1);
});
