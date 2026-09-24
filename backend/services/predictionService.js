import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

let mlServiceWarningLogged = false;

const logMlServiceUnavailable = () => {
  if (!mlServiceWarningLogged) {
    mlServiceWarningLogged = true;
    console.warn(`[ML Service] Prediction service not reachable at ${ML_SERVICE_URL}. Using built-in fallback engine. Start it with: cd ml-service && python main.py`);
  }
};

const normalizeProject = (data) => (data && data.projectData ? data.projectData : (data || {}));

export const predictCostOverrun = async (projectInput) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/predict/cost-overrun`, { projectData: project }, { timeout: 15000 });
    return response.data;
  } catch (err) {
    logMlServiceUnavailable();
    return fallbackCostOverrunPrediction(project);
  }
};

export const predictTimeOverrun = async (projectInput) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/predict/time-overrun`, { projectData: project }, { timeout: 15000 });
    return response.data;
  } catch (err) {
    logMlServiceUnavailable();
    return fallbackTimeOverrunPrediction(project);
  }
};

export const runRiskAssessment = async (projectInput) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/predict/risk-assessment`, { projectData: project }, { timeout: 15000 });
    return response.data;
  } catch (err) {
    logMlServiceUnavailable();
    return fallbackRiskAssessment(project);
  }
};

export const runWhatIfSimulation = async (projectInput, modifications = {}) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/simulate/what-if`, { projectData: project, modifications }, { timeout: 15000 });
    return response.data;
  } catch (err) {
    logMlServiceUnavailable();
    return fallbackWhatIfSimulation(project, modifications);
  }
};

// ---------------------------------------------------------------------------
// PAIMANA-trained model integration (official MoSPI project data).
// These call the ML service endpoints trained on 10,623 PAIMANA rows
// (9 months of FY 2025-26 Flash Reports). Fallback is the built-in engine;
// we never fabricate "ML" numbers when the service is down.
// ---------------------------------------------------------------------------
const toMonth = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

const PAIMANA_SECTOR_HINTS = [
  ["Roads & Highways", ["road transport", "highway", "nmacc", "pradhan mantri gram sadak"]],
  ["Railways", ["rail"]],
  ["Oil & Gas", ["petroleum", "oil & gas", "natural gas", "pipeline"]],
  ["Coal", ["coal"]],
  ["Power", ["power", "electricity", "energy"]],
  ["Water Resources", ["irrigation", "water", "namami gange", "dam"]],
  ["Urban Development", ["urban", "housing", "smart city", "amrut", "metro", "airport"]],
  ["Health", ["health", "ayushman"]],
  ["Education", ["education", "school", "university"]],
];

const sectorMap = {
  Transport: "Roads & Highways",
  Water: "Water Resources",
  Energy: "Power",
  Housing: "Urban Development",
  Health: "Health",
  Education: "Education",
  Irrigation: "Water Resources",
  "Urban Development": "Urban Development",
  "Digital Infrastructure": "Power",
  Other: "Water Resources",
};

const stateNormalize = (state) => {
  const s = String(state || "").trim().replace(/\s+/g, " ");
  if (!s) return "UNKNOWN";
  const upper = s.toUpperCase();
  if (upper.includes("MULTI") || upper === "PAN" || upper.startsWith("PAN-") || upper === "OFFSHORE" || upper.includes("ALL INDIA")) {
    return "Multi-States / Pan-India";
  }
  return s;
};

export const mapProjectToPaimanaFeatures = (project, extra = {}) => {
  const ministry = String(project.ministry || "").toLowerCase();
  let sector = sectorMap[project.sector] || "Water Resources";
  for (const [label, keys] of PAIMANA_SECTOR_HINTS) {
    if (keys.some((k) => ministry.includes(k))) {
      sector = label;
      break;
    }
  }
  return {
    cost_original: Number(project.originalCost || 0) / 1e7,   // Rs crore
    expenditure: Number(project.expenditure || 0) / 1e7,
    physical_progress: Number(project.physicalProgress || 0),
    approval_date_original: toMonth(project.plannedStartDate),
    doc_original: toMonth(project.plannedEndDate),
    report_date: toMonth(extra.reportDate || new Date()),
    state: stateNormalize(project.state),
    sector,
    ministry: String(project.ministry || "UNKNOWN"),
  };
};

