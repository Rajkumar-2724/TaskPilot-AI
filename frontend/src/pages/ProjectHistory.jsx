import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";

const statusColors = {
  Completed: { bg: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "rgba(34, 197, 94, 0.3)" },
};

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const formatINR = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `₹${Number(value).toLocaleString("en-IN")}`;
};

const ProjectHistory = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/projects/history")
      .then(({ data }) => setProjects(data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2" variants={itemVariants}>
        <div>
          <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span className="tp-gradient-text">Project History</span>
          </h3>
          <p className="small mb-0" style={{ color: "#94A3B8" }}>
            Completed projects archive ({filteredProjects.length} of {projects.length} total)
          </p>
        </div>
        <button className="btn btn-light" style={{ borderRadius: 12 }} onClick={load} disabled={loading}>
          <i className={`bi ${loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"} me-1`} /> Refresh
        </button>
      </motion.div>

      {/* Filter Bar */}
      <motion.div className="tp-glass p-3 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3" variants={itemVariants}>
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 400 }}>
          <i className="bi bi-search" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search completed projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {loading ? (
        <div className="row g-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="col-md-6 col-xl-4" key={i}>
              <div className="tp-skeleton" style={{ height: 220 }} />
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="tp-glass p-5 text-center">
          <i className="bi bi-archive display-4 mb-3 d-block" style={{ color: "#94A3B8" }} />
          <h5 className="fw-bold mb-2" style={{ color: "var(--tp-text)" }}>No completed projects found</h5>
          <p className="mb-0 small" style={{ color: "#94A3B8" }}>
            {projects.length === 0
              ? "Projects marked as Completed will appear here automatically."
              : "No completed projects match your current filters."}
          </p>
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          <div className="row g-3">
            {filteredProjects.map((p) => {
              const sc = statusColors[p.status] || statusColors.Completed;
              const isInfra = p.projectType === "InfrastructureProject";
              const isOpen = !!expanded[p._id];
              return (
                <motion.div className="col-12" key={p._id} variants={itemVariants}>
                  <div className="tp-card p-4">
                    {/* Summary Row */}
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                      <div className="flex-grow-1" style={{ minWidth: 260 }}>
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <Link to={`/app/projects/${p._id}`} className="text-decoration-none">
                            <h5 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                              {p.name}
                            </h5>
                          </Link>
                          <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                            {p.status}
                          </span>
                        </div>
                        <p className="small mb-2" style={{ color: "#94A3B8", maxWidth: 700, fontSize: "0.85rem" }}>
                          {p.description || "No description provided."}
                        </p>
                        {isInfra && (
                          <div className="d-flex flex-wrap gap-2 small mb-1" style={{ color: "#94A3B8", fontSize: "0.78rem" }}>
                            {p.projectCode && <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#94A3B8" }}><i className="bi bi-hash me-1" />{p.projectCode}</span>}
                            {p.ministry && <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#94A3B8" }}><i className="bi bi-building me-1" />{p.ministry}</span>}
                            {p.sector && <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "#94A3B8" }}><i className="bi bi-grid me-1" />{p.sector}</span>}
                          </div>
                        )}
                      </div>

                      <div className="d-flex flex-column align-items-end gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="small" style={{ color: "#94A3B8", fontSize: "0.78rem" }}>Completed:</span>
                          <span className="fw-semibold" style={{ color: "#22C55E", fontSize: "0.85rem" }}>
                            {formatDate(p.completedAt)}
                          </span>
                        </div>
                        <div className="d-flex align-items-center gap-4 small" style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                          <span><i className="bi bi-calendar3 me-1" />Start: <strong style={{ color: "var(--tp-text)" }}>{formatDate(p.startDate)}</strong></span>
                          <span><i className="bi bi-calendar-event me-1" />Due: <strong style={{ color: "var(--tp-text)" }}>{formatDate(p.deadline)}</strong></span>
                        </div>
                        <div className="d-flex align-items-center gap-3" style={{ fontSize: "0.78rem", color: "#94A3B8" }}>
                          <span><i className="bi bi-person me-1" />Owner: <strong style={{ color: "var(--tp-text)" }}>{p.owner?.name || p.manager?.name || "—"}</strong></span>
                          <span><i className="bi bi-people me-1" />Members: <strong style={{ color: "var(--tp-text)" }}>{p.members?.length || 0}</strong></span>
                        </div>
                        <div className="d-flex align-items-center gap-3" style={{ fontSize: "0.78rem", color: "#94A3B8" }}>
                          <span><i className="bi bi-check2-circle me-1" />Tasks: <strong style={{ color: "var(--tp-text)" }}>{p.completedTaskCount || 0}/{p.taskCount || 0} done</strong></span>
                          {isInfra && (
                            <>
                              <span><i className="bi bi-cash-stack me-1" />Cost: <strong style={{ color: "var(--tp-text)" }}>{formatINR(p.expenditure)}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-3">
                      <div className="d-flex justify-content-between small mb-1" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                        <span>Final Progress</span>
                        <span style={{ color: "#38BDF8", fontWeight: 600 }}>{p.progress || 0}%</span>
                      </div>
                      <div className="progress" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                        <div className="progress-bar" style={{ width: `${p.progress || 0}%` }} />
                      </div>
                    </div>

                    {/* Expand Toggle */}
                    <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top flex-wrap gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <button className="btn btn-sm btn-light" style={{ borderRadius: 8 }} onClick={() => toggleExpand(p._id)}>
                        <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
                        {isOpen ? "Hide Tasks" : `View Tasks (${p.taskCount || 0})`}
                      </button>
                      <div className="d-flex align-items-center gap-2">
                        <Link to={`/app/projects/${p._id}`} className="btn btn-sm tp-btn-primary" style={{ borderRadius: 8 }}>
                          Open Project <i className="bi bi-arrow-right ms-1" />
                        </Link>
                      </div>
                    </div>

                    {/* Tasks Section */}
                    {isOpen && (
                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <h6 className="fw-bold mb-3" style={{ color: "var(--tp-text)", fontSize: "0.85rem" }}>
                          <i className="bi bi-list-task me-2" style={{ color: "#38BDF8" }} />Tasks & Final Status
                        </h6>
                        {p.tasks && p.tasks.length > 0 ? (
                          <div className="table-responsive">
                            <table className="table align-middle mb-0">
                              <thead>
                                <tr style={{ color: "#94A3B8", fontSize: "0.72rem" }}>
                                  <th>Task</th>
                                  <th>Priority</th>
                                  <th>Assignee</th>
                                  <th>Due Date</th>
                                  <th>Final Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.tasks.map((t) => (
                                  <tr key={t._id}>
                                    <td>
                                      <div className="fw-semibold" style={{ color: "var(--tp-text)", fontSize: "0.85rem" }}>{t.title}</div>
                                      {t.description && (
                                        <div className="text-truncate" style={{ color: "#94A3B8", fontSize: "0.72rem", maxWidth: 300 }}>{t.description}</div>
                                      )}
                                    </td>
                                    <td>
                                      <span className={`badge ${priorityBadge[t.priority] || "tp-badge-medium"}`} style={{ fontSize: "0.72rem" }}>{t.priority}</span>
                                    </td>
                                    <td className="small" style={{ color: "#94A3B8" }}>{t.assignedTo?.name || "Unassigned"}</td>
                                    <td className="small" style={{ color: "#94A3B8" }}>{formatDate(t.dueDate)}</td>
                                    <td>
                                      <span className="badge" style={{ background: t.status === "Completed" ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)", color: t.status === "Completed" ? "#22C55E" : "#94A3B8", fontSize: "0.72rem" }}>
                                        {t.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="small mb-0" style={{ color: "#94A3B8" }}>No tasks were recorded for this project.</p>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default ProjectHistory;