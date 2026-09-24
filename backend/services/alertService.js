import InfrastructureProject from "../models/InfrastructureProject.js";
import { Alert, RiskHistory } from "../models/RiskModels.js";

export const createAlert = async (alertData) => {
  try {
    const existing = await Alert.findOne({
      project: alertData.project,
      alertType: alertData.alertType,
      title: alertData.title,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).sort("-createdAt");
    if (existing) return existing;

    const alertDoc = await Alert.create(alertData);
    const populated = await alertDoc.populate("project", "name projectCode ministry");
    return populated;
  } catch (err) {
    console.error("[AlertService] Error creating alert:", err.message);
    throw err;
  }
};

export const detectEmergingRisks = async (io) => {
  try {
    const projects = await InfrastructureProject.find({ isActive: true });
    const allAlerts = [];

    for (const project of projects) {
      const riskScore = project.riskScore || 0;
      const costProb = project.costOverrunProbability || 0;
      const timeProb = project.timeOverrunProbability || 0;
      const prevHistory = await RiskHistory.findOne({ project: project._id }).sort("-recordedAt");
      const projectAlerts = [];

      if (riskScore >= 75) {
        const alertObj = await createAlert({
          project: project._id,
          alertType: "Risk Increase",
          severity: "Critical",
          title: `Critical Risk Alert: ${project.name}`,
          description: `Project risk score is ${riskScore}/100 (${project.riskCategory || "Critical"}). Immediate intervention required.`,
          probability: riskScore,
          predictedImpact: `Potential project failure or significant cost/schedule overruns`,
          contributingFactors: [`Risk score: ${riskScore}`, `Cost overrun probability: ${costProb}%`, `Time overrun probability: ${timeProb}%`],
          recommendedAction: "Escalate to senior management and conduct emergency project review.",
          sentTo: [],
        });
        projectAlerts.push(alertObj);
        allAlerts.push(alertObj);
      } else if (riskScore >= 50) {
        const alertObj = await createAlert({
          project: project._id,
          alertType: "Risk Increase",
          severity: "High",
          title: `High Risk Alert: ${project.name}`,
          description: `Project risk score is ${riskScore}/100 (${project.riskCategory || "High"}).`,
          probability: riskScore,
          predictedImpact: `Potential cost and schedule overruns`,
          contributingFactors: [`Risk score: ${riskScore}`, `Cost overrun probability: ${costProb}%`],
          recommendedAction: "Review project status and implement corrective measures.",
          sentTo: [],
        });
        projectAlerts.push(alertObj);
        allAlerts.push(alertObj);
      } else if (costProb > 60) {
        const alertObj = await createAlert({
          project: project._id,
          alertType: "Cost Overrun",
          severity: costProb > 80 ? "Critical" : "High",
          title: `Cost Overrun Risk: ${project.name}`,
          description: `Cost overrun probability is ${costProb}%.`,
          probability: costProb,
          predictedImpact: `Potential cost overrun`,
          contributingFactors: project.costEscalationDrivers || ["Cost escalation factors identified"],
          recommendedAction: "Review budget allocation and identify cost reduction measures.",
          sentTo: [],
        });
        projectAlerts.push(alertObj);
        allAlerts.push(alertObj);
      }

      if (project.delayedMilestones > 0 && !prevHistory) {
        const alertObj = await createAlert({
          project: project._id,
          alertType: "Milestone Delay",
          severity: project.delayedMilestones > 3 ? "Critical" : "High",
          title: `Milestone Delay: ${project.name}`,
          description: `${project.delayedMilestones} milestone(s) are delayed.`,
          probability: (project.delayedMilestones / Math.max(1, project.totalMilestones || 1)) * 100,
          predictedImpact: `Project completion may be delayed by ${project.predictedDelayDays || 0} days`,
          contributingFactors: [`${project.delayedMilestones} delayed milestone(s)`],
          recommendedAction: "Conduct root cause analysis and implement recovery plan.",
          sentTo: [],
        });
        projectAlerts.push(alertObj);
        allAlerts.push(alertObj);
      }

      if (projectAlerts.length > 0 && io) {
        for (const item of projectAlerts) {
          io.to(`project:${project._id}`).emit("alert:new", item);
        }
      }
    }

    return allAlerts;
  } catch (err) {
    console.error("[AlertService] Error detecting emerging risks:", err.message);
    return [];
  }
};

export const sendRiskAlertToSocket = (io, projectId, alertData) => {
  io.to(`project:${projectId}`).emit("alert:new", alertData);
};
