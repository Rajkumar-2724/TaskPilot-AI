import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import api, { SERVER_BASE_URL } from "../services/api.js";
import { toast } from "react-toastify";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const statusColors = {
  Planning: { bg: "rgba(148, 163, 184, 0.15)", color: "#94A3B8", border: "rgba(148, 163, 184, 0.3)" },
  Active: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", border: "rgba(56, 189, 248, 0.3)" },
  "On Hold": { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" },
  Completed: { bg: "rgba(34, 197, 94, 0.15)", color: "#22C55E", border: "rgba(34, 197, 94, 0.3)" },
  Cancelled: { bg: "rgba(239, 68, 68, 0.15)", color: "#EF4444", border: "rgba(239, 68, 68, 0.3)" },
  Suspended: { bg: "rgba(245, 158, 11, 0.15)", color: "#F59E0B", border: "rgba(245, 158, 11, 0.3)" },
};

const Projects = () => {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const { triggerRefresh } = useDashboardRefresh();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [form, setForm] = useState({ name: "", description: "", deadline: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api.get("/projects", { params: { excludeOverdue: true } }),
      api.get("/infrastructure/projects"),
    ])
      .then(([regular, infra]) => {
        const reg = regular.status === "fulfilled" ? regular.value.data.projects || [] : [];
        const inf = infra.status === "fulfilled" ? infra.value.data.projects || [] : [];
        setProjects([...reg, ...inf]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const downloadPDF = async (projectId, projectName) => {
    const token = localStorage.getItem("tp_token");
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/reports/project/${projectId}/pdf-report`, {
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
      a.download = `${projectName || "project"}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to download PDF");
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/projects", { name: form.name, description: form.description, deadline: form.deadline });
      toast.success("Project created successfully!");
      setShowModal(false);
      setForm({ name: "", description: "", deadline: "" });
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const allProjects = [...filteredProjects];

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
      {/* Top Header */}
      <motion.div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2" variants={itemVariants}>
        <div>
          <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span className="tp-gradient-text">Projects</span>
          </h3>
          <p className="small mb-0" style={{ color: "#94A3B8" }}>
            Track and oversee ongoing workspace initiatives ({allProjects.length} total)
          </p>
        </div>
        <div className="d-flex gap-2">
          {isManagerOrAdmin && <button className="tp-btn-primary" onClick={() => setShowModal(true)} style={{ borderRadius: 12 }}>
            <i className="bi bi-plus-lg me-1" /> Create Project
          </button>}
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div className="tp-glass p-3 mb-4 d-flex flex-wrap align-items-center justify-content-between gap-3" variants={itemVariants}>
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: 400 }}>
          <i className="bi bi-search" style={{ color: "#94A3B8" }} />
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {["All", "Planning", "Active", "On Hold", "Completed"].map((st) => (
            <button
              key={st}
              className={`btn btn-sm ${statusFilter === st ? "tp-btn-primary" : "btn-light"}`}
              style={{ borderRadius: 10, fontSize: "0.8rem" }}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Projects Grid */}
      {loading ? (
        <div className="row g-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="col-md-4" key={i}>
              <div className="tp-skeleton" style={{ height: 190 }} />
            </div>
          ))}
        </div>
      ) : allProjects.length === 0 ? (
        <div className="tp-glass p-5 text-center">
          <i className="bi bi-folder2-open display-4 mb-3 d-block" style={{ color: "#94A3B8" }} />
          <h5 className="fw-bold mb-2" style={{ color: "var(--tp-text)" }}>No projects found</h5>
          <p className="mb-3 small" style={{ color: "#94A3B8" }}>
            {search || statusFilter !== "All" ? "No projects match your active search filters." : "Create your first project to get started!"}
          </p>
          {isManagerOrAdmin && <button className="tp-btn-primary" onClick={() => setShowModal(true)}>
            <i className="bi bi-plus-lg me-1" /> Create Project
          </button>}
        </div>
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          <div className="row g-3">
            {allProjects.map((p) => {
              const sc = statusColors[p.status] || statusColors.Planning;
              const progressValue = p.progress ?? p.physicalProgress ?? 0;
              return (
                <motion.div className="col-md-6 col-lg-4" key={p._id} variants={itemVariants}>
                  <div className="tp-card p-4 h-100 d-flex flex-column justify-content-between position-relative">
                    <Link to={`/app/projects/${p._id}`} className="text-decoration-none">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h5 className="fw-bold mb-0 text-truncate me-2" style={{ color: "var(--tp-text)", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                          {p.name}
                        </h5>
                        <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {p.status}
                        </span>
                      </div>
                      <p className="small mb-3 text-truncate-2" style={{ color: "#94A3B8", minHeight: 40, fontSize: "0.85rem" }}>
                        {p.description || "No description provided."}
                      </p>
                      <div className="mb-2">
                        <div className="d-flex justify-content-between small mb-1" style={{ color: "#94A3B8", fontSize: "0.75rem" }}>
                          <span>Progress</span>
                          <span style={{ color: "#38BDF8", fontWeight: 600 }}>{progressValue}%</span>
                        </div>
                        <div className="progress" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                          <motion.div
                            className="progress-bar"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressValue}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    </Link>

                    <div className="d-flex justify-content-between align-items-center pt-2 mt-2 border-top small" style={{ borderColor: "rgba(255,255,255,0.06)", color: "#94A3B8" }}>
                      <div className="d-flex align-items-center gap-1">
                        <i className="bi bi-people" />
                        <span>{p.members?.length || 0} members</span>
                        <span className="ms-1" style={{ color: "#38BDF8" }}>{p.taskCount || 0} tasks</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadPDF(p._id, p.name);
                          }}
                          className="btn btn-sm btn-outline-light p-1 px-2"
                          style={{ borderRadius: 8, fontSize: "0.75rem" }}
                          title="Download PDF Report"
                        >
                          <i className="bi bi-file-pdf text-danger me-1" /> PDF
                        </button>
                        <Link to={`/app/projects/${p._id}`} className="btn btn-sm tp-btn-primary p-1 px-2" style={{ borderRadius: 8, fontSize: "0.75rem" }}>
                          View <i className="bi bi-arrow-right ms-1" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* New Project Modal */}
      {showModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: "var(--tp-text)" }}>
                  <i className="bi bi-folder-plus me-2" style={{ color: "#38BDF8" }} />
                  Create New Project
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowModal(false)} />
              </div>
              <form onSubmit={createProject}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small">Project Name <span className="text-danger">*</span></label>
                    <input
                      required
                      className="form-control"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. AI Workflow Optimization"
                      disabled={!isManagerOrAdmin}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Description</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Objectives, deliverables, and scope..."
                      disabled={!isManagerOrAdmin}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Target Deadline</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.deadline}
                      onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                      disabled={!isManagerOrAdmin}
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button className="tp-btn-primary" disabled={saving || !isManagerOrAdmin} style={{ borderRadius: 10 }}>
                    {saving ? "Creating..." : "Create Project"}
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

export default Projects;