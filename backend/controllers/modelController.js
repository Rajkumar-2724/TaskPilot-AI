import asyncHandler from "express-async-handler";
import ModelMetric from "../models/ModelMetric.js";
import { callMlTrainModels, callMlModels, callMlModelMetrics, mlServiceAvailable, callMlEvaluationSplitInfo, callMlEvaluationCV, callMlEvaluationFeatureImportance, callMlEvaluationActualVsPredicted } from "../services/mlClient.js";
import { logActivity } from "../utils/logActivity.js";

// @desc    Get the list of available ML models (from the ml-service metadata)
// @route   GET /api/models
export const getModels = asyncHandler(async (req, res) => {
  const stored = await ModelMetric.find().select("-__v").sort({ evaluationDate: -1 }).limit(500);
  try {
    const ml = await callMlModels();
    return res.json({ success: true, models: ml.models || ml, stored });
  } catch (err) {
    return res.json({
      success: true,
      models: [],
      stored,
      source: "database",
      message: "ML service metadata unavailable; showing stored evaluation metrics.",
    });
  }
});

// @desc    Get model evaluation metrics (baseline vs ML comparison)
// @route   GET /api/models/metrics
export const getModelMetrics = asyncHandler(async (req, res) => {
  const stored = await ModelMetric.find().sort({ evaluationDate: -1 }).limit(1000);

  if (stored.length === 0) {
    const health = await mlServiceAvailable();
    if (health.available) {
      const mlMetrics = await callMlModelMetrics();
      const metricsArray = mlMetrics?.metrics || mlMetrics || [];
      return res.json({ success: true, metrics: metricsArray, stored: false, source: "ml-service" });
    }
  }

  const byGroup = (g) => stored.filter((m) => m.comparisonGroup === g).map((m) => m.toObject());

  res.json({
    success: true,
    metrics: stored.map((m) => m.toObject()),
    baseline: byGroup("baseline"),
    ml: byGroup("ml"),
    source: stored.length > 0 ? "database" : "none",
    stored: stored.length > 0,
  });
});

// @desc    Retrain the ML models (Admin only)
// @route   POST /api/models/train
export const retrainModels = asyncHandler(async (req, res) => {
  const health = await mlServiceAvailable();
  if (!health.available) {
    res.status(503);
    throw new Error("ML prediction service is unreachable from the backend. Check that ML_SERVICE_URL points to a running ML service.");
  }

  const result = await callMlTrainModels();
  await logActivity({
    user: req.user._id,
    action: "ML models retrained",
    details: `Retrained core prediction models (${result.samples || 0} samples)`,
  });

  res.json({ success: true, ...result });
});

// @desc    Get train/test split information for a model type
// @route   GET /api/evaluation/:modelType/split-info
export const getEvaluationSplitInfo = asyncHandler(async (req, res) => {
  const { modelType } = req.params;
  if (!["cost", "time", "risk"].includes(modelType)) {
    res.status(400);
    throw new Error("modelType must be 'cost', 'time', or 'risk'");
  }
  try {
    const result = await callMlEvaluationSplitInfo(modelType);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, message: err.message });
  }
});

// @desc    Get 5-fold cross-validation results for a model type
// @route   GET /api/evaluation/:modelType/cross-validation
export const getEvaluationCV = asyncHandler(async (req, res) => {
  const { modelType } = req.params;
  if (!["cost", "time"].includes(modelType)) {
    res.status(400);
    throw new Error("modelType must be 'cost' or 'time'");
  }
  try {
    const result = await callMlEvaluationCV(modelType);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, message: err.message });
  }
});

// @desc    Get feature importance from the trained model
// @route   GET /api/evaluation/:modelType/feature-importance
export const getEvaluationFeatureImportance = asyncHandler(async (req, res) => {
  const { modelType } = req.params;
  if (!["cost", "time"].includes(modelType)) {
    res.status(400);
    throw new Error("modelType must be 'cost' or 'time'");
  }
  try {
    const result = await callMlEvaluationFeatureImportance(modelType);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, message: err.message });
  }
});

// @desc    Get actual vs predicted test-set predictions
// @route   GET /api/evaluation/:modelType/actual-vs-predicted
export const getEvaluationActualVsPredicted = asyncHandler(async (req, res) => {
  const { modelType } = req.params;
  if (!["cost", "time"].includes(modelType)) {
    res.status(400);
    throw new Error("modelType must be 'cost' or 'time'");
  }
  try {
    const result = await callMlEvaluationActualVsPredicted(modelType);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.response?.status || 500).json({ success: false, message: err.message });
  }
});