import asyncHandler from "express-async-handler";
import ModelMetric from "../models/ModelMetric.js";
import { callMlCufTrain, callMlCufAnalysis, callMlCufProjectAnalysis, callMlSearchInfrastructureProjects, mlServiceAvailable } from "../services/mlClient.js";
import { logActivity } from "../utils/logActivity.js";
import InfrastructureProject from "../models/InfrastructureProject.js";

// Candidate additional variables that could improve predictive performance beyond
// the current CUF (Common Unified Format / project-register) fields. Clearly
// labelled as candidates — the ml-service trains Model B on a synthetic version
// of these to demonstrate the data-sufficiency workflow.
export const CANDIDATE_VARIABLES = [
  "contractorPerformance",
  "procurementDelay",
  "landAcquisitionDelay",
  "environmentalClearanceDelay",
  "materialPriceVariation",
  "laborAvailability",
  "weatherDisruptionDays",
  "fundingReleaseDelay",
  "utilityShifting",
  "litigationDisputes",
];

export const CUF_FIELDS = [
  "originalCost",
  "revisedCost",
  "expenditure",
  "plannedDuration",
  "actualDuration",
  "physicalProgress",
  "financialProgress",
  "totalMilestones",
  "completedMilestones",
  "delayedMilestones",
  "resourceAvailability",
  "contractChanges",
  "contractChangeImpact",
];

