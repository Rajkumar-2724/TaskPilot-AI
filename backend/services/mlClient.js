import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// Thin helpers used by the model-management & CUF endpoints.
// Every call keeps the same "graceful degradation" contract as predictionService:
// if the Python ML service is unreachable we surface a clear JSON message instead
// of silently faking results.

export const mlServiceAvailable = async () => {
  try {
    const res = await axios.get(`${ML_SERVICE_URL}/api/health`, { timeout: 5000 });
    return { available: true, data: res.data };
  } catch (err) {
    return { available: false, data: null };
  }
};

export const callMlTrainModels = async () => {
  const { data } = await axios.post(`${ML_SERVICE_URL}/api/train`, {}, { timeout: 120000 });
  return data;
};

export const callMlCufTrain = async (params = {}) => {
  const { data } = await axios.post(`${ML_SERVICE_URL}/api/cuf/train`, params, { timeout: 180000 });
  return data;
};

export const callMlCufProjectAnalysis = async (params = {}) => {
  const { data } = await axios.post(`${ML_SERVICE_URL}/api/cuf/project-analysis`, params, { timeout: 180000 });
  return data;
};

export const callMlSearchInfrastructureProjects = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/cuf/project-search${qs ? "?" + qs : ""}`, { timeout: 15000 });
  return data;
};

export const callMlCufAnalysis = async () => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/cuf/analysis`, { timeout: 20000 });
  return data;
};

export const callMlModels = async () => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/models`, { timeout: 20000 });
  return data;
};

export const callMlModelMetrics = async () => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/models/metrics`, { timeout: 20000 });
  return data;
};

export const callMlEvaluationSplitInfo = async (modelType) => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/evaluation/${modelType}/split-info`, { timeout: 15000 });
  return data;
};

export const callMlEvaluationCV = async (modelType) => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/evaluation/${modelType}/cross-validation`, { timeout: 30000 });
  return data;
};

export const callMlEvaluationFeatureImportance = async (modelType) => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/evaluation/${modelType}/feature-importance`, { timeout: 15000 });
  return data;
};

export const callMlEvaluationActualVsPredicted = async (modelType) => {
  const { data } = await axios.get(`${ML_SERVICE_URL}/api/evaluation/${modelType}/actual-vs-predicted`, { timeout: 15000 });
  return data;
};