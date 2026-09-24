import asyncHandler from "express-async-handler";
import multer from "multer";
import InfrastructureProject, { Milestone, ProjectProgress } from "../models/InfrastructureProject.js";
import Project from "../models/Project.js";
import ActivityLog from "../models/ActivityLog.js";
import { RiskHistory } from "../models/RiskModels.js";
import { calculateRiskScore, identifyCostEscalationDrivers } from "../services/riskEngine.js";
import { logActivity } from "../utils/logActivity.js";

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: supports quoted fields, commas and escaped quotes)
// ---------------------------------------------------------------------------
export const parseCSV = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
};

// Map a flat CSV row to our internal field names using case-insensitive aliases.
const FIELD_ALIASES = {
  name: ["name", "project_name", "projectname", "project", "title"],
  projectCode: ["project_code", "projectcode", "code", "project_number"],
  description: ["description", "remarks", "project_description"],
  sector: ["sector", "category"],
  ministry: ["ministry", "department", "ministry_department"],
  state: ["state", "province", "region"],
  district: ["district"],
  implementationAgency: ["implementation_agency", "agency", "implementingagency", "contractor"],
  originalCost: ["original_cost", "originalcost", "approvedcost", "approved_cost", "cost_original"],
  revisedCost: ["revised_cost", "revisedcost", "current_cost", "currentcost"],
  expenditure: ["expenditure", "cumulative_expenditure", "cumulativeexpenditure", "amount_spent", "expenditure_so_far"],
  budgetSanctioned: ["budget_sanctioned", "sanctioned_cost"],
  budgetReleased: ["budget_released", "funds_released", "fund_released"],
  plannedDuration: ["planned_duration", "plannedduration", "planned_duration_months"],
  actualDuration: ["actual_duration", "actualduration", "actual_duration_months"],
  plannedStartDate: ["original_start_date", "planned_start_date", "plannedstartdate", "start_date"],
  plannedEndDate: ["original_completion_date", "planned_end_date", "plannedenddate", "completion_date", "original_completion"],
  currentExpectedCompletionDate: ["current_expected_completion_date", "revised_completion_date", "expected_completion_date"],
  physicalProgress: ["physical_progress", "physicalprogress", "progress", "physical_achievement"],
  financialProgress: ["financial_progress", "financialprogress", "financial_achievement"],
  plannedProgress: ["planned_progress", "plannedprogress", "target_progress"],
  milestoneCompletion: ["milestone_completion", "milestonecompletion"],
  totalMilestones: ["total_milestones", "totalmilestones", "number_of_milestones"],
  completedMilestones: ["completed_milestones", "completedmilestones"],
  delayedMilestones: ["delayed_milestones", "delayedmilestones"],
  resourceAvailability: ["resource_availability", "resourceavailability"],
  projectStatus: ["project_status", "status"],
  reportingPeriod: ["reporting_period", "reportingmonth", "month"],
};

const lookup = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  return undefined;
};

