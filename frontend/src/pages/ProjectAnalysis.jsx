import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";

const TABS = [
  { id: "overview", label: "Overview", icon: "bi-grid-1x2" },
  { id: "cost", label: "Cost Analysis", icon: "bi-cash-stack" },
  { id: "schedule", label: "Schedule Analysis", icon: "bi-calendar3" },
  { id: "progress", label: "Progress Analysis", icon: "bi-graph-up" },
  { id: "risk", label: "Risk Analysis", icon: "bi-shield-exclamation" },
  { id: "milestones", label: "Milestones", icon: "bi-flag" },
  { id: "whatif", label: "What-If", icon: "bi-lightbulb" },
  { id: "drivers", label: "Cost Drivers", icon: "bi-diagram-3" },
  { id: "benchmark", label: "Benchmarking", icon: "bi-bar-chart-line" },
  { id: "recommendations", label: "Recommendations", icon: "bi-clipboard-check" },
  { id: "explanation", label: "Model Explanation", icon: "bi-cpu" },
  { id: "sufficiency", label: "Data Sufficiency", icon: "bi-database-check" },
];

const riskColor = (c) =>
  c === "Critical" ? "#EF4444" : c === "High" ? "#F97316" : c === "Moderate" ? "#F59E0B" : "#22C55E";

const fmtCr = (n) => {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 100000) return `₹${(num / 100000).toFixed(2)} Cr`;
  if (Math.abs(num) >= 1000) return `₹${(num / 1000).toFixed(1)} L`;
  return `₹${num.toLocaleString("en-IN")}`;
};

const Stat = ({ label, value, sub, color = "#38BDF8" }) => (
  <div className="tp-card p-3 h-100">
    <div className="small mb-1" style={{ color: "#94A3B8" }}>{label}</div>
    <div className="fw-bold fs-5" style={{ color }}>{value}</div>
    {sub && <div className="small text-muted">{sub}</div>}
  </div>
);

