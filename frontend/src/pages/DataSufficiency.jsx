import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";

const CANDIDATE_VARIABLES = [
  "contractorPerformance", "procurementDelay", "landAcquisitionDelay",
  "environmentalClearanceDelay", "materialPriceVariation", "laborAvailability",
  "weatherDisruptionDays", "fundingReleaseDelay", "utilityShifting", "litigationDisputes",
];

const CUF_FIELDS = [
  "originalCost", "revisedCost", "expenditure", "plannedDuration", "actualDuration",
  "physicalProgress", "financialProgress", "totalMilestones", "completedMilestones",
  "delayedMilestones", "resourceAvailability", "contractChanges", "contractChangeImpact",
];

const DataSufficiency = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [mlAvailable, setMlAvailable] = useState(true);

  const [projectSearch, setProjectSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState(null);
  const [cohortResult, setCohortResult] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [projectAnalysisLoading, setProjectAnalysisLoading] = useState(false);

  const searchProjects = async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data: res } = await api.get(`/cuf/projects/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.projects || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleProjectSelect = async (project) => {
    setSelectedProject(project);
    setProjectSearch(project.name);
    setSearchResults([]);
    setCohortResult(null);
    setSelectedProjectDetails(null);
    try {
      const { data: details } = await api.get(`/infrastructure/projects/${project._id}`);
      setSelectedProjectDetails(details.project);
    } catch {
      setSelectedProjectDetails({ ...project, projectType: "InfrastructureProject" });
    }
  };

  const runCohortAnalysis = async () => {
    if (!selectedProject) { toast.warning("Select a project first"); return; }
    setProjectAnalysisLoading(true);
    try {
      const payload = {
        selectedProject: {
          _id: selectedProject._id,
          name: selectedProject.name,
          sector: selectedProjectDetails?.sector || selectedProject.sector,
          state: selectedProjectDetails?.state || selectedProject.state,
          projectType: "InfrastructureProject",
          originalCost: selectedProject.originalCost,
          revisedCost: selectedProject.revisedCost,
          plannedDuration: selectedProject.plannedDuration,
          ...(selectedProjectDetails || {}),
        },
        sector: selectedProjectDetails?.sector || selectedProject.sector,
        state: selectedProjectDetails?.state || selectedProject.state,
        costMin: selectedProject.originalCost * 0.5,
        costMax: selectedProject.revisedCost * 1.5,
        durationMin: selectedProject.plannedDuration * 0.5,
        durationMax: selectedProject.plannedDuration * 1.5,
      };
      const { data } = await api.post("/cuf/project-analysis", payload);
      setCohortResult(data);
      if (data.status === "available") {
        setData(data);
        toast.success(`Cohort analysis complete — ${data.cohortSize} historical projects matched`);
      } else {
        toast.info(data.message || "Analysis returned insufficient cohort data");
      }
    } catch (err) {
      if (err.response?.status === 503) {
        setMlAvailable(false);
        toast.error("ML service is not running. Start it with: cd ml-service && python main.py");
      } else {
        toast.error(err.response?.data?.message || "Analysis failed");
      }
    } finally {
      setProjectAnalysisLoading(false);
    }
  };

  const load = () => {
    setLoading(true);
    api.get("/cuf/analysis").then(({ data }) => { setData(data); setMlAvailable(true); }).catch(() => { setMlAvailable(false); }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const runTraining = async () => {
    setTraining(true);
    try {
      const { data } = await api.post("/cuf/train");
      toast.success("CUF data-sufficiency analysis completed");
      setData(data);
    } catch (err) {
      if (err.response?.status === 503) { setMlAvailable(false); toast.error("ML service not running. cd ml-service && python main.py"); }
      else { toast.error(err.response?.data?.message || "Training failed"); }
    } finally { setTraining(false); }
  };

  if (loading) return <div className="tp-skeleton" style={{ height: 320, borderRadius: 16 }} />;

const notRun = data?.status === "not_run";
  const isProjectAnalysis = cohortResult?.status === "available";

  const getCohortMetrics = (target, groupName) => {
    const src = cohortResult?.metrics || [];
    const prefix = target === "cost" ? "CUF Cost Overrun" : "CUF Time Overrun";
    const match = src.find((m) => m.comparisonGroup === groupName && m.modelName?.startsWith(prefix));
    return match?.metricValue ?? null;
  };

  const buildRows = () => {
    if (isProjectAnalysis) {
      const src = cohortResult?.metrics || [];
      const costCuf = src.filter((m) => m.comparisonGroup === "cuf-only" && m.modelName?.startsWith("CUF Cost Overrun"));
      const costExt = src.filter((m) => m.comparisonGroup === "extended" && m.modelName?.startsWith("CUF Cost Overrun"));
      const timeCuf = src.filter((m) => m.comparisonGroup === "cuf-only" && m.modelName?.startsWith("CUF Time Overrun"));
      const timeExt = src.filter((m) => m.comparisonGroup === "extended" && m.modelName?.startsWith("CUF Time Overrun"));

      const costMA_mae = costCuf.find((m) => m.metricName === "MAE")?.metricValue;
      const costMB_mae = costExt.find((m) => m.metricName === "MAE")?.metricValue;
      const costMA_rmse = costCuf.find((m) => m.metricName === "RMSE")?.metricValue;
      const costMB_rmse = costExt.find((m) => m.metricName === "RMSE")?.metricValue;
      const costMA_r2 = costCuf.find((m) => m.metricName === "R2")?.metricValue;
      const costMB_r2 = costExt.find((m) => m.metricName === "R2")?.metricValue;
      const timeMA_mae = timeCuf.find((m) => m.metricName === "MAE")?.metricValue;
      const timeMB_mae = timeExt.find((m) => m.metricName === "MAE")?.metricValue;
      const timeMA_rmse = timeCuf.find((m) => m.metricName === "RMSE")?.metricValue;
      const timeMB_rmse = timeExt.find((m) => m.metricName === "RMSE")?.metricValue;
      const timeMA_r2 = timeCuf.find((m) => m.metricName === "R2")?.metricValue;
      const timeMB_r2 = timeExt.find((m) => m.metricName === "R2")?.metricValue;

      return [
        { target: "Cost Overrun", metric: "MAE", a: costMA_mae, b: costMB_mae, diff: costMB_mae != null && costMA_mae != null ? costMB_mae - costMA_mae : null },
        { target: "Cost Overrun", metric: "RMSE", a: costMA_rmse, b: costMB_rmse, diff: costMB_rmse != null && costMA_rmse != null ? costMB_rmse - costMA_rmse : null },
        { target: "Cost Overrun", metric: "R2", a: costMA_r2, b: costMB_r2, diff: costMB_r2 != null && costMA_r2 != null ? costMB_r2 - costMA_r2 : null },
        { target: "Time Overrun", metric: "MAE", a: timeMA_mae, b: timeMB_mae, diff: timeMB_mae != null && timeMA_mae != null ? timeMB_mae - timeMA_mae : null },
        { target: "Time Overrun", metric: "RMSE", a: timeMA_rmse, b: timeMB_rmse, diff: timeMB_rmse != null && timeMA_rmse != null ? timeMB_rmse - timeMA_rmse : null },
        { target: "Time Overrun", metric: "R2", a: timeMA_r2, b: timeMB_r2, diff: timeMB_r2 != null && timeMA_r2 != null ? timeMB_r2 - timeMA_r2 : null },
      ];
    }
    const cufOnlyMetrics = (data?.cufOnly || []);
    const extendedMetrics = (data?.extended || []);
    const names = [...new Set([...cufOnlyMetrics, ...extendedMetrics].map((m) => m.modelName))];
    return names.flatMap((name) =>
      ["MAE", "RMSE", "R2"].map((k) => {
        const cuf = cufOnlyMetrics.find((m) => m.modelName === name && m.metricName === k);
        const ext = extendedMetrics.find((m) => m.modelName === name && m.metricName === k);
        return { model: name, metric: k, cufOnly: cuf?.metricValue ?? null, extended: ext?.metricValue ?? null, diff: ext?.improvementVsA ?? null };
      })
    );
  };
  const rows = buildRows();

  const chartData = isProjectAnalysis
    ? rows.filter((r) => r.metric === "MAE").map((r) => ({ name: r.target.includes("Cost") ? "Cost" : "Time", a: r.a, b: r.b }))
    : rows.filter((r) => r.metric === "MAE").map((r) => ({ name: r.model.replace(" + Candidate Variables (Model B)", "").replace("Overrun", "Overrun · Model"), cufOnly: r.cufOnly, extended: r.extended }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-1">
        <h4 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Data Sufficiency Analysis (CUF)</span>
        </h4>
        {isAdmin && (
          <button className="tp-btn-primary" onClick={runTraining} disabled={training}>
            {training ? <><span className="spinner-border spinner-border-sm me-2" />Training...</> : <><i className="bi bi-database-add me-1" /> Run CUF Experiment</>}
          </button>
        )}
      </div>
      <p className="mb-4" style={{ color: "#94A3B8" }}>
        Compares a model trained on the currently-collected CUF / project-register fields (Model A) against one that adds candidate variables (Model B). A meaningful drop in MAE (or rise in R2) shows which additional fields are worth collecting.
      </p>

      {!mlAvailable && (
        <div className="tp-box-subtle p-3 mb-4" style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
          <strong className="text-danger"><i className="bi bi-exclamation-triangle me-1" /> ML service not reachable.</strong>
          {isAdmin ? <span className="ms-2 small text-muted">It must be running for training (cd ml-service && python main.py). </span> : <span className="ms-2 small text-muted">Start the ML service, then an Admin can run the experiment.</span>}
        </div>
      )}

      <div className="tp-card p-4 mb-4">
        <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <i className="bi bi-search me-1" /> Step 1 — Select a Project
        </h6>
        <div className="row g-3 align-items-end">
          <div className="col-lg-5">
            <label className="form-label small" style={{ color: "#94A3B8" }}>Search Infrastructure Project</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, sector, or state…"
              value={projectSearch}
              onChange={(e) => { setProjectSearch(e.target.value); searchProjects(e.target.value); }}
              onFocus={() => { if (projectSearch.length >= 2) searchProjects(projectSearch); }}
              style={{ background: "var(--tp-surface)", borderColor: "var(--tp-glass-border)", color: "var(--tp-text)" }}
            />
            {searchResults.length > 0 && (
              <div className="dropdown-menu show tp-glass mt-1" style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--tp-glass-border)" }}>
                {searchResults.map((p) => (
                  <a key={p._id} className="dropdown-item d-flex justify-content-between align-items-center py-2" style={{ cursor: "pointer", color: "var(--tp-text)", fontSize: "0.85rem" }} onClick={() => handleProjectSelect(p)}>
                    <div>
                      <strong>{p.name}</strong>
                      <div className="small text-muted">{p.sector} · {p.state} · Code: {p.projectCode}</div>
                    </div>
                    <span className="badge" style={{ background: "rgba(56,189,248,0.12)", color: "#38BDF8" }}>₹{(p.originalCost / 100000).toFixed(1)} Cr</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="col-lg-4">
            <label className="form-label small" style={{ color: "#94A3B8" }}>Or filter by sector</label>
            <select className="form-select" style={{ background: "var(--tp-surface)", borderColor: "var(--tp-glass-border)", color: "var(--tp-text)" }} onChange={(e) => {
              const sector = e.target.value;
              if (!sector) return;
              api.get(`/cuf/projects/search?sector=${sector}`).then(({ data: res }) => {
                const matches = Array.isArray(res.projects) ? res.projects : [];
                if (matches.length > 0) handleProjectSelect(matches[0]);
                else toast.warning(`No infrastructure projects found in sector: ${sector}`);
              }).catch(() => toast.error("Failed to search projects"));
            }}>
              <option value="">Select sector…</option>
              <option value="Transport">Transport</option>
              <option value="Water">Water</option>
              <option value="Energy">Energy</option>
              <option value="Housing">Housing</option>
              <option value="Health">Health</option>
              <option value="Education">Education</option>
              <option value="Irrigation">Irrigation</option>
              <option value="Urban Development">Urban Development</option>
              <option value="Digital Infrastructure">Digital Infrastructure</option>
            </select>
          </div>
          <div className="col-lg-3">
            <button className="tp-btn-primary w-100" onClick={runCohortAnalysis} disabled={!selectedProject || projectAnalysisLoading}>
              {projectAnalysisLoading ? <><span className="spinner-border spinner-border-sm me-2" />Analyzing…</> : <><i className="bi bi-play-circle me-1" /> Analyze Cohort</>}
            </button>
          </div>
        </div>
      </div>

      {selectedProject && selectedProjectDetails && (
        <div className="tp-card p-4 mb-4" style={{ borderLeft: "4px solid #6366F1" }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-card-text me-1" /> Selected Project — Data Coverage Profile
            </h6>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Name</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>{selectedProjectDetails.name}</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Sector</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>{selectedProjectDetails.sector}</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>State</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>{selectedProjectDetails.state}</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Original Cost</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>₹{selectedProjectDetails.originalCost?.toLocaleString() || "—"}</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Revised Cost</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>₹{selectedProjectDetails.revisedCost?.toLocaleString() || "—"}</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Planned Duration</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>{selectedProjectDetails.plannedDuration || 0} months</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Physical Progress</div><div className="small fw-bold" style={{ color: "var(--tp-text)" }}>{selectedProjectDetails.physicalProgress || 0}%</div></div>
            <div className="col-md-3"><div className="small" style={{ color: "#94A3B8" }}>Risk Score</div><div className="small fw-bold" style={{ color: selectedProjectDetails.riskScore > 60 ? "#EF4444" : "#22C55E" }}>{selectedProjectDetails.riskScore || 0}/100</div></div>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <div className="small mb-1" style={{ color: "#94A3B8" }}>Available CUF fields on this project</div>
              <div className="d-flex flex-wrap gap-1">
                {CUF_FIELDS.map((f) => {
                  const hasVal = selectedProjectDetails[f] !== undefined && selectedProjectDetails[f] !== null;
                  return <span key={f} className="badge" style={{ background: hasVal ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)", color: hasVal ? "#22C55E" : "#94A3B8", border: `1px solid ${hasVal ? "rgba(34,197,94,0.25)" : "rgba(148,163,184,0.25)"}`, fontSize: "0.68rem" }}>{f}: {hasVal ? "✓" : "✗"}</span>;
                })}
              </div>
            </div>
            <div className="col-md-6">
              <div className="small mb-1" style={{ color: "#94A3B8" }}>Candidate variable coverage on this project</div>
              <div className="d-flex flex-wrap gap-1">
                {CANDIDATE_VARIABLES.map((v) => {
                  const hasVal = selectedProjectDetails[v] !== undefined && selectedProjectDetails[v] !== null;
                  return <span key={v} className="badge" style={{ background: hasVal ? "rgba(167,139,250,0.12)" : "rgba(239,68,68,0.12)", color: hasVal ? "#A78BFA" : "#EF4444", border: `1px solid ${hasVal ? "rgba(167,139,250,0.25)" : "rgba(239,68,68,0.25)"}`, fontSize: "0.68rem" }}>{v}: {hasVal ? "✓" : "✗"}</span>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {isProjectAnalysis && (
        <div className="tp-card p-4 mb-4" style={{ borderLeft: "4px solid #22C55E" }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-people me-1" /> Selected Project Analysis — Cohort Results
            </h6>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-md-3"><div className="tp-card p-3"><div className="small" style={{ color: "#94A3B8" }}>Historical Cohort Size</div><div className="fw-bold fs-4" style={{ color: "#22C55E" }}>{cohortResult.cohortSize}</div><div className="small text-muted">matched projects</div></div></div>
            <div className="col-md-3"><div className="tp-card p-3"><div className="small" style={{ color: "#94A3B8" }}>Cohort Sector</div><div className="fw-bold fs-4" style={{ color: "#38BDF8" }}>{cohortResult.cohortFilter?.sector || "—"}</div><div className="small text-muted">filter criterion</div></div></div>
            <div className="col-md-3"><div className="tp-card p-3"><div className="small" style={{ color: "#94A3B8" }}>Cohort State</div><div className="fw-bold fs-4" style={{ color: "#38BDF8" }}>{cohortResult.cohortFilter?.state || "All"}</div><div className="small text-muted">filter criterion</div></div></div>
            <div className="col-md-3"><div className="tp-card p-3"><div className="small" style={{ color: "#94A3B8" }}>Cohort Filter</div><div className="fw-bold fs-4" style={{ color: "#F59E0B" }}>₹{cohortResult.cohortFilter?.costRange?.min?.toLocaleString() || "?"}–{cohortResult.cohortFilter?.costRange?.max?.toLocaleString() || "?"}</div><div className="small text-muted">cost range · {cohortResult.cohortFilter?.durationRange?.min || 0}–{cohortResult.cohortFilter?.durationRange?.max || 0} mo</div></div></div>
          </div>
          {cohortResult.cohortFilter?.relaxed && (
            <div className="tp-box-subtle p-3 mb-3" style={{ border: "1px solid rgba(245,158,11,0.3)" }}>
              <strong style={{ color: "#F59E0B" }}><i className="bi bi-exclamation-triangle me-1" /> Cohort relaxed.</strong>
              <span className="ms-2 small text-muted">Exact cost/duration filter returned fewer than 15 records. Broadened to sector + state match with wider cost/duration bounds for reliable regression.</span>
            </div>
          )}
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="small mb-1" style={{ color: "#94A3B8" }}>Available candidate variables (already collected)</div>
              <div className="d-flex flex-wrap gap-1">
                {(cohortResult.availableCandidateVariables || []).map((v) => <span key={v} className="badge" style={{ background: "rgba(34,197,94,0.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.25)", fontSize: "0.68rem" }}>{v}</span>)}
                {(cohortResult.availableCandidateVariables || []).length === 0 && <span className="small text-muted">None</span>}
              </div>
            </div>
            <div className="col-md-4">
              <div className="small mb-1" style={{ color: "#94A3B8" }}>Missing candidate variables (worth collecting)</div>
              <div className="d-flex flex-wrap gap-1">
                {(cohortResult.missingCandidateVariables || []).map((v) => <span key={v} className="badge" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)", fontSize: "0.68rem" }}>{v}</span>)}
                {(cohortResult.missingCandidateVariables || []).length === 0 && <span className="small text-muted">All collected</span>}
              </div>
            </div>
            <div className="col-md-4">
              <div className="small mb-1" style={{ color: "#94A3B8" }}>Data sufficiency vs model performance</div>
              <div className="small" style={{ color: "var(--tp-text)" }}>
                Cohort size ({cohortResult.cohortSize}) and variable coverage determine <strong>data sufficiency</strong>. Model performance (MAE/RMSE/R2) measures <strong>predictive accuracy</strong>. They are distinct: a large cohort with missing variables may show poor model performance, while collecting those variables may close the gap.
              </div>
            </div>
          </div>

          <h6 className="fw-bold mb-3 mt-4" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Model Performance Comparison (Regression Metrics)</h6>
          <div className="table-responsive mb-4">
            <table className="table table-sm">
              <thead><tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}><th>Target</th><th>Metric</th><th>Model A (CUF fields)</th><th>Model B (CUF + candidates)</th><th>Δ (B − A)</th><th>Model B better?</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const isGoodImprovement = r.metric === "R2" ? (r.b != null && r.a != null && r.b > r.a) : (r.b != null && r.a != null && r.b < r.a);
                  return (
                    <tr key={i}>
                      <td className="small fw-bold" style={{ color: "var(--tp-text)" }}>{r.target}</td>
                      <td><span className="badge" style={{ background: "rgba(56,189,248,0.12)", color: "#38BDF8", fontSize: "0.72rem" }}>{r.metric}</span></td>
                      <td>{r.a != null ? r.a.toFixed(4) : "—"}</td>
                      <td>{r.b != null ? r.b.toFixed(4) : "—"}</td>
                      <td style={{ color: r.diff != null ? (r.diff < 0 ? "#22C55E" : "#EF4444") : "#94A3B8" }}>
                        {r.diff != null ? (r.diff > 0 ? `+${r.diff.toFixed(4)}` : `−${Math.abs(r.diff).toFixed(4)}`) : "—"}
                      </td>
                      <td>{r.b != null && r.a != null ? (isGoodImprovement ? <i className="bi bi-check-circle-fill text-success" /> : <i className="bi bi-x-circle-fill text-danger" />) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="tp-card p-4">
                <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.85rem" }}>Cost Overrun — MAE Comparison</h6>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData.filter((d) => d.name.includes("Cost"))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                      <XAxis dataKey="name" stroke="#94A3B8" />
                      <YAxis stroke="#94A3B8" />
                      <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                      <Legend />
                      <Bar dataKey="a" fill="#6366F1" name="Model A (CUF only)" />
                      <Bar dataKey="b" fill="#22C55E" name="Model B (extended)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="small" style={{ color: "#94A3B8" }}>No chart data.</p>}
              </div>
            </div>
            <div className="col-md-4">
              <div className="tp-card p-4">
                <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.85rem" }}>R2 Comparison</h6>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={[
                    { name: "Cost R2", a: rows.find((r) => r.target === "Cost Overrun" && r.metric === "R2")?.a, b: rows.find((r) => r.target === "Cost Overrun" && r.metric === "R2")?.b },
                    { name: "Time R2", a: rows.find((r) => r.target === "Time Overrun" && r.metric === "R2")?.a, b: rows.find((r) => r.target === "Time Overrun" && r.metric === "R2")?.b },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="name" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" />
                    <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                    <Legend />
                    <Bar dataKey="a" fill="#6366F1" name="Model A (CUF only)" />
                    <Bar dataKey="b" fill="#22C55E" name="Model B (extended)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="col-md-4">
              <div className="tp-card p-4">
                <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.85rem" }}>Data Sufficiency Summary</h6>
                <div className="d-flex flex-column gap-2 small">
                  <div><span style={{ color: "#94A3B8" }}>Cohort size:</span> <strong style={{ color: "var(--tp-text)" }}>{cohortResult.cohortSize} projects</strong></div>
                  <div><span style={{ color: "#94A3B8" }}>CUF fields available:</span> <strong style={{ color: "#22C55E" }}>{CUF_FIELDS.length} fields</strong></div>
                  <div><span style={{ color: "#94A3B8" }}>Candidate variables available:</span> <strong style={{ color: cohortResult.availableCandidateVariables?.length ? "#22C55E" : "#EF4444" }}>{(cohortResult.availableCandidateVariables || []).length}</strong></div>
                  <div><span style={{ color: "#94A3B8" }}>Candidate variables missing:</span> <strong style={{ color: "#EF4444" }}>{(cohortResult.missingCandidateVariables || []).length}</strong></div>
                  <hr style={{ borderColor: "var(--tp-glass-border)" }} />
                  <div><span style={{ color: "#94A3B8" }}>Data sufficiency score:</span></div>
                  <div className="progress" style={{ height: 8 }}>
                    <div className="progress-bar" style={{ width: `${Math.min(100, ((cohortResult.availableCandidateVariables?.length || 0) / CANDIDATE_VARIABLES.length) * 100)}%`, background: (cohortResult.availableCandidateVariables?.length || 0) >= CANDIDATE_VARIABLES.length ? "#22C55E" : (cohortResult.availableCandidateVariables?.length || 0) >= 5 ? "#F59E0B" : "#EF4444" }} />
                  </div>
                  <div className="small text-muted">
                    {(cohortResult.availableCandidateVariables?.length || 0)}/{CANDIDATE_VARIABLES.length} candidate variables collected.
                    {cohortResult.cohortSize >= 50 ? " Cohort size is strong." : cohortResult.cohortSize >= 20 ? " Cohort size is moderate." : " Cohort size is small — consider broadening filters."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="tp-card p-4" style={{ borderLeft: "4px solid #F59E0B" }}>
            <h6 className="fw-bold mb-3" style={{ color: "#F59E0B", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <i className="bi bi-lightbulb me-1" /> Recommended Variables to Collect/Test
            </h6>
            <p className="small mb-3" style={{ color: "#94A3B8" }}>
              Based on the cohort analysis, the following candidate variables are <strong>missing</strong> from the selected project but are identified as potentially valuable for improving predictive accuracy. Each represents a data collection opportunity:
            </p>
            <div className="table-responsive">
              <table className="table table-sm">
                <thead><tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}><th>Candidate Variable</th><th>Category</th><th>Worth Collecting?</th><th>Rationale</th></tr></thead>
                <tbody>
                  {cohortResult.missingCandidateVariables?.map((v) => {
                    const categoryMap = {
                      contractorPerformance: "Contractor", procurementDelay: "Procurement", landAcquisitionDelay: "Land",
                      environmentalClearanceDelay: "Environmental", materialPriceVariation: "Material",
                      laborAvailability: "Labor", weatherDisruptionDays: "Weather", fundingReleaseDelay: "Financial",
                      utilityShifting: "Utility", litigationDisputes: "Legal",
                    };
                    const rationaleMap = {
                      contractorPerformance: "High feature importance in cost prediction; directly affects project timelines",
                      procurementDelay: "Strong impact on schedule variance and cost escalation",
                      landAcquisitionDelay: "Critical bottleneck in infrastructure projects; affects overall timeline",
                      environmentalClearanceDelay: "Regulatory risk factor; causes significant schedule overruns",
                      materialPriceVariation: "Direct cost driver; affects budget accuracy significantly",
                      laborAvailability: "Affects both schedule and cost; highly correlated with progress",
                      weatherDisruptionDays: "External factor; important for accurate timeline predictions",
                      fundingReleaseDelay: "Financial bottleneck; directly impacts expenditure and progress",
                      utilityShifting: "Local infrastructure factor; causes unexpected delays",
                      litigationDisputes: "High-severity risk factor; causes both cost and schedule overruns",
                    };
                    const cat = categoryMap[v] || "Other";
                    const rationale = rationaleMap[v] || "Evaluated as potential improvement over CUF-only model";
                    return (
                      <tr key={v}>
                        <td className="small fw-bold" style={{ color: "var(--tp-text)" }}>{v}</td>
                        <td><span className="badge" style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA", fontSize: "0.7rem" }}>{cat}</span></td>
                        <td><span className="badge bg-warning" style={{ fontSize: "0.7rem" }}>Worth testing</span></td>
                        <td className="small" style={{ color: "#94A3B8" }}>{rationale}</td>
                      </tr>
                    );
                  })}
                  {(cohortResult.missingCandidateVariables?.length || 0) === 0 && (
                    <tr><td colSpan={4} className="small text-muted">All candidate variables are already collected for this project.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!isProjectAnalysis && data?.datasetLabel && !cohortResult && (
        <div className="row g-3">
          <div className="col-lg-7">
            <div className="tp-card p-4">
              <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Per-metric comparison (Model A = CUF fields only, Model B = + candidate variables)</h6>
              {rows.length === 0 ? (
                <p className="small" style={{ color: "#94A3B8" }}>No metrics available yet. Select a project above or run the default CUF experiment.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead><tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}><th>Model</th><th>Metric</th><th>CUF only (A)</th><th>Extended (B)</th><th>Δ (B − A)</th><th>Better?</th></tr></thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const delta = r.diff != null ? r.diff : (r.extended != null && r.cufOnly != null ? r.extended - r.cufOnly : null);
                        const improvesFor = r.metric === "R2" ? delta > 0 : delta < 0;
                        return (
                          <tr key={i}>
                            <td className="small" style={{ color: "var(--tp-text)" }}>{r.model}</td>
                            <td><span className="badge tp-badge-low">{r.metric}</span></td>
                            <td>{r.cufOnly ?? "—"}</td>
                            <td>{r.extended ?? "—"}</td>
                            <td>{delta != null ? (delta > 0 ? `+${Math.abs(delta).toFixed(3)}` : `-${Math.abs(delta).toFixed(3)}`) : "—"}</td>
                            <td>{r.extended != null && r.cufOnly != null ? <i className={`bi ${improvesFor ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"}`} /> : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="col-lg-5">
            <div className="tp-card p-4 mb-3">
              <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>MAE comparison</h6>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="name" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" />
                    <Tooltip contentStyle={{ background: "#0D1328", border: "1px solid rgba(56,189,248,0.3)", color: "#fff" }} />
                    <Legend />
                    <Bar dataKey="a" fill="#6366F1" name="Model A (CUF only)" />
                    <Bar dataKey="b" fill="#22C55E" name="Model B (extended)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="small" style={{ color: "#94A3B8" }}>No chart data. Select a project above.</p>}
            </div>
            <div className="tp-card p-4">
              <h6 className="fw-bold mb-2" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Candidate variables for Model B</h6>
              <p className="small mb-2" style={{ color: "#94A3B8" }}>These are the additional data fields the experiment says are worth evaluating for collection:</p>
              <div className="d-flex flex-wrap gap-1">
                {(data?.candidateVariables || []).map((c) => <span key={c} className="badge" style={{ background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.25)", fontSize: "0.72rem" }}>{c}</span>)}
              </div>
              <div className="mt-3">
                <p className="small" style={{ color: "#94A3B8" }}><strong>Data sufficiency</strong> (cohort size, variable coverage) is distinct from <strong>model performance</strong> (MAE, RMSE, R2). A model may perform poorly not because the algorithm is bad, but because the data is insufficient — more or better variables may close the gap.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DataSufficiency;
