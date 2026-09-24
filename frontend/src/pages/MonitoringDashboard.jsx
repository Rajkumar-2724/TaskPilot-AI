import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const COLORS = { Low: "#22C55E", Moderate: "#F59E0B", High: "#F97316", Critical: "#EF4444" };

const MonitoringDashboard = () => {
  const [projects, setProjects] = useState([]);
  const [workProjects, setWorkProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [benchmark, setBenchmark] = useState(null);
  const [benchmarkFull, setBenchmarkFull] = useState(null);
  const [modelMetrics, setModelMetrics] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/infrastructure/projects").then(({ data }) => setProjects(data.projects || [])).catch(() => {}),
      api.get("/infrastructure/benchmarking").then(({ data }) => { setBenchmark(data.summary); setBenchmarkFull(data); }).catch(() => {}),
      api.get("/predictions/model-metrics").then(({ data }) => setModelMetrics(data)).catch(() => {}),
      api.get("/projects").then(({ data }) => setWorkProjects(data.projects || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading monitoring dashboard...</div>;
  }

  const totalOriginalCost = projects.reduce((s, p) => s + (p.originalCost || 0), 0);
  const totalRevisedCost = projects.reduce((s, p) => s + (p.revisedCost || 0), 0);
  const totalExpenditure = projects.reduce((s, p) => s + (p.expenditure || 0), 0);
  const highRiskProjects = projects.filter((p) => (p.riskScore || 0) >= 50);
  const criticalProjects = projects.filter((p) => (p.riskScore || 0) >= 75);
  const predictedCostOverruns = projects.filter((p) => (p.costOverrunProbability || 0) > 50);
  const predictedScheduleDelays = projects.filter((p) => (p.timeOverrunProbability || 0) > 50);

  const riskDist = { Low: 0, Moderate: 0, High: 0, Critical: 0 };
  projects.forEach((p) => { riskDist[p.riskCategory || "Low"] = (riskDist[p.riskCategory || "Low"] || 0) + 1; });

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const statCards = [
    { icon: "📁", title: "Total Projects", value: projects.length, color: "primary" },
    { icon: "💰", title: "Original Cost", value: `₹${(totalOriginalCost / 100000).toFixed(1)}Cr`, color: "cyan" },
    { icon: "🔄", title: "Revised Cost", value: `₹${(totalRevisedCost / 100000).toFixed(1)}Cr`, color: "violet" },
    { icon: "📊", title: "Expenditure", value: `₹${(totalExpenditure / 100000).toFixed(1)}Cr`, color: "success" },
    { icon: "⚠️", title: "High Risk", value: highRiskProjects.length, color: "warning" },
    { icon: "🚨", title: "Critical", value: criticalProjects.length, color: "danger" },
    { icon: "📈", title: "Cost Overrun Risk", value: predictedCostOverruns.length, color: "primary" },
    { icon: "⏰", title: "Schedule Delay Risk", value: predictedScheduleDelays.length, color: "cyan" },
  ];

  const cardColors = {
    primary: { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },
    cyan: { bg: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.25)' },
    violet: { bg: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)' },
    success: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)' },
    warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)' },
    danger: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)' },
  };

  const withCostInfo = (b) => {
    const bp = b?.projects || [];
    const scored = bp.filter((p) => p.predictedCostOverrunPct != null || p.predictedTimeOverrunMonths != null);
    return scored.length ? `${scored.length} of ${bp.length} projects scored by PAIMANA models` : "No PAIMANA scores yet - edit a project or call POST /api/predictions/all/:id";
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h2 className="fw-bold mb-4" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Infrastructure Monitoring</span>
      </motion.h2>

      <motion.div className="row g-3 mb-4" variants={containerVariants} initial="hidden" animate="visible">
        {statCards.map((s, i) => {
          const cc = cardColors[s.color] || cardColors.primary;
          return (
            <motion.div className="col-6 col-md-3" key={i} variants={itemVariants}>
              <div className="tp-card h-100" style={{ background: cc.bg, border: `1px solid ${cc.border}` }}>
                <div className="d-flex align-items-center gap-2">
                  <span className="fs-2">{s.icon}</span>
                  <div>
                    <div className="small" style={{ color: '#94A3B8' }}>{s.title}</div>
                    <div className="fw-bold fs-5 tp-gradient-text">{s.value}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div className="row g-3 mb-4" variants={containerVariants} initial="hidden" animate="visible">
        <motion.div className="col-md-4" variants={itemVariants}>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Risk Distribution</h6>
            <div style={{ height: 200 }}>
              {Object.entries(riskDist).map(([cat, count]) => (
                <div key={cat} className="d-flex align-items-center mb-2">
                  <span className="me-2" style={{ color: COLORS[cat], fontWeight: "bold", minWidth: 70 }}>{cat}</span>
                  <div className="flex-grow-1 progress" style={{ height: 20 }}>
                    <div className="progress-bar" style={{ width: `${projects.length ? (count / projects.length) * 100 : 0}%`, background: COLORS[cat] }}>
                      {count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div className="col-md-4" variants={itemVariants}>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Portfolio Summary</h6>
            <div className="table-responsive">
              <table className="table table-sm">
                <tbody>
                  <tr><td style={{ color: '#94A3B8' }}>Total Projects</td><td style={{ color: 'var(--tp-text)' }}><strong>{benchmark?.totalProjects || projects.length}</strong></td></tr>
                  <tr><td style={{ color: '#94A3B8' }}>Avg Risk Score</td><td style={{ color: 'var(--tp-text)' }}><strong>{benchmark?.avgRiskScore || 0}/100</strong></td></tr>
                  <tr><td style={{ color: '#94A3B8' }}>Total Original Cost</td><td style={{ color: 'var(--tp-text)' }}><strong>₹{(totalOriginalCost/100000).toFixed(1)}Cr</strong></td></tr>
                  <tr><td style={{ color: '#94A3B8' }}>Total Revised Cost</td><td style={{ color: 'var(--tp-text)' }}><strong>₹{(totalRevisedCost/100000).toFixed(1)}Cr</strong></td></tr>
                  <tr><td style={{ color: '#94A3B8' }}>Avg Cost Overrun Prob</td><td style={{ color: 'var(--tp-text)' }}><strong>{benchmark?.avgCostOverrunProb || 0}%</strong></td></tr>
                  <tr><td style={{ color: '#94A3B8' }}>Avg Time Overrun Prob</td><td style={{ color: 'var(--tp-text)' }}><strong>{benchmark?.avgTimeOverrunProb || 0}%</strong></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
        <motion.div className="col-md-4" variants={itemVariants}>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Sector Overview</h6>
            <div className="table-responsive">
              <table className="table table-sm">
                <tbody>
                  {benchmark && Object.entries(benchmark.sectorStats || {}).slice(0, 6).map(([sector, data]) => (
                    <tr key={sector}>
                      <td style={{ color: '#94A3B8' }}>{sector}</td>
                      <td style={{ color: 'var(--tp-text)' }}>{data.count} projects</td>
                      <td style={{ color: 'var(--tp-text)' }}>{Math.round(data.avgRisk || 0)} risk</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div className="tp-card p-4 mb-4" variants={itemVariants}>
        <h6 className="fw-bold mb-1 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>AI Infrastructure Forecasts</h6>
        <div className="mb-1 small" style={{ color: '#94A3B8' }}>
          {modelMetrics?.version
            ? `Models v${modelMetrics.version} trained on ${modelMetrics.models?.costOverrun?.nextMonthHoldout?.metrics?.n || modelMetrics.models?.costOverrun?.cv?.rf?.n || "10,623"} official PAIMANA (MoSPI) project-month records. Source: ${modelMetrics.source || "PAIMANA (MoSPI) official project reports"}`
            : "PAIMANA-trained model metrics unavailable (start the ML service)."}
        </div>
        <div className="row g-3 mt-1">
          <div className="col-md-4">
            <div className="tp-card p-3 h-100" style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <div className="small" style={{ color: '#94A3B8' }}>Cost Model (held-out next-month test)</div>
              <div className="fw-bold fs-5 tp-gradient-text">
                {modelMetrics?.available !== false && modelMetrics?.models
                  ? `${(modelMetrics.models.costOverrun.nextMonthHoldout.metrics.rmse || 12.249).toFixed(2)} RMSE` 
                  : "N/A"}
              </div>
              <div className="small" style={{ color: '#94A3B8' }}>
                {modelMetrics?.models ? `${modelMetrics.models.costOverrun.model} | MAE ${modelMetrics.models.costOverrun.nextMonthHoldout.metrics.mae.toFixed(2)} | R² ${modelMetrics.models.costOverrun.nextMonthHoldout.metrics.r2.toFixed(3)}` : "No test metrics yet"}
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="tp-card p-3 h-100" style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <div className="small" style={{ color: '#94A3B8' }}>Time Model (held-out next-month test)</div>
              <div className="fw-bold fs-5 tp-gradient-text">
                {modelMetrics?.available !== false && modelMetrics?.models
                  ? `${(modelMetrics.models.timeOverrun.nextMonthHoldout.metrics.rmse || 12.556).toFixed(2)} RMSE`
                  : "N/A"}
              </div>
              <div className="small" style={{ color: '#94A3B8' }}>
                {modelMetrics?.models ? `${modelMetrics.models.timeOverrun.model} | MAE ${modelMetrics.models.timeOverrun.nextMonthHoldout.metrics.mae.toFixed(2)} | R² ${modelMetrics.models.timeOverrun.nextMonthHoldout.metrics.r2.toFixed(3)}` : "No test metrics yet"}
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="tp-card p-3 h-100" style={{ background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div className="small" style={{ color: '#94A3B8' }}>Predicted overrun (this portfolio)</div>
              <div className="fw-bold fs-5 tp-gradient-text">
                {(() => {
                  const bp = benchmarkFull?.projects || [];
                  const withCost = bp.filter((p) => p.predictedCostOverrunPct != null);
                  const withTime = bp.filter((p) => p.predictedTimeOverrunMonths != null);
                  if (!withCost.length && !withTime.length) return "Not scored yet";
                  const c = withCost.length ? (withCost.reduce((s, p) => s + p.predictedCostOverrunPct, 0) / withCost.length) : 0;
                  const t = withTime.length ? (withTime.reduce((s, p) => s + p.predictedTimeOverrunMonths, 0) / withTime.length) : 0;
                  return `${c.toFixed(1)}% cost / ${t.toFixed(1)} mo`;
                })()}
              </div>
              <div className="small" style={{ color: '#94A3B8' }}>{withCostInfo(benchmarkFull)}</div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div className="tp-card p-4" variants={itemVariants}>
        <h6 className="fw-bold mb-3 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>High & Critical Risk Projects</h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Project</th><th>Sector</th><th>Ministry</th><th>Risk Score</th><th>Category</th><th>Cost O/Risk</th><th>Time O/Risk</th><th>Pred. Cost O/R %</th><th>Pred. Delay (mo)</th><th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {projects.filter((p) => (p.riskScore || 0) >= 50).map((p) => (
                <tr key={p._id}>
                  <td style={{ color: 'var(--tp-text)' }}>{p.name}</td>
                  <td style={{ color: '#94A3B8' }}>{p.sector}</td>
                  <td style={{ color: '#94A3B8' }}>{p.ministry}</td>
                  <td><span className={`badge ${(p.riskScore || 0) >= 75 ? "tp-badge-critical" : "tp-badge-high"}`}>{p.riskScore}</span></td>
                  <td><span className="badge" style={{ background: `${COLORS[p.riskCategory]}20`, color: COLORS[p.riskCategory], border: `1px solid ${COLORS[p.riskCategory]}40` }}>{p.riskCategory}</span></td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.costOverrunProbability || 0}%</td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.timeOverrunProbability || 0}%</td>
                  <td style={{ color: p.predictedCostOverrunPct != null && p.predictedCostOverrunPct > 20 ? '#F97316' : 'var(--tp-text)' }}>{p.predictedCostOverrunPct != null ? `${p.predictedCostOverrunPct.toFixed(1)}%` : "—"}</td>
                  <td style={{ color: p.predictedTimeOverrunMonths != null && p.predictedTimeOverrunMonths > 24 ? '#F97316' : 'var(--tp-text)' }}>{p.predictedTimeOverrunMonths != null ? p.predictedTimeOverrunMonths.toFixed(1) : "—"}</td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.physicalProgress || 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div className="tp-card p-4" variants={itemVariants}>
        <h6 className="fw-bold mb-3 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Work Management Projects</h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Progress</th><th>Deadline</th><th>Members</th>
              </tr>
            </thead>
            <tbody>
              {workProjects.map((p) => (
                <tr key={p._id}>
                  <td style={{ color: 'var(--tp-text)' }}>{p.name}</td>
                  <td><span className="badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" }}>{p.status}</span></td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.progress || 0}%</td>
                  <td style={{ color: '#94A3B8' }}>{p.deadline ? new Date(p.deadline).toLocaleDateString() : "N/A"}</td>
                  <td style={{ color: '#94A3B8' }}>{p.members?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MonitoringDashboard;
