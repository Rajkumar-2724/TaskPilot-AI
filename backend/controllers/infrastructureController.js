import asyncHandler from "express-async-handler";
import InfrastructureProject, { Milestone, ProjectProgress, FinancialRecord } from "../models/InfrastructureProject.js";
import ActivityLog from "../models/ActivityLog.js";
import Task from "../models/Task.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { RiskPrediction, RiskHistory, Alert, Recommendation, Simulation, AIReport } from "../models/RiskModels.js";
import { calculateRiskScore, identifyCostEscalationDrivers, generateSHAPExplanation, assessAndUpdateRisk, computeRiskAcceleration } from "../services/riskEngine.js";
import { predictCostOverrun, predictTimeOverrun, runRiskAssessment, runWhatIfSimulation, predictAllPaimana } from "../services/predictionService.js";
import { createAlert, detectEmergingRisks } from "../services/alertService.js";
import { logActivity } from "../utils/logActivity.js";
import { createNotification } from "../utils/notify.js";
import { sendEmail, emailTemplates } from "../services/emailService.js";

const refreshPaimanaPredictions = (projectId) => {
  (async () => {
    try {
      const project = await InfrastructureProject.findById(projectId);
      if (!project) return;
      const result = await predictAllPaimana(project);
      if (!result.success) return;
      if (result.costOverrunPct != null) project.predictedCostOverrunPct = result.costOverrunPct;
      if (result.timeOverrunMonths != null) project.predictedTimeOverrunMonths = result.timeOverrunMonths;
      project.paimanaPredictionSource = result.source || "PAIMANA (MoSPI) official project reports";
      project.predictedFinalCost = result.predictedFinalCost || project.predictedFinalCost;
      project.riskScore = result.riskScore != null ? result.riskScore : project.riskScore;
      project.riskCategory = result.riskCategory || project.riskCategory;
      await project.save();
    } catch (err) {
      console.error("[PAIMANA] prediction refresh failed:", err.message);
    }
  })();
};

// @desc Create infrastructure project
// @route POST /api/infrastructure/projects
export const createInfrastructureProject = asyncHandler(async (req, res) => {
  const { name, projectCode, description, sector, ministry, state, district, originalCost, revisedCost, plannedDuration, plannedStartDate, plannedEndDate, milestones } = req.body;
  if (!name || !projectCode || !ministry || !state) {
    res.status(400);
    throw new Error("Project name, code, ministry, and state are required");
  }

  const project = await InfrastructureProject.create({
    name, projectCode, description, sector, ministry, state, district,
    originalCost, revisedCost, plannedDuration,
    plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : new Date(),
    plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : new Date(),
    milestones: milestones || [],
    totalMilestones: milestones ? milestones.length : 0,
    projectManager: req.user._id,
    members: [],
  });

  refreshPaimanaPredictions(project._id);

  await logActivity({ user: req.user._id, project: project._id, projectType: "InfrastructureProject", action: "Infrastructure Project created", details: `"${project.name}" created with original cost ₹${originalCost}` });
  res.status(201).json({ success: true, project });
});

// @desc Get all infrastructure projects
// @route GET /api/infrastructure/projects
export const getInfrastructureProjects = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const filter = isAdmin
    ? { status: { $ne: "Completed" } }
    : { $or: [{ projectManager: req.user._id }, { members: req.user._id }], status: { $ne: "Completed" } };

  const projects = await InfrastructureProject.find(filter)
    .populate("projectManager", "name email profilePicture")
    .populate("members", "name email profilePicture")
    .sort("-createdAt");

  const projectIds = projects.map((p) => p._id);
  const taskCounts = projectIds.length > 0
    ? await Task.aggregate([
        { $match: { project: { $in: projectIds }, projectType: "InfrastructureProject" } },
        { $group: { _id: "$project", count: { $sum: 1 } } },
      ])
    : [];
  const taskCountMap = {};
  for (const tc of taskCounts) taskCountMap[tc._id.toString()] = tc.count;

  const projectsWithType = projects.map((p) => ({
    ...p.toObject(),
    projectType: "InfrastructureProject",
    taskCount: taskCountMap[p._id.toString()] || 0,
    members: p.members || [],
  }));
  res.json({ success: true, count: projectsWithType.length, projects: projectsWithType });
});

