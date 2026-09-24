import asyncHandler from "express-async-handler";
import Project from "../models/Project.js";
import InfrastructureProject from "../models/InfrastructureProject.js";
import { predictCostOverrun, predictTimeOverrun, runRiskAssessment, runWhatIfSimulation, getFeatureImportance, predictAllPaimana } from "../services/predictionService.js";
import { callMlModelMetrics, mlServiceAvailable } from "../services/mlClient.js";

// @desc Get prediction dashboard data
// @route GET /api/predictions/dashboard
export const getPredictionDashboard = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "Admin";
  const filter = isAdmin
    ? {}
    : { $or: [{ projectManager: req.user._id }, { members: req.user._id }] };
  const projects = await InfrastructureProject.find(filter);
  const costPredictions = [];
  const timePredictions = [];

  for (const project of projects) {
    const costPred = await predictCostOverrun({ projectData: project });
    const timePred = await predictTimeOverrun({ projectData: project });
    costPredictions.push({ projectId: project._id, projectName: project.name, ...costPred });
    timePredictions.push({ projectId: project._id, projectName: project.name, ...timePred });
  }

  res.json({ success: true, costPredictions, timePredictions });
});

// @desc Run cost overrun prediction for a project
// @route POST /api/predictions/cost-overrun/:id
export const predictProjectCostOverrun = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await predictCostOverrun({ projectData: project });

  project.costOverrunProbability = result.probability;
  project.predictedFinalCost = result.predictedFinalCost;
  await project.save();

  res.json({ success: true, prediction: result, project });
});

// @desc Run time overrun prediction for a project
// @route POST /api/predictions/time-overrun/:id
export const predictProjectTimeOverrun = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await predictTimeOverrun({ projectData: project });

  project.timeOverrunProbability = result.probability;
  project.predictedDelayDays = result.predictedDelayDays;
  await project.save();

  res.json({ success: true, prediction: result, project });
});

// @desc Run full PAIMANA-model prediction (cost + time + risk)
// @route POST /api/predictions/all/:id
export const predictProjectAll = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await predictAllPaimana({ projectData: project });

  if (result.success) {
    project.predictedCostOverrunPct = result.costOverrunPct;
    project.timeOverrunProbability = Math.max(0, Math.min(100, result.costOverrunPct));
    project.predictedFinalCost = result.predictedFinalCost;
    project.predictedTimeOverrunMonths = result.timeOverrunMonths;
    project.predictedDelayDays = Math.max(0, Math.round(result.timeOverrunMonths * 30));
    project.riskScore = result.riskScore;
    project.riskCategory = result.riskCategory;
    project.paimanaPredictionSource = result.source;
    await project.save();
  }

  res.json({ success: true, prediction: result, project });
});

// @desc Get published model benchmark metrics (real PAIMANA test results)
// @route GET /api/predictions/model-metrics
export const getPredictModelMetrics = asyncHandler(async (req, res) => {
  const available = await mlServiceAvailable();
  if (!available.available) {
    res.json({ success: true, available: false, source: "ML service unreachable" });
    return;
  }
  const data = await callMlModelMetrics();
  res.json({ success: true, available: true, ...data });
});

// @desc Run full risk assessment
// @route POST /api/predictions/risk/:id
export const assessProjectRiskPrediction = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await runRiskAssessment({ projectData: project });

  project.riskScore = result.riskScore;
  project.riskCategory = result.riskCategory;
  await project.save();

  res.json({ success: true, assessment: result, project });
});

// @desc Run what-if simulation
// @route POST /api/predictions/simulate/:id
export const simulateWhatIf = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await runWhatIfSimulation({ projectData: project }, req.body.modifications);

  const { Simulation } = await import("../models/RiskModels.js");
  await Simulation.create({
    project: project._id,
    simulationName: req.body.simulationName || "What-If Simulation",
    description: req.body.description || "",
    modifiedFactors: req.body.modifications,
    results: result.results,
    createdBy: req.user._id,
  });

  res.json({ success: true, simulation: result });
});

// @desc Get feature importance for a project
// @route GET /api/predictions/feature-importance/:id
export const getProjectFeatureImportance = asyncHandler(async (req, res) => {
  const project = await InfrastructureProject.findById(req.params.id);
  if (!project) {
    res.status(404);
    throw new Error("Project not found");
  }
  const result = await getFeatureImportance({ projectData: project });
  res.json({ success: true, featureImportance: result.featureImportance, shapExplanation: result.shapExplanation });
});

// @desc Get all risk predictions
// @route GET /api/predictions/history
export const getPredictionHistory = asyncHandler(async (req, res) => {
  const { RiskPrediction } = await import("../models/RiskModels.js");
  let filter = {};
  if (req.user.role !== "Admin") {
    const userId = req.user._id;
    const [projects, infraProjects] = await Promise.all([
      Project.find({ $or: [{ owner: userId }, { members: userId }] }).select("_id"),
      InfrastructureProject.find({ $or: [{ projectManager: userId }, { members: userId }] }).select("_id"),
    ]);
    const allProjectIds = [...projects.map((p) => p._id), ...infraProjects.map((p) => p._id)];
    filter.project = { $in: allProjectIds };
  }
  const predictions = await RiskPrediction.find(filter).sort("-predictedAt").limit(50);
  res.json({ success: true, count: predictions.length, predictions });
});
