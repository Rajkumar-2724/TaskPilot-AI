import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    plannedStartDate: { type: Date, default: Date.now },
    plannedEndDate: { type: Date, default: Date.now },
    actualStartDate: { type: Date },
    actualEndDate: { type: Date },
    status: { type: String, enum: ["Not Started", "In Progress", "Completed", "Delayed", "Cancelled"], default: "Not Started" },
    completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    physicalProgress: { type: Number, default: 0, min: 0, max: 100 },
    financialProgress: { type: Number, default: 0, min: 0, max: 100 },
    delayedDays: { type: Number, default: 0 },
    costAtMilestone: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const projectProgressSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    reportingPeriod: { type: String, required: true },
    plannedProgress: { type: Number, default: 0, min: 0, max: 100 },
    physicalProgress: { type: Number, default: 0, min: 0, max: 100 },
    financialProgress: { type: Number, default: 0, min: 0, max: 100 },
    expenditure: { type: Number, default: 0 },
    milestoneCompletion: { type: Number, default: 0, min: 0, max: 100 },
    resourceAvailability: { type: Number, default: 100, min: 0, max: 100 },
    issues: { type: String, default: "" },
    issueCategory: { type: String, default: "" },
    remarks: { type: String, default: "" },
    contractChanges: [{ type: mongoose.Schema.Types.ObjectId, ref: "ContractChange" }],
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const contractChangeSchema = new mongoose.Schema(
  {
    changeDescription: { type: String, required: true },
    changeDate: { type: Date, default: Date.now },
    costImpact: { type: Number, default: 0 },
    scheduleImpactDays: { type: Number, default: 0 },
    approvedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

const financialRecordSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "InfrastructureProject", required: true },
    category: { type: String, enum: ["Material", "Labor", "Equipment", "Land", "Administrative", "Contingency", "Construction", "Other"], required: true },
    amount: { type: Number, required: true, min: 0 },
    cumulativeAmount: { type: Number, default: 0 },
    description: { type: String, default: "" },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const infrastructureProjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    projectCode: { type: String, unique: true, trim: true },
    description: { type: String, default: "" },
    sector: { type: String, enum: ["Transport", "Water", "Energy", "Housing", "Health", "Education", "Irrigation", "Urban Development", "Digital Infrastructure", "Other"], default: "Other" },
    ministry: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    district: { type: String, default: "" },
    implementationAgency: { type: String, default: "" },
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    originalCost: { type: Number, default: 0, min: 0 },
    revisedCost: { type: Number, default: 0, min: 0 },
    expenditure: { type: Number, default: 0, min: 0 },
    budgetSanctioned: { type: Number, default: 0, min: 0 },
    budgetReleased: { type: Number, default: 0, min: 0 },
    plannedDuration: { type: Number, default: 0, min: 0 },
    actualDuration: { type: Number, default: 0, min: 0 },
    plannedStartDate: { type: Date, default: Date.now },
    plannedEndDate: { type: Date, default: Date.now },
    actualStartDate: { type: Date },
    actualEndDate: { type: Date },
    physicalProgress: { type: Number, default: 0, min: 0, max: 100 },
    financialProgress: { type: Number, default: 0, min: 0, max: 100 },
    milestoneCompletion: { type: Number, default: 0, min: 0, max: 100 },
    totalMilestones: { type: Number, default: 0, min: 0 },
    completedMilestones: { type: Number, default: 0, min: 0 },
    delayedMilestones: { type: Number, default: 0, min: 0 },
    resourceAvailability: { type: Number, default: 100, min: 0, max: 100 },
    contractChanges: [contractChangeSchema],
    status: {
      type: String,
      enum: ["Planning", "Active", "Suspended", "Completed", "Cancelled"],
      default: "Planning",
    },
    completedAt: { type: Date, default: null },
    milestones: [milestoneSchema],
    progressHistory: [projectProgressSchema],
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskCategory: { type: String, enum: ["Low", "Moderate", "High", "Critical"], default: "Low" },
    costOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    predictedFinalCost: { type: Number, default: 0 },
    timeOverrunProbability: { type: Number, default: 0, min: 0, max: 100 },
    predictedDelayDays: { type: Number, default: 0 },
    predictedCostOverrunPct: { type: Number, default: null },
    predictedTimeOverrunMonths: { type: Number, default: null },
    paimanaPredictionSource: { type: String, default: "" },
    costEscalationDrivers: [{ type: String }],
    lastRiskAssessmentDate: { type: Date },
    isActive: { type: Boolean, default: true },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

infrastructureProjectSchema.index({ projectManager: 1 });
infrastructureProjectSchema.index({ members: 1 });
infrastructureProjectSchema.index({ status: 1 });
infrastructureProjectSchema.index({ sector: 1 });
infrastructureProjectSchema.index({ ministry: 1 });
infrastructureProjectSchema.index({ riskScore: -1 });

const InfrastructureProject = mongoose.model("InfrastructureProject", infrastructureProjectSchema);
const Milestone = mongoose.model("Milestone", milestoneSchema);
const ProjectProgress = mongoose.model("ProjectProgress", projectProgressSchema);
const FinancialRecord = mongoose.model("FinancialRecord", financialRecordSchema);
const ContractChange = mongoose.model("ContractChange", contractChangeSchema);

export { InfrastructureProject, Milestone, ProjectProgress, FinancialRecord, ContractChange };
export default InfrastructureProject;
