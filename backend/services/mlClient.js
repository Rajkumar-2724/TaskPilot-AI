import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

// Thin helpers used by the model-management & CUF endpoints.
// Every call keeps the same "graceful degradation" contract as predictionService:
// if the Python ML service is unreachable we surface a clear JSON message instead
// of silently faking results.

export const mlServiceUrl = () => ML_SERVICE_URL;

// Render free-tier cold starts can exceed 5s, so a healthy-but-waking service
// must not be reported as "unreachable".
export const mlServiceAvailable = async () => {
  try {
    const res = await axios.get(`${ML_SERVICE_URL}/api/health`, { timeout: 20000 });
    return { available: true, data: res.data, error: null };
  } catch (err) {
    const error = err.code || err.message || "unknown error";
    console.warn(`[ML Service] health check failed for ${ML_SERVICE_URL}: ${error}`);
    return { available: false, data: null, error };
  }
};

// Best-effort warm-up so the first real user request doesn't hit a cold start.
export const warmUpMlService = async () => {
  const health = await mlServiceAvailable();
  console.log(
    health.available
      ? `[ML Service] reachable at ${ML_SERVICE_URL}`
      : `[ML Service] NOT reachable at ${ML_SERVICE_URL} (${health.error}). Set ML_SERVICE_URL on the backend service.`
  );
  return health;
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