const ProjectAnalysis = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [plannedVsActual, setPlannedVsActual] = useState(null);
  const [history, setHistory] = useState(null);
  const [riskTrend, setRiskTrend] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [benchmark, setBenchmark] = useState(null);
  const [featureImportance, setFeatureImportance] = useState(null);
  const [isInfra, setIsInfra] = useState(true);
  const [assessing, setAssessing] = useState(false);

  // What-if state
  const [sim, setSim] = useState({ resourceAllocation: 100, expenditureRate: 100, milestoneCompletion: 0, scheduleAdjustment: 0, contractChangeImpact: 0 });
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        let p;
        try {
          const { data } = await api.get(`/infrastructure/projects/${id}`);
          p = { ...data.project, projectType: "InfrastructureProject" };
          setIsInfra(true);
        } catch {
          const { data } = await api.get(`/projects/${id}`);
          p = { ...data.project, projectType: data.project?.projectType || "Project" };
          setIsInfra(data.project?.projectType === "InfrastructureProject");
        }
        if (!mounted) return;
        setProject(p);

        const q = [];
        q.push(api.get(`/projects/${id}/planned-vs-actual`).then(({ data }) => setPlannedVsActual(data)).catch(() => {}));
        q.push(api.get(`/projects/${id}/history`).then(({ data }) => setHistory(data)).catch(() => {}));
        q.push(api.get(`/infrastructure/projects/${id}/risk-trend`).then(({ data }) => setRiskTrend(data)).catch(() => {}));
        q.push(api.get(`/infrastructure/projects/${id}/alerts`).then(({ data }) => setAlerts(data.alerts || [])).catch(() => {}));
        q.push(api.get(`/infrastructure/projects/${id}/recommendations`).then(({ data }) => setRecommendations(data.recommendations || [])).catch(() => {}));
        q.push(api.get(`/infrastructure/benchmarking`).then(({ data }) => setBenchmark(data || null)).catch(() => {}));
        q.push(api.get(`/predictions/feature-importance/${id}`).then(({ data }) => setFeatureImportance(data.featureImportance || null)).catch(() => {}));
        await Promise.all(q);
      } catch {
        toast.error("Failed to load project analysis");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id]);

  const runRiskAssessment = async () => {
    if (!isInfra) return;
    setAssessing(true);
    try {
      const { data } = await api.post(`/predictions/risk/${id}`);
      const a = data.assessment || data;
      toast.success(`Risk assessment complete: ${a.riskCategory || ""} (${a.riskScore || ""}/100)`);
      api.get(`/predictions/feature-importance/${id}`).then(({ data }) => setFeatureImportance(data.featureImportance || null)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || "Risk assessment failed");
    } finally {
      setAssessing(false);
    }
  };

  const runSimulation = async () => {
    if (!isInfra) return;
    setSimLoading(true);
    try {
      const { data } = await api.post(`/predictions/simulate/${id}`, { modifications: sim });
      const simo = data.simulation?.results || data.simulation;
      setSimResult(simo);
    } catch (err) {
      toast.error(err.response?.data?.message || "Simulation failed");
    } finally {
      setSimLoading(false);
    }
  };

  const benchmarkData = useMemo(() => {
    if (!benchmark?.sectorStats || !project) return null;
    const sec = project.sector;
    const data = benchmark.sectorStats[sec];
    if (!data) return null;
    return {
      risk: data.avgRisk || 0,
      portfolioRisk: benchmark.summary?.avgRiskScore || 0,
    };
  }, [benchmark, project]);

  const progressTrend = useMemo(() => {
    const src = plannedVsActual?.trend || history?.progress || [];
    return src.map((p) => ({ period: p.period || p.reportingPeriod, planned: p.planned ?? p.plannedProgress, actual: p.actual ?? p.physicalProgress }));
  }, [plannedVsActual, history]);

  const riskChartData = useMemo(() => {
    const src = riskTrend?.history || history?.riskHistory || [];
    return src.map((r, i) => ({ period: new Date(r.recordedAt).toLocaleDateString(), score: r.riskScore || r.score, index: i }));
  }, [riskTrend, history]);

  const suff = null;

  if (loading) return <div className="tp-skeleton" style={{ height: 420, borderRadius: 16 }} />;
  if (!project) return <div className="tp-glass p-5 text-center">Project not found</div>;

  const v = plannedVsActual?.variances || {};
  const latest = plannedVsActual?.latest || {};
  const inf = project;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="d-flex align-items-center gap-2 mb-1">
        <Link to={`/app/projects/${id}`} className="btn btn-sm btn-outline-light rounded-circle p-1" style={{ width: 30, height: 30 }}>
          <i className="bi bi-chevron-left" />
        </Link>
        <h4 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Project Analysis</span>
        </h4>
        <span className="badge ms-2" style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}>
          {project.name}
        </span>
      </div>
      <p className="mb-4 ms-4 small" style={{ color: "#94A3B8" }}>
        {project.projectCode} · {project.sector || project.category || ""} · {project.status}
      </p>
      {!isInfra && (
        <div className="tp-box-subtle mb-3 p-3">
          Regular project — deep analytics (risk engine, cost drivers, what-if, benchmarking) apply to <strong>Infrastructure</strong> projects.
        </div>
      )}

      <div className="d-flex gap-2 flex-wrap mb-4">
        {TABS.map((t) => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? "tp-btn-primary" : "btn-light"}`} style={{ borderRadius: 12 }} onClick={() => setTab(t.id)}>
            <i className={`bi ${t.icon} me-1`} /> {t.label}
          </button>
        ))}
      </div>

      <div className="tp-card p-4">
        {/* ---------- OVERVIEW ---------- */}
        {tab === "overview" && (
          <>
            <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>Executive Overview</h6>
            <div className="row g-3 mb-3">
              <div className="col-6 col-md-3"><Stat label="Original Cost" value={fmtCr(inf.originalCost)} /></div>
              <div className="col-6 col-md-3"><Stat label="Revised Cost" value={fmtCr(inf.revisedCost)} color="#F59E0B" /></div>
              <div className="col-6 col-md-3"><Stat label="Expenditure" value={fmtCr(inf.expenditure)} color="#22C55E" /></div>
              <div className="col-6 col-md-3"><Stat label="Physical Progress" value={`${inf.physicalProgress || 0}%`} color="#6366F1" /></div>
              <div className="col-6 col-md-3"><Stat label="Risk Score" value={`${inf.riskScore || 0}/100`} color={riskColor(inf.riskCategory)} sub={inf.riskCategory} /></div>
              <div className="col-6 col-md-3"><Stat label="Cost Overrun Prob." value={`${inf.costOverrunProbability || 0}%`} color="#F97316" /></div>
              <div className="col-6 col-md-3"><Stat label="Time Overrun Prob." value={`${inf.timeOverrunProbability || 0}%`} color="#F97316" /></div>
              <div className="col-6 col-md-3"><Stat label="Est. Delay" value={`${inf.predictedDelayDays || 0} days`} color="#EF4444" /></div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button className="tp-btn-primary" onClick={runRiskAssessment} disabled={assessing || !isInfra}>
                {assessing ? "Assessing..." : <><i className="bi bi-shield-check me-1" /> Re-assess Risk</>}
              </button>
              <button className="btn btn-light" onClick={() => setTab("sufficiency")}><i className="bi bi-database-check me-1" /> Data Sufficiency</button>
            </div>
          </>
        )}

        {/* ---------- COST ---------- */}
        {tab === "cost" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Cost Analysis</h6>
            <div className="row g-3 mb-3">
              <div className="col-md-4"><Stat label="Cost Variance (revised − original)" value={fmtCr(v.costVariance)} sub={`${v.costVariancePct}% · ${v.costSeverity}`} color={v.costVariancePct > 0 ? "#EF4444" : "#22C55E"} /></div>
              <div className="col-md-4"><Stat label="Expenditure vs Expected" value={fmtCr(v.expenditureVariance)} sub={`${v.expenditureSeverity}`} color={v.expenditureVariance > 0 ? "#F97316" : "#22C55E"} /></div>
              <div className="col-md-4"><Stat label="Cost Overrun Probability" value={`${inf.costOverrunProbability || 0}%`} sub={`Predicted final cost ${fmtCr(inf.predictedFinalCost)}`} color="#F97316" /></div>
            </div>
            <p className="small mb-0" style={{ color: "#94A3B8" }}>
              Expected expenditure at {latest.plannedProgress ?? "planned"}% progress: {fmtCr(latest.expectedExpenditure)} vs actual spent {fmtCr(latest.expenditure)}.
            </p>
          </>
        )}

        {/* ---------- SCHEDULE ---------- */}
        {tab === "schedule" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Schedule Analysis</h6>
            <div className="row g-3">
              <div className="col-md-4"><Stat label="Planned Duration" value={`${inf.plannedDuration || 0} months`} /></div>
              <div className="col-md-4"><Stat label="Actual Duration" value={`${inf.actualDuration || 0} months`} color="#F59E0B" /></div>
              <div className="col-md-4"><Stat label="Schedule Variance" value={`${v.scheduleVarianceMonths || 0} months`} sub={v.scheduleSeverity} color={Math.abs(v.scheduleVarianceMonths || 0) > 0 ? "#EF4444" : "#22C55E"} /></div>
              <div className="col-md-4"><Stat label="Time Overrun Probability" value={`${inf.timeOverrunProbability || 0}%`} color="#F97316" /></div>
              <div className="col-md-4"><Stat label="Predicted Delay" value={`${inf.predictedDelayDays || 0} days`} color="#EF4444" /></div>
              <div className="col-md-4"><Stat label="Time Remaining" value={plannedVsActual?.timeRemainingMonths != null ? `${plannedVsActual.timeRemainingMonths} months` : "—"} sub={new Date(inf.plannedEndDate).toLocaleDateString()} /></div>
            </div>
          </>
        )}

        {/* ---------- PROGRESS ---------- */}
        {tab === "progress" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Progress vs Plan</h6>
            {progressTrend.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={progressTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="period" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                    <Legend />
                    <Line type="monotone" dataKey="planned" stroke="#6366F1" dot={false} name="Planned %" />
                    <Line type="monotone" dataKey="actual" stroke="#22C55E" dot={false} name="Actual %" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="table-responsive mt-3">
                  <table className="table table-sm">
                    <thead><tr style={{ color: "#94A3B8", fontSize: "0.8rem" }}><th>Period</th><th>Planned</th><th>Actual</th><th>Variance</th></tr></thead>
                    <tbody>
                      {progressTrend.map((p, i) => (
                        <tr key={i}>
                          <td style={{ color: "var(--tp-text)" }}>{p.period}</td>
                          <td>{p.planned ?? "—"}</td>
                          <td>{p.actual ?? "—"}</td>
                          <td style={{ color: ((p.actual ?? 0) - (p.planned ?? 0)) < 0 ? "#EF4444" : "#22C55E" }}>{p.actual != null && p.planned != null ? `${Math.round((p.actual - p.planned) * 10) / 10} pts` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="small" style={{ color: "#94A3B8" }}>
                No monthly progress updates recorded yet. Add updates from the project page, or import historical data.
              </p>
            )}
            {!isInfra && <Link to="/app/import" className="btn btn-sm btn-light mt-2"><i className="bi bi-upload me-1" /> Import project data</Link>}
          </>
        )}

        {/* ---------- RISK ---------- */}
        {tab === "risk" && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Risk Trend & Acceleration</h6>
              <button className="btn btn-sm btn-light" onClick={runRiskAssessment} disabled={assessing || !isInfra}><i className="bi bi-shield-check me-1" /> Re-assess</button>
            </div>
            {riskChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={riskChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="period" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                  <Line type="monotone" dataKey="score" stroke="#EF4444" name="Risk Score" dot={true} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="small" style={{ color: "#94A3B8" }}>No risk history recorded. Run a risk assessment to generate the first trend point.</p>}
            {riskTrend?.acceleration && (
              <div className="tp-box-subtle mt-3 p-3">
                <strong style={{ color: "#F97316" }}><i className="bi bi-activity me-1" /> {riskTrend.acceleration.flag}</strong>
                <div className="small text-muted">Slope {riskTrend.acceleration.slope >= 0 ? "+" : ""}{riskTrend.acceleration.slope} pts/period · {riskTrend.acceleration.consecutiveIncreases} consecutive increase(s) · Persistent high risk: {riskTrend.acceleration.persistentHighRisk ? "yes" : "no"}</div>
              </div>
            )}
            {alerts.length > 0 && (
              <div className="mt-3">
                <div className="small fw-bold mb-2 text-uppercase" style={{ color: "#94A3B8" }}>Active alerts</div>
                {alerts.slice(0, 5).map((a) => (
                  <div key={a._id} className="d-flex align-items-center gap-2 mb-1 small" style={{ color: "var(--tp-text)" }}>
                    <i className="bi bi-bell" style={{ color: a.severity === "Critical" ? "#EF4444" : "#F59E0B" }} /> {a.title}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------- MILESTONES ---------- */}
        {tab === "milestones" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Milestones</h6>
            {(history?.milestones?.length || 0) === 0 && (inf.milestones?.length || 0) === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No milestones defined.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead><tr style={{ color: "#94A3B8", fontSize: "0.8rem" }}><th>Title</th><th>Planned</th><th>Status</th><th>Completion</th></tr></thead>
                  <tbody>
                    {(history?.milestones || inf.milestones || []).map((m) => (
                      <tr key={m._id}>
                        <td style={{ color: "var(--tp-text)" }}>{m.title}</td>
                        <td>{m.plannedEndDate ? new Date(m.plannedEndDate).toLocaleDateString() : "—"}</td>
                        <td><span className="badge" style={{ background: m.status === "Completed" ? "rgba(34,197,94,0.15)" : m.status === "In Progress" ? "rgba(56,189,248,0.15)" : "rgba(148,163,184,0.15)", color: m.status === "Completed" ? "#22C55E" : m.status === "In Progress" ? "#38BDF8" : "#94A3B8" }}>{m.status}</span></td>
                        <td>{m.completionPercentage ?? m.physicalProgress ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ---------- WHAT-IF ---------- */}
        {tab === "whatif" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>What-If Scenario Analysis</h6>
            {!isInfra ? (
              <p className="small" style={{ color: "#94A3B8" }}>What-if analysis is available for infrastructure projects.</p>
            ) : (
              <>
                <div className="row g-3 mb-3">
                  {[
                    ["resourceAllocation", "Resource Allocation %", 60, 120],
                    ["expenditureRate", "Expenditure Rate %", 60, 150],
                    ["milestoneCompletion", "Milestone Boost pts", -20, 30],
                    ["scheduleAdjustment", "Schedule Adjustment (mo)", -12, 12],
                    ["contractChangeImpact", "Contract Change Impact (₹ L)", -500, 1500],
                  ].map(([key, label, min, max]) => (
                    <div className="col-md-4" key={key}>
                      <label className="form-label small" style={{ color: "#94A3B8" }}>{label}: <strong style={{ color: "#38BDF8" }}>{sim[key]}</strong></label>
                      <input type="range" className="form-range" min={min} max={max} value={sim[key]} onChange={(e) => setSim({ ...sim, [key]: Number(e.target.value) })} />
                    </div>
                  ))}
                </div>
                <button className="tp-btn-primary mb-3" onClick={runSimulation} disabled={simLoading}><i className="bi bi-lightning-charge me-1" /> {simLoading ? "Simulating..." : "Run Simulation"}</button>
                {simResult && (
                  <div className="row g-3">
                    <div className="col-md-3"><Stat label="Predicted Cost" value={fmtCr(simResult.predictedFinalCost)} /></div>
                    <div className="col-md-3"><Stat label="Cost Overrun Prob." value={`${simResult.costOverrunProbability}%`} color="#F97316" /></div>
                    <div className="col-md-3"><Stat label="Delay" value={`${simResult.predictedDelayDays} days`} color="#EF4444" /></div>
                    <div className="col-md-3"><Stat label="Risk" value={`${simResult.riskScore}/100`} color={riskColor(simResult.riskCategory)} sub={simResult.riskCategory} /></div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ---------- COST DRIVERS ---------- */}
        {tab === "drivers" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Cost Escalation Factors</h6>
            {(inf.costEscalationDrivers || []).length === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No cost escalation drivers identified. Run a risk assessment.</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {inf.costEscalationDrivers.map((d, i) => (
                  <div key={i} className="tp-box-subtle p-2 small" style={{ color: "var(--tp-text)" }}><i className="bi bi-droplet-fill me-2" style={{ color: "#F97316" }} />{d}</div>
                ))}
              </div>
            )}
            <h6 className="fw-bold mt-4 mb-2" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Measured Feature Importance</h6>
            {featureImportance ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={Object.entries(featureImportance).map(([k, val]) => ({ name: k, importance: val }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                  <Bar dataKey="importance" fill="#6366F1" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="small" style={{ color: "#94A3B8" }}>No feature-importance data yet.</p>}
          </>
        )}

        {/* ---------- BENCHMARKING ---------- */}
        {tab === "benchmark" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Benchmarking vs Similar Projects</h6>
            {benchmarkData ? (
              <div className="row g-3">
                <div className="col-md-4"><Stat label="This Project · Risk" value={`${inf.riskScore || 0}/100`} color={riskColor(inf.riskCategory)} /></div>
                <div className="col-md-4"><Stat label="Sector Avg · Risk" value={`${benchmarkData.risk}/100`} sub={project.sector} color="#38BDF8" /></div>
                <div className="col-md-4"><Stat label="Portfolio Avg · Risk" value={`${benchmarkData.portfolioRisk}/100`} sub="All sectors" /></div>
              </div>
            ) : (
              <p className="small" style={{ color: "#94A3B8" }}>Benchmarking data not available for sector {project.sector}. Infrastructure projects with populated sector data are required.</p>
            )}
          </>
        )}

        {/* ---------- RECOMMENDATIONS ---------- */}
        {tab === "recommendations" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Recommended Interventions</h6>
            {recommendations.length === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No recommendations generated yet. Run a risk assessment to produce actionable items.</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {recommendations.map((r) => (
                  <div key={r._id} className="tp-box-subtle p-3">
                    <div className="d-flex justify-content-between">
                      <strong className="small" style={{ color: "var(--tp-text)" }}><i className="bi bi-clipboard-check me-2" style={{ color: "#22C55E" }} />{r.title}</strong>
                      <span className="badge" style={{ background: r.priority === "High" ? "rgba(239,68,68,0.15)" : "rgba(56,189,248,0.15)", color: r.priority === "High" ? "#EF4444" : "#38BDF8", fontSize: "0.68rem" }}>{r.priority}</span>
                    </div>
                    {r.description && <div className="small mt-1" style={{ color: "#94A3B8" }}>{r.description}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------- EXPLANATION ---------- */}
        {tab === "explanation" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Model Explanation</h6>
            <div className="tp-box-subtle p-3 mb-3">
              <strong style={{ color: "#38BDF8" }}><i className="bi bi-cpu me-1" /> Explanation</strong>
              <p className="mb-0 mt-1 small" style={{ color: "var(--tp-text)" }}>
                The prediction is a weighted composite of cost, schedule, milestones, resources, financial and implementation factors. Feature contributions below are measured from the trained model and reflect the current project state.
              </p>
            </div>
            {featureImportance ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={Object.entries(featureImportance).map(([k, val]) => ({ name: k, importance: val }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                  <Bar dataKey="importance" fill="#A78BFA" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="small" style={{ color: "#94A3B8" }}>Run a risk assessment to compute feature contributions.</p>}
          </>
        )}

        {/* ---------- DATA SUFFICIENCY ---------- */}
        {tab === "sufficiency" && (
          <>
            <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Data Sufficiency (CUF)</h6>
            <p className="small" style={{ color: "#94A3B8" }}>
              The platform compares a register-based (CUF) model with an extended model that adds candidate variables (contractor performance, procurement/land delays, material price variation, labour availability, weather, funding, utilities, litigation). Improvements in MAE/R² indicate whether additional data fields materially improve predictive performance.
            </p>
            <div className="tp-box-subtle p-3">
              <strong className="small" style={{ color: "#38BDF8" }}><i className="bi bi-database-add me-1" /> Candidate variables</strong>
              <ul className="mb-0 mt-2 small" style={{ color: "var(--tp-text)" }}>
                {["contractorPerformance", "procurementDelay", "landAcquisitionDelay", "environmentalClearanceDelay", "materialPriceVariation", "laborAvailability", "weatherDisruptionDays", "fundingReleaseDelay", "utilityShifting", "litigationDisputes"].map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
            {!isInfra && <div className="small text-muted mt-2">Data sufficiency analysis is scoped to infrastructure projects.</div>}
            <Link to="/app/data-sufficiency" className="btn tp-btn-primary mt-3"><i className="bi bi-arrow-right me-1" /> Open Data Sufficiency Dashboard</Link>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectAnalysis;