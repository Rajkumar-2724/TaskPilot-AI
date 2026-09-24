import InfrastructureProject from "../models/InfrastructureProject.js";
import { RiskHistory, Alert, Recommendation } from "../models/RiskModels.js";
import { computeRiskAcceleration } from "./riskEngine.js";
import { callGemini, isAiEnabled } from "./aiService.js";
import { getRiskThresholds } from "./settingsService.js";

// ---------------------------------------------------------------------------
// Grounded "Project Intelligence" assistant.
// Every answer is computed from the application database (retrieval layer) and,
// when GEMINI_API_KEY is configured, re-phrased by the LLM — but never invented.
// The `sources` array always lists the exact records used.
// ---------------------------------------------------------------------------

const scrapedAccessibleProjects = async (user) => {
  const filter = user.role === "Admin"
    ? {}
    : { $or: [{ projectManager: user._id }, { members: user._id }] };
  return InfrastructureProject.find(filter).lean();
};

const findByIdentifier = (projects, raw) => {
  const q = String(raw || "").toLowerCase().trim();
  if (!q) return null;
  const byCode = projects.find((p) => p.projectCode && p.projectCode.toLowerCase() === q);
  if (byCode) return byCode;
  // token overlap scoring for name matching
  let best = null;
  let bestScore = 0;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return null;
  for (const p of projects) {
    const name = String(p.name || "").toLowerCase();
    let score = 0;
    for (const t of tokens) if (name.includes(t)) score += 1;
    // project code partial match
    if (p.projectCode && p.projectCode.toLowerCase().includes(q)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 1 ? best : null;
};

const highRiskProjects = (projects, key, threshold) => projects
  .filter((p) => Number(p[key]) >= threshold)
  .sort((a, b) => Number(b[key]) - Number(a[key]));

const fmtMoney = (n) => {
  const num = Number(n) || 0;
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)} Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(2)} L`;
  return `₹${num.toLocaleString("en-IN")}`;
};

const summarizeProject = (p) => {
  const t = getRiskThresholds();
  return {
    projectId: p._id,
    projectName: p.name,
    projectCode: p.projectCode,
    sector: p.sector,
    ministry: p.ministry,
    state: p.state,
    status: p.status,
    originalCost: fmtMoney(p.originalCost),
    revisedCost: fmtMoney(p.revisedCost),
    expenditure: fmtMoney(p.expenditure),
    physicalProgress: `${p.physicalProgress || 0}%`,
    plannedStartDate: p.plannedStartDate ? new Date(p.plannedStartDate).toISOString().split("T")[0] : null,
    plannedEndDate: p.plannedEndDate ? new Date(p.plannedEndDate).toISOString().split("T")[0] : null,
    riskScore: p.riskScore,
    riskCategory: p.riskCategory,
    costOverrunProbability: `${p.costOverrunProbability || 0}%`,
    timeOverrunProbability: `${p.timeOverrunProbability || 0}%`,
    predictedDelayDays: p.predictedDelayDays || 0,
    delayedMilestones: p.delayedMilestones || 0,
    riskBand: `thresholds: Low≤${t.moderate}, Moderate≤${t.high}, High≤${t.critical}, Critical>${t.critical}`,
  };
};

const projectSource = (p, detail = "") => ({
  projectId: p._id,
  projectName: p.name,
  projectCode: p.projectCode,
  type: "InfrastructureProject",
  detail,
});

const buildContext = (projects, user) => {
  const rows = projects.map((p) => {
    const s = summarizeProject(p);
    delete s.riskBand;
    return s;
  });
  return {
    scope: user.role === "Admin" ? "all projects" : "projects assigned to the requesting user",
    projects: rows,
  };
};

export const answerQuestion = async (user, message, history = []) => {
  const projects = await scrapedAccessibleProjects(user);
  const lower = String(message || "").toLowerCase();
  let answer = "";
  let sources = [];
  let specific = null;

  // ---- detect & route intent -------------------------------------------
  const mentionProjects = projects.filter((p) => {
    const n = (p.name || "").toLowerCase();
    const c = (p.projectCode || "").toLowerCase();
    const tokens = lower.split(/\s+/).filter((t) => t.length >= 4);
    return tokens.some((t) => n.includes(t) || c.includes(t));
  });

  if (lower.includes("risk driver") || (lower.includes("why") || lower.includes("reason")) && (lower.includes("risky") || lower.includes("risk"))) {
    specific = mentionProjects[0] || findByIdentifier(projects, lower) || projects[0];
    if (specific) {
      const drivers = specific.costEscalationDrivers && specific.costEscalationDrivers.length > 0
        ? specific.costEscalationDrivers
        : ["No specific risk drivers recorded — run a risk assessment for this project."];
      const shap = `The most influential factors associated with the model's risk estimate are cost, schedule, milestones, resources, financial and implementation drivers.`;
      answer = `Top risk drivers for "${specific.name}" (${specific.projectCode}): ${drivers.join("; ")}. ${shap} Risk score is ${specific.riskScore}/100 (${specific.riskCategory}).`;
      sources.push(projectSource(specific, "costEscalationDrivers"));
    }
  } else if (lower.includes("compare")) {
    specific = mentionProjects[0] || findByIdentifier(projects, lower) || projects[0];
    if (specific) {
      const peers = projects.filter((p) => p.sector === specific.sector && String(p._id) !== String(specific._id)).slice(0, 5);
      if (peers.length === 0) {
        answer = `"${specific.name}" has no comparable projects in the same sector (${specific.sector}).`;
      } else {
        const avgRisk = Math.round(peers.reduce((s, p) => s + (p.riskScore || 0), 0) / peers.length);
        const avgProgress = Math.round(peers.reduce((s, p) => s + (p.physicalProgress || 0), 0) / peers.length);
        answer = `Compared with ${peers.length} similar ${specific.sector} projects, "${specific.name}" has risk ${specific.riskScore} (sector average ${avgRisk}) and physical progress ${specific.physicalProgress}% (sector average ${avgProgress}%). Peers: ${peers.map((p) => p.name).join("; ")}.`;
        peers.forEach((p) => sources.push(projectSource(p, "benchmark peer")));
      }
      sources.push(projectSource(specific, "benchmark subject"));
    }
  } else if (lower.includes("what changed") || lower.includes("last month") || lower.includes("latest update") || lower.includes("changed from")) {
    specific = mentionProjects[0] || findByIdentifier(projects, lower) || projects[0];
    if (specific) {
      const full = await InfrastructureProject.findById(specific._id).lean();
      const history = (full.progressHistory || []).sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      if (!last) {
        answer = `No progress updates have been recorded for "${specific.name}" yet.`;
      } else {
        const pp = (last.plannedProgress ?? "n/a");
        const ap = (last.physicalProgress ?? "n/a");
        if (prev) {
          const dP = (last.physicalProgress - prev.physicalProgress).toFixed(1);
          const dBudget = (last.expenditure - prev.expenditure).toFixed(0);
          answer = `For "${specific.name}", the latest reporting period (${last.reportingPeriod}) shows physical progress ${ap}% (${Number(dP) >= 0 ? "+" : ""}${dP} pts vs prior), planned ${pp}%, expenditure ${fmtMoney(last.expenditure)} (Δ ${fmtMoney(dBudget)}).`;
        } else {
          answer = `For "${specific.name}", the first reporting period (${last.reportingPeriod}) recorded physical progress ${ap}%, planned ${pp}%, expenditure ${fmtMoney(last.expenditure)}.`;
        }
        sources.push(projectSource(specific, `progressHistory[${last.reportingPeriod}]`));
      }
    }
  } else if (lower.includes("milestone") && (lower.includes("delay") || lower.includes("behind"))) {
    const delayed = projects.filter((p) => (p.delayedMilestones || 0) > 0).sort((a, b) => b.delayedMilestones - a.delayedMilestones);
    if (delayed.length === 0) {
      answer = "No project has recorded delayed milestones.";
    } else {
      answer = `${delayed.length} project(s) have delayed milestones: ${delayed.slice(0, 8).map((p) => `${p.name} (${p.delayedMilestones} delayed)`).join("; ")}${delayed.length > 8 ? `; …and ${delayed.length - 8} more` : ""}.`;
      delayed.slice(0, 8).forEach((p) => sources.push(projectSource(p, `${p.delayedMilestones} delayed milestone(s)`)));
    }
  } else if (lower.includes("accelerat") || lower.includes("risin") || lower.includes("increas") || lower.includes("worsen")) {
    const acc = [];
    for (const p of projects.slice(0, 30)) {
      const hist = await RiskHistory.find({ project: p._id }).sort("recordedAt").lean();
      if (hist.length < 2) continue;
      const a = computeRiskAcceleration(hist);
      if (a.flag === "Risk Accelerating" || a.flag === "Sudden Deterioration") {
        acc.push({ p, a });
      }
    }
    acc.sort((x, y) => y.a.slope - x.a.slope);
    if (acc.length === 0) {
      answer = "No projects currently show accelerating or sharply deteriorating risk trends.";
    } else {
      answer = `${acc.length} project(s) show an accelerating/deteriorating risk trend: ${acc.slice(0, 8).map(({ p, a }) => `${p.name} (${a.flag}, slope ${a.slope >= 0 ? "+" : ""}${a.slope}/period)`).join("; ")}.`;
      acc.slice(0, 8).forEach(({ p, a }) => sources.push(projectSource(p, `risk trend: ${a.flag}`)));
    }
  } else if ((lower.includes("high") || lower.includes("top")) && (lower.includes("schedule") || lower.includes("time") || lower.includes("delay"))) {
    const list = highRiskProjects(projects, "timeOverrunProbability", 50);
    answer = list.length === 0
      ? "No project currently has a high (>50%) time/schedule overrun probability."
      : `${list.length} project(s) have high time/schedule overrun risk: ${list.slice(0, 8).map((p) => `${p.name} (${p.timeOverrunProbability}%)`).join("; ")}.`;
    list.slice(0, 8).forEach((p) => sources.push(projectSource(p, `timeOverrunProbability ${p.timeOverrunProbability}%`)));
  } else if ((lower.includes("high") || lower.includes("top")) && (lower.includes("cost") || lower.includes("budget"))) {
    const list = highRiskProjects(projects, "costOverrunProbability", 50);
    answer = list.length === 0
      ? "No project currently has a high (>50%) cost overrun probability."
      : `${list.length} project(s) have high cost overrun risk: ${list.slice(0, 8).map((p) => `${p.name} (${p.costOverrunProbability}%)`).join("; ")}.`;
    list.slice(0, 8).forEach((p) => sources.push(projectSource(p, `costOverrunProbability ${p.costOverrunProbability}%`)));
  } else if (lower.includes("risk") && (lower.includes("high") || lower.includes("critical") || lower.includes("list") || lower.includes("which"))) {
    const list = highRiskProjects(projects, "riskScore", getRiskThresholds().high);
    answer = list.length === 0
      ? "No projects are currently in the High/Critical risk band."
      : `${list.length} project(s) are in the High/Critical risk band (≥${getRiskThresholds().high}/100): ${list.slice(0, 8).map((p) => `${p.name} (${p.riskScore}, ${p.riskCategory})`).join("; ")}.`;
    list.slice(0, 8).forEach((p) => sources.push(projectSource(p, `riskScore ${p.riskScore}`)));
  } else if (lower.includes("summary") || lower.includes("summarize") || lower.includes("overview")) {
    specific = mentionProjects[0] || findByIdentifier(projects, lower) || projects[0];
    if (specific) {
      const s = summarizeProject(specific);
      answer = `Summary for "${s.projectName}" (${s.projectCode}): ${s.sector} project under ${s.ministry} in ${s.state}. Status: ${s.status}. Budget: ${s.originalCost} original → ${s.revisedCost} revised, ${s.expenditure} spent so far. Physical progress ${s.physicalProgress}, risk ${s.riskScore}/100 (${s.riskCategory}), cost overrun probability ${s.costOverrunProbability}, time overrun probability ${s.timeOverrunProbability} (predicted delay ${s.predictedDelayDays} days).`;
      sources.push(projectSource(specific, "project summary"));
    }
  } else if (lower.includes("alerts") || lower.includes("warning")) {
    const alerts = await Alert.find({ project: { $in: projects.map((p) => p._id) } }).sort("-createdAt").limit(8).populate("project", "name projectCode");
    if (alerts.length === 0) {
      answer = "No alerts have been generated for your projects.";
    } else {
      answer = `Latest alerts: ${alerts.map((a) => `[${a.severity}] ${a.project?.name || ""}: ${a.title}`).join(" | ")}.`;
      alerts.forEach((a) => sources.push({ projectId: a.project?._id, projectName: a.project?.name, projectCode: a.project?.projectCode, type: "Alert", detail: a.title }));
    }
  } else if (lower.includes("recommend") || lower.includes("intervention") || lower.includes("action")) {
    const recs = projects.length > 0
      ? await Recommendation.find({ project: { $in: projects.map((p) => p._id) } }).sort("-priority").limit(8).populate("project", "name projectCode")
      : [];
    if (recs.length === 0) {
      answer = "No recommendations have been generated yet. Run a risk assessment to generate action items.";
    } else {
      answer = `Top recommendations: ${recs.map((r) => `[${r.priority}] ${r.project?.name || ""}: ${r.title}`).join(" | ")}.`;
      recs.forEach((r) => sources.push({ projectId: r.project?._id, projectName: r.project?.name, projectCode: r.project?.projectCode, type: "Recommendation", detail: r.title }));
    }
  } else if (lower.includes("count") || lower.includes("how many") || lower.includes("total")) {
    const t = getRiskThresholds();
    answer = `Across ${projects.length} accessible project(s): high/critical risk (≥${t.high}) = ${projects.filter((p) => p.riskScore >= t.high).length}; cost overrun risk >50% = ${projects.filter((p) => p.costOverrunProbability >= 50).length}; schedule risk >50% = ${projects.filter((p) => p.timeOverrunProbability >= 50).length}; delayed milestones = ${projects.filter((p) => (p.delayedMilestones || 0) > 0).length}.`;
  } else if (lower.includes("hello") || lower.includes("hi ") || lower === "hi" || lower.includes("hey")) {
    answer = `Hello! I'm the grounded Project Intelligence assistant. I can answer questions like: "Which projects have high schedule risk?", "Why is <project> risky?", "Which milestones are delayed?", "What changed last month for <project>?", "Compare <project> with similar projects". Every answer is computed from the stored project data.`;
  } else {
    specific = findByIdentifier(projects, lower);
    if (specific && !mentionProjects.length) {
      const s = summarizeProject(specific);
      answer = `"${s.projectName}" (${s.projectCode}) is currently ${s.status} with ${s.physicalProgress} physical progress, risk ${s.riskScore}/100 (${s.riskCategory}). Cost overrun probability ${s.costOverrunProbability}, time overrun probability ${s.timeOverrunProbability}.`;
      sources.push(projectSource(specific, "project lookup"));
    } else if (projects.length > 0) {
      answer = `I found ${projects.length} accessible project(s). Ask me about high-risk projects, risk drivers, delayed milestones, latest updates, comparisons or summaries. Examples: "Why is ${projects[0].name} risky?", "Which projects have high cost risk?".`;
      sources.push(projectSource(projects[0], "example reference"));
    } else {
      answer = "No projects are accessible to your account yet.";
    }
  }

  if (!answer) answer = "I could not resolve that question against the available project data.";

  // ---- LLM re-phrasing (grounded; never invents values) ------------------
  if (isAiEnabled()) {
    const context = { answer, sources, scopeHint: "Answer using ONLY the provided grounded answer and sources. Do not add project figures that are not present above. Keep it concise and factual." };
    const prompt =
      `You are the grounded Project Intelligence assistant for an infrastructure project monitoring platform.\n` +
      `Use ONLY the grounded answer below. DO NOT invent project names, numbers, dates or risks.\n\n` +
      `Grounded answer:\n${context.answer}\n\n` +
      `Sources:\n${JSON.stringify(context.sources)}\n\n` +
      `Re-express the grounded answer as a clear, concise reply (same facts, same figures). Respond ONLY with strict JSON: {"answer": "..."}`;
    const result = await callGemini(prompt, () => ({ answer }));
    if (result && result.answer) answer = result.answer;
  }

  return { answer, sources, mode: isAiEnabled() ? "Gemini (grounded)" : "Rule-based retrieval", history: history.slice(-6) };
};