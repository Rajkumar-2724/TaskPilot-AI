import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const priorityColors = {
  Low: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8" },
  Medium: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" },
  High: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  Critical: { bg: "rgba(239, 68, 68, 0.15)", color: "#EF4444" },
};

const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const timeAgo = (date) => {
  if (!date) return "—";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const TaskHistory = () => {
  const [history, setHistory] = useState([]);
  const [retentionDays, setRetentionDays] = useState(100);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [expanded, setExpanded] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/history")
      .then(({ data }) => {
        setHistory(data.history || []);
        if (data.retentionDays) setRetentionDays(data.retentionDays);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const filtered = history.filter((h) => {
    const matchesSearch =
      h.title.toLowerCase().includes(search.toLowerCase()) ||
      (h.projectName && h.projectName.toLowerCase().includes(search.toLowerCase())) ||
      (h.description && h.description.toLowerCase().includes(search.toLowerCase()));
    const matchesPriority = priorityFilter === "All" || h.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  const now = Date.now();
  const weekCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).getTime();
  const completedThisWeek = history.filter((h) => h.completedAt && new Date(h.completedAt).getTime() >= weekCutoff).length;
  const highCritical = history.filter((h) => h.priority === "High" || h.priority === "Critical").length;

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
            <span className="tp-gradient-text">Task History</span>
          </h3>
          <p className="small mb-0" style={{ color: "#94A3B8" }}>
            Your completed tasks archive ({filtered.length} of {history.length} shown · kept for {retentionDays} days)
          </p>
        </div>
        <button className="btn btn-light" style={{ borderRadius: 12 }} onClick={load} disabled={loading}>
          <i className={`bi ${loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"} me-1`} /> Refresh
        </button>
      </motion.div>

      {/* Summary Stats */}
      <motion.div className="row g-3 mb-4" variants={itemVariants}>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(34, 197, 94, 0.15)", color: "#22C55E" }}>
              <i className="bi bi-check2-circle fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{history.length}</div>
              <div className="small" style={{ color: "#94A3B8" }}>Total Completed</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" }}>
              <i className="bi bi-calendar-week fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{completedThisWeek}</div>
              <div className="small" style={{ color: "#94A3B8" }}>This Week</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(239, 68, 68, 0.15)", color: "#EF4444" }}>
              <i className="bi bi-fire fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{highCritical}</div>
              <div className="small" style={{ color: "#94A3B8" }}>High / Critical</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div className="tp-glass p-3 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3" variants={itemVariants}>
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 400 }}>
          <i className="bi bi-search" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search completed tasks or projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {["All", "Low", "Medium", "High", "Critical"].map((pr) => (
            <button
              key={pr}
              className={`btn btn-sm ${priorityFilter === pr ? "tp-btn-primary" : "btn-light"}`}
              style={{ borderRadius: 10, fontSize: "0.8rem" }}
              onClick={() => setPriorityFilter(pr)}
            >
              {pr === "All" ? "All Priorities" : pr}
            </button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <div className="row g-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="col-12" key={i}>
              <div className="tp-skeleton" style={{ height: 96 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="tp-glass p-5 text-center">
          <i className="bi bi-clock-history display-4 mb-3 d-block" style={{ color: "#94A3B8" }} />
          <h5 className="fw-bold mb-2" style={{ color: "var(--tp-text)" }}>No completed tasks found</h5>
          <p className="mb-0 small" style={{ color: "#94A3B8" }}>
            {history.length === 0
              ? "Tasks you complete will appear here automatically and stay for the retention period."
              : "No completed tasks match your current filters."}
          </p>
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          {filtered.map((h) => {
            const pc = priorityColors[h.priority] || priorityColors.Medium;
            const isOpen = !!expanded[h._id];
            return (
              <motion.div className="mb-3" key={h._id} variants={itemVariants}>
                <div className="tp-card p-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div className="flex-grow-1" style={{ minWidth: 260 }}>
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        {h.task ? (
                          <Link to={`/app/tasks/${h.task._id || h.task}`} className="text-decoration-none">
                            <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.95rem" }}>
                              {h.title}
                            </h6>
                          </Link>
                        ) : (
                          <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.95rem" }}>
                            {h.title}
                          </h6>
                        )}
                        <span className="badge" style={{ background: pc.bg, color: pc.color, fontSize: "0.72rem" }}>
                          {h.priority}
                        </span>
                        {h.projectName && (
                          <span className="badge" style={{ background: h.projectType === "InfrastructureProject" ? "rgba(167, 139, 250, 0.15)" : "rgba(56, 189, 248, 0.12)", color: h.projectType === "InfrastructureProject" ? "#A78BFA" : "#38BDF8", fontSize: "0.7rem" }}>
                            <i className="bi bi-folder2 me-1" />{h.projectName}
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <p className="small mb-2" style={{ color: "#94A3B8", maxWidth: 700, fontSize: "0.85rem" }}>
                          {h.description}
                        </p>
                      )}
                    </div>

                    <div className="d-flex flex-row flex-md-column align-items-center align-items-md-end gap-2">
                      <div className="d-flex align-items-center gap-2">
                        <i className="bi bi-check-circle-fill" style={{ color: "#22C55E" }} />
                        <span className="fw-semibold" style={{ color: "#22C55E", fontSize: "0.85rem" }}>
                          {formatDate(h.completedAt)}
                        </span>
                        <span className="small" style={{ color: "#64748B", fontSize: "0.72rem" }}>({timeAgo(h.completedAt)})</span>
                      </div>
                      <div className="small" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                        {h.completedBy?.name ? `Completed by ${h.completedBy.name}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top flex-wrap gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="d-flex align-items-center gap-3 small" style={{ color: "#94A3B8", fontSize: "0.78rem" }}>
                      <span><i className="bi bi-calendar3 me-1" />Due: <strong style={{ color: "var(--tp-text)" }}>{formatDate(h.dueDate)}</strong></span>
                      {h.assignedTo && (
                        <span><i className="bi bi-person me-1" />Assignee: <strong style={{ color: "var(--tp-text)" }}>{h.assignedTo.name || "—"}</strong></span>
                      )}
                      <span><i className="bi bi-clock-history me-1" />Kept for <strong style={{ color: "var(--tp-text)" }}>{retentionDays} days</strong></span>
                    </div>
                    <button className="btn btn-sm btn-light" style={{ borderRadius: 8 }} onClick={() => toggleExpand(h._id)}>
                      <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-chevron-down"} me-1`} />
                      {isOpen ? "Hide Details" : "View Details"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 rounded p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="row g-2 small" style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                        <div className="col-md-6">
                          <div className="mb-2"><i className="bi bi-tag me-2" />Status: <strong style={{ color: "#22C55E" }}>Completed</strong></div>
                          <div className="mb-2"><i className="bi bi-star me-2" />Priority: <strong style={{ color: "var(--tp-text)" }}>{h.priority}</strong></div>
                          <div className="mb-2"><i className="bi bi-folder me-2" />Project: <strong style={{ color: "var(--tp-text)" }}>{h.projectName}</strong></div>
                          <div className="mb-2"><i className="bi bi-calendar-event me-2" />Due Date: <strong style={{ color: "var(--tp-text)" }}>{formatDate(h.dueDate)}</strong></div>
                        </div>
                        <div className="col-md-6">
                          <div className="mb-2"><i className="bi bi-check2-circle me-2" />Completed: <strong style={{ color: "var(--tp-text)" }}>{formatDate(h.completedAt)}</strong></div>
                          <div className="mb-2"><i className="bi bi-person-badge me-2" />Completed By: <strong style={{ color: "var(--tp-text)" }}>{h.completedBy?.name || "—"}</strong></div>
                          <div className="mb-2"><i className="bi bi-person me-2" />Assigned To: <strong style={{ color: "var(--tp-text)" }}>{h.assignedTo?.name || "Unassigned"}</strong></div>
                        </div>
                        {h.description && (
                          <div className="col-12 mt-1 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                            <i className="bi bi-card-text me-2" />Description: <span style={{ color: "var(--tp-text)" }}>{h.description}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
};

export default TaskHistory;