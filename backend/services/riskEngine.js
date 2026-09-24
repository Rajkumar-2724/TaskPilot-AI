import mongoose from "mongoose";
import InfrastructureProject from "../models/InfrastructureProject.js";
import { RiskPrediction, RiskHistory, Alert, Recommendation, Simulation } from "../models/RiskModels.js";
import { categoryFromScore, getRiskThresholds } from "./settingsService.js";

export const calculateRiskScore = (project) => {
  const weights = { cost: 0.25, schedule: 0.20, milestones: 0.20, resources: 0.15, financial: 0.12, implementation: 0.08 };
  
  const costRisk = project.originalCost > 0
    ? Math.min(100, (Math.max(0, project.revisedCost - project.originalCost) / project.originalCost) * 100 * 0.5 + 
        (project.expenditure > project.revisedCost ? 50 : 0) +
        (project.costOverrunProbability || 0))
    : 50;

  const scheduleRisk = project.plannedDuration > 0
    ? Math.min(100, (Math.max(0, project.actualDuration - project.plannedDuration) / project.plannedDuration) * 100 * 0.5 +
        (project.timeOverrunProbability || 0) +
        (project.delayedMilestones / Math.max(1, project.totalMilestones) * 100))
    : 50;

  const milestoneRisk = project.totalMilestones > 0
    ? ((project.totalMilestones - project.completedMilestones) / project.totalMilestones) * 100 * 0.6 +
      (project.delayedMilestones / Math.max(1, project.totalMilestones)) * 100 * 0.4
    : 50;

  const resourceRisk = 100 - (project.resourceAvailability || 100);

  const financialRisk = project.originalCost > 0
    ? Math.min(100, (project.expenditure / Math.max(1, project.originalCost)) * 100 * 0.5 +
        ((project.revisedCost - project.originalCost) / Math.max(1, project.originalCost)) * 100 * 0.5)
    : 50;

  const implementationRisk = 50 - (project.physicalProgress || 0) * 0.3 + (100 - (project.financialProgress || 0)) * 0.3;

  const score = Math.round(
    Math.min(100, Math.max(0,
      costRisk * weights.cost +
      scheduleRisk * weights.schedule +
      milestoneRisk * weights.milestones +
      resourceRisk * weights.resources +
      financialRisk * weights.financial +
      Math.min(100, Math.max(0, implementationRisk)) * weights.implementation
    ))
  );

  const category = categoryFromScore(score);

  return { score, category, weights };
};

