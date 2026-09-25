import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/leaderboard").then(({ data }) => {
      setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
    }).catch(() => {
      toast.error("Failed to load leaderboard");
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <motion.div className="tp-skeleton" style={{ height: 400 }} />;
  }

  if (leaderboard.length === 0) {
    return (
      <motion.div className="tp-glass p-5 text-center" style={{ color: '#94A3B8' }}>
        <i className="bi bi-trophy me-2" style={{ fontSize: 48, color: '#94A3B8' }} />
        <p>No productivity data available yet.</p>
      </motion.div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h3 className="fw-bold mb-4" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Team Productivity Leaderboard</span>
      </motion.h3>

      <motion.div className="tp-glass p-3" variants={itemVariants}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr>
              <th>Rank</th>
              <th>User</th>
              <th>Assigned Tasks</th>
              <th>Completed</th>
              <th>Pending</th>
              <th>Completion %</th>
              <th>Productivity Score</th>
            </tr></thead>
            <tbody>
              {leaderboard.map((member) => (
                <tr key={member._id} style={{ background: 'var(--tp-surface-table-body)' }}>
                  <td style={{ color: 'var(--tp-text)' }}>{member.rank}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      {member.profilePicture ? (
                        <img
                          src={member.profilePicture}
                          alt={member.name}
                          className="rounded-circle"
                          style={{ width: 32, height: 32, objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="rounded-circle"
                          style={{
                            width: 32,
                            height: 32,
                            background: 'linear-gradient(135deg, #38BDF8, #6366F1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--tp-text)',
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {member.name?.split(" ")[0] || "U"}
                        </div>
                      )}
                      <span className="small" style={{ color: '#94A3B8' }}>{member.name}</span>
                    </div>
                  </td>
                  <td style={{ color: '#94A3B8' }}>{member.assignedTasks}</td>
                  <td style={{ color: 'var(--tp-text)' }}>{member.completedTasks}</td>
                  <td style={{ color: '#94A3B8' }}>{member.pendingTasks}</td>
                  <td>
                    <span className={member.completionPercentage >= 80 ? "tp-badge-high" : member.completionPercentage >= 60 ? "tp-badge-medium" : "tp-badge-low"}>
                      {member.completionPercentage}%
                    </span>
                  </td>
                  <td style={{ color: 'var(--tp-text)' }}>{member.productivityScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Leaderboard;