import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const COLORS = { Low: "#22C55E", Moderate: "#F59E0B", High: "#F97316", Critical: "#EF4444" };

const FACTOR_META = [
  { key: "cost", label: "Cost Risk", color: "#6366F1" },
  { key: "schedule", label: "Schedule Risk", color: "#38BDF8" },
  { key: "milestones", label: "Milestone Risk", color: "#F59E0B" },
  { key: "resources", label: "Resource Risk", color: "#22C55E" },
  { key: "financial", label: "Financial Risk", color: "#A78BFA" },
  { key: "implementation", label: "Implementation Risk", color: "#F472B6" },
];

const WEIGHT_META = [
  { key: "cost", label: "Cost", color: "#6366F1" },
  { key: "schedule", label: "Schedule", color: "#38BDF8" },
  { key: "milestones", label: "Milestones", color: "#F59E0B" },
  { key: "resources", label: "Resources", color: "#22C55E" },
  { key: "financial", label: "Financial", color: "#A78BFA" },
  { key: "implementation", label: "Implementation", color: "#F472B6" },
];

const calculateRiskScore = (project) => {
  const weights = { cost: 0.25, schedule: 0.20, milestones: 0.20, resources: 0.15, financial: 0.12, implementation: 0.08 };
  const clamp = (n) => Math.min(100, Math.max(0, n));

  const costRisk = project.originalCost > 0
    ? Math.min(100, (Math.max(0, project.revisedCost - project.originalCost) / project.originalCost) * 100 * 0.5 + (project.expenditure > project.revisedCost ? 50 : 0) + (project.costOverrunProbability || 0))
    : 50;
  const scheduleRisk = project.plannedDuration > 0
    ? Math.min(100, (Math.max(0, project.actualDuration - project.plannedDuration) / project.plannedDuration) * 100 * 0.5 + (project.timeOverrunProbability || 0) + (project.delayedMilestones / Math.max(1, project.totalMilestones) * 100))
    : 50;
  const milestoneRisk = project.totalMilestones > 0
    ? ((project.totalMilestones - project.completedMilestones) / project.totalMilestones) * 100 * 0.6 + (project.delayedMilestones / Math.max(1, project.totalMilestones)) * 100 * 0.4
    : 50;
  const resourceRisk = 100 - (project.resourceAvailability || 100);
  const financialRisk = project.originalCost > 0
    ? Math.min(100, (project.expenditure / Math.max(1, project.originalCost)) * 100 * 0.5 + ((project.revisedCost - project.originalCost) / Math.max(1, project.originalCost)) * 100 * 0.5)
    : 50;
  const implementationRisk = 50 - (project.physicalProgress || 0) * 0.3 + (100 - (project.financialProgress || 0)) * 0.3;

  const categoryScores = {
    cost: Math.round(clamp(costRisk)),
    schedule: Math.round(clamp(scheduleRisk)),
    milestones: Math.round(clamp(milestoneRisk)),
    resources: Math.round(clamp(resourceRisk)),
    financial: Math.round(clamp(financialRisk)),
    implementation: Math.round(clamp(implementationRisk)),
  };

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
  const category = score < 30 ? "Low" : score < 50 ? "Moderate" : score < 75 ? "High" : "Critical";

  const topFactors = FACTOR_META
    .map((f) => ({ ...f, value: categoryScores[f.key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return {
    score,
    category,
    weights,
    categoryScores,
    shapExplanation: `Primary risk drivers: ${topFactors.map((f) => `${f.label} (${f.value}/100)`).join(", ")}.`,
  };
};

const RiskScoringPage = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [riskDetails, setRiskDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    api.get("/infrastructure/projects").then(({ data }) => setProjects(data.projects || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const assessRisk = async (projectId) => {
    setAssessing(true);
    try {
      const [, projectRes] = await Promise.all([
        api.post(`/infrastructure/projects/${projectId}/assess-risk`).catch(() => null),
        api.get(`/infrastructure/projects/${projectId}`),
      ]);
      const proj = projectRes?.data?.project;
      if (!proj) return;

      const riskData = calculateRiskScore(proj);
      setSelectedProject(projectId);
      setRiskDetails({ ...riskData, project: proj });
      const { data: t } = await api.get(`/infrastructure/projects/${projectId}/risk-trend`);
      setTrends(t.history || []);
    } catch (err) {
      console.error(err);
    } finally {
      setAssessing(false);
    }
  };

  if (loading) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading projects...</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const overallColor = riskDetails ? COLORS[riskDetails.category] : "#38BDF8";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <motion.h2 className="fw-bold mb-0" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Project Risk Scoring Engine</span>
        </motion.h2>
        {assessing && (
          <motion.div variants={itemVariants} className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}>
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Analyzing risk...
          </motion.div>
        )}
      </div>

      <div className="row g-3 mb-4">
        {projects.map((p) => (
          <motion.div className="col-md-3" key={p._id} variants={itemVariants}>
            <div className="tp-card p-3 h-100" style={{ cursor: 'pointer' }} onClick={() => assessRisk(p._id)}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold small" style={{ color: 'var(--tp-text)' }}>{p.name}</span>
                <span className="badge" style={{ background: `${COLORS[p.riskCategory || "Low"]}20`, color: COLORS[p.riskCategory || "Low"], border: `1px solid ${COLORS[p.riskCategory || "Low"]}40` }}>{p.riskCategory || "Low"}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span style={{ color: '#94A3B8' }}>Risk Score:</span>
                <strong style={{ color: (p.riskScore || 0) >= 75 ? "#EF4444" : (p.riskScore || 0) >= 50 ? "#F59E0B" : "#22C55E" }}>
                  {p.riskScore || 0}/100
                </strong>
              </div>
              <div className="progress mt-2" style={{ height: 6 }}>
                <div className="progress-bar" style={{ width: `${p.riskScore || 0}%`, background: COLORS[p.riskCategory || "Low"] }} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {riskDetails && riskDetails.project ? (
        <motion.div className="tp-card p-4 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h5 className="fw-bold mb-4" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Risk Assessment: {riskDetails.project.name}
          </h5>
          <div className="row g-4">
            <div className="col-md-4">
              <h6 className="fw-bold mb-3" style={{ color: '#38BDF8', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-grid-3x3-gap me-1.5"></i>Factor Scores
              </h6>
              <div className="d-flex flex-column gap-3">
                {FACTOR_META.map((f) => {
                  const value = riskDetails.categoryScores?.[f.key] ?? 0;
                  return (
                    <div key={f.key}>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="small" style={{ color: '#94A3B8' }}>{f.label}</span>
                        <strong className="small" style={{ color: f.color }}>{value}/100</strong>
                      </div>
                      <div className="progress" style={{ height: 6, background: 'rgba(148, 163, 184, 0.15)' }}>
                        <div className="progress-bar" style={{ width: `${value}%`, background: f.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-md-4">
              <h6 className="fw-bold mb-3" style={{ color: '#38BDF8', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-bar-chart-fill me-1.5"></i>Weight Distribution
              </h6>
              <div className="d-flex flex-column gap-3">
                {WEIGHT_META.map((w) => {
                  const weight = riskDetails.weights?.[w.key] ?? 0;
                  const pct = Math.round(weight * 100);
                  return (
                    <div key={w.key}>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="small" style={{ color: '#94A3B8' }}>{w.label}</span>
                        <strong className="small" style={{ color: w.color }}>{pct}%</strong>
                      </div>
                      <div className="progress" style={{ height: 6, background: 'rgba(148, 163, 184, 0.15)' }}>
                        <div className="progress-bar" style={{ width: `${pct}%`, background: w.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-md-4">
              <h6 className="fw-bold mb-3" style={{ color: '#38BDF8', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-shield-exclamation me-1.5"></i>Overall Risk
              </h6>
              <div style={{ background: `${overallColor}18`, border: `1px solid ${overallColor}50`, borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="small" style={{ color: '#94A3B8' }}>Risk Score</span>
                  <span className="badge" style={{ background: `${overallColor}25`, color: overallColor, border: `1px solid ${overallColor}60` }}>{riskDetails.category}</span>
                </div>
                <div className="d-flex align-items-end gap-2 mb-3">
                  <strong style={{ color: overallColor, fontSize: '2.4rem', lineHeight: 1, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{riskDetails.score}</strong>
                  <span style={{ color: '#94A3B8' }}>/100</span>
                </div>
                <div className="progress mb-3" style={{ height: 8, background: 'rgba(148, 163, 184, 0.15)' }}>
                  <div className="progress-bar" style={{ width: `${riskDetails.score}%`, background: overallColor }} />
                </div>
              </div>
              <p className="small mt-3 mb-0" style={{ color: '#94A3B8' }}>{riskDetails.shapExplanation || "Risk assessment based on multiple factors."}</p>
            </div>
          </div>
        </motion.div>
      ) : (
        !assessing && (
          <motion.div className="tp-card p-5 mb-4 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <i className="bi bi-clipboard-data" style={{ fontSize: '2.5rem', color: '#38BDF8' }}></i>
            <p className="mb-0 mt-3" style={{ color: '#94A3B8' }}>Select a project to run a risk assessment.</p>
          </motion.div>
        )
      )}

      {trends.length > 0 && (
        <div className="tp-card p-4 mb-4">
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Risk Trend History</h6>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Date</th><th>Risk Score</th><th>Category</th><th>Trend</th></tr></thead>
              <tbody>
                {trends.map((t, i) => (
                  <tr key={i}>
                    <td style={{ color: '#94A3B8' }}>{new Date(t.recordedAt).toLocaleDateString()}</td>
                    <td style={{ color: 'var(--tp-text)' }}>{t.riskScore}</td>
                    <td style={{ color: 'var(--tp-text)' }}>{t.riskCategory}</td>
                    <td style={{ color: 'var(--tp-text)' }}>{t.trendDirection}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default RiskScoringPage;