const toNumber = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const cleaned = String(v).replace(/[₹,$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const toDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const normalizeRow = (row) => {
  const res = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const raw = lookup(row, aliases);
    if (raw === undefined) continue;
    if (["originalCost", "revisedCost", "expenditure", "budgetSanctioned", "budgetReleased", "plannedDuration", "actualDuration", "physicalProgress", "financialProgress", "plannedProgress", "milestoneCompletion", "totalMilestones", "completedMilestones", "delayedMilestones", "resourceAvailability"].includes(field)) {
      res[field] = toNumber(raw);
    } else if (["plannedStartDate", "plannedEndDate", "currentExpectedCompletionDate"].includes(field)) {
      res[field] = toDate(raw);
    } else {
      res[field] = raw;
    }
  }
  return res;
};

export const validateProjectRecord = (record, index = 0) => {
  const errors = [];
  const warnings = [];

  if (!record.name) errors.push(`Row ${index + 2}: project name is required`);
  if (!record.projectCode) {
    if (record.name) record.projectCode = `IMPORTED-${Date.now()}-${index}`;
  }
  if (record.originalCost !== undefined && record.originalCost < 0) errors.push(`Row ${index + 2}: original cost cannot be negative`);
  if (record.revisedCost !== undefined && record.revisedCost < 0) errors.push(`Row ${index + 2}: revised cost cannot be negative`);
  if (record.expenditure !== undefined && record.expenditure < 0) errors.push(`Row ${index + 2}: expenditure cannot be negative`);
  if (record.physicalProgress !== undefined && (record.physicalProgress < 0 || record.physicalProgress > 100)) errors.push(`Row ${index + 2}: physical progress must be between 0 and 100`);
  if (record.financialProgress !== undefined && (record.financialProgress < 0 || record.financialProgress > 100)) errors.push(`Row ${index + 2}: financial progress must be between 0 and 100`);
  if (record.plannedProgress !== undefined && (record.plannedProgress < 0 || record.plannedProgress > 100)) errors.push(`Row ${index + 2}: planned progress must be between 0 and 100`);
  if (record.resourceAvailability !== undefined && (record.resourceAvailability < 0 || record.resourceAvailability > 100)) warnings.push(`Row ${index + 2}: resource availability is out of range 0-100`);
  if (record.plannedStartDate && record.plannedEndDate && record.plannedEndDate < record.plannedStartDate) warnings.push(`Row ${index + 2}: end date is before start date (inconsistent dates)`);
  if (record.currentExpectedCompletionDate && record.plannedEndDate && record.currentExpectedCompletionDate < record.plannedEndDate) warnings.push(`Row ${index + 2}: current expected completion is earlier than original completion date`);
  if (record.revisedCost !== undefined && record.originalCost !== undefined && record.revisedCost < record.originalCost) warnings.push(`Row ${index + 2}: revised cost is below original cost (possible data entry issue)`);
  if (record.expenditure !== undefined && record.revisedCost !== undefined && record.expenditure > record.revisedCost) warnings.push(`Row ${index + 2}: expenditure exceeds revised cost`);
  if (record.milestoneCompletion !== undefined && (record.milestoneCompletion < 0 || record.milestoneCompletion > 100)) warnings.push(`Row ${index + 2}: milestone completion must be between 0 and 100`);

  return { errors, warnings };
};

const buildProjectDocument = async (record) => {
  const originalCost = Number(record.originalCost) || 0;
  const revisedCost = Number(record.revisedCost) || originalCost;
  const expenditure = Number(record.expenditure) || 0;
  const physicalProgress = Number.isFinite(Number(record.physicalProgress)) ? Math.min(100, Math.max(0, Number(record.physicalProgress))) : 0;
  const financialProgress = Number.isFinite(Number(record.financialProgress)) ? Math.min(100, Math.max(0, Number(record.financialProgress))) : 0;
  const plannedDuration = Number(record.plannedDuration) || 12;
  const actualDuration = Number(record.actualDuration) || plannedDuration;
  const totalMilestones = Math.max(0, Math.floor(Number(record.totalMilestones) || 0));
  const completedMilestones = Math.min(totalMilestones, Math.max(0, Math.floor(Number(record.completedMilestones) || 0)));
  const delayedMilestones = Math.max(0, Math.floor(Number(record.delayedMilestones) || 0));
  const resourceAvailability = Number.isFinite(Number(record.resourceAvailability)) ? Math.min(100, Math.max(0, Number(record.resourceAvailability))) : 100;

  const project = new InfrastructureProject({
    name: record.name,
    projectCode: record.projectCode,
    description: record.description || "",
    sector: record.sector || "Other",
    ministry: record.ministry || "Unknown Ministry",
    state: record.state || "Unknown",
    district: record.district || "",
    implementationAgency: record.implementationAgency || "",
    originalCost,
    revisedCost,
    expenditure,
    budgetSanctioned: Number(record.budgetSanctioned) || originalCost,
    budgetReleased: Number(record.budgetReleased) || 0,
    plannedDuration,
    actualDuration,
    plannedStartDate: record.plannedStartDate || new Date(),
    plannedEndDate: record.plannedEndDate || new Date(Date.now() + plannedDuration * 30 * 24 * 60 * 60 * 1000),
    physicalProgress,
    financialProgress,
    milestoneCompletion: Number(record.milestoneCompletion) ?? (totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0),
    totalMilestones,
    completedMilestones,
    delayedMilestones,
    resourceAvailability,
    status: normalizeStatus(record.projectStatus, physicalProgress),
  });

  if (record.plannedProgress !== undefined) {
    project.progressHistory.push({
      project: project._id,
      reportingPeriod: record.reportingPeriod || "Initial Data Import",
      plannedProgress: Math.min(100, Math.max(0, Number(record.plannedProgress) || 0)),
      physicalProgress,
      financialProgress,
      expenditure,
      milestoneCompletion: project.milestoneCompletion,
      resourceAvailability,
      remarks: "Imported from external dataset",
      recordedAt: new Date(),
    });
  }

  return project;
};

const normalizeStatus = (raw, progress) => {
  const map = {
    planning: "Planning", active: "Active", suspended: "Suspended",
    completed: "Completed", cancelled: "Cancelled",
    "on hold": "Active", approved: "Planning",
  };
  if (raw) {
    const key = String(raw).toLowerCase().trim();
    if (map[key]) return map[key];
  }
  if (progress >= 100) return "Completed";
  return "Active";
};

// ---------------------------------------------------------------------------
// POST /api/projects/import  (CSV file: multipart field "file" OR JSON body)
// ---------------------------------------------------------------------------
export const importProjects = asyncHandler(async (req, res) => {
  const records = [];
  const allWarnings = [];
  const allErrors = [];

  if (req.file) {
    const rows = parseCSV(req.file.buffer.toString("utf-8"));
    if (rows.length === 0) {
      res.status(400);
      throw new Error("CSV file is empty or could not be parsed");
    }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    for (let i = 1; i < rows.length; i += 1) {
      const rowObj = {};
      headers.forEach((h, idx) => {
        if (h) rowObj[h] = rows[i][idx] !== undefined ? rows[i][idx] : "";
      });
      records.push(normalizeRow(rowObj));
    }
  } else if (Array.isArray(req.body)) {
    req.body.forEach((record) => records.push(normalizeRow(record)));
  } else if (req.body && Array.isArray(req.body.projects)) {
    req.body.projects.forEach((record) => records.push(normalizeRow(record)));
  } else {
    res.status(400);
    throw new Error("Provide a CSV file (multipart 'file') or a JSON array (or { projects: [...] }) of project records");
  }

  if (records.length === 0) {
    res.status(400);
    throw new Error("No project records found in the uploaded data");
  }

  const seenCodes = new Set();
  const validProjects = [];
  const failures = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const { errors, warnings } = validateProjectRecord(record, i);
    allWarnings.push(...warnings);

    if (record.projectCode && seenCodes.has(record.projectCode.toLowerCase())) {
      errors.push(`Row ${i + 2}: duplicate project code "${record.projectCode}" within the file`);
    }
    if (record.projectCode) seenCodes.add(record.projectCode.toLowerCase());
    const existing = record.projectCode ? await InfrastructureProject.findOne({ projectCode: record.projectCode.toUpperCase() }) : null;
    if (existing) errors.push(`Row ${i + 2}: project code "${record.projectCode}" already exists in the database`);

    if (errors.length > 0) {
      failures.push({ index: i + 2, projectCode: record.projectCode || null, errors });
      continue;
    }
    const doc = await buildProjectDocument(record);
    const risk = calculateRiskScore(doc);
    doc.riskScore = risk.score;
    doc.riskCategory = risk.category;
    doc.costEscalationDrivers = identifyCostEscalationDrivers(doc);
    validProjects.push(doc);
  }

  const inserted = validProjects.length > 0 ? await InfrastructureProject.insertMany(validProjects, { ordered: false }) : [];

  await logActivity({
    user: req.user._id,
    action: "Bulk project import",
    details: `Imported ${inserted.length} infrastructure project(s); ${failures.length} row(s) rejected`,
  });

  res.status(201).json({
    success: true,
    imported: inserted.length,
    rejected: failures.length,
    total: records.length,
    warnings: allWarnings,
    failures,
    sample: inserted.length > 0 ? [{ id: inserted[0]._id, name: inserted[0].name, projectCode: inserted[0].projectCode }] : [],
  });
});

