import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

const TaskDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === "Manager" || user?.role === "Admin";
  const { triggerRefresh } = useDashboardRefresh();
  const [task, setTask] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "Medium", status: "To Do", dueDate: "", assignedTo: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [pendingStatus, setPendingStatus] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const load = () => {
    api.get(`/tasks/${id}`).then(({ data }) => setTask(data.task)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const updateStatus = async (status) => {
    await api.put(`/tasks/${id}/status`, { status });
    toast.success(`Status updated to ${status}`);
    load();
    triggerRefresh();
  };

  const handleStatusSelect = (status) => {
    setPendingStatus(status);
  };

  const submitStatus = async () => {
    if (!pendingStatus) return;
    setStatusSubmitting(true);
    try {
      await updateStatus(pendingStatus);
      setPendingStatus("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/tasks/${id}/comments`, { text: comment });
    setComment("");
    load();
  };

  const deleteTask = async () => {
    if (!confirm("Delete this task?")) return;
    await api.delete(`/tasks/${id}`);
    toast.success("Task deleted");
    triggerRefresh();
    navigate(-1);
  };

  const openEditModal = () => {
    setEditForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
      assignedTo: task.assignedTo?._id || "",
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.assignedTo) payload.assignedTo = undefined;
      await api.put(`/tasks/${id}`, payload);
      toast.success("Task updated successfully");
      setShowEditModal(false);
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  const assignTask = async (assignedTo) => {
    try {
      await api.put(`/tasks/${id}/assign`, { assignedTo: assignedTo || undefined });
      toast.success(assignedTo ? "Task assigned successfully" : "Task unassigned");
      load();
      triggerRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign task");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/tasks/${id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("File uploaded successfully");
      setShowUploadModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadFile(null);
    }
  };

  const downloadAttachment = (url, name) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  if (loading) return <div className="tp-skeleton" style={{ height: 300 }} />;
  if (!task) return <div className="tp-glass p-4 text-center" style={{ color: '#94A3B8' }}>Task not found</div>;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div className="row g-3" variants={containerVariants} initial="hidden" animate="visible">
      <div className="col-md-8">
        <motion.div className="tp-glass p-4 mb-3" variants={itemVariants}>
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <h4 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
              {task.title}
            </h4>
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-sm btn-outline-light" style={{ borderRadius: 10 }} onClick={openEditModal} title="Edit Task" disabled={!isManagerOrAdmin}><i className="bi bi-pencil" /></button>
              <button className="btn btn-sm btn-outline-light" style={{ borderRadius: 10 }} onClick={() => setShowUploadModal(true)} title="Upload Attachment"><i className="bi bi-paperclip" /></button>
              <button className="btn btn-sm" style={{ borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444' }} onClick={deleteTask} title="Delete Task" disabled={!isManagerOrAdmin}><i className="bi bi-trash" /></button>
            </div>
          </div>
          <p style={{ color: '#94A3B8', lineHeight: 1.6 }}>{task.description || "No description provided."}</p>

          {/* Status Pills */}
          <div className="d-flex gap-2 flex-wrap mt-3">
            <span className="small text-muted me-2 align-self-center fw-bold">Status:</span>
            {["To Do", "In Progress", "Review", "Completed"].map((s) => {
              const isSelected = pendingStatus === s;
              const isCurrent = task.status === s;
              const isClickable = ["To Do", "In Progress", "Review", "Completed"].includes(task.status) && task.status !== s;
              return (
                <button
                  key={s}
                  className={`btn btn-sm ${isSelected || isCurrent ? "tp-btn-primary" : "btn-light"}`}
                  style={{ borderRadius: 10, fontWeight: 500, opacity: isClickable || isSelected ? 1 : 0.5 }}
                  onClick={() => isClickable ? handleStatusSelect(s) : undefined}
                  disabled={(!isClickable && !isSelected) || (task.status === "Completed" && s !== "Completed")}
                >
                  {s}
                  {isSelected && <i className="bi bi-check-circle-fill ms-1" />}
                </button>
              );
            })}
            {pendingStatus && (
              <button className="btn btn-sm tp-btn-primary ms-2" style={{ borderRadius: 10 }} onClick={submitStatus} disabled={statusSubmitting}>
                {statusSubmitting ? "Submitting..." : "Submit"}
              </button>
            )}
          </div>

          {/* Attachments */}
          {task.attachments?.length > 0 && (
            <div className="mt-3 pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="small fw-bold" style={{ color: '#94A3B8' }}>Attachments ({task.attachments.length})</span>
                <button className="btn btn-sm btn-outline-light" style={{ borderRadius: 8, padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setShowUploadModal(true)}>
                  <i className="bi bi-plus me-1" /> Add
                </button>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {task.attachments.map((att, i) => (
                  <div key={i} className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <i className="bi bi-file-earmark" style={{ color: '#38BDF8', fontSize: '1.2rem' }} />
                    <span className="small text-truncate" style={{ color: 'var(--tp-text)', maxWidth: 200 }}>{att.name}</span>
                    <button className="btn btn-sm btn-outline-light ms-auto" onClick={() => downloadAttachment(att.url, att.name)} title="Download">
                      <i className="bi bi-download" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Comments */}
        <motion.div className="tp-glass p-4" variants={itemVariants}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
              Comments ({task.comments?.length || 0})
            </h6>
          </div>
          {task.comments?.map((c, i) => (
            <div key={i} className="mb-3 pb-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div className="d-flex align-items-start gap-2 mb-1">
                <img
                  src={c.user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user?.name || "User")}&background=0D1328&color=38BDF8&bold=true`}
                  className="rounded-circle"
                  style={{ width: 28, height: 28 }}
                  alt=""
                />
                <div className="flex-grow-1">
                  <div className="d-flex justify-content-between">
                    <strong className="small" style={{ color: 'var(--tp-text)' }}>{c.user?.name || "User"}</strong>
                    <span className="small" style={{ color: '#94A3B8' }}>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mb-0 small" style={{ color: 'var(--tp-text)', lineHeight: 1.5 }}>{c.text}</p>
                </div>
              </div>
            </div>
          ))}
          <form onSubmit={addComment} className="d-flex gap-2 mt-3">
            <div className="flex-grow-1">
              <input className="form-control" placeholder="Write a comment..." value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <button className="tp-btn-primary" style={{ borderRadius: 12, padding: '0.5rem 1.2rem' }}>Post</button>
          </form>
        </motion.div>
      </div>

      <div className="col-md-4">
        <motion.div className="tp-glass p-4" variants={itemVariants}>
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
            <i className="bi bi-info-circle me-1.5" style={{ color: '#38BDF8' }} />
            Details
          </h6>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Project: </span>
            <span style={{ color: 'var(--tp-text)' }}>{task.project?.name}</span>
          </div>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Priority: </span>
            <span className={`badge ${priorityBadge[task.priority] || "tp-badge-medium"}`}>{task.priority}</span>
          </div>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Assignee: </span>
            <div className="d-flex align-items-center gap-2 mt-1">
              <img
                src={task.assignedTo?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignedTo?.name || "U")}&background=0D1328&color=38BDF8&bold=true`}
                className="rounded-circle"
                style={{ width: 24, height: 24 }}
                alt=""
              />
              <span style={{ color: 'var(--tp-text)' }}>{task.assignedTo?.name || "Unassigned"}</span>
            </div>
          </div>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Due: </span>
            <span style={{ color: 'var(--tp-text)' }}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Not set"}</span>
          </div>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Created by: </span>
            <span style={{ color: 'var(--tp-text)' }}>{task.createdBy?.name}</span>
          </div>
          <div className="small mb-2">
            <span style={{ color: '#94A3B8' }}>Created on: </span>
            <span style={{ color: 'var(--tp-text)' }}>{new Date(task.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <label className="form-label small mb-2" style={{ color: '#94A3B8' }}>Reassign Task</label>
            <select className="form-select form-select-sm" value={task.assignedTo?._id || ""} onChange={(e) => assignTask(e.target.value)} disabled={!isManagerOrAdmin}>
              <option value="">Unassigned</option>
              {task.project?.members?.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              {task.project?.owner && <option value={task.project.owner._id}>{task.project.owner.name} (owner)</option>}
            </select>
          </div>
        </motion.div>
      </div>

      {/* Edit Task Modal */}
      {showEditModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: 'blur(8px)' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
                  <i className="bi bi-pencil-square me-2" style={{ color: '#38BDF8' }} />
                  Edit Task
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowEditModal(false)} />
              </div>
              <form onSubmit={handleEditSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small">Task Title <span className="text-danger">*</span></label>
                    <input required className="form-control" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} disabled={!isManagerOrAdmin} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small">Description</label>
                    <textarea className="form-control" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Detailed task description..." disabled={!isManagerOrAdmin} />
                  </div>
                  <div className="row">
                    <div className="col-6 mb-3">
                      <label className="form-label small">Priority</label>
                      <select className="form-select" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
                      </select>
                    </div>
                    <div className="col-6 mb-3">
                      <label className="form-label small">Status</label>
                      <select className="form-select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option>To Do</option><option>In Progress</option><option>Review</option><option>Completed</option>
                      </select>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-6 mb-3">
                      <label className="form-label small">Due Date</label>
                      <input type="date" className="form-control" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} disabled={!isManagerOrAdmin} />
                    </div>
                    <div className="col-6 mb-3">
                      <label className="form-label small">Assignee</label>
                      <select className="form-select" value={editForm.assignedTo} onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })} disabled={!isManagerOrAdmin}>
                        <option value="">Unassigned</option>
                        {task.project?.members?.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
                        {task.project?.owner && <option value={task.project.owner._id}>{task.project.owner.name} (owner)</option>}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => setShowEditModal(false)}>Cancel</button>
                  <button className="tp-btn-primary" disabled={saving || !isManagerOrAdmin} style={{ borderRadius: 10 }}>{saving ? "Saving..." : "Save Changes"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Upload Attachment Modal */}
      {showUploadModal && (
        <div className="modal d-block" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: 'blur(8px)' }} onClick={() => setShowUploadModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content tp-glass border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
                  <i className="bi bi-paperclip me-2" style={{ color: '#38BDF8' }} />
                  Upload Attachment
                </h5>
                <button className="btn-close btn-close-white" onClick={() => setShowUploadModal(false)} />
              </div>
              <form onSubmit={handleFileUpload}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small">Select File <span className="text-danger">*</span></label>
                    <input type="file" className="form-control" required onChange={(e) => setUploadFile(e.target.files[0])} />
                  </div>
                  <p className="small text-muted">Supported: PDF, DOC, XLS, Images, ZIP. Max size: 10MB.</p>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light" style={{ borderRadius: 10 }} onClick={() => { setShowUploadModal(false); setUploadFile(null); }}>Cancel</button>
                  <button className="tp-btn-primary" disabled={uploading || !uploadFile} style={{ borderRadius: 10 }}>{uploading ? "Uploading..." : "Upload File"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TaskDetails;