const upsertMetrics = async (metrics) => {
  const docs = [];
  for (const row of metrics || []) {
    const doc = await ModelMetric.findOneAndUpdate(
      {
        modelName: row.modelName,
        metricName: row.metricName,
        modelVersion: row.modelVersion || "1.0.0",
      },
      {
        $set: {
          metricValue: row.metricValue,
          datasetLabel: row.datasetLabel || "Demo/Synthetic Dataset",
          datasetSize: row.datasetSize || 0,
          comparisonGroup: row.comparisonGroup || "ml",
          modelType: row.modelType || "regression",
          trainingDate: row.trainingDate ? new Date(row.trainingDate) : new Date(),
          evaluationDate: new Date(),
          extra: row.extra || {},
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    docs.push(row);
  }
  return docs;
};

// @desc    Run the CUF data-sufficiency experiment (Model A vs Model B)
// @route   POST /api/cuf/train   (Admin)
export const trainCufAnalysis = asyncHandler(async (req, res) => {
  const health = await mlServiceAvailable();
  if (!health.available) {
    res.status(503);
    throw new Error("ML prediction service is not reachable. Start it with: cd ml-service && python main.py");
  }

  const result = await callMlCufTrain({});
  await upsertMetrics(result.metrics || []);

  await logActivity({
    user: req.user._id,
    action: "CUF data-sufficiency analysis trained",
    details: "Model A (CUF fields only) vs Model B (CUF + candidate variables) comparison computed on the synthetic dataset",
  });

  res.json({ success: true, ...result });
});

// @desc    Read the latest CUF data-sufficiency comparison
// @route   GET /api/cuf/analysis
export const getCufAnalysis = asyncHandler(async (req, res) => {
  const stored = await ModelMetric.find({
    comparisonGroup: { $in: ["cuf-only", "extended"] },
  })
    .sort({ evaluationDate: -1 })
    .limit(300);

  if (stored.length === 0) {
    const health = await mlServiceAvailable();
    if (health.available) {
      const mlAnalysis = await callMlCufAnalysis();
      if (mlAnalysis && mlAnalysis.status === "available") {
        await upsertMetrics(mlAnalysis.metrics || []);
        return res.json({ success: true, ...mlAnalysis, stored: false });
      }
    }
    return res.json({
      success: true,
      status: "not_run",
      message: "No CUF data-sufficiency analysis stored yet. An Admin can run it from the Data Sufficiency page.",
      cufOnly: [],
      extended: [],
      featureImportance: [],
      candidateVariables: CANDIDATE_VARIABLES,
      stored: false,
    });
  }

    const group = (name) => stored.filter((m) => m.comparisonGroup === name).map((m) => m.toObject());

  res.json({
    success: true,
    status: "stored",
    cufOnly: group("cuf-only"),
    extended: group("extended"),
    featureImportance: [],
    candidateVariables: CANDIDATE_VARIABLES,
    cufFields: CUF_FIELDS,
    stored: true,
  });
});

// @desc    Search infrastructure projects for CUF analysis
// @route   GET /api/cuf/projects/search
export const searchProjects = asyncHandler(async (req, res) => {
  const { sector, state, projectType, q } = req.query;
  try {
    const filter = {};
    if (sector) filter.sector = sector;
    if (state) filter.state = state;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { projectCode: { $regex: q, $options: "i" } },
      ];
    }
    const projects = await InfrastructureProject.find(filter)
      .select("name projectCode sector state ministry originalCost revisedCost plannedDuration plannedStartDate plannedEndDate physicalProgress financialProgress totalMilestones completedMilestones delayedMilestones resourceAvailability riskScore projectManager status")
      .limit(50)
      .sort("-createdAt");
    const formatted = projects.map((p) => ({
      _id: p._id,
      name: p.name,
      projectCode: p.projectCode,
      sector: p.sector,
      state: p.state,
      ministry: p.ministry,
      originalCost: p.originalCost,
      revisedCost: p.revisedCost,
      plannedDuration: p.plannedDuration,
      plannedStartDate: p.plannedStartDate,
      plannedEndDate: p.plannedEndDate,
      physicalProgress: p.physicalProgress,
      financialProgress: p.financialProgress,
      totalMilestones: p.totalMilestones,
      completedMilestones: p.completedMilestones,
      delayedMilestones: p.delayedMilestones,
      resourceAvailability: p.resourceAvailability,
      riskScore: p.riskScore,
      riskCategory: p.riskCategory,
      costRange: { min: p.originalCost, max: p.revisedCost },
      projectType: "InfrastructureProject",
      status: p.status,
    }));
    res.json({ success: true, count: formatted.length, projects: formatted });
  } catch (err) {
    // Fallback to ML service search
    try {
      const mlResult = await callMlSearchInfrastructureProjects({ sector, state, projectType });
      res.json({ success: true, ...mlResult });
    } catch (mlErr) {
      res.status(503).json({ success: false, message: "Unable to search projects" });
    }
  }
});

// @desc    Run project-specific CUF cohort analysis (Model A vs Model B)
// @route   POST /api/cuf/project-analysis
export const runProjectCufAnalysis = asyncHandler(async (req, res) => {
  const { selectedProject, sector, state, projectType, costMin, costMax, durationMin, durationMax } = req.body;
  const health = await mlServiceAvailable();
  if (!health.available) {
    res.status(503);
    throw new Error("ML prediction service is not reachable. Start it with: cd ml-service && python main.py");
  }

  const result = await callMlCufProjectAnalysis({ selectedProject, sector, state, projectType, costMin, costMax, durationMin, durationMax });
  if (result.status === "insufficient_cohort") {
    return res.json({ success: true, ...result });
  }
  await upsertMetrics(result.metrics || []);

  // Determine candidate variable coverage for the selected project
  const availableVars = [];
  const missingVars = [];
  const infraProject = await InfrastructureProject.findById(selectedProject?._id || selectedProject?.projectId);
  for (const v of CANDIDATE_VARIABLES) {
    const val = infraProject?.[v] ?? selectedProject?.[v];
    if (val !== undefined && val !== null) {
      availableVars.push(v);
    } else {
      missingVars.push(v);
    }
  }

  await logActivity({
    user: req.user._id,
    action: "Project-specific CUF analysis trained",
    details: `Cohort size: ${result.cohortSize}, Sector: ${result.cohortFilter?.sector}, State: ${result.cohortFilter?.state}`,
  });

  res.json({
    success: true,
    ...result,
    candidateVariables: CANDIDATE_VARIABLES,
    availableCandidateVariables: availableVars,
    missingCandidateVariables: missingVars,
    cufFields: CUF_FIELDS,
  });
});