// @desc Get single infrastructure project
// @route GET /api/infrastructure/projects/:id
export const getInfrastructureProject = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id)
    .populate("projectManager", "name email profilePicture")
    .populate("members", "name email profilePicture");
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  if (req.user.role !== "Admin") {
    const userId = req.user._id.toString();
    const isManager = (project.projectManager?._id || project.projectManager)?.toString() === userId;
    const isMember = (project.members || []).some((m) => (m?._id || m).toString() === userId);
    if (!isManager && !isMember) {
      res.status(403);
      throw new Error("You do not have access to this project");
    }
  }

  const [financialRecords, activityLogs, taskCount] = await Promise.all([
    FinancialRecord.find({ project: req.params.id }).sort("-createdAt"),
    ActivityLog.find({ project: req.params.id, projectType: "InfrastructureProject" }).populate("user", "name profilePicture").sort("-createdAt").limit(20),
    Task.countDocuments({ project: req.params.id, projectType: "InfrastructureProject" }),
  ]);
  const projectObj = project.toObject();
  projectObj.projectType = "InfrastructureProject";
  projectObj.members = project.members || [];
  projectObj.taskCount = taskCount;
  res.json({ success: true, project: projectObj, financialRecords, activityLogs });
});

// @desc Update infrastructure project
// @route PUT /api/infrastructure/projects/:id
export const updateInfrastructureProject = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const { name, revisedCost, expenditure, physicalProgress, financialProgress, resourceAvailability, status, milestones } = req.body;
  if (status) {
    const validInfraStatuses = ["Planning", "Active", "Suspended", "Completed", "Cancelled"];
    if (!validInfraStatuses.includes(status)) {
      res.status(400);
      throw new Error("Invalid infrastructure project status");
    }
    const validTransitions = {
      "Planning": ["Active"],
      "Active": ["Suspended", "Completed"],
      "Suspended": ["Active"],
      "Completed": [],
      "Cancelled": [],
    };
    const previousStatus = project.status;
    if (previousStatus === "Completed" || previousStatus === "Cancelled") {
      res.status(400);
      throw new Error(`Cannot change status of a ${previousStatus.toLowerCase()} project`);
    }
    if (previousStatus !== status && !validTransitions[previousStatus]?.includes(status)) {
      res.status(400);
      throw new Error(`Invalid status transition: ${previousStatus} → ${status}`);
    }
    project.status = status;
    if (status === "Completed" && previousStatus !== "Completed") {
      project.completedAt = new Date();
      project.isActive = false;
    }
  }
  if (name) project.name = name;
  if (revisedCost !== undefined) project.revisedCost = revisedCost;
  if (expenditure !== undefined) project.expenditure = expenditure;
  if (physicalProgress !== undefined) project.physicalProgress = physicalProgress;
  if (financialProgress !== undefined) project.financialProgress = financialProgress;
  if (resourceAvailability !== undefined) project.resourceAvailability = resourceAvailability;
  if (milestones) project.milestones = milestones;

  const riskData = calculateRiskScore(project);
  project.riskScore = riskData.score;
  project.riskCategory = riskData.category;
  project.costEscalationDrivers = identifyCostEscalationDrivers(project);
  project.lastRiskAssessmentDate = new Date();

  await project.save();
  const populated = await InfrastructureProject.findById(project._id).populate("projectManager", "name email profilePicture").populate("members", "name email profilePicture");
  await logActivity({ user: req.user._id, project: project._id, projectType: "InfrastructureProject", action: "Infrastructure Project updated", details: `"${project.name}" updated` });
  const popObj = populated.toObject();
  popObj.projectType = "InfrastructureProject";
  refreshPaimanaPredictions(project._id);
  res.json({ success: true, project: popObj });
});

// @desc Delete infrastructure project
// @route DELETE /api/infrastructure/projects/:id
export const deleteInfrastructureProject = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  await Task.deleteMany({ project: project._id, projectType: "InfrastructureProject" });
  await Message.deleteMany({ project: project._id, projectType: "InfrastructureProject" });
  await project.deleteOne();
  res.json({ success: true, message: "Project deleted" });
});

// @desc Run risk assessment for a project
// @route POST /api/infrastructure/projects/:id/assess-risk
export const assessProjectRisk = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const result = await assessAndUpdateRisk(project._id);
  res.json({ success: true, ...result });
});