// Risk acceleration detection.
// Analyzes risk scores across reporting periods to flag:
//  - "Risk Accelerating"      -> sustained, compounding risk growth
//  - "Sudden Deterioration"   -> a single large jump between periods
//  - "Increasing"             -> mild upward drift
//  - "Decreasing" / "Stable"
// history must be sorted oldest -> newest (each entry: { riskScore, recordedAt }).
export const computeRiskAcceleration = (history) => {
  const empty = { flag: "Stable", slope: 0, change: 0, consecutiveIncreases: 0, persistentHighRisk: false, points: history ? history.length : 0 };
  if (!history || history.length < 2) return empty;

  const recent = history
    .map((h) => ({ score: Number(h.riskScore) || 0, t: Number(new Date(h.recordedAt || Date.now())) }))
    .filter((h) => Number.isFinite(h.score));

  if (recent.length < 2) return empty;

  const lastScore = recent[recent.length - 1].score;
  const prevScore = recent[recent.length - 2].score;
  const change = Math.round((lastScore - prevScore) * 10) / 10;

  // Linear regression slope over the most recent window (up to 6 points).
  const window = recent.slice(-Math.min(6, recent.length));
  const n = window.length;
  const meanX = (n - 1) / 2;
  const meanY = window.reduce((s, p) => s + p.score, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (window[i].score - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const slope = den === 0 ? 0 : Math.round((num / den) * 100) / 100;

  let consecutiveIncreases = 0;
  for (let i = recent.length - 1; i > 0; i -= 1) {
    if (recent[i].score > recent[i - 1].score) consecutiveIncreases += 1;
    else break;
  }

  const thresholds = getRiskThresholds();
  const persistentHighRisk = lastScore >= thresholds.high && history.length >= 3;

  let flag = "Stable";
  if (consecutiveIncreases >= 3 && slope >= 6) flag = "Risk Accelerating";
  else if (consecutiveIncreases >= 2 && change >= 10) flag = "Risk Accelerating";
  else if (consecutiveIncreases >= 3) flag = "Risk Accelerating";
  else if (change >= 15 && n >= 3) flag = "Sudden Deterioration";
  else if (change > 0) flag = "Increasing";
  else if (change < 0) flag = "Decreasing";

  return { flag, slope, change, consecutiveIncreases, persistentHighRisk, lastScore, prevScore, points: history.length };
};

export const generateSHAPExplanation = (project, featureImportance) => {
  const reasons = [];
  if (project.costOverrunProbability > 40) reasons.push(`Cost overrun probability of ${project.costOverrunProbability}% indicates budget risk (weight: ${(featureImportance.cost * 100).toFixed(1)}%)`);
  if (project.timeOverrunProbability > 40) reasons.push(`Time overrun probability of ${project.timeOverrunProbability}% indicates schedule risk (weight: ${(featureImportance.schedule * 100).toFixed(1)}%)`);
  if (project.delayedMilestones > 0) reasons.push(`${project.delayedMilestones} delayed milestone(s) contributing to risk (weight: ${(featureImportance.milestones * 100).toFixed(1)}%)`);
  if (project.resourceAvailability < 80) reasons.push(`Resource availability at ${project.resourceAvailability}% indicates resource constraints (weight: ${(featureImportance.resources * 100).toFixed(1)}%)`);
  if (project.expenditure > project.originalCost * 0.5) reasons.push(`Expenditure at ${((project.expenditure/project.originalCost)*100).toFixed(1)}% of original cost (weight: ${(featureImportance.financial * 100).toFixed(1)}%)`);
  if (project.physicalProgress < 50 && project.plannedDuration > 0) reasons.push(`Physical progress at ${project.physicalProgress}% behind schedule (weight: ${(featureImportance.implementation * 100).toFixed(1)}%)`);
  
  const base = "Project risk is driven by: ";
  return base + (reasons.length > 0 ? reasons.join("; ") : "Multiple factors contributing to overall risk profile.");
};

export const identifyCostEscalationDrivers = (project) => {
  const drivers = [];
  if (project.contractChanges && project.contractChanges.length > 0) {
    project.contractChanges.forEach(c => {
      if (c.costImpact > 0) drivers.push(`Contract change: ${c.changeDescription} (+₹${c.costImpact} impact)`);
    });
  }
  if (project.revisedCost > project.originalCost * 1.1) drivers.push("Revised cost exceeds original by more than 10%");
  if (project.expenditure > project.originalCost * 0.8) drivers.push("Expenditure approaching original cost ceiling");
  if (project.budgetReleased < project.expenditure) drivers.push("Budget released is less than expenditure incurred");
  if (project.resourceAvailability < 70) drivers.push("Low resource availability may cause cost escalation through delays");
  if (project.delayedMilestones > 0) drivers.push(`Delayed milestones extend project timeline, increasing costs`);
  if (drivers.length === 0) drivers.push("No significant cost escalation drivers identified at this time");
  return drivers;
};

export const createRiskHistoryEntry = async (projectId, riskData) => {
  try {
    const project = await InfrastructureProject.findById(projectId);
    if (!project) return null;

    const priorHistory = await RiskHistory.find({ project: projectId }).sort("recordedAt");
    const lastHistory = priorHistory[priorHistory.length - 1];
    let trendDirection = "Stable";
    if (lastHistory) {
      if (riskData.riskScore > lastHistory.riskScore + 5) trendDirection = "Increasing";
      else if (riskData.riskScore < lastHistory.riskScore - 5) trendDirection = "Decreasing";
    }

    const acceleration = computeRiskAcceleration([
      ...priorHistory,
      { riskScore: riskData.riskScore, recordedAt: new Date() },
    ]);

    const historyEntry = await RiskHistory.create({
      project: projectId,
      riskScore: riskData.riskScore,
      riskCategory: riskData.category,
      costOverrunProbability: riskData.costOverrunProbability,
      timeOverrunProbability: riskData.timeOverrunProbability,
      costEscalationDrivers: riskData.costEscalationDrivers || [],
      trendDirection,
      riskAcceleration: acceleration.flag,
      slope: acceleration.slope,
      consecutiveIncreases: acceleration.consecutiveIncreases,
      persistentHighRisk: acceleration.persistentHighRisk,
    });

    return historyEntry;
  } catch (err) {
    console.error("[RiskEngine] Error creating risk history:", err.message);
    return null;
  }
};

export const generateRecommendations = (project, riskData) => {
  const recommendations = [];

  if (project.costOverrunProbability > 50) {
    recommendations.push({
      priority: "High",
      category: "Cost",
      title: "Cost Overrun Mitigation Required",
      description: `Cost overrun probability is ${project.costOverrunProbability}%. Immediate budget review required.`,
      expectedImpact: "Can reduce predicted final cost by 10-20%",
      actions: ["Review revised cost estimates", "Identify non-essential expenditures", "Request additional budget allocation", "Optimize resource utilization"],
    });
  }

  if (project.timeOverrunProbability > 50) {
    recommendations.push({
      priority: "High",
      category: "Schedule",
      title: "Schedule Delay Mitigation Required",
      description: `Time overrun probability is ${project.timeOverrunProbability}%. Schedule recovery plan needed.`,
      expectedImpact: "Can reduce predicted delay by 15-25 days",
      actions: ["Crash critical path activities", "Add additional resources to delayed milestones", "Re-evaluate milestone dependencies", "Consider schedule compression techniques"],
    });
  }

  if (project.resourceAvailability < 70) {
    recommendations.push({
      priority: "Medium",
      category: "Resources",
      title: "Resource Availability Improvement",
      description: `Resource availability is at ${project.resourceAvailability}%. Resource gaps may cause further delays.`,
      expectedImpact: "Improve progress rate by 10-15%",
      actions: ["Recruit additional skilled personnel", "Lease required equipment", "Negotiate resource sharing with other projects", "Prioritize critical path tasks"],
    });
  }

  if (project.delayedMilestones > 0) {
    recommendations.push({
      priority: "High",
      category: "Risk Mitigation",
      title: "Delayed Milestone Recovery Plan",
      description: `${project.delayedMilestones} milestone(s) are delayed. Recovery plan needed.`,
      expectedImpact: "Reduce delay by getting back on track",
      actions: ["Conduct root cause analysis for each delay", "Implement corrective actions", "Adjust milestone timelines", "Increase monitoring frequency"],
    });
  }

  if (project.contractChanges && project.contractChanges.length > 0) {
    recommendations.push({
      priority: "Medium",
      category: "Contract",
      title: "Contract Change Management",
      description: `${project.contractChanges.length} contract change(s) detected. Review all changes for cost/schedule impact.`,
      expectedImpact: "Ensure all changes are properly documented and approved",
      actions: ["Audit all contract changes", "Verify change approvals", "Assess cumulative impact on budget and timeline", "Update project baselines"],
    });
  }

  if (riskData.score >= 75) {
    recommendations.push({
      priority: "Critical",
      category: "Risk Mitigation",
      title: "Critical Risk - Immediate Intervention Required",
      description: `Overall risk score is ${riskData.score}/100 (${riskData.category}). Immediate executive intervention required.`,
      expectedImpact: "Prevent project failure",
      actions: ["Escalate to senior management", "Conduct emergency project review", "Implement all recommended corrective actions", "Consider project restructuring"],
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: "Low",
      category: "Other",
      title: "Continue Monitoring",
      description: "Current risk levels are manageable. Continue regular monitoring.",
      expectedImpact: "Maintain current risk profile",
      actions: ["Continue periodic risk assessments", "Monitor key indicators", "Update risk predictions quarterly"],
    });
  }

  return recommendations;
};

export const assessAndUpdateRisk = async (projectId) => {
  try {
    const project = await InfrastructureProject.findById(projectId);
    if (!project) return null;

    const riskData = calculateRiskScore(project);
    const costEscalationDrivers = identifyCostEscalationDrivers(project);
    const shapExplanation = generateSHAPExplanation(project, { cost: 0.3, schedule: 0.25, milestones: 0.2, resources: 0.15, financial: 0.07, implementation: 0.03 });

    const riskPrediction = await RiskPrediction.create({
      project: projectId,
      predictionType: "All",
      costOverrunProbability: project.costOverrunProbability,
      predictedFinalCost: project.predictedFinalCost,
      timeOverrunProbability: project.timeOverrunProbability,
      predictedDelayDays: project.predictedDelayDays,
      riskScore: riskData.score,
      riskCategory: riskData.category,
      costEscalationDrivers,
      featureImportance: {
        cost: 0.3, schedule: 0.25, milestones: 0.2, resources: 0.15, financial: 0.07, implementation: 0.03,
      },
      shapExplanation,
    });

    const historyEntry = await createRiskHistoryEntry(projectId, {
      riskScore: riskData.score,
      category: riskData.category,
      costOverrunProbability: project.costOverrunProbability,
      timeOverrunProbability: project.timeOverrunProbability,
      costEscalationDrivers,
    });

    if (historyEntry && historyEntry.riskAcceleration !== "Stable" && historyEntry.riskAcceleration !== "Decreasing") {
      await Alert.create({
        project: projectId,
        alertType: "Risk Increase",
        severity: historyEntry.riskAcceleration === "Risk Accelerating" ? "Critical" : "High",
        title: `RISK ${historyEntry.riskAcceleration.toUpperCase()}: ${project.name}`,
        description: `Risk score moved ${historyEntry.riskAcceleration.toLowerCase()}: ${Math.max(0, riskData.score - historyEntry.slope)} → ${riskData.score} over ${Math.max(2, historyEntry.consecutiveIncreases + 1)} reporting period(s) (slope ${historyEntry.slope >= 0 ? "+" : ""}${historyEntry.slope}/period).`,
        probability: riskData.score,
        predictedImpact: `Without intervention the project risk may continue to escalate toward the critical range.`,
        contributingFactors: [
          `Consecutive risk increases: ${historyEntry.consecutiveIncreases}`,
          `Last period change: ${historyEntry.slope >= 0 ? "+" : ""}${Math.round((riskData.score - (riskData.score - historyEntry.slope)) * 10) / 10}`,
          ...(historyEntry.persistentHighRisk ? ["Risk has remained in the high band across multiple periods"] : []),
        ],
        recommendedAction: "ESCALATE monitoring frequency, review top risk drivers and implement corrective actions immediately.",
        sentTo: [],
      });
      console.warn(`[RiskEngine] Risk acceleration detected for project ${projectId}: ${historyEntry.riskAcceleration}`);
    }

    const recommendations = generateRecommendations(project, riskData);
    for (const rec of recommendations) {
      await Recommendation.create({
        project: projectId,
        ...rec,
      });
    }

    project.riskScore = riskData.score;
    project.riskCategory = riskData.category;
    project.costEscalationDrivers = costEscalationDrivers;
    project.lastRiskAssessmentDate = new Date();
    await project.save();

    return { riskPrediction, riskData, historyEntry, recommendations };
  } catch (err) {
    console.error("[RiskEngine] Error assessing risk:", err.message);
    throw err;
  }
};
