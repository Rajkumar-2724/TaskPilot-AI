import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import api, { SERVER_BASE_URL } from "../services/api.js";
import { toast } from "react-toastify";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const priorityBadge = {
  Low: "tp-badge-low",
  Medium: "tp-badge-medium",
  High: "tp-badge-high",
  Critical: "tp-badge-critical",
};

const statusBadge = {
  Planning: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8" },
  Active: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8" },
  "On Hold": { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  Suspended: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" },
  Completed: { bg: "rgba(34, 197, 94, 0.15)", color: "#22C55E" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", color: "#EF4444" },
};

const statusFlow = {
  Project: {
    Planning: ["Active"],
    Active: ["On Hold", "Completed"],
    "On Hold": ["Active"],
    Completed: [],
    Cancelled: [],
  },
  InfrastructureProject: {
    Planning: ["Active"],
    Active: ["Suspended", "Completed"],
    Suspended: ["Active"],
    Completed: [],
    Cancelled: [],
  },
};

const getNextStatuses = (status, projectType) => statusFlow[projectType]?.[status] || [];

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const { triggerRefresh } = useDashboardRefresh();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "Medium", dueDate: "", assignedTo: "" });
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState(null);
  const [editStatus, setEditStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedProgress, setSelectedProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    // Try standard project first, fall back to infrastructure project
    api
      .get(`/projects/${id}`)
      .then(({ data }) => {
        setProject(data.project);
        setTasks(data.tasks || []);
        setActivityLogs(data.activityLogs || []);
        setSelectedStatus(data.project?.status || "Planning");
        setPendingStatus(data.project?.status || "Planning");
        setSelectedProgress(data.project?.progress || 0);
      })
      .catch(async (err) => {
        if (err.response?.status === 404) {
          try {
            const infraRes = await api.get(`/infrastructure/projects/${id}`);
            const p = infraRes.data.project;
            setProject({
              ...p,
              _id: p._id,
              name: p.name,
              description: p.description,
              status: p.status,
              progress: p.physicalProgress || 0,
              deadline: p.plannedEndDate,
              members: p.members || [],
              owner: p.projectManager ? { _id: p.projectManager._id, name: p.projectManager.name, email: p.projectManager.email, profilePicture: p.projectManager.profilePicture } : null,
              createdAt: p.createdAt,
              projectCode: p.projectCode,
              sector: p.sector,
              ministry: p.ministry,
              projectType: "InfrastructureProject",
            });
            setTasks([]);
            setActivityLogs(infraRes.data.activityLogs || []);
            setSelectedStatus(p.status || "Planning");
            setPendingStatus(p.status || "Planning");
            setSelectedProgress(p.physicalProgress || 0);
          } catch {
            toast.error("Project not found");
          }
        } else {
          toast.error(err.response?.data?.message || "Failed to load project");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const downloadPDF = async () => {
    const token = localStorage.getItem("tp_token");
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/reports/project/${id}/pdf-report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem("tp_token");
          localStorage.removeItem("tp_user");
          window.location.href = "/login";
          return;
        }
        throw new Error(errData.message || "Failed to download PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(project?.name || "project").replace(/\s+/g, "-")}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to download PDF");
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isInfra = project?.projectType === "InfrastructureProject";
      await api.post("/tasks", {
        ...taskForm,
        project: id,
        projectType: isInfra ? "InfrastructureProject" : "Project",
        assignedTo: taskForm.assignedTo || undefined,
      });
      toast.success("Task created successfully!");
      setShowTaskModal(false);
      setTaskForm({ title: "", description: "", priority: "Medium", dueDate: "", assignedTo: "" });
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const isInfra = project?.projectType === "InfrastructureProject";
      await api.post(isInfra ? `/infrastructure/projects/${id}/members` : `/projects/${id}/members`, { email: memberEmail.trim() });
      toast.success("Team member added successfully!");
      setShowAddMemberModal(false);
      setMemberEmail("");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add member. Check if email exists.");
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (userId, userName) => {
    if (!confirm(`Remove ${userName} from this project?`)) return;
    setRemovingMember(userId);
    try {
      const isInfra = project?.projectType === "InfrastructureProject";
      await api.delete(isInfra ? `/infrastructure/projects/${id}/members/${userId}` : `/projects/${id}/members/${userId}`);
      toast.success("Member removed from project");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove member");
    } finally {
      setRemovingMember(null);
    }
  };

  const handleStatusEdit = () => {
    const next = getNextStatuses(selectedStatus, project?.projectType);
    setPendingStatus(next[0] || selectedStatus);
    setEditStatus(true);
  };

  const submitProjectStatus = async () => {
    if (!pendingStatus) return;
    setStatusSubmitting(true);
    try {
      const isInfra = project?.projectType === "InfrastructureProject";
      if (isInfra) {
        await api.put(`/infrastructure/projects/${id}`, { status: pendingStatus });
      } else {
        await api.put(`/projects/${id}`, { status: pendingStatus });
      }
      toast.success("Project status updated successfully!");
      setEditStatus(false);
      setPendingStatus("");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update project status");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const updateProjectDetails = async () => {
    try {
      const statusToSend = pendingStatus || selectedStatus;
      const isInfra = project?.projectType === "InfrastructureProject";
      if (isInfra) {
        await api.put(`/infrastructure/projects/${id}`, {
          status: statusToSend,
          physicalProgress: Number(selectedProgress),
        });
      } else {
        await api.put(`/projects/${id}`, {
          status: statusToSend,
          progress: Number(selectedProgress),
        });
      }
      toast.success("Project updated successfully!");
      setEditStatus(false);
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update project");
    }
  };

  const deleteProject = async () => {
    if (!confirm("Are you sure you want to delete this project and all associated tasks?")) return;
    try {
      const isInfra = project?.projectType === "InfrastructureProject";
      if (isInfra) {
        await api.delete(`/infrastructure/projects/${id}`);
      } else {
        await api.delete(`/projects/${id}`);
      }
      toast.success("Project deleted successfully");
      triggerRefresh();
      navigate("/app/projects");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete project");
    }
  };

  if (loading) {
    return <div className="tp-skeleton" style={{ height: 350, borderRadius: 16 }} />;
  }

  if (!project) {
    return (
      <div className="tp-glass p-5 text-center">
        <i className="bi bi-exclamation-triangle display-4 text-warning mb-3 d-block" />
        <h5>Project not found</h5>
        <button className="tp-btn-primary mt-3" onClick={() => navigate("/app/projects")}>
          Back to Projects
        </button>
      </div>
    );
  }

  const isOwnerOrAdmin =
    user?.role === "Admin" || (project.owner?._id || project.owner)?.toString() === user?._id?.toString();

  const availableStatuses = getNextStatuses(project.status, project.projectType);

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
      {/* Header Banner */}
      <motion.div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3" variants={itemVariants}>
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/app/projects" className="btn btn-sm btn-outline-light rounded-circle p-1" style={{ width: 30, height: 30 }}>
              <i className="bi bi-chevron-left" />
            </Link>
            <h3 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
              {project.name}
            </h3>
            <span
              className="badge"
              style={{
                background: statusBadge[project.status]?.bg || "rgba(148,163,184,0.15)",
                color: statusBadge[project.status]?.color || "#94A3B8",
              }}
            >
              {project.status}
            </span>
            <span className="badge ms-2" style={{ background: project.projectType === "InfrastructureProject" ? "rgba(167, 139, 250, 0.15)" : "rgba(56, 189, 248, 0.15)", color: project.projectType === "InfrastructureProject" ? "#A78BFA" : "#38BDF8", border: `1px solid ${project.projectType === "InfrastructureProject" ? "rgba(167, 139, 250, 0.3)" : "rgba(56, 189, 248, 0.3)"}`, fontSize: "0.75rem" }}>
              {project.projectType === "InfrastructureProject" ? "Infrastructure" : "Regular"} Project
            </span>
          </div>
          <p className="small mb-0 ms-4 ps-2" style={{ color: "#94A3B8", maxWidth: 650 }}>
            {project.description || "No description provided."}
          </p>
        </div>

        {/* Action buttons */}
        <div className="d-flex gap-2 flex-wrap">
          {isManagerOrAdmin && <button className="tp-btn-primary" onClick={() => setShowTaskModal(true)} style={{ borderRadius: 12 }}>
            <i className="bi bi-plus-lg me-1" /> Add Task
          </button>}
          {isManagerOrAdmin && <button className="btn btn-light" onClick={() => setShowAddMemberModal(true)} style={{ borderRadius: 12 }}>
            <i className="bi bi-person-plus me-1" /> Add Member
          </button>}
          <Link to={`/app/projects/${id}/analysis`} className="btn btn-light" style={{ borderRadius: 12 }}>
            <i className="bi bi-graph-up-arrow me-1" style={{ color: "#6366F1" }} /> Analysis
          </Link>
          <button
            onClick={downloadPDF}
            className="btn btn-outline-light"
            style={{ borderRadius: 12 }}
            title="Download PDF Report"
          >
            <i className="bi bi-file-pdf text-danger me-1" /> Export PDF
          </button>
          {isManagerOrAdmin && (
            <button
              className="btn btn-outline-danger"
              style={{ borderRadius: 12 }}
              onClick={deleteProject}
              title="Delete Project"
            >
              <i className="bi bi-trash" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Grid Content */}
      <div className="row g-3 mb-4">
        {/* Tasks List */}
        <div className="col-lg-8">
          <motion.div className="tp-glass p-4" variants={itemVariants}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                <i className="bi bi-list-task me-2" style={{ color: "#38BDF8" }} />
                Project Tasks ({tasks.length})
              </h5>
              <Link to="/app/kanban" className="btn btn-sm btn-outline-light" style={{ borderRadius: 8, fontSize: "0.8rem" }}>
                Open Kanban <i className="bi bi-kanban ms-1" />
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-4" style={{ color: "#94A3B8" }}>
                <i className="bi bi-check2-circle fs-2 d-block mb-2 text-muted" />
                <p className="mb-2 small">No tasks yet in this project.</p>
                {isManagerOrAdmin && <button className="btn btn-sm tp-btn-primary" onClick={() => setShowTaskModal(true)} style={{ borderRadius: 8 }}>
                  Create First Task
                </button>}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Assignee</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr
                        key={t._id}
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/app/tasks/${t._id}`)}
                        className="tp-table-row"
                      >
                        <td style={{ color: "var(--tp-text)", fontWeight: 500 }}>{t.title}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: "rgba(56, 189, 248, 0.12)",
                              color: "#38BDF8",
                              border: "1px solid rgba(56, 189, 248, 0.25)",
                              fontSize: "0.75rem",
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${priorityBadge[t.priority] || "tp-badge-medium"}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td style={{ color: "var(--tp-text)", fontSize: "0.85rem" }}>
                          {t.assignedTo ? (
                            <div className="d-flex align-items-center gap-1">
                              <img
                                src={
                                  t.assignedTo.profilePicture ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(t.assignedTo.name)}&background=0D1328&color=38BDF8&bold=true`
                                }
                                alt=""
                                className="rounded-circle"
                                style={{ width: 22, height: 22 }}
                              />
                              <span>{t.assignedTo.name}</span>
                            </div>
                          ) : (
                            <span className="text-muted">Unassigned</span>
                          )}
                        </td>
                        <td style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>

        {/* Activity Log Section */}
        <div className="col-lg-4">
          <motion.div className="tp-glass p-4 mt-3" variants={itemVariants}>
            <h5 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
              <i className="bi bi-journal-text me-2" style={{ color: "#38BDF8" }} /> Activity Log
            </h5>
            {activityLogs.length === 0 ? (
              <p className="small" style={{ color: "#94A3B8" }}>No activity yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
                      <th>User</th>
                      <th>Action</th>
                      <th>Details</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log) => (
                      <tr key={log._id}>
                        <td style={{ color: "var(--tp-text)", fontSize: "0.85rem" }}>
                          {log.user?.name || "Unknown"}
                        </td>
                        <td>
                          <span className="badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", fontSize: "0.75rem" }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ color: "#94A3B8", fontSize: "0.8rem" }}>{log.details}</td>
                        <td style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>

        {/* Project Meta & Team Sidebar */}
        <div className="col-lg-4">
          {/* Status & Progress Card */}
          <motion.div className="tp-glass p-4 mb-3" variants={itemVariants}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                Status & Progress
              </h6>
              {isManagerOrAdmin && (
                <button
                  className="btn btn-sm btn-link text-decoration-none p-0"
                  style={{ color: "#38BDF8", fontSize: "0.8rem" }}
                  onClick={handleStatusEdit}
                >
                  {editStatus ? "Cancel" : "Edit"}
                </button>
              )}
            </div>

            {editStatus ? (
              <div className="p-2 rounded" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="mb-2">
                  <label className="form-label small" style={{ color: "#94A3B8" }}>Project Status</label>
                  {availableStatuses.length > 0 ? (
                    <select
                      className="form-select form-select-sm"
                      value={pendingStatus || availableStatuses[0]}
                      onChange={(e) => setPendingStatus(e.target.value)}
                    >
                      {availableStatuses.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="form-control form-control-sm" style={{ background: "rgba(255,255,255,0.03)", color: "#94A3B8", borderColor: "rgba(255,255,255,0.08)" }}>
                      {selectedStatus} (no further status changes allowed)
                    </div>
                  )}
                  <div className="form-text" style={{ color: "#64748B", fontSize: "0.72rem" }}>
                    Flow: Planning → Active → Completed
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label small" style={{ color: "#94A3B8" }}>Progress ({selectedProgress}%)</label>
                  <input
                    type="range"
                    className="form-range"
                    min={0}
                    max={100}
                    value={selectedProgress}
                    onChange={(e) => setSelectedProgress(e.target.value)}
                  />
                </div>
                <button className="btn btn-sm tp-btn-primary w-100" onClick={submitProjectStatus} disabled={statusSubmitting || availableStatuses.length === 0}>
                  {statusSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            ) : (
              <div>
                <div className="d-flex justify-content-between small mb-1" style={{ color: "#94A3B8" }}>
                  <span>Completion Rate</span>
                  <span style={{ color: "#38BDF8", fontWeight: 700 }}>{project.progress || 0}%</span>
                </div>
                <div className="progress mb-3" style={{ height: 8, background: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="progress-bar"
                    initial={{ width: 0 }}
                    animate={{ width: `${project.progress || 0}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>

                <div className="small mb-2 d-flex justify-content-between">
                  <span style={{ color: "#94A3B8" }}>Target Deadline:</span>
                  <span style={{ color: "var(--tp-text)" }}>
                    {project.deadline ? new Date(project.deadline).toLocaleDateString() : "Not set"}
                  </span>
                </div>
                <div className="small d-flex justify-content-between">
                  <span style={{ color: "#94A3B8" }}>Created On:</span>
                  <span style={{ color: "var(--tp-text)" }}>
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </motion.div>

          {/* Team Members Card */}
          {project?.projectType !== "InfrastructureProject" && (
          <motion.div className="tp-glass p-4" variants={itemVariants}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                <i className="bi bi-people me-1.5" style={{ color: "#38BDF8" }} />
                Team ({project.members?.length || 0})
              </h6>
              <button
                className="btn btn-sm btn-link text-decoration-none p-0"
                style={{ color: "#38BDF8", fontSize: "0.8rem" }}
                onClick={() => setShowAddMemberModal(true)}
              >
                + Add
              </button>
            </div>

            {/* Owner Item */}
            {project.owner && (
              <div
                className="d-flex align-items-center justify-content-between p-2 rounded mb-2"
                style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)" }}
              >
                <div className="d-flex align-items-center gap-2">
                  <img
                    src={
                      project.owner.profilePicture ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(project.owner.name)}&background=0D1328&color=F59E0B&bold=true`
                    }
                    className="rounded-circle"
                    style={{ width: 30, height: 30, objectFit: "cover" }}
                    alt=""
                  />
                  <div>
                    <div className="small fw-semibold" style={{ color: "var(--tp-text)" }}>
                      {project.owner.name}
                    </div>
                    <div className="small text-muted" style={{ fontSize: "0.7rem" }}>
                      {project.owner.email}
                    </div>
                  </div>
                </div>
                <span className="badge" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#F59E0B", fontSize: "0.68rem" }}>
                  Owner
                </span>
              </div>
            )}

            {/* Members List */}
            {project.members?.map((m) => (
              <div
                key={m._id}
                className="d-flex align-items-center justify-content-between p-2 rounded mb-2"
                style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.05)" }}
              >
                <div className="d-flex align-items-center gap-2">
                  <img
                    src={
                      m.profilePicture ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=0D1328&color=38BDF8&bold=true`
                    }
                    className="rounded-circle"
                    style={{ width: 28, height: 28, objectFit: "cover" }}
                    alt=""
                  />
                  <div>
                    <div className="small fw-semibold" style={{ color: "var(--tp-text)" }}>
                      {m.name}
                    </div>
                    <div className="small text-muted" style={{ fontSize: "0.7rem" }}>
                      {m.email}
                    </div>
                  </div>
                </div>
                {isManagerOrAdmin && (
                  <button
                    className="btn btn-sm btn-outline-danger p-1"
                    style={{ borderRadius: 6, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={() => removeMember(m._id, m.name)}
                    disabled={removingMember === m._id}
                    title="Remove member"
                  >
                    {removingMember === m._id ? "..." : <i className="bi bi-x" />}
                  </button>
                )}
              </div>
            ))}

            {isManagerOrAdmin && <button
              className="btn btn-sm tp-btn-primary w-100 mt-2"
              onClick={() => setShowAddMemberModal(true)}
              style={{ borderRadius: 8 }}
            >
              <i className="bi bi-person-plus me-1" /> Add Team Member
            </button>}
          </motion.div>
          )}
        </div>
      </div>

      {/* New Task Modal */}
      {showTaskModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={() => setShowTaskModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                  <i className="bi bi-plus-circle me-2" style={{ color: "#38BDF8" }} />
                  Create Task for {project.name}
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowTaskModal(false)} />
              </div>
              <form onSubmit={createTask}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small">Task Title <span className="text-danger">*</span></label>
                    <input
                      required
                      className="form-control"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      placeholder="e.g. Implement API route caching"
                      disabled={!isManagerOrAdmin}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                      placeholder="Detailed task description..."
                      disabled={!isManagerOrAdmin}
                    />
                  </div>
                  <div className="row">
                    <div className="col-6 mb-3">
                      <label className="form-label small">Priority</label>
                      <select
                        className="form-select"
                        value={taskForm.priority}
                        onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                        disabled={!isManagerOrAdmin}
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Critical</option>
                      </select>
                    </div>
                    <div className="col-6 mb-3">
                      <label className="form-label small">Due Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={taskForm.dueDate}
                        onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                        disabled={!isManagerOrAdmin}
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Assignee</label>
                    <select
                      className="form-select"
                      value={taskForm.assignedTo}
                      onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                      disabled={!isManagerOrAdmin}
                    >
                      <option value="">Unassigned</option>
                      {project.owner && (
                        <option value={project.owner._id}>
                          {project.owner.name} (Owner)
                        </option>
                      )}
                      {project.members?.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => setShowTaskModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="tp-btn-primary" disabled={saving || !isManagerOrAdmin} style={{ borderRadius: 10 }}>
                    {saving ? "Creating..." : "Create Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={() => setShowAddMemberModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                  <i className="bi bi-person-plus me-2" style={{ color: "#38BDF8" }} />
                  Invite Member to Project
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowAddMemberModal(false)} />
              </div>
              <form onSubmit={handleAddMember}>
                <div className="modal-body">
                  <p className="small text-muted mb-3">
                    Enter the registered email of the team member to add them to <strong>{project.name}</strong>.
                  </p>
                  <div className="mb-3">
                    <label className="form-label small">User Email Address <span className="text-danger">*</span></label>
                    <input
                      type="email"
                      required
                      className="form-control"
                      placeholder="e.g. member@company.com"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => setShowAddMemberModal(false)}>
                    Cancel
                  </button>
                  <button className="tp-btn-primary" disabled={addingMember} style={{ borderRadius: 10 }}>
                    {addingMember ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ProjectDetails;