// @desc Get project risk trend
// @route GET /api/infrastructure/projects/:id/risk-trend
export const getRiskTrend = asyncHandler(async (req, res) => {
  const history = await RiskHistory.find({ project: req.params.id }).sort("recordedAt").limit(20);
  const acceleration = computeRiskAcceleration(history);
  res.json({ success: true, count: history.length, history, acceleration });
});

// @desc Get project alerts
// @route GET /api/infrastructure/projects/:id/alerts
export const getProjectAlerts = asyncHandler(async (req, res) => {
  const alerts = await Alert.find({ project: req.params.id }).sort("-createdAt");
  res.json({ success: true, count: alerts.length, alerts });
});

// @desc Get project recommendations
// @route GET /api/infrastructure/projects/:id/recommendations
export const getProjectRecommendations = asyncHandler(async (req, res) => {
  const recs = await Recommendation.find({ project: req.params.id }).sort("-priority").limit(10);
  res.json({ success: true, count: recs.length, recommendations: recs });
});

// @desc Get benchmarking data
// @route GET /api/infrastructure/benchmarking
export const getBenchmarkingData = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const filter = isAdmin
    ? {}
    : { $or: [{ projectManager: req.user._id }, { members: req.user._id }] };
  const projects = await InfrastructureProject.find(filter).sort("-createdAt");

  const sectorStats = {};
  const ministryStats = {};
  const riskDistribution = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
  let totalOriginalCost = 0;
  let totalRevisedCost = 0;
  let totalExpenditure = 0;

  projects.forEach((p) => {
    if (!sectorStats[p.sector]) sectorStats[p.sector] = { count: 0, avgRisk: 0, totalCost: 0 };
    sectorStats[p.sector].count++;
    sectorStats[p.sector].totalCost += p.originalCost;
    sectorStats[p.sector].avgRisk = (sectorStats[p.sector].avgRisk * (sectorStats[p.sector].count - 1) + (p.riskScore || 0)) / sectorStats[p.sector].count;

    if (!ministryStats[p.ministry]) ministryStats[p.ministry] = { count: 0, avgRisk: 0 };
    ministryStats[p.ministry].count++;
    ministryStats[p.ministry].avgRisk = (ministryStats[p.ministry].avgRisk * (ministryStats[p.ministry].count - 1) + (p.riskScore || 0)) / ministryStats[p.ministry].count;

    riskDistribution[p.riskCategory] = (riskDistribution[p.riskCategory] || 0) + 1;
    totalOriginalCost += p.originalCost || 0;
    totalRevisedCost += p.revisedCost || 0;
    totalExpenditure += p.expenditure || 0;
  });

  res.json({
    success: true,
    summary: {
      totalProjects: projects.length,
      totalOriginalCost,
      totalRevisedCost,
      totalExpenditure,
      riskDistribution,
      avgRiskScore: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + (p.riskScore || 0), 0) / projects.length) : 0,
    },
    sectorStats,
    ministryStats,
    projects: projects.map((p) => ({
      id: p._id,
      name: p.name,
      projectCode: p.projectCode,
      sector: p.sector,
      ministry: p.ministry,
      state: p.state,
      originalCost: p.originalCost,
      revisedCost: p.revisedCost,
      expenditure: p.expenditure,
      physicalProgress: p.physicalProgress,
      financialProgress: p.financialProgress,
      riskScore: p.riskScore,
      riskCategory: p.riskCategory,
      costOverrunProbability: p.costOverrunProbability,
      timeOverrunProbability: p.timeOverrunProbability,
      predictedDelayDays: p.predictedDelayDays,
      predictedCostOverrunPct: p.predictedCostOverrunPct,
      predictedTimeOverrunMonths: p.predictedTimeOverrunMonths,
      paimanaPredictionSource: p.paimanaPredictionSource,
      resourceAvailability: p.resourceAvailability,
    })),
  });
});