// Multer in-memory upload for CSV import (used by the route below).
export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname) || file.mimetype === "text/csv";
    cb(ok ? null : new Error("Only CSV files are supported for bulk import"), ok);
  },
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/updates   (monthly reporting update)
// ---------------------------------------------------------------------------
export const addProjectUpdate = asyncHandler(async (req, res) => {
  const infraProject = await InfrastructureProject.findById(req.params.id);
  if (!infraProject) {
    res.status(404);
    throw new Error("Infrastructure project not found");
  }

  const userId = req.user._id.toString();
  if (req.user.role !== "Admin") {
    const isManager = (infraProject.projectManager?._id || infraProject.projectManager)?.toString() === userId;
    const isMember = (infraProject.members || []).some((m) => (m?._id || m).toString() === userId);
    if (!isManager && !isMember) {
      res.status(403);
      throw new Error("You do not have access to this project");
    }
  }

  const {
    reportingPeriod, plannedProgress, physicalProgress, financialProgress,
    expenditure, milestoneCompletion, resourceAvailability, issues, issueCategory, remarks,
  } = req.body;

  if (!reportingPeriod) {
    res.status(400);
    throw new Error("reportingPeriod (e.g. '2026-09') is required");
  }

  const clamp = (v, min = 0, max = 100) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : undefined);

  const physical = clamp(physicalProgress ?? infraProject.physicalProgress, 0, 100);
  const planned = clamp(plannedProgress ?? infraProject.plannedProgress, 0, 100);
  const financial = clamp(financialProgress ?? infraProject.financialProgress, 0, 100);
  const milestone = clamp(milestoneCompletion ?? infraProject.milestoneCompletion, 0, 100);
  const resources = clamp(resourceAvailability ?? infraProject.resourceAvailability, 0, 100);
  const spent = Number.isFinite(Number(expenditure)) ? Math.max(0, Number(expenditure)) : infraProject.expenditure;

  infraProject.progressHistory.push({
    project: infraProject._id,
    reportingPeriod,
    plannedProgress: planned,
    physicalProgress: physical,
    financialProgress: financial,
    expenditure: spent,
    milestoneCompletion: milestone,
    resourceAvailability: resources,
    issues: issues || "",
    issueCategory: issueCategory || "",
    remarks: remarks || "",
    recordedAt: new Date(),
  });

  // Sync the project's current snapshot.
  infraProject.physicalProgress = physical;
  infraProject.financialProgress = financial;
  infraProject.expenditure = spent;
  infraProject.milestoneCompletion = milestone;
  infraProject.resourceAvailability = resources;
  if (req.body.revisedCost !== undefined && Number.isFinite(Number(req.body.revisedCost))) infraProject.revisedCost = Math.max(0, Number(req.body.revisedCost));
  if (req.body.currentExpectedCompletionDate) infraProject.plannedEndDate = new Date(req.body.currentExpectedCompletionDate);

  const risk = calculateRiskScore(infraProject);
  infraProject.riskScore = risk.score;
  infraProject.riskCategory = risk.category;
  infraProject.costEscalationDrivers = identifyCostEscalationDrivers(infraProject);
  infraProject.lastRiskAssessmentDate = new Date();
  await infraProject.save();

  await logActivity({
    user: req.user._id,
    project: infraProject._id,
    projectType: "InfrastructureProject",
    action: "Project update recorded",
    details: `Reported ${reportingPeriod}: physical ${physical}%, planned ${planned}%, expenditure ₹${spent}`,
  });

  res.status(201).json({
    success: true,
    message: "Project update recorded",
    update: infraProject.progressHistory[infraProject.progressHistory.length - 1],
    riskScore: infraProject.riskScore,
    riskCategory: infraProject.riskCategory,
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/history   (timeline of updates / milestones / risk)
// ---------------------------------------------------------------------------
export const getProjectHistory = asyncHandler(async (req, res) => {
  const infraProject = await InfrastructureProject.findById(req.params.id).populate("projectManager", "name email");
  if (!infraProject) {
    res.status(404);
    throw new Error("Project not found");
  }

  const userId = req.user._id.toString();
  if (req.user.role !== "Admin") {
    const isManager = (infraProject.projectManager?._id || infraProject.projectManager)?.toString() === userId;
    const isMember = (infraProject.members || []).some((m) => (m?._id || m).toString() === userId);
    if (!isManager && !isMember) {
      res.status(403);
      throw new Error("You do not have access to this project");
    }
  }

  const [riskHistory] = await Promise.all([
    RiskHistory.find({ project: infraProject._id }).sort("recordedAt"),
  ]);

  const progress = (infraProject.progressHistory || []).map((p) => p.toObject()).sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  // Merge into a single timeline.
  const timeline = [];
  progress.forEach((p) => timeline.push({
    kind: "update",
    period: p.reportingPeriod,
    date: p.recordedAt,
    plannedProgress: p.plannedProgress ?? null,
    physicalProgress: p.physicalProgress ?? null,
    expenditure: p.expenditure ?? null,
    milestoneCompletion: p.milestoneCompletion ?? null,
    issues: p.issues || "",
    remarks: p.remarks || "",
  }));
  riskHistory.forEach((r) => timeline.push({
    kind: "risk",
    date: r.recordedAt,
    riskScore: r.riskScore,
    riskCategory: r.riskCategory,
    trendDirection: r.trendDirection,
    riskAcceleration: r.riskAcceleration,
  }));
  timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json({
    success: true,
    projectId: infraProject._id,
    projectName: infraProject.name,
    projectCode: infraProject.projectCode,
    progress,
    milestones: infraProject.milestones || [],
    riskHistory,
    timeline,
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/planned-vs-actual
// ---------------------------------------------------------------------------
export const getPlannedVsActual = asyncHandler(async (req, res) => {
  const infraProject = await InfrastructureProject.findById(req.params.id);
  if (!infraProject) {
    res.status(404);
    throw new Error("Project not found");
  }

  const userId = req.user._id.toString();
  if (req.user.role !== "Admin") {
    const isManager = (infraProject.projectManager?._id || infraProject.projectManager)?.toString() === userId;
    const isMember = (infraProject.members || []).some((m) => (m?._id || m).toString() === userId);
    if (!isManager && !isMember) {
      res.status(403);
      throw new Error("You do not have access to this project");
    }
  }

  const progressHistory = (infraProject.progressHistory || []).map((p) => p.toObject()).sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  const latest = progressHistory.length > 0 ? progressHistory[progressHistory.length - 1] : null;
  const actual = latest ? latest.physicalProgress : infraProject.physicalProgress || 0;
  const planned = latest && latest.plannedProgress !== undefined && latest.plannedProgress !== null ? latest.plannedProgress : actual;

  // Progress variance = Actual - Planned
  const progressVariance = Math.round((actual - planned) * 10) / 10;

  // Schedule variance = original completion vs current expected completion (months)
  const originalEnd = infraProject.plannedEndDate ? new Date(infraProject.plannedEndDate).getTime() : null;
  const start = infraProject.plannedStartDate ? new Date(infraProject.plannedStartDate).getTime() : null;
  const scheduleVarianceMonths = originalEnd && start ? Math.round(((originalEnd - start) / (30.44 * 24 * 60 * 60 * 1000)) - (infraProject.plannedDuration || 0) * 10) / 10 : 0;
  const timeRemaining = originalEnd ? Math.round(((originalEnd - Date.now()) / (30.44 * 24 * 60 * 60 * 1000)) * 10) / 10 : 0;

  // Cost variance = Revised - Original (cumulative overrun)
  const costVariance = Math.round(((infraProject.revisedCost || 0) - (infraProject.originalCost || 0)) * 10) / 10;
  const costVariancePct = infraProject.originalCost > 0 ? Math.round(((costVariance / infraProject.originalCost) * 100) * 10) / 10 : 0;

  // Expected expenditure at this point (linear ramp up to revised cost by progress)
  const expectedExpenditure = Math.round(((infraProject.revisedCost || 0) * (planned / 100)) * 10) / 10;
  const expenditureVariance = Math.round(((infraProject.expenditure || 0) - expectedExpenditure) * 10) / 10;

  const severityOf = (value, highThreshold, extremeThreshold) => {
    const abs = Math.abs(value);
    if (abs >= extremeThreshold) return "Extreme";
    if (abs >= highThreshold) return "Severe";
    if (abs > 0) return "Moderate";
    return "On Track";
  };

  res.json({
    success: true,
    projectId: infraProject._id,
    projectName: infraProject.name,
    latest: {
      reportingPeriod: latest ? latest.reportingPeriod : "Current snapshot",
      plannedProgress: planned,
      actualProgress: actual,
      expenditure: infraProject.expenditure || 0,
      expectedExpenditure,
    },
    variances: {
      progressVariance,
      progressSeverity: progressVariance < -10 ? "Severe" : progressVariance < 0 ? "Moderate" : "On Track",
      expenditureVariance,
      expenditureSeverity: severityOf(expenditureVariance, infraProject.originalCost * 0.1, infraProject.originalCost * 0.25),
      scheduleVarianceMonths,
      scheduleSeverity: Math.abs(scheduleVarianceMonths) >= 12 ? "Extreme" : Math.abs(scheduleVarianceMonths) >= 6 ? "Severe" : Math.abs(scheduleVarianceMonths) > 0 ? "Moderate" : "On Track",
      costVariance,
      costVariancePct,
      costSeverity: costVariancePct >= 25 ? "Extreme" : costVariancePct >= 10 ? "Severe" : costVariancePct > 0 ? "Moderate" : "On Track",
    },
    trend: progressHistory.map((p) => ({
      period: p.reportingPeriod,
      planned: p.plannedProgress ?? null,
      actual: p.physicalProgress ?? null,
    })),
    timeRemainingMonths: timeRemaining,
  });
});