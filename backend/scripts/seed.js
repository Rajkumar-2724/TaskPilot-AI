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

const priorities = ["Low", "Medium", "High", "Critical"];
const statuses = ["To Do", "In Progress", "Review", "Completed"];

const run = async () => {
  await connectDB();
  console.log("[Seed] Clearing existing data...");
  await Promise.all([
    User.deleteMany(),
    Project.deleteMany(),
    Task.deleteMany(),
    Notification.deleteMany(),
    ActivityLog.deleteMany(),
    Message.deleteMany(),
    InfrastructureProject.deleteMany(),
  ]);

  console.log("[Seed] Creating users...");
  const admin = await User.create({
    name: "Ava Admin",
    email: "admin@taskpilot.ai",
    password: "Admin@123",
    role: "Admin",
    bio: "Platform administrator",
  });

  const manager = await User.create({
    name: "Marcus Manager",
    email: "manager@taskpilot.ai",
    password: "Manager@123",
    role: "Manager",
    bio: "Delivery manager",
  });

  const members = await User.create([
    { name: "Priya Sharma", email: "priya@taskpilot.ai", password: "Member@123", role: "Member" },
    { name: "Daniel Osei", email: "daniel@taskpilot.ai", password: "Member@123", role: "Member" },
    { name: "Lucia Fernandez", email: "lucia@taskpilot.ai", password: "Member@123", role: "Member" },
  ]);

  console.log("[Seed] Creating task projects...");
  const project1 = await Project.create({
    name: "Website Redesign",
    description: "Revamp the corporate marketing website with a modern design system.",
    owner: manager._id,
    members: [members[0]._id, members[1]._id],
    status: "Active",
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    progress: 45,
  });

  const project2 = await Project.create({
    name: "Mobile App Launch",
    description: "Build and ship v1 of the companion mobile app.",
    owner: manager._id,
    members: [members[1]._id, members[2]._id],
    status: "Planning",
    deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    progress: 10,
  });

  const projects = [project1, project2];
  const taskTitles = [
    "Set up project repository", "Design homepage wireframes", "Implement auth API",
    "Create onboarding flow", "Write unit tests", "Set up CI/CD pipeline",
    "Design database schema", "Build dashboard UI", "Integrate payment gateway",
    "Conduct user research", "Fix responsive layout bugs", "Write API documentation",
    "Set up monitoring/alerts", "Optimize image loading", "Prepare launch checklist",
    "Migrate legacy database", "Security audit", "Performance testing",
  ];

  const allMembers = [...members, manager];
  const tasksToInsert = taskTitles.map((title, i) => ({
    title,
    description: `Detailed work item: ${title.toLowerCase()}.`,
    project: projects[i % projects.length]._id,
    assignedTo: allMembers[i % allMembers.length]._id,
    createdBy: manager._id,
    priority: priorities[i % priorities.length],
    status: statuses[i % statuses.length],
    dueDate: new Date(Date.now() + (i + 1) * 3 * 24 * 60 * 60 * 1000),
  }));
  const tasks = await Task.insertMany(tasksToInsert);

  console.log("[Seed] Creating infrastructure projects...");
  const infraProjects = await InfrastructureProject.insertMany([
    {
      name: "National Highway Expansion - NH44",
      projectCode: "NHE-2025-001",
      description: "Expansion of National Highway 44 from 4 to 6 lanes across 280 km.",
      sector: "Transport",
      ministry: "Ministry of Road Transport and Highways",
      state: "Maharashtra",
      district: "Pune",
      originalCost: 45000000000,
      revisedCost: 58500000000,
      expenditure: 32000000000,
      plannedDuration: 36,
      actualDuration: 42,
      physicalProgress: 65,
      financialProgress: 70,
      totalMilestones: 12,
      completedMilestones: 8,
      delayedMilestones: 2,
      resourceAvailability: 75,
      milestones: [
        { title: "Land Acquisition", status: "Completed", completionPercentage: 100 },
        { title: "Environmental Clearance", status: "Completed", completionPercentage: 100 },
        { title: "Construction Phase 1", status: "In Progress", completionPercentage: 60 },
        { title: "Bridge Construction", status: "Delayed", completionPercentage: 40 },
      ],
      contractChanges: [
        { changeDescription: "Route modification due to environmental concerns", costImpact: 5000000000, scheduleImpactDays: 30, approvedBy: "Project Director" },
      ],
      riskScore: 65,
      riskCategory: "High",
      costOverrunProbability: 58,
      predictedFinalCost: 62000000000,
      timeOverrunProbability: 62,
      predictedDelayDays: 120,
      tags: ["National Highway", "High Priority"],
    },
    {
      name: "Smart Water Distribution System - Chennai",
      projectCode: "SWDS-2025-002",
      description: "Implementation of smart water distribution and monitoring system across Chennai.",
      sector: "Water",
      ministry: "Ministry of Jal Shakti",
      state: "Tamil Nadu",
      district: "Chennai",
      originalCost: 12000000000,
      revisedCost: 13800000000,
      expenditure: 8500000000,
      plannedDuration: 24,
      actualDuration: 24,
      physicalProgress: 45,
      financialProgress: 50,
      totalMilestones: 8,
      completedMilestones: 4,
      delayedMilestones: 1,
      resourceAvailability: 85,
      milestones: [
        { title: "Pipeline Survey", status: "Completed", completionPercentage: 100 },
        { title: "Pump Station Setup", status: "In Progress", completionPercentage: 55 },
        { title: "Smart Meters Installation", status: "In Progress", completionPercentage: 30 },
      ],
      contractChanges: [],
      riskScore: 42,
      riskCategory: "Moderate",
      costOverrunProbability: 35,
      predictedFinalCost: 15000000000,
      timeOverrunProbability: 30,
      predictedDelayDays: 30,
      tags: ["Water", "Smart City"],
    },
    {
      name: "Solar Power Plant - Rajasthan",
      projectCode: "SPP-2025-003",
      description: "Construction of 500MW solar power plant in Rajasthan.",
      sector: "Energy",
      ministry: "Ministry of New and Renewable Energy",
      state: "Rajasthan",
      district: "Jodhpur",
      originalCost: 25000000000,
      revisedCost: 31250000000,
      expenditure: 18000000000,
      plannedDuration: 18,
      actualDuration: 22,
      physicalProgress: 70,
      financialProgress: 75,
      totalMilestones: 10,
      completedMilestones: 7,
      delayedMilestones: 2,
      resourceAvailability: 65,
      milestones: [
        { title: "Land Preparation", status: "Completed", completionPercentage: 100 },
        { title: "Solar Panel Installation", status: "In Progress", completionPercentage: 70 },
        { title: "Grid Connection", status: "Not Started", completionPercentage: 0 },
      ],
      contractChanges: [
        { changeDescription: "Panel specification upgrade for higher efficiency", costImpact: 3500000000, scheduleImpactDays: 15, approvedBy: "Technical Committee" },
      ],
      riskScore: 72,
      riskCategory: "High",
      costOverrunProbability: 68,
      predictedFinalCost: 34000000000,
      timeOverrunProbability: 55,
      predictedDelayDays: 90,
      tags: ["Solar Energy", "Renewable"],
    },
    {
      name: "Metro Rail Extension - Bangalore",
      projectCode: "MRE-2025-004",
      description: "Phase 2 extension of Bangalore Metro rail network.",
      sector: "Transport",
      ministry: "Ministry of Housing and Urban Affairs",
      state: "Karnataka",
      district: "Bangalore",
      originalCost: 80000000000,
      revisedCost: 80000000000,
      expenditure: 35000000000,
      plannedDuration: 48,
      actualDuration: 45,
      physicalProgress: 50,
      financialProgress: 48,
      totalMilestones: 15,
      completedMilestones: 7,
      delayedMilestones: 0,
      resourceAvailability: 90,
      milestones: [
        { title: "Tunnel Boring", status: "Completed", completionPercentage: 100 },
        { title: "Station Construction", status: "In Progress", completionPercentage: 50 },
        { title: "Track Laying", status: "Not Started", completionPercentage: 0 },
      ],
      contractChanges: [],
      riskScore: 35,
      riskCategory: "Moderate",
      costOverrunProbability: 25,
      predictedFinalCost: 85000000000,
      timeOverrunProbability: 20,
      predictedDelayDays: 15,
      tags: ["Metro", "Urban Transport"],
    },
    {
      name: "Ayushman Digital Health Platform",
      projectCode: "ADH-2025-005",
      description: "Digital infrastructure for health records and telemedicine under Ayushman Bharat.",
      sector: "Health",
      ministry: "Ministry of Health and Family Welfare",
      state: "Delhi",
      district: "New Delhi",
      originalCost: 5000000000,
      revisedCost: 6500000000,
      expenditure: 4200000000,
      plannedDuration: 12,
      actualDuration: 15,
      physicalProgress: 80,
      financialProgress: 85,
      totalMilestones: 6,
      completedMilestones: 5,
      delayedMilestones: 1,
      resourceAvailability: 95,
      milestones: [
        { title: "Server Infrastructure", status: "Completed", completionPercentage: 100 },
        { title: "Software Development", status: "Completed", completionPercentage: 100 },
        { title: "State Integration", status: "In Progress", completionPercentage: 70 },
      ],
      contractChanges: [],
      riskScore: 48,
      riskCategory: "Moderate",
      costOverrunProbability: 38,
      predictedFinalCost: 7200000000,
      timeOverrunProbability: 35,
      predictedDelayDays: 20,
      tags: ["Digital Health", "e-Governance"],
    },
  ]);

  console.log("[Seed] Creating notifications...");
  await Notification.insertMany([
    { user: members[0]._id, type: "Task Assigned", message: `You were assigned task "${taskTitles[0]}"`, link: `/app/tasks/${tasks[0]._id}` },
    { user: members[1]._id, type: "Project Invitation", message: `You've been added to project "${project1.name}"`, link: `/app/projects/${project1._id}` },
    { user: manager._id, type: "Deadline Approaching", message: `Task "${taskTitles[3]}" is due soon`, link: `/app/tasks/${tasks[3]._id}` },
  ]);

  console.log("[Seed] Creating activity logs...");
  await ActivityLog.insertMany([
    { user: manager._id, project: project1._id, action: "Project created", details: `"${project1.name}" was created` },
    { user: manager._id, project: project1._id, task: tasks[0]._id, action: "Task created", details: `"${taskTitles[0]}" was created` },
  ]);

  console.log("[Seed] Creating sample chat messages...");
  await Message.insertMany([
    { project: project1._id, sender: manager._id, text: "Kickoff meeting is tomorrow at 10am!", readBy: [manager._id] },
    { project: project1._id, sender: members[0]._id, text: "Sounds good, I'll have the wireframes ready.", readBy: [members[0]._id] },
  ]);

  console.log("\n[Seed] Done! Sample login credentials:");
  console.log("  Admin:   admin@taskpilot.ai / Admin@123");
  console.log("  Manager: manager@taskpilot.ai / Manager@123");
  console.log("  Member:  priya@taskpilot.ai / Member@123");
  console.log("  Member:  daniel@taskpilot.ai / Member@123");
  console.log("  Member:  lucia@taskpilot.ai / Member@123");

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("[Seed] Failed:", err);
  process.exit(1);
});
