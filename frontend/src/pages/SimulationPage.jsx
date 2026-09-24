import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const SimulationPage = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [modifications, setModifications] = useState({
    resourceAllocation: 100,
    milestoneCompletion: 0,
    expenditureRate: 100,
    scheduleAdjustment: 0,
    contractChangeImpact: 0,
  });
  const [results, setResults] = useState(null);
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/infrastructure/projects").then(({ data }) => setProjects(data.projects || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const runSimulation = async () => {
    if (!selectedProject) return;
    try {
      const { data: sim } = await api.post(`/predictions/simulate/${selectedProject}`, {
        modifications,
        simulationName: "What-If Analysis",
      });
      setResults(sim.simulation?.results || sim.results);
      setSimulations((prev) => [sim.simulation?.results || sim.results, ...prev]);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading projects...</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h2 className="fw-bold mb-2" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">What-If Project Simulation</span>
      </motion.h2>
      <motion.p className="mb-4" variants={itemVariants} style={{ color: '#94A3B8' }}>
        Modify hypothetical factors and see the estimated impact on cost, completion date, and risk score.
      </motion.p>

      <motion.div className="row g-3 mb-4" variants={itemVariants}>
        <div className="col-md-4">
          <select className="form-select" value={selectedProject || ""} onChange={(e) => setSelectedProject(e.target.value)}>
            <option value="">Select Project</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>
      </motion.div>

      {selectedProject && (
        <motion.div className="tp-card p-4 mb-4" variants={itemVariants}>
          <h5 className="fw-bold mb-3" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Simulation Parameters</h5>
          <div className="row g-3">
            {[
              { key: "resourceAllocation", label: "Resource Allocation (%)", min: 0, max: 200, step: 5 },
              { key: "milestoneCompletion", label: "Milestone Completion (%)", min: 0, max: 100, step: 5 },
              { key: "expenditureRate", label: "Expenditure Rate (%)", min: 0, max: 200, step: 5 },
              { key: "scheduleAdjustment", label: "Schedule Adjustment (days)", min: -100, max: 100, step: 5 },
              { key: "contractChangeImpact", label: "Contract Change Impact (₹)", min: 0, max: 100000000, step: 1000000 },
            ].map(({ key, label, min, max, step }) => (
              <div className="col-md-4" key={key}>
                <label className="form-label">{label}</label>
                <input type="range" className="form-range" min={min} max={max} step={step}
                  value={modifications[key]}
                  onChange={(e) => setModifications((m) => ({ ...m, [key]: Number(e.target.value) }))} />
                <div className="small" style={{ color: '#94A3B8' }}>{modifications[key]}</div>
              </div>
            ))}
          </div>
          <button className="tp-btn-primary mt-3" onClick={runSimulation} style={{ borderRadius: 12 }}>
            <i className="bi bi-play-circle me-1" /> Run Simulation
          </button>
        </motion.div>
      )}

      {results && (
        <motion.div className="tp-card p-4 mb-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h5 className="fw-bold mb-3" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Simulation Results</h5>
          <div className="row g-3">
            <div className="col-md-3">
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 14, padding: '1rem' }}>
                <div className="small" style={{ color: '#94A3B8' }}>Predicted Final Cost</div>
                <div className="fs-4 fw-bold" style={{ color: '#818CF8' }}>₹{(results.predictedFinalCost/100000).toFixed(2)} Cr</div>
              </div>
            </div>
            <div className="col-md-3">
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 14, padding: '1rem' }}>
                <div className="small" style={{ color: '#94A3B8' }}>Cost Overrun Probability</div>
                <div className="fs-4 fw-bold" style={{ color: '#F59E0B' }}>{results.costOverrunProbability}%</div>
              </div>
            </div>
            <div className="col-md-3">
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 14, padding: '1rem' }}>
                <div className="small" style={{ color: '#94A3B8' }}>Predicted Delay</div>
                <div className="fs-4 fw-bold" style={{ color: '#38BDF8' }}>{results.predictedDelayDays} days</div>
              </div>
            </div>
            <div className="col-md-3">
              <div style={{ background: results.riskScore >= 75 ? 'rgba(239, 68, 68, 0.1)' : results.riskScore >= 50 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)', border: `1px solid ${results.riskScore >= 75 ? 'rgba(239, 68, 68, 0.3)' : results.riskScore >= 50 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`, borderRadius: 14, padding: '1rem' }}>
                <div className="small" style={{ color: '#94A3B8' }}>Risk Score</div>
                <div className="fs-4 fw-bold" style={{ color: results.riskScore >= 75 ? '#EF4444' : results.riskScore >= 50 ? '#F59E0B' : '#22C55E' }}>{results.riskScore}/100 ({results.riskCategory})</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {simulations.length > 0 && (
        <div className="tp-card p-4">
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Simulation History</h6>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Risk Score</th><th>Cost</th><th>Delay</th><th>Category</th></tr></thead>
              <tbody>
                {simulations.map((s, i) => (
                  <tr key={i}>
                    <td><span className={`badge ${s.riskScore >= 75 ? "tp-badge-critical" : s.riskScore >= 50 ? "tp-badge-high" : "tp-badge-low"}`}>{s.riskScore}</span></td>
                    <td style={{ color: 'var(--tp-text)' }}>₹{(s.predictedFinalCost/100000).toFixed(2)} Cr</td>
                    <td style={{ color: 'var(--tp-text)' }}>{s.predictedDelayDays} days</td>
                    <td style={{ color: 'var(--tp-text)' }}>{s.riskCategory}</td>
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

export default SimulationPage;
