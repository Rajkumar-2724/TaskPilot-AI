// Retention period for completed project history (in days).
// Change this value to control how long completed projects are kept
// in the database before being automatically removed.
export const PROJECT_HISTORY_RETENTION_DAYS =
  Number(process.env.PROJECT_HISTORY_RETENTION_DAYS) || 100;

// How often (in milliseconds) the retention cleanup job checks for
// expired project history. Defaults to once every 24 hours.
export const RETENTION_JOB_INTERVAL_MS =
  Number(process.env.RETENTION_JOB_INTERVAL_MS) || 24 * 60 * 60 * 1000;

// Retention period for per-user completed task history (in days).
// Change this value (or set TASK_HISTORY_RETENTION_DAYS in the environment)
// to control how long completed tasks stay visible on the Task History page.
export const TASK_HISTORY_RETENTION_DAYS =
  Number(process.env.TASK_HISTORY_RETENTION_DAYS) || 100;