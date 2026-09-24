import Project from "../models/Project.js";
import InfrastructureProject, { FinancialRecord } from "../models/InfrastructureProject.js";
import Task from "../models/Task.js";
import TaskHistory from "../models/TaskHistory.js";
import ActivityLog from "../models/ActivityLog.js";
import Message from "../models/Message.js";
import {
  RiskPrediction,
  RiskHistory,
  Alert,
  Recommendation,
  Simulation,
  AIReport,
} from "../models/RiskModels.js";
import { PROJECT_HISTORY_RETENTION_DAYS, TASK_HISTORY_RETENTION_DAYS, RETENTION_JOB_INTERVAL_MS } from "../config/constants.js";

export const cleanupExpiredProjectHistory = async () => {
  try {
    const cutoff = new Date(Date.now() - PROJECT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const completedFilter = {
      status: "Completed",
      $or: [
        { completedAt: { $lt: cutoff } },
        { completedAt: null, updatedAt: { $lt: cutoff } },
      ],
    };

    let removedProjects = 0;

    for (const model of [Project, InfrastructureProject]) {
      const expired = await model.find(completedFilter).select("_id projectType");
      for (const project of expired) {
        const projectId = project._id;
        const projectType = model === Project ? "Project" : "InfrastructureProject";

        const deletes = [
          Task.deleteMany({ project: projectId, projectType }),
          ActivityLog.deleteMany({ project: projectId, projectType }),
          Message.deleteMany({ project: projectId, projectType }),
        ];

        if (model === InfrastructureProject) {
          deletes.push(
            FinancialRecord.deleteMany({ project: projectId }),
            RiskPrediction.deleteMany({ project: projectId }),
            RiskHistory.deleteMany({ project: projectId }),
            Alert.deleteMany({ project: projectId }),
            Recommendation.deleteMany({ project: projectId }),
            Simulation.deleteMany({ project: projectId }),
            AIReport.deleteMany({ project: projectId })
          );
        }

        await Promise.all(deletes);
        await model.deleteOne({ _id: projectId });
        removedProjects++;
      }
    }

    console.log(
      `[Retention] Cleanup complete: removed ${removedProjects} expired completed project(s) older than ${PROJECT_HISTORY_RETENTION_DAYS} day(s)`
    );
  } catch (err) {
    console.error("[Retention] Cleanup error:", err.message);
  }
};

export const cleanupExpiredTaskHistory = async () => {
  try {
    const cutoff = new Date(Date.now() - TASK_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await TaskHistory.deleteMany({
      $or: [
        { completedAt: { $lt: cutoff } },
        { completedAt: null, createdAt: { $lt: cutoff } },
      ],
    });

    console.log(
      `[Retention] Task history cleanup complete: removed ${result.deletedCount} record(s) older than ${TASK_HISTORY_RETENTION_DAYS} day(s)`
    );
  } catch (err) {
    console.error("[Retention] Task history cleanup error:", err.message);
  }
};

export const startRetentionJob = () => {
  console.log(`[Retention] Starting project history retention job (retention: ${PROJECT_HISTORY_RETENTION_DAYS} days)`);
  cleanupExpiredProjectHistory();
  cleanupExpiredTaskHistory();
  setInterval(() => {
    cleanupExpiredProjectHistory();
    cleanupExpiredTaskHistory();
  }, RETENTION_JOB_INTERVAL_MS);
  console.log(`[Retention] Retention job running every ${Math.round(RETENTION_JOB_INTERVAL_MS / (60 * 60 * 1000))} hour(s)`);
};