import mongoose from "mongoose";

const riskPredictionSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    predictionType: { type: String, enum: ["Cost Overrun", "Time Overrun", "Risk Score", "All"], required: true },
    costOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    predictedFinalCost: { type: Number, default: 0 },
    timeOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    predictedDelayDays: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskCategory: { type: String, enum: ["Low", "Moderate", "High", "Critical"], default: "Low" },
    costEscalationDrivers: [{ type: String }],
    featureImportance: {
      cost: { type: Number, default: 0 },
      schedule: { type: Number, default: 0 },
      milestones: { type: Number, default: 0 },
      resources: { type: Number, default: 0 },
      financial: { type: Number, default: 0 },
      implementation: { type: Number, default: 0 },
    },
    shapExplanation: { type: String, default: "" },
    modelVersion: { type: String, default: "1.0.0" },
    predictedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const riskHistorySchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    riskScore: { type: Number, required: true, min: 0, max: 100 },
    riskCategory: { type: String, enum: ["Low", "Moderate", "High", "Critical"], required: true },
    costOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    timeOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    costEscalationDrivers: [{ type: String }],
    trendDirection: { type: String, enum: ["Increasing", "Stable", "Decreasing"], default: "Stable" },
    riskAcceleration: {
      type: String,
      enum: ["Stable", "Increasing", "Sudden Deterioration", "Risk Accelerating", "Decreasing"],
      default: "Stable",
    },
    slope: { type: Number, default: 0 },
    consecutiveIncreases: { type: Number, default: 0 },
    persistentHighRisk: { type: Boolean, default: false },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const alertSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    alertType: { type: String, enum: ["Cost Overrun", "Time Overrun", "Risk Increase", "Milestone Delay", "Resource Shortage", "Budget Exceeded", "Schedule Slip", "Contract Change"], required: true },
    severity: { type: String, enum: ["Low", "Medium", "High", "Critical"], required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    probability: { type: Number, default: 0 },
    predictedImpact: { type: String, default: "" },
    contributingFactors: [{ type: String }],
    recommendedAction: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
    isEmailSent: { type: Boolean, default: false },
    sentTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const recommendationSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: "Alert" },
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], required: true },
    category: { type: String, enum: ["Cost", "Schedule", "Resources", "Risk Mitigation", "Contract", "Other"], required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    expectedImpact: { type: String, default: "" },
    actions: [{ type: String }],
    isActioned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const simulationSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    simulationName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    modifiedFactors: {
      resourceAllocation: { type: Number, default: 100, min: 0, max: 200 },
      milestoneCompletion: { type: Number, default: 0, min: 0, max: 100 },
      expenditureRate: { type: Number, default: 100, min: 0, max: 200 },
      scheduleAdjustment: { type: Number, default: 0 },
      contractChangeImpact: { type: Number, default: 0 },
    },
    results: {
      predictedFinalCost: { type: Number, default: 0 },
      costOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
      predictedCompletionDate: { type: Date },
      predictedDelayDays: { type: Number, default: 0 },
      timeOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
      riskScore: { type: Number, default: 0, min: 0, max: 100 },
      riskCategory: { type: String, enum: ["Low", "Moderate", "High", "Critical"], default: "Low" },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const aiReportSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject" },
    reportType: { type: String, enum: ["Risk Summary", "Cost Analysis", "Schedule Analysis", "Comprehensive", "What-If Simulation"], required: true },
    summary: { type: String, default: "" },
    findings: [{ type: String }],
    recommendations: [{ type: String }],
    insights: [{ type: String }],
    generatedBy: { type: String, enum: ["Gemini AI", "Smart Analysis Engine"], default: "Smart Analysis Engine" },
    metadata: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const RiskPrediction = mongoose.model("RiskPrediction", riskPredictionSchema);
const RiskHistory = mongoose.model("RiskHistory", riskHistorySchema);
const Alert = mongoose.model("Alert", alertSchema);
const Recommendation = mongoose.model("Recommendation", recommendationSchema);
const Simulation = mongoose.model("Simulation", simulationSchema);
const AIReport = mongoose.model("AIReport", aiReportSchema);

export { RiskPrediction, RiskHistory, Alert, Recommendation, Simulation, AIReport };
