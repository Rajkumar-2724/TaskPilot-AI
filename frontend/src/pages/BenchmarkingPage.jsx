import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const COLORS = ["#6366F1", "#38BDF8", "#A78BFA", "#22C55E", "#F59E0B", "#EF4444"];

const BenchmarkingPage = () => {
  const [data, setData] = useState(null);
  const [workProjects, setWorkProjects] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/infrastructure/benchmarking").then(({ data: d }) => {
        setData(d);
        setLoading(false);
      }).catch(() => setLoading(false)),
      api.get("/predictions/model-metrics").then(({ data }) => setModelMetrics(data)).catch(() => {}),
      api.get("/projects").then(({ data }) => setWorkProjects(data.projects || [])).catch(() => {}),
    ]);
  }, []);

  if (loading) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading benchmarking data...</div>;
  if (!data) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>No data available</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const tooltipStyle = {
    background: 'var(--tp-surface-elevated)',
    border: '1px solid var(--tp-glass-border)',
    borderRadius: 14,
    color: 'var(--tp-text)',
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h2 className="fw-bold mb-4" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Benchmarking & Comparative Analytics</span>
      </motion.h2>

      <div className="row g-3 mb-4">
        {[
          { icon: "📁", label: "Total Projects", value: data.summary.totalProjects },
          { icon: "💰", label: "Total Original Cost", value: `₹${(data.summary.totalOriginalCost/100000).toFixed(1)}Cr` },
          { icon: "⚠️", label: "Avg Risk Score", value: data.summary.avgRiskScore },
          { icon: "📈", label: "Avg Cost Overrun", value: `${data.summary.avgCostOverrunProb}%` },
        ].map((s, i) => (
          <motion.div className="col-md-3" key={i} variants={itemVariants}>
            <div className="tp-card p-4 text-center">
              <div className="fs-1 mb-2">{s.icon}</div>
              <div className="fw-bold fs-4 tp-gradient-text">{s.value}</div>
              <div style={{ color: '#94A3B8' }}>{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {modelMetrics?.models && (
        <div className="tp-card p-4 mb-4" variants={itemVariants}>
          <h6 className="fw-bold mb-1 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Model Test Benchmarks (held-out PAIMANA data)</h6>
          <div className="mb-3 small" style={{ color: '#94A3B8' }}>
            Candidate models compared on {modelMetrics.source || "official PAIMANA (MoSPI) project reports"} v{modelMetrics.version}. CV = project-held-out cross-validation; Holdout = projects from the next unseen month. Selected model = best CV RMSE.
          </div>
          {["costOverrun", "timeOverrun"].map((key) => {
            const target = modelMetrics.models[key];
            const rows = ["rf", "gb", "xgb"].map((cv) => ({
              cv: cv.toUpperCase(),
              ...target.cv[cv],
              selected: target.model === cv,
            }));
            return (
              <div className="row g-3 mb-3" key={key}>
                <div className="col-12">
                  <h6 className="fw-bold mb-2" style={{ color: 'var(--tp-text)' }}>{key === "costOverrun" ? "Cost Overrun Prediction (%)" : "Time Overrun Prediction (months)"}</h6>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead><tr><th>Candidate</th><th>CV MAE</th><th>CV RMSE</th><th>CV R²</th><th>CV MAPE</th><th>Holdout MAE</th><th>Holdout RMSE</th><th>Holdout R²</th><th>Selected</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.cv}>
                            <td style={{ color: 'var(--tp-text)' }}><strong>{r.cv}</strong></td>
                            <td style={{ color: '#94A3B8' }}>{r.mae?.toFixed(3)}</td>
                            <td style={{ color: '#94A3B8' }}>{r.rmse?.toFixed(3)}</td>
                            <td style={{ color: '#94A3B8' }}>{r.r2?.toFixed(3)}</td>
                            <td style={{ color: '#94A3B8' }}>{r.mape != null ? `${r.mape.toFixed(2)}%` : "—"}</td>
                            <td style={{ color: '#94A3B8' }}>{target.nextMonthHoldout.metrics.mae.toFixed(3)}</td>
                            <td style={{ color: '#94A3B8' }}>{target.nextMonthHoldout.metrics.rmse.toFixed(3)}</td>
                            <td style={{ color: '#94A3B8' }}>{target.nextMonthHoldout.metrics.r2.toFixed(3)}</td>
                            <td>{r.selected ? <span className="badge tp-badge-low">✓</span> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="small" style={{ color: '#94A3B8' }}>
                    Selected: <strong style={{ color: 'var(--tp-text)' }}>{target.model.toUpperCase()}</strong> — trained on {target.cv.rf.n ?? target.nextMonthHoldout.trainRows} project-month rows; tested on {target.nextMonthHoldout.testRows} unseen project-month rows. Trimmed MAPE (small-target rows excluded).
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="row g-3 mb-4">
        <motion.div className="col-md-6" variants={itemVariants}>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Risk Distribution</h6>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={Object.entries(data.summary.riskDistribution).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {Object.entries(data.summary.riskDistribution).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        <motion.div className="col-md-6" variants={itemVariants}>
          <div className="tp-card p-4">
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Ministry Comparison</h6>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(data.ministryStats || {}).map(([name, stats]) => ({ name, count: stats.count, avgRisk: Math.round(stats.avgRisk || 0) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="rgba(56, 189, 248, 0.1)" />
                <XAxis dataKey="name" fontSize={10} stroke="rgba(148, 163, 184, 0.5)" />
                <YAxis fontSize={10} stroke="rgba(148, 163, 184, 0.5)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avgRisk" fill="#6366F1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="tp-card p-4">
        <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Project Comparison Table</h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead><tr><th>Project</th><th>Sector</th><th>Ministry</th><th>Original Cost</th><th>Revised Cost</th><th>Physical Progress</th><th>Pred. Cost O/R %</th><th>Pred. Delay (mo)</th><th>Risk Score</th><th>Risk Category</th></tr></thead>
            <tbody>
              {data.projects.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--tp-text)' }}>{p.name}</td>
                  <td style={{ color: '#94A3B8' }}>{p.sector}</td>
                  <td style={{ color: '#94A3B8' }}>{p.ministry}</td>
                  <td style={{ color: '#94A3B8' }}>₹{(p.originalCost/100000).toFixed(1)}Cr</td>
                  <td style={{ color: '#94A3B8' }}>₹{(p.revisedCost/100000).toFixed(1)}Cr</td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.physicalProgress}%</td>
                  <td style={{ color: p.predictedCostOverrunPct != null && p.predictedCostOverrunPct > 20 ? '#F97316' : 'var(--tp-text)' }}>{p.predictedCostOverrunPct != null ? `${p.predictedCostOverrunPct.toFixed(1)}%` : "—"}</td>
                  <td style={{ color: p.predictedTimeOverrunMonths != null && p.predictedTimeOverrunMonths > 24 ? '#F97316' : 'var(--tp-text)' }}>{p.predictedTimeOverrunMonths != null ? p.predictedTimeOverrunMonths.toFixed(1) : "—"}</td>
                  <td><span className={`badge ${p.riskScore >= 75 ? "tp-badge-critical" : p.riskScore >= 50 ? "tp-badge-high" : "tp-badge-low"}`}>{p.riskScore}</span></td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.riskCategory}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {workProjects.length > 0 && (
        <div className="tp-card p-4 mt-4">
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Work Management Projects</h6>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Deadline</th><th>Members</th></tr></thead>
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
        </div>
      )}
    </motion.div>
  );
};

export default BenchmarkingPage;
