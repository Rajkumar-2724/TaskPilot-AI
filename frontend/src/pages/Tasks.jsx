import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const Tasks = () => {
  const { user } = useAuth();
  const { triggerRefresh } = useDashboardRefresh();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", priority: "", project: "", assignee: "", search: "" });
  const [sort, setSort] = useState({ field: "createdAt", order: "desc" });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", project: "", assignedTo: "", priority: "Medium", status: "To Do", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";

  const load = () => {
    setLoading(true);
    const params = { ...filter, excludeOverdue: true };
    if (sort.field) {
      params.sort = `${sort.order === "desc" ? "-" : ""}${sort.field}`;
    }
    api.get("/tasks", { params }).then(({ data }) => setTasks(data.tasks)).finally(() => setLoading(false));
    api.get("/projects").then(({ data }) => setProjects(data.projects || []));
  };

  useEffect(load, []);

  const createTask = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...taskForm };
      if (!payload.assignedTo) payload.assignedTo = undefined;
      if (!payload.project) payload.project = undefined;
      if (taskForm.project) {
        const selectedProject = projects.find((p) => p._id === taskForm.project);
        payload.projectType = selectedProject?.projectType || "Project";
      }
      await api.post("/tasks", payload);
      toast.success("Task created successfully");
      setShowTaskModal(false);
      setTaskForm({ title: "", description: "", project: "", assignedTo: "", priority: "Medium", status: "To Do", dueDate: "" });
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

const getProjectMembers = (projectId) => {
  const project = projects.find((p) => p._id === projectId);
  if (!project) return [];
  if (project.projectType === "InfrastructureProject") {
    if (project.projectManager) return [{ ...project.projectManager, isOwner: true }];
    return [];
  }
  const members = project.members || [];
  if (project.owner) members.push({ ...project.owner, isOwner: true });
  return members;
};

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
      <motion.div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2" variants={itemVariants}>
        <h3 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Tasks</span>
        </h3>
        <div className="d-flex gap-2">
          {isManagerOrAdmin && <button className="tp-btn-primary" onClick={() => setShowTaskModal(true)} style={{ borderRadius: 12 }}>
            <i className="bi bi-plus-lg me-1" /> New Task
          </button>}
        </div>
      </motion.div>

      <motion.div className="tp-glass p-3 mb-4" variants={itemVariants}>
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label small mb-1" style={{ color: '#94A3B8' }}>Search</label>
            <input type="text" className="form-control form-control-sm" placeholder="Search by title..." value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" style={{ color: '#94A3B8' }}>Project</label>
            <select className="form-select form-select-sm" value={filter.project} onChange={(e) => setFilter({ ...filter, project: e.target.value })}>
              <option value="">All Projects</option>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" style={{ color: '#94A3B8' }}>Status</label>
            <select className="form-select form-select-sm" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="">All Status</option>
              <option>To Do</option><option>In Progress</option><option>Review</option><option>Completed</option>
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" style={{ color: '#94A3B8' }}>Priority</label>
            <select className="form-select form-select-sm" value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
              <option value="">All Priority</option>
              <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" style={{ color: '#94A3B8' }}>Sort By</label>
            <select className="form-select form-select-sm" value={`${sort.field},${sort.order}`} onChange={(e) => {
              const [field, order] = e.target.value.split(",");
              setSort({ field, order });
            }}>
              <option value="createdAt,desc">Newest</option>
              <option value="createdAt,asc">Oldest</option>
              <option value="dueDate,asc">Due Date (Asc)</option>
              <option value="dueDate,desc">Due Date (Desc)</option>
              <option value="priority,desc">Priority (High First)</option>
              <option value="priority,asc">Priority (Low First)</option>
              <option value="title,asc">Title (A-Z)</option>
            </select>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="tp-skeleton" style={{ height: 300 }} />
      ) : tasks.length === 0 ? (
        <div className="tp-glass p-5 text-center" style={{ color: '#94A3B8' }}>No tasks found.</div>
      ) : (
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Title</th><th>Project</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t._id} style={{ cursor: "pointer" }} onClick={() => navigate(`/app/tasks/${t._id}`)}>
                    <td style={{ color: 'var(--tp-text)', fontWeight: 500 }}>{t.title}</td>
                    <td style={{ color: '#94A3B8' }} className="small">{t.project?.name}</td>
                    <td><span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>{t.status}</span></td>
                    <td><span className={`badge ${priorityBadge[t.priority]}`}>{t.priority}</span></td>
                    <td style={{ color: 'var(--tp-text)' }}>{t.assignedTo?.name || "Unassigned"}</td>
                    <td style={{ color: '#94A3B8' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {showTaskModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: 'blur(8px)' }} onClick={() => setShowTaskModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0">
              <div className="modal-header border-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>New Task</h5>
                <button className="btn-close btn-close-white" onClick={() => setShowTaskModal(false)} />
              </div>
              <form onSubmit={createTask}>
                <div className="modal-body">
                  <div className="mb-3"><label className="form-label">Title</label>
                    <input required className="form-control" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} disabled={!isManagerOrAdmin} /></div>
                  <div className="mb-3"><label className="form-label">Description</label>
                    <textarea className="form-control" rows={2} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} disabled={!isManagerOrAdmin} /></div>
                  <div className="row">
                    <div className="col-6 mb-3"><label className="form-label">Project</label>
                      <select className="form-select" value={taskForm.project} onChange={(e) => setTaskForm({ ...taskForm, project: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option value="">Select Project</option>
                        {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select></div>
                    <div className="col-6 mb-3"><label className="form-label">Priority</label>
                      <select className="form-select" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                      </select></div>
                  </div>
                  <div className="row">
                    <div className="col-6 mb-3"><label className="form-label">Status</label>
                      <select className="form-select" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option>To Do</option><option>In Progress</option><option>Review</option><option>Completed</option>
                      </select></div>
                    <div className="col-6 mb-3"><label className="form-label">Due Date</label>
                      <input type="date" className="form-control" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} disabled={!isManagerOrAdmin} /></div>
                  </div>
                  <div className="mb-3"><label className="form-label">Assign to</label>
                    <select className="form-select" value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} disabled={!isManagerOrAdmin}>
                      <option value="">Unassigned</option>
                      {taskForm.project && getProjectMembers(taskForm.project).map((m) => <option key={m._id} value={m._id}>{m.name}{m.isOwner ? " (owner)" : ""}</option>)}
                    </select></div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-light" onClick={() => setShowTaskModal(false)}>Cancel</button>
                  <button className="tp-btn-primary" disabled={saving || !isManagerOrAdmin}>{saving ? "Creating..." : "Create Task"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default Tasks;