// @desc Get AI insights
// @route GET /api/infrastructure/insights
export const getAIInsights = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const filter = isAdmin
    ? {}
    : { $or: [{ projectManager: req.user._id }, { members: req.user._id }] };
  const projects = await InfrastructureProject.find(filter).sort("-riskScore").limit(10);
  const highRiskProjects = projects.filter((p) => (p.riskScore || 0) >= 50);
  const criticalProjects = projects.filter((p) => (p.riskScore || 0) >= 75);

  const insights = [
    `${highRiskProjects.length} project(s) are at high risk (score ≥ 50)`,
    `${criticalProjects.length} project(s) require immediate intervention (score ≥ 75)`,
    `Average risk score across all projects: ${projects.length > 0 ? Math.round(projects.reduce((s, p) => s + (p.riskScore || 0), 0) / projects.length) : 0}/100`,
    `${projects.filter((p) => p.costOverrunProbability > 60).length} project(s) face significant cost overrun risk`,
    `${projects.filter((p) => p.timeOverrunProbability > 60).length} project(s) face significant schedule delay risk`,
  ];

  const aiReport = await AIReport.create({
    project: null,
    reportType: "Comprehensive",
    summary: "AI-generated insights on infrastructure project portfolio risk",
    findings: insights,
    recommendations: [
      "Prioritize intervention on critical-risk projects immediately",
      "Allocate additional resources to high-risk projects",
      "Conduct detailed review of cost escalation drivers",
      "Implement enhanced monitoring for projects with low resource availability",
    ],
    insights,
    generatedBy: "Smart Analysis Engine",
  });

  res.json({ success: true, insights, aiReport });
});

// @desc Create financial record
// @route POST /api/infrastructure/projects/:id/financial-records
export const createFinancialRecord = asyncHandler(async (req, res) => {
  const { category, amount, description } = req.body;
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const record = await FinancialRecord.create({
    project: project._id, category, amount,
    cumulativeAmount: project.expenditure + amount,
    description,
  });

  project.expenditure += amount;
  await project.save();
  res.status(201).json({ success: true, record });
});

// @desc Create milestone
// @route POST /api/infrastructure/projects/:id/milestones
export const createMilestone = asyncHandler(async (req, res) => {
  const { title, description, plannedEndDate } = req.body;
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }

  const milestone = {
    title,
    description: description || "",
    plannedStartDate: new Date(),
    plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : new Date(),
  };

  project.milestones.push(milestone);
  project.totalMilestones = project.milestones.length;
  await project.save();

  const createdMilestone = project.milestones[project.milestones.length - 1];
  res.status(201).json({ success: true, milestone: createdMilestone });
});

// @desc Get financial records
// @route GET /api/infrastructure/projects/:id/financial-records
export const getFinancialRecords = asyncHandler(async (req, res) => {
  const records = await FinancialRecord.find({ project: req.params.id }).sort("-createdAt");
  res.json({ success: true, count: records.length, financialRecords: records });
});

// @desc Add member to infrastructure project
// @route POST /api/infrastructure/projects/:id/members
export const addInfrastructureMember = asyncHandler(async (req, res) => {
  const { userId, email } = req.body;
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.projectManager?._id || project.projectManager)?.toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can add members");
  }
  const members = project.members || [];
  const user = userId ? await User.findById(userId) : await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (members.some((m) => (m?._id || m).toString() === user._id.toString())) {
    res.status(400);
    throw new Error("User is already a member of this project");
  }
  project.members.push(user._id);
  await project.save();
  const io = req.app.get("io");
  await createNotification(io, {
    user: user._id,
    type: "Project Invitation",
    message: `You've been added to project "${project.name}"`,
    link: `/app/projects/${project._id}`,
  });
  sendEmail({
    to: user.email,
    subject: `You Have Been Added to a Project – TaskPilot AI`,
    html: emailTemplates.projectInvite(
      user.name,
      project.name,
      project.description,
      req.user?.name || "System",
      project.status,
      `/app/projects/${project._id}`
    ),
  }).catch(() => {});
  io?.to(`project:${project._id}`).emit("project:memberAdded", { projectId: project._id, user: user._id });
  await logActivity({ user: req.user._id, project: project._id, action: "Member added", details: `${user.name} was added to the project` });
  res.json({ success: true, project });
});

// @desc Remove member from infrastructure project
// @route DELETE /api/infrastructure/projects/:id/members/:userId
export const removeInfrastructureMember = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const ownerId = (project.projectManager?._id || project.projectManager)?.toString();
  if (req.user.role !== "Admin" && ownerId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the project owner or an admin can remove members");
  }
  const userId = req.params.userId;
  project.members = project.members.filter((m) => m.toString() !== userId.toString());
  await project.save();
  await logActivity({ user: req.user._id, project: project._id, action: "Member removed", details: `A member was removed from the project` });
  res.json({ success: true, project });
});
