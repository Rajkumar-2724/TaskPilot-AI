import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const severityColors = { Low: "#22C55E", Medium: "#F59E0B", High: "#F97316", Critical: "#EF4444" };
const alertTypeIcons = { "Risk Increase": "🛡️", "Cost Overrun": "💰", "Time Overrun": "⏰", "Milestone Delay": "📋", "Resource Shortage": "👥", "Budget Exceeded": "💸", "Schedule Slip": "📅", "Contract Change": "📝" };

const AlertsPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    api.get("/infrastructure/projects").then(({ data }) => {
      const proms = (data.projects || []).map((p) =>
        api.get(`/infrastructure/projects/${p._id}/alerts`).then(({ data: a }) => a.alerts || []).catch(() => [])
      );
      Promise.all(proms).then((allAlerts) => {
        setAlerts(allAlerts.flat());
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, []);

  const filteredAlerts = filter === "All" ? alerts : alerts.filter((a) => a.alertType === filter);

  if (loading) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading alerts...</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h2 className="fw-bold mb-4" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Early Warning Alerts</span>
      </motion.h2>
      <motion.div className="d-flex gap-2 mb-3 flex-wrap" variants={itemVariants}>
        {["All", "Risk Increase", "Cost Overrun", "Time Overrun", "Milestone Delay", "Critical"].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? "tp-btn-primary" : "btn-light"}`} style={{ borderRadius: 10 }} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </motion.div>
      <div className="row g-3">
        {filteredAlerts.map((alert, i) => (
          <motion.div className="col-md-6" key={i} variants={itemVariants}>
            <div className="tp-card p-4" style={{ borderLeft: `4px solid ${severityColors[alert.severity] || "#6366F1"}` }}>
              <div className="d-flex justify-content-between mb-2">
                <h6 className="fw-bold" style={{ color: 'var(--tp-text)' }}>{alertTypeIcons[alert.alertType] || "⚠️"} {alert.title}</h6>
                <span className="badge" style={{ background: `${severityColors[alert.severity]}20`, color: severityColors[alert.severity], border: `1px solid ${severityColors[alert.severity]}40` }}>{alert.severity}</span>
              </div>
              <p className="small" style={{ color: '#94A3B8' }}>{alert.description}</p>
              <div className="d-flex justify-content-between small mb-2">
                <span style={{ color: '#94A3B8' }}>Probability: {alert.probability}%</span>
                <span style={{ color: '#94A3B8' }}>Impact: {alert.predictedImpact}</span>
              </div>
              {alert.contributingFactors && alert.contributingFactors.length > 0 && (
                <div className="small" style={{ color: '#94A3B8' }}>
                  <strong>Factors:</strong> {alert.contributingFactors.join("; ")}
                </div>
              )}
              <div className="small mt-2" style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 10, padding: '0.75rem' }}>
                <strong style={{ color: '#38BDF8' }}>Recommended Action:</strong> <span style={{ color: 'var(--tp-text)' }}>{alert.recommendedAction}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      {filteredAlerts.length === 0 && <div className="text-center py-4" style={{ color: '#94A3B8' }}>No alerts found</div>}
    </motion.div>
  );
};

export default AlertsPage;
