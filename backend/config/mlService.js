// Single source of truth for the Python ML service address.
//
// ML_SERVICE_URL is the correct way to configure this and should be set on the
// host. The default below points at the project's hosted ML service so a fresh
// deploy is not silently broken, but it is a fallback: `usingDefault` is
// surfaced on /api/health so an unset env var stays visible.
const DEFAULT_ML_SERVICE_URL = "https://taskpilot-ai-ml-service.onrender.com";

const configured = (process.env.ML_SERVICE_URL || "").trim();
const resolved = (configured || DEFAULT_ML_SERVICE_URL).replace(/\/+$/, "");

export const ML_SERVICE_URL = resolved;
export const mlServiceUrlSource = configured ? "ML_SERVICE_URL" : "built-in default";
export const usingDefaultMlUrl = !configured;
