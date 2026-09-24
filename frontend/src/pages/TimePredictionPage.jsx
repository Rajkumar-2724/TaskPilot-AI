import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const TimePredictionPage = () => {
  const [projects, setProjects] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/infrastructure/projects").then(({ data }) => setProjects(data.projects || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const runPrediction = async (projectId) => {
    try {
      const { data } = await api.post(`/predictions/time-overrun/${projectId}`);
      setPredictions((prev) => {
        const filtered = prev.filter((item) => item.projectId !== projectId);
        return [...filtered, { projectId, projectName: projects.find((p) => p._id === projectId)?.name, ...data.prediction }];
      });
    } catch (err) {
      console.error(err);
    }
  };

  const runAllPredictions = async () => {
    setLoading(true);
    const results = [];
    for (const p of projects) {
      try {
        const { data } = await api.post(`/predictions/time-overrun/${p._id}`);
        results.push({ projectId: p._id, projectName: p.name, ...data.prediction });
      } catch (err) {}
    }
    setPredictions(results);
    setLoading(false);
  };

  if (loading && !predictions.length) return <div className="text-center py-5" style={{ color: '#94A3B8' }}>Loading projects...</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h2 className="fw-bold mb-4" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Time Overrun Prediction</span>
      </motion.h2>
      <motion.div className="d-flex gap-3 mb-4" variants={itemVariants}>
        <button className="tp-btn-primary" onClick={runAllPredictions} style={{ borderRadius: 12 }}>
          <i className="bi bi-lightning-charge me-1" /> Run All Predictions
        </button>
      </motion.div>
      <div className="row g-3 mb-4">
        {predictions.map((pred, i) => (
          <motion.div className="col-md-4" key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="tp-card p-4">
              <h6 className="fw-bold" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>{pred.projectName}</h6>
              <div className="d-flex justify-content-between my-2">
                <span style={{ color: '#94A3B8' }}>Time Overrun Probability:</span>
                <strong style={{ color: pred.probability > 60 ? "#EF4444" : pred.probability > 30 ? "#F59E0B" : "#22C55E" }}>{pred.probability}%</strong>
              </div>
              <div className="d-flex justify-content-between my-2">
                <span style={{ color: '#94A3B8' }}>Predicted Delay:</span>
                <strong style={{ color: 'var(--tp-text)' }}>{pred.predictedDelayDays} days</strong>
              </div>
              <div className="d-flex justify-content-between my-2">
                <span style={{ color: '#94A3B8' }}>Confidence:</span>
                <strong style={{ color: 'var(--tp-text)' }}>{(pred.confidence * 100).toFixed(0)}%</strong>
              </div>
              <p className="small mt-2" style={{ color: '#94A3B8' }}>{pred.explanation}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="tp-card p-4">
        <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>All Infrastructure Projects</h6>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead><tr><th>Project</th><th>Planned Duration</th><th>Actual Duration</th><th>Milestones</th><th>Completed</th><th>Action</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p._id}>
                  <td style={{ color: 'var(--tp-text)' }}>{p.name}</td>
                  <td style={{ color: '#94A3B8' }}>{p.plannedDuration} days</td>
                  <td style={{ color: '#94A3B8' }}>{p.actualDuration} days</td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.totalMilestones || 0}</td>
                  <td style={{ color: 'var(--tp-text)' }}>{p.completedMilestones || 0}</td>
                  <td><button className="btn btn-sm tp-btn-primary" style={{ borderRadius: 8, padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => runPrediction(p._id)}>Predict</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default TimePredictionPage;
