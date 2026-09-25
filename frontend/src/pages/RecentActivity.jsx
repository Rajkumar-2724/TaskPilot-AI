import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";

const projectStatusColors = {
  Planning: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8", border: "rgba(148, 163, 184, 0.3)" },
  Active: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", border: "rgba(56, 189, 248, 0.3)" },
  "On Hold": { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" },
  Suspended: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" },
  Completed: { bg: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "rgba(34, 197, 94, 0.3)" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", color: "#EF4444", border: "rgba(239, 68, 68, 0.3)" },
};

const taskStatusColors = {
  "To Do": { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8", border: "rgba(148, 163, 184, 0.3)" },
  "In Progress": { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", border: "rgba(56, 189, 248, 0.3)" },
  Review: { bg: "rgba(167, 139, 250, 0.15)", color: "#A78BFA", border: "rgba(167, 139, 250, 0.3)" },
  Completed: { bg: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "rgba(34, 197, 94, 0.3)" },
};

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };
const roleColors = {
  Owner: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  "Project Manager": { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  Member: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" },
  Viewer: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8" },
};

const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const timeAgo = (date) => {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
};

const isOverdue = (date, status) => date && status !== "Completed" && new Date(date) < new Date();

const RecentActivity = () => {
  const { user } = useAuth();
  const { refreshKey } = useDashboardRefresh();
  const navigate = useNavigate();
  const [data, setData] = useState({ recentProjects: [], recentTasks: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/activity/recent")
      .then(({ data: res }) => {
        setData({
          recentProjects: res.recentProjects || [],
          recentTasks: res.recentTasks || [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, refreshKey]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2" variants={itemVariants}>
        <div>
          <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span className="tp-gradient-text">Recent Activity</span>
          </h3>
          <p className="small mb-0" style={{ color: "#94A3B8" }}>
            Projects and tasks you recently worked on{user?.name ? ` — ${user.name}` : ""}
          </p>
        </div>
        <button className="btn btn-light" style={{ borderRadius: 12 }} onClick={load} disabled={loading}>
          <i className={`bi ${loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"} me-1`} /> Refresh
        </button>
      </motion.div>

      {loading ? (
        <>
          <div className="row g-3 mb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="col-md-6 col-xl-4" key={i}>
                <div className="tp-skeleton" style={{ height: 210 }} />
              </div>
            ))}
          </div>
          <div className="tp-skeleton" style={{ height: 220 }} />
        </>
      ) : (
        <>
          {/* Recent Projects */}
          <motion.div className="mb-4" variants={itemVariants}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-folder2-open" style={{ color: "#38BDF8" }} />
              <h5 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                Recent Projects
              </h5>
              <span className="badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" }}>
                {data.recentProjects.length}
              </span>
            </div>

            {data.recentProjects.length === 0 ? (
              <div className="tp-glass p-4 text-center" style={{ color: "#94A3B8" }}>
                <i className="bi bi-folder-x fs-2 d-block mb-2 text-muted" />
                <p className="small mb-0">You have not worked on any project yet.</p>
              </div>
            ) : (
              <div className="row g-3">
                {data.recentProjects.map((p) => {
                  const sc = projectStatusColors[p.status] || projectStatusColors.Planning;
                  const rc = roleColors[p.role] || roleColors.Viewer;
                  const isInfra = p.projectType === "InfrastructureProject";
                  const overdue = isOverdue(p.deadline, p.status);
                  return (
                    <motion.div className="col-md-6 col-xl-4" key={p._id} variants={itemVariants}>
                      <div className="tp-card p-4 h-100 d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <Link to={`/app/projects/${p._id}`} className="text-decoration-none">
                            <h6 className="fw-bold mb-0 text-truncate me-2" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                              {p.name}
                            </h6>
                          </Link>
                          <span className="badge flex-shrink-0" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                            {p.status}
                          </span>
                        </div>

                        <div className="d-flex flex-wrap gap-1 mb-2">
                          <span className="badge" style={{ background: rc.bg, color: rc.color, fontSize: "0.68rem" }}>
                            <i className="bi bi-person-badge me-1" />{p.role}
                          </span>
                          {isInfra && p.sector && (
                            <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#94A3B8", fontSize: "0.68rem" }}>{p.sector}</span>
                          )}
                        </div>

                        <p className="small mb-3" style={{ color: "#94A3B8", fontSize: "0.82rem", minHeight: 34 }}>
                          {p.description || "No description provided."}
                        </p>

                        <div className="small mb-3" style={{ color: "#94A3B8", fontSize: "0.78rem" }}>
                          <div className="d-flex justify-content-between mb-1">
                            <span><i className="bi bi-clock-history me-1" />Last worked</span>
                            <span style={{ color: "var(--tp-text)" }}>{timeAgo(p.lastActivity)}</span>
                          </div>
                          <div className="d-flex justify-content-between mb-1">
                            <span><i className="bi bi-calendar-event me-1" />Due date</span>
                            <span style={{ color: overdue ? "#EF4444" : "var(--tp-text)" }}>{formatDate(p.deadline)}</span>
                          </div>
                          {isInfra && p.ministry && (
                            <div className="d-flex justify-content-between mb-1">
                              <span><i className="bi bi-building me-1" />Ministry</span>
                              <span className="text-truncate ms-2" style={{ color: "var(--tp-text)", maxWidth: 150 }}>{p.ministry}</span>
                            </div>
                          )}
                          <div className="d-flex justify-content-between">
                            <span><i className="bi bi-person me-1" />Owner</span>
                            <span className="text-truncate ms-2" style={{ color: "var(--tp-text)", maxWidth: 150 }}>{p.owner?.name || "—"}</span>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between small mb-1" style={{ color: "#94A3B8", fontSize: "0.72rem" }}>
                            <span>Progress</span>
                            <span style={{ color: "#38BDF8", fontWeight: 600 }}>{p.progress || 0}%</span>
                          </div>
                          <div className="progress" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                            <div className="progress-bar" style={{ width: `${p.progress || 0}%` }} />
                          </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center mt-auto pt-2 border-top" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                          <span className="small" style={{ color: "#94A3B8", fontSize: "0.72rem" }}>
                            <i className="bi bi-people me-1" />{p.membersCount} members
                          </span>
                          <Link to={`/app/projects/${p._id}`} className="btn btn-sm tp-btn-primary p-1 px-2" style={{ borderRadius: 8, fontSize: "0.72rem" }}>
                            View <i className="bi bi-arrow-right ms-1" />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Recent Tasks */}
          <motion.div variants={itemVariants}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-list-task" style={{ color: "#38BDF8" }} />
              <h5 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                Recent Tasks
              </h5>
              <span className="badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" }}>
                {data.recentTasks.length}
              </span>
            </div>

            {data.recentTasks.length === 0 ? (
              <div className="tp-glass p-4 text-center" style={{ color: "#94A3B8" }}>
                <i className="bi bi-check2-circle fs-2 d-block mb-2 text-muted" />
                <p className="small mb-0">You have not worked on any task yet.</p>
              </div>
            ) : (
              <div className="tp-glass p-3">
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead>
                      <tr style={{ color: "#94A3B8", fontSize: "0.78rem" }}>
                        <th>Task</th>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assigned</th>
                        <th>Due</th>
                        <th>Last Worked</th>
                        <th className="text-end">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTasks.map((t) => {
                        const sc = taskStatusColors[t.status] || taskStatusColors["To Do"];
                        const overdue = isOverdue(t.dueDate, t.status);
                        return (
                          <tr key={t._id} style={{ cursor: "pointer" }} onClick={() => navigate(`/app/tasks/${t._id}`)}>
                            <td style={{ maxWidth: 260 }}>
                              <div className="fw-semibold" style={{ color: "var(--tp-text)" }}>{t.title}</div>
                              {t.description && (
                                <div className="text-truncate" style={{ color: "#94A3B8", fontSize: "0.74rem", maxWidth: 240 }}>
                                  {t.description}
                                </div>
                              )}
                            </td>
                            <td className="small" style={{ color: "#94A3B8" }}>{t.project?.name || "—"}</td>
                            <td>
                              <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{t.status}</span>
                            </td>
                            <td>
                              <span className={`badge ${priorityBadge[t.priority] || "tp-badge-medium"}`}>{t.priority}</span>
                            </td>
                            <td className="small" style={{ color: "#94A3B8" }}>{formatDate(t.assignedDate)}</td>
                            <td className="small" style={{ color: overdue ? "#EF4444" : "#94A3B8" }}>{formatDate(t.dueDate)}</td>
                            <td className="small" style={{ color: "#94A3B8" }} title={t.lastActivity ? new Date(t.lastActivity).toLocaleString() : ""}>
                              {timeAgo(t.lastActivity)}
                            </td>
                            <td className="text-end">
                              <span className="badge" style={{ background: t.isAssignee ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)", color: t.isAssignee ? "#22C55E" : "#94A3B8", fontSize: "0.68rem" }}>
                                {t.isAssignee ? "Assignee" : "Contributor"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </motion.div>
  );
};

export default RecentActivity;
