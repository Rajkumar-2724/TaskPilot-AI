import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext.jsx";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const statusColors = {
  Planning: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8" },
  Active: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" },
  "On Hold": { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  Suspended: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
};

const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const daysOverdue = (date) => {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)));
};

const Overdue = () => {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const { triggerRefresh } = useDashboardRefresh();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [projectMeta, setProjectMeta] = useState({});
  const [search, setSearch] = useState("");
  const [view, setView] = useState("tasks");
  const [loading, setLoading] = useState(true);
  const [reassign, setReassign] = useState(null);
  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/tasks", { params: { overdue: true } }),
      api.get("/projects", { params: { overdue: true } }),
      api.get("/auth/users"),
      api.get("/projects"),
    ])
      .then(([{ data: td }, { data: pd }, { data: ud }, { data: md }]) => {
        setTasks(td.tasks || []);
        setProjects(pd.projects || []);
        setAllUsers(ud.users || []);
        const meta = {};
        (md.projects || []).forEach((p) => (meta[p._id] = p));
        setProjectMeta(meta);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const getProjectMembers = (projectId) => {
    const p = projectMeta[projectId];
    if (!p) return [];
    const members = p.members && p.members.length ? [...p.members] : [];
    if (p.owner) members.unshift(p.owner);
    if (p.projectManager && !members.some((m) => m._id === p.projectManager._id)) members.unshift(p.projectManager);
    return members.filter((m) => m && m._id);
  };

  const filteredTasks = tasks.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.project?.name || "").toLowerCase().includes(q) ||
      (t.assignedTo?.name || "").toLowerCase().includes(q)
    );
  });

  const filteredProjects = projects.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.projectCode || "").toLowerCase().includes(q);
  });

  const reassignTask = async () => {
    if (!target) return toast.error("Please choose an assignee");
    setSubmitting(true);
    try {
      await api.put(`/tasks/${reassign.item._id}/assign`, { assignedTo: target });
      toast.success("Task reassigned successfully!");
      setReassign(null);
      setTarget("");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reassign task");
    } finally {
      setSubmitting(false);
    }
  };

  const reassignProject = async () => {
    if (!target) return toast.error("Please choose a new project manager");
    setSubmitting(true);
    try {
      await api.put(`/projects/${reassign.item._id}/reassign`, { userId: target });
      toast.success("Project reassigned successfully!");
      setReassign(null);
      setTarget("");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reassign project");
    } finally {
      setSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const maxTaskOverdue = daysOverdue([...tasks].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate);
  const maxProjectOverdue = daysOverdue([...projects].sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2" variants={itemVariants}>
        <div>
          <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span className="tp-gradient-text">Overdue</span>
          </h3>
          <p className="small mb-0" style={{ color: "#94A3B8" }}>
            Tasks and projects past their deadline ({tasks.length} tasks · {projects.length} projects)
          </p>
        </div>
        <button className="btn btn-light" style={{ borderRadius: 12 }} onClick={load} disabled={loading}>
          <i className={`bi ${loading ? "bi-arrow-repeat" : "bi-arrow-clockwise"} me-1`} /> Refresh
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div className="row g-3 mb-4" variants={itemVariants}>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(239, 68, 68, 0.15)", color: "#EF4444" }}>
              <i className="bi bi-list-task fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{tasks.length}</div>
              <div className="small" style={{ color: "#94A3B8" }}>Overdue Tasks</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" }}>
              <i className="bi bi-folder2-open fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{projects.length}</div>
              <div className="small" style={{ color: "#94A3B8" }}>Overdue Projects</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="tp-glass p-3 d-flex align-items-center gap-3">
            <div className="rounded d-flex align-items-center justify-content-center" style={{ width: 46, height: 46, background: "rgba(168, 85, 247, 0.15)", color: "#A855F7" }}>
              <i className="bi bi-hourglass-bottom fs-4" />
            </div>
            <div>
              <div className="fs-4 fw-bold" style={{ color: "var(--tp-text)" }}>{Math.max(maxTaskOverdue, maxProjectOverdue)}</div>
              <div className="small" style={{ color: "#94A3B8" }}>Max Days Overdue</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filter + Tabs */}
      <motion.div className="tp-glass p-3 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3" variants={itemVariants}>
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 400 }}>
          <i className="bi bi-search" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search overdue tasks or projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button
            className={`btn btn-sm ${view === "tasks" ? "tp-btn-primary" : "btn-light"}`}
            style={{ borderRadius: 10, fontSize: "0.8rem" }}
            onClick={() => setView("tasks")}
          >
            <i className="bi bi-list-task me-1" /> Overdue Tasks ({tasks.length})
          </button>
          <button
            className={`btn btn-sm ${view === "projects" ? "tp-btn-primary" : "btn-light"}`}
            style={{ borderRadius: 10, fontSize: "0.8rem" }}
            onClick={() => setView("projects")}
          >
            <i className="bi bi-folder2-open me-1" /> Overdue Projects ({projects.length})
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="row g-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="col-12" key={i}>
              <div className="tp-skeleton" style={{ height: 110 }} />
            </div>
          ))}
        </div>
      ) : view === "tasks" ? (
        filteredTasks.length === 0 ? (
          <div className="tp-glass p-5 text-center">
            <i className="bi bi-check2-circle display-4 mb-3 d-block" style={{ color: "#94A3B8" }} />
            <h5 className="fw-bold mb-2" style={{ color: "var(--tp-text)" }}>No overdue tasks</h5>
            <p className="mb-0 small" style={{ color: "#94A3B8" }}>Tasks past their due date will appear here for reassignment.</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filteredTasks.map((t) => {
              const od = daysOverdue(t.dueDate);
              const members = getProjectMembers(t.project?._id || t.project);
              return (
                <motion.div className="mb-3" key={t._id} variants={itemVariants}>
                  <div className="tp-card p-4">
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                      <div className="flex-grow-1" style={{ minWidth: 260 }}>
                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                          <Link to={`/app/tasks/${t._id}`} className="text-decoration-none">
                            <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.95rem" }}>
                              {t.title}
                            </h6>
                          </Link>
                          <span className={`badge ${priorityBadge[t.priority] || "tp-badge-medium"}`} style={{ fontSize: "0.72rem" }}>{t.priority}</span>
                          {t.project?.name && (
                            <span className="badge" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#38BDF8", fontSize: "0.7rem" }}>
                              <i className="bi bi-folder2 me-1" />{t.project.name}
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-3 small" style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                          <span><i className="bi bi-person me-1" />Assignee: <strong style={{ color: "var(--tp-text)" }}>{t.assignedTo?.name || "Unassigned"}</strong></span>
                          <span><i className="bi bi-tag me-1" />Status: <strong style={{ color: "var(--tp-text)" }}>{t.status}</strong></span>
                        </div>
                      </div>
                      <div className="d-flex flex-column align-items-md-end gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#EF4444", fontSize: "0.75rem" }}>
                            <i className="bi bi-exclamation-octagon me-1" />{od} day{od === 1 ? "" : "s"} overdue
                          </span>
                        </div>
                        <div className="small" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                          <i className="bi bi-calendar-x me-1" />Due: <strong style={{ color: "#EF4444" }}>{formatDate(t.dueDate)}</strong>
                        </div>
                      </div>
                    </div>
                    {isManagerOrAdmin && (
                      <div className="d-flex justify-content-end align-items-center mt-3 pt-3 border-top gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <button className="btn btn-sm tp-btn-primary" style={{ borderRadius: 8 }} onClick={() => setReassign({ type: "task", item: t })}>
                          <i className="bi bi-arrow-repeat me-1" /> Reassign
                        </button>
                        {members.length === 0 && (
                          <span className="small text-muted">No members in this project yet</span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )
      ) : filteredProjects.length === 0 ? (
        <div className="tp-glass p-5 text-center">
          <i className="bi bi-check2-circle display-4 mb-3 d-block" style={{ color: "#94A3B8" }} />
          <h5 className="fw-bold mb-2" style={{ color: "var(--tp-text)" }}>No overdue projects</h5>
          <p className="mb-0 small" style={{ color: "#94A3B8" }}>Projects past their deadline will appear here for reassignment.</p>
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          {filteredProjects.map((p) => {
            const od = daysOverdue(p.deadline);
            const sc = statusColors[p.status] || statusColors.Planning;
            const isInfra = p.projectType === "InfrastructureProject";
            return (
              <motion.div className="mb-3" key={p._id} variants={itemVariants}>
                <div className="tp-card p-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div className="flex-grow-1" style={{ minWidth: 260 }}>
                      <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                        <Link to={`/app/projects/${p._id}`} className="text-decoration-none">
                          <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: "0.95rem" }}>
                            {p.name}
                          </h6>
                        </Link>
                        <span className="badge" style={{ background: sc.bg, color: sc.color, fontSize: "0.72rem" }}>{p.status}</span>
                      </div>
                      {p.description && (
                        <p className="small mb-2 text-truncate-2" style={{ color: "#94A3B8", maxWidth: 700, fontSize: "0.85rem" }}>{p.description}</p>
                      )}
                      <div className="d-flex align-items-center gap-3 small" style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                        {p.owner && <span><i className="bi bi-person me-1" />Manager: <strong style={{ color: "var(--tp-text)" }}>{p.owner.name}</strong></span>}
                        <span><i className="bi bi-check2-circle me-1" />Tasks: <strong style={{ color: "var(--tp-text)" }}>{p.taskCount || 0}</strong></span>
                        {isInfra && p.projectCode && <span><i className="bi bi-hash me-1" />{p.projectCode}</span>}
                      </div>
                    </div>
                    <div className="d-flex flex-column align-items-md-end gap-2">
                      <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#EF4444", fontSize: "0.75rem" }}>
                        <i className="bi bi-exclamation-octagon me-1" />{od} day{od === 1 ? "" : "s"} overdue
                      </span>
                      <div className="small" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                        <i className="bi bi-calendar-x me-1" />Deadline: <strong style={{ color: "#EF4444" }}>{formatDate(p.deadline)}</strong>
                      </div>
                      <div className="small" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                        Progress: <strong style={{ color: "#38BDF8" }}>{p.progress || 0}%</strong>
                      </div>
                    </div>
                  </div>
                  {isManagerOrAdmin && (
                    <div className="d-flex justify-content-end align-items-center mt-3 pt-3 border-top gap-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <button className="btn btn-sm tp-btn-primary" style={{ borderRadius: 8 }} onClick={() => setReassign({ type: "project", item: p })}>
                        <i className="bi bi-arrow-repeat me-1" /> Reassign Manager
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Reassign Modal */}
      {reassign && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={() => setReassign(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                  <i className="bi bi-arrow-repeat me-2" style={{ color: "#F59E0B" }} />
                  {reassign.type === "task" ? "Reassign Overdue Task" : "Reassign Overdue Project"}
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setReassign(null)} />
              </div>
              <div className="modal-body">
                <p className="small text-muted mb-3">
                  {reassign.type === "task"
                    ? `Choose a new assignee for "${reassign.item.title}".`
                    : `Choose a new project manager for "${reassign.item.name}".`}
                </p>
                <label className="form-label small">{reassign.type === "task" ? "New Assignee" : "New Manager"}</label>
                <select
                  className="form-select"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Select a user...</option>
                  {reassign.type === "task"
                    ? getProjectMembers(reassign.item.project?._id || reassign.item.project).map((m) => (
                        <option key={m._id} value={m._id}>{m.name} ({m.email})</option>
                      ))
                    : allUsers
                        .filter((u) => u._id !== (reassign.item.owner?._id || reassign.item.projectManager?._id))
                        .map((u) => (
                          <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                        ))}
                </select>
                {reassign.type === "task" && getProjectMembers(reassign.item.project?._id || reassign.item.project).length === 0 && (
                  <div className="form-text small mt-2" style={{ color: "#F59E0B" }}>
                    No members in this project yet. Add members from the project page first.
                  </div>
                )}
              </div>
              <div className="modal-footer border-0 pt-0">
                <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => setReassign(null)}>
                  Cancel
                </button>
                <button
                  className="tp-btn-primary"
                  style={{ borderRadius: 10 }}
                  disabled={submitting}
                  onClick={reassign.type === "task" ? reassignTask : reassignProject}
                >
                  {submitting ? "Reassigning..." : "Reassign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Overdue;