export const predictAllPaimana = async (projectInput) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict/all`, { projectData: mapProjectToPaimanaFeatures(project) }, { timeout: 15000 });
    return { success: true, ...response.data };
  } catch (err) {
    logMlServiceUnavailable();
    return { success: false, modelUsed: "fallback-engine", source: "built-in engine (ML service unreachable)", ...fallbackRiskAssessment(project) };
  }
};

export const predictCostOverrunPct = async (projectInput) => {
  const p = await predictAllPaimana(projectInput);
  return {
    costOverrunPct: p.success ? p.costOverrunPct : null,
    predictedFinalCost: p.success ? p.predictedFinalCost : null,
    modelUsed: p.success ? `${p.costModel} v${p.version}` : p.modelUsed,
    source: p.source,
  };
};

export const predictTimeOverrunMonths = async (projectInput) => {
  const p = await predictAllPaimana(projectInput);
  return {
    timeOverrunMonths: p.success ? p.timeOverrunMonths : null,
    modelUsed: p.success ? `${p.timeModel} v${p.version}` : p.modelUsed,
    source: p.source,
  };
};

export const getFeatureImportance = async (projectInput) => {
  const project = normalizeProject(projectInput);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/api/predict/feature-importance`, { projectData: project }, { timeout: 15000 });
    return response.data;
  } catch (err) {
    logMlServiceUnavailable();
    return {
      featureImportance: { cost: 0.3, schedule: 0.25, milestones: 0.2, resources: 0.15, financial: 0.07, implementation: 0.03 },
      shapExplanation: "Feature importance calculated using default risk weight heuristics."
    };
  }
};

const fallbackCostOverrunPrediction = (projectData = {}) => {
  const originalCost = Number(projectData.originalCost) || 1;
  const revisedCost = Number(projectData.revisedCost) || originalCost;
  const expenditure = Number(projectData.expenditure) || 0;
  const physicalProgress = Number(projectData.physicalProgress) || 0;

  const costRatio = expenditure / Math.max(1, originalCost);
  const revisedRatio = revisedCost / Math.max(1, originalCost);
  const progressFactor = physicalProgress / 100;

  let probability = Math.min(95, Math.max(5, (costRatio - 0.3) * 60 + (revisedRatio - 1) * 30 + (1 - progressFactor) * 20));
  const predictedFinalCost = revisedCost > originalCost
    ? revisedCost * (1 + probability / 200)
    : originalCost * (1 + probability / 200);

  return {
    probability: Math.round(probability * 10) / 10,
    predictedFinalCost: Math.round(predictedFinalCost),
    confidence: 0.75,
    explanation: `Based on expenditure ratio (${(costRatio * 100).toFixed(1)}%) and revised cost ratio (${(revisedRatio * 100).toFixed(1)}%), cost overrun probability estimated.`,
    modelUsed: "fallback-engine",
  };
};

const fallbackTimeOverrunPrediction = (projectData = {}) => {
  const plannedDuration = Number(projectData.plannedDuration) || 12;
  const actualDuration = Number(projectData.actualDuration) || 0;
  const totalMilestones = Number(projectData.totalMilestones) || 1;
  const completedMilestones = Number(projectData.completedMilestones) || 0;
  const physicalProgress = Number(projectData.physicalProgress) || 0;

  const durationRatio = actualDuration / Math.max(1, plannedDuration);
  const milestoneRatio = completedMilestones / Math.max(1, totalMilestones);
  const progressFactor = physicalProgress / 100;

  let probability = Math.min(95, Math.max(5, (durationRatio - 0.7) * 50 + (1 - milestoneRatio) * 40 + (1 - progressFactor) * 30));
  const predictedDelayDays = Math.round(Math.max(0, (durationRatio - 1) * plannedDuration * 30 + (1 - milestoneRatio) * 60));
  const validDelay = isNaN(predictedDelayDays) ? 0 : predictedDelayDays;

  return {
    probability: Math.round(probability * 10) / 10,
    predictedDelayDays: validDelay,
    predictedCompletionDate: new Date(Date.now() + validDelay * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 0.72,
    explanation: `Based on duration ratio (${(durationRatio * 100).toFixed(1)}%) and milestone completion (${(milestoneRatio * 100).toFixed(1)}%), time overrun probability estimated.`,
    modelUsed: "fallback-engine",
  };
};

const fallbackRiskAssessment = (projectData = {}) => {
  const originalCost = Number(projectData.originalCost) || 1;
  const revisedCost = Number(projectData.revisedCost) || originalCost;
  const expenditure = Number(projectData.expenditure) || 0;
  const plannedDuration = Number(projectData.plannedDuration) || 12;
  const actualDuration = Number(projectData.actualDuration) || 0;
  const totalMilestones = Number(projectData.totalMilestones) || 1;
  const delayedMilestones = Number(projectData.delayedMilestones) || 0;
  const resourceAvailability = Number(projectData.resourceAvailability) || 100;
  const physicalProgress = Number(projectData.physicalProgress) || 0;

  const costScore = Math.min(100, (expenditure / Math.max(1, originalCost)) * 60 + (revisedCost > originalCost ? 30 : 0));
  const scheduleScore = Math.min(100, (actualDuration / Math.max(1, plannedDuration)) * 50 + (delayedMilestones / Math.max(1, totalMilestones) * 50));
  const riskScore = Math.round(Math.min(100, Math.max(0, costScore * 0.4 + scheduleScore * 0.3 + (100 - resourceAvailability) * 0.2 + (100 - physicalProgress) * 0.1)));
  const category = riskScore < 30 ? "Low" : riskScore < 50 ? "Moderate" : riskScore < 75 ? "High" : "Critical";

  return { riskScore, category, costOverrunProbability: costScore, timeOverrunProbability: scheduleScore, modelUsed: "fallback-engine" };
};

const fallbackWhatIfSimulation = (projectData = {}, modifications = {}) => {
  const revisedCost = Number(projectData.revisedCost) || Number(projectData.originalCost) || 1000000;
  const originalCost = Number(projectData.originalCost) || revisedCost;
  const resourceAlloc = Number(modifications.resourceAllocation) || 100;
  const expRate = Number(modifications.expenditureRate) || 100;
  const milestoneComp = Number(modifications.milestoneCompletion) || 0;
  const curMilestoneComp = projectData.totalMilestones ? ((projectData.completedMilestones || 0) / projectData.totalMilestones) * 100 : 0;
  const schedAdj = Number(modifications.scheduleAdjustment) || 0;
  const curRisk = Number(projectData.riskScore) || 50;
  const curDelay = Number(projectData.predictedDelayDays) || 0;
  const curTimeProb = Number(projectData.timeOverrunProbability) || 50;

  const modifiedCost = revisedCost * (resourceAlloc / 100) * (expRate / 100);
  const modifiedProgress = Math.min(100, Math.max(0, (projectData.physicalProgress || 0) + (milestoneComp - curMilestoneComp) * 0.5));
  const modifiedRisk = Math.max(0, Math.min(100, curRisk - (milestoneComp - curMilestoneComp) * 2 - (resourceAlloc - 100) * 0.3));
  const predictedDelay = Math.round(Math.max(0, curDelay - schedAdj));

  return {
    results: {
      predictedFinalCost: Math.round(modifiedCost),
      costOverrunProbability: Math.round(Math.min(95, Math.max(5, (modifiedCost / Math.max(1, originalCost)) * 50))),
      predictedCompletionDate: new Date(Date.now() + predictedDelay * 24 * 60 * 60 * 1000).toISOString(),
      predictedDelayDays: predictedDelay,
      timeOverrunProbability: Math.round(Math.min(95, Math.max(5, curTimeProb - schedAdj * 2))),
      riskScore: Math.round(modifiedRisk),
      riskCategory: modifiedRisk < 30 ? "Low" : modifiedRisk < 50 ? "Moderate" : modifiedRisk < 75 ? "High" : "Critical",
    },
    modelUsed: "fallback-engine",
  };
};
