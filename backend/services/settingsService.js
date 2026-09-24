import Setting from "../models/Setting.js";

// Risk severity thresholds follow the documented scale:
//   0-30  -> Low
//   31-60 -> Moderate
//   61-80 -> High
//   81-100 -> Critical
// These can be overridden at runtime by an Admin via PUT /api/admin/settings/risk-thresholds
// or through the environment variables below. Environment values are the boot defaults.
export const DEFAULT_RISK_THRESHOLDS = {
  moderate: 30,
  high: 60,
  critical: 80,
};

const envThresholds = () => ({
  moderate: clampThreshold(Number(process.env.RISK_THRESHOLD_MODERATE) || DEFAULT_RISK_THRESHOLDS.moderate),
  high: clampThreshold(Number(process.env.RISK_THRESHOLD_HIGH) || DEFAULT_RISK_THRESHOLDS.high),
  critical: clampThreshold(Number(process.env.RISK_THRESHOLD_CRITICAL) || DEFAULT_RISK_THRESHOLDS.critical),
});

const clampThreshold = (v) => Math.max(1, Math.min(100, Math.round(Number(v) || 0)));

let cache = { ...envThresholds() };
let cacheLoaded = false;

// Load persisted thresholds from the database once (called at server boot).
export const initSettings = async () => {
  try {
    const doc = await Setting.findOne({ key: "riskThresholds" }).lean();
    if (doc && doc.value) {
      cache = {
        moderate: clampThreshold(doc.value.moderate),
        high: clampThreshold(doc.value.high),
        critical: clampThreshold(doc.value.critical),
      };
    } else {
      cache = { ...envThresholds() };
    }
    cacheLoaded = true;
  } catch (err) {
    console.warn("[Settings] Could not load settings from DB, using defaults:", err.message);
    cache = { ...envThresholds() };
    cacheLoaded = false;
  }
  return cache;
};

export const getRiskThresholds = () => {
  if (!cacheLoaded) {
    // Try a lightweight refresh; never blocks caller on DB errors.
    initSettings().catch(() => {});
    cache = { ...envThresholds() };
    cacheLoaded = true;
  }
  return { ...cache };
};

export const setRiskThresholds = async (values, updatedBy = null) => {
  const candidate = {
    moderate: clampThreshold(values.moderate),
    high: clampThreshold(values.high),
    critical: clampThreshold(values.critical),
  };
  // Validate ordering: moderate < high < critical
  if (!(candidate.moderate < candidate.high && candidate.high < candidate.critical)) {
    const err = new Error("Thresholds must satisfy moderate < high < critical");
    err.statusCode = 400;
    throw err;
  }
  await Setting.findOneAndUpdate(
    { key: "riskThresholds" },
    {
      $set: {
        value: candidate,
        description: "Risk score thresholds used to classify projects into Low/Moderate/High/Critical",
        updatedBy,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  cache = candidate;
  cacheLoaded = true;
  return { ...candidate };
};

// Map a risk score to a category label using the active thresholds.
export const categoryFromScore = (score) => {
  const t = getRiskThresholds();
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s <= t.moderate) return "Low";
  if (s <= t.high) return "Moderate";
  if (s <= t.critical) return "High";
  return "Critical";
};

export const riskSettingsPublic = () => ({
  thresholds: getRiskThresholds(),
  source: cacheLoaded ? "database" : "environment",
});