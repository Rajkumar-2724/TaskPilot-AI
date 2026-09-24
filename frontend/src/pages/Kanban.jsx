import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const COLUMNS = ["To Do", "In Progress", "Review", "Completed"];
const columnColors = {
  "To Do": '#94A3B8',
  "In Progress": '#38BDF8',
  "Review": '#A78BFA',
  "Completed": '#22C55E',
};
const priorityBadge = { Low: "tp-badge-low", Medium: "tp-badge-medium", High: "tp-badge-high", Critical: "tp-badge-critical" };

const Kanban = () => {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const { triggerRefresh } = useDashboardRefresh();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = {};
    if (projectFilter) params.project = projectFilter;
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    Promise.all([
      api.get("/tasks", { params }),
      api.get("/projects"),
    ]).then(([tRes, pRes]) => {
      setTasks(tRes.data.tasks);
      setProjects(pRes.data.projects);
    }).finally(() => setLoading(false));
  };

  useEffect(load, [projectFilter, statusFilter, priorityFilter]);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId;
    setTasks((prev) => prev.map((t) => (t._id === draggableId ? { ...t, status: newStatus } : t)));

    try {
      await api.put(`/tasks/${draggableId}/status`, { status: newStatus });
      toast.success(`Moved to "${newStatus}"`);
      triggerRefresh();
    } catch (err) {
      toast.error("Failed to update task status");
      load();
    }
  };

  const assignTask = async (taskId, assignedTo) => {
    try {
      await api.put(`/tasks/${taskId}/assign`, { assignedTo: assignedTo || undefined });
      toast.success(assignedTo ? "Task assigned" : "Task unassigned");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign task");
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

  if (loading) return <div className="tp-skeleton" style={{ height: 400 }} />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h3 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Kanban Board</span>
        </h3>
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm" style={{ width: 180 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option>To Do</option><option>In Progress</option><option>Review</option><option>Completed</option>
          </select>
          <select className="form-select form-select-sm" style={{ width: 130 }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All Priority</option>
            <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
          </select>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="row g-3">
          {COLUMNS.map((col) => (
            <div className="col-12 col-md-3" key={col}>
              <Droppable droppableId={col}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="tp-glass p-3"
                    style={{
                      minHeight: 300,
                      background: snapshot.isDraggingOver ? 'rgba(56, 189, 248, 0.06)' : undefined,
                      borderColor: snapshot.isDraggingOver ? 'rgba(56, 189, 248, 0.2)' : undefined,
                    }}
                  >
                    <h6 className="fw-bold mb-3 d-flex justify-content-between align-items-center" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                      <span style={{ color: columnColors[col] }}>{col}</span>
                      <span className="badge" style={{
                        background: `${columnColors[col]}20`,
                        color: columnColors[col],
                        border: `1px solid ${columnColors[col]}40`,
                      }}>
                        {tasks.filter((t) => t.status === col && (!projectFilter || t.project?.toString() === projectFilter) && (!statusFilter || t.status === statusFilter) && (!priorityFilter || t.priority === priorityFilter)).length}
                      </span>
                    </h6>
                    {tasks.filter((t) => t.status === col && (!projectFilter || t.project?.toString() === projectFilter) && (!statusFilter || t.status === statusFilter) && (!priorityFilter || t.priority === priorityFilter)).map((t, index) => (
                      <Draggable draggableId={t._id} index={index} key={t._id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className="tp-glass p-3 mb-2"
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: dragSnapshot.isDragging ? 0.85 : 1,
                              background: dragSnapshot.isDragging ? 'rgba(56, 189, 248, 0.08)' : undefined,
                            }}
                          >
                            <div className="fw-semibold small mb-1" style={{ color: 'var(--tp-text)' }}>{t.title}</div>
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span className={`badge ${priorityBadge[t.priority]}`} style={{ marginRight: '4px' }}>{t.priority}</span>
                              <span className="small" style={{ color: '#94A3B8' }}>{t.assignedTo?.name?.split(" ")[0] || "—"}</span>
                            </div>
                            <div className="small text-muted mt-1" style={{ fontSize: '0.75rem' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "No due date"}</div>
                            <select
                              className="form-select form-select-sm mt-2"
                              value={t.assignedTo?._id || ""}
                              onChange={(e) => assignTask(t._id, e.target.value)}
                              style={{ fontSize: '0.75rem' }}
                              disabled={!isManagerOrAdmin}
                            >
                              <option value="">Unassigned</option>
                              {getProjectMembers(t.project?._id || t.project).map((m) => (
                                <option key={m._id} value={m._id}>{m.name}{m.isOwner ? " (owner)" : ""}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </motion.div>
  );
};

export default Kanban;