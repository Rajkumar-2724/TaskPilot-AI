import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";

const Admin = () => {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({ moderate: 30, high: 60, critical: 80 });
  const [threshSource, setThreshSource] = useState("");

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      api.get("/admin/users"),
      api.get("/admin/projects"),
      api.get("/admin/analytics"),
      api.get("/admin/activity-logs"),
      api.get("/admin/settings/risk-thresholds"),
    ]).then(([u, p, a, l, r]) => {
      setUsers(u.data.users);
      setProjects(p.data.projects);
      setAnalytics(a.data.analytics);
      setLogs(l.data.logs);
      if (r.data?.thresholds) {
        setThresholds(r.data.thresholds);
        setThreshSource(r.data.source || "");
      }
    }).finally(() => setLoading(false));
  };

  const saveThresholds = async () => {
    if (!(thresholds.moderate < thresholds.high && thresholds.high < thresholds.critical)) {
      toast.error("Thresholds must satisfy: Moderate < High < Critical");
      return;
    }
    try {
      await api.put("/admin/settings/risk-thresholds", thresholds);
      toast.success("Risk thresholds updated");
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to update thresholds");
    }
  };

  useEffect(loadAll, []);

  const toggleStatus = async (id) => {
    await api.put(`/admin/users/${id}/status`);
    loadAll();
  };

  const changeRole = async (id, role) => {
    await api.put(`/admin/users/${id}/role`, { role });
    toast.success("Role updated");
    loadAll();
  };

  const filteredUsers = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="tp-skeleton" style={{ height: 400 }} />;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h3 className="fw-bold mb-4" variants={itemVariants} style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Admin Panel</span>
      </motion.h3>

      {analytics && (
        <motion.div className="row g-3 mb-4" variants={containerVariants}>
          {[
            { label: "Users", value: analytics.userCount, color: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.25)' },
            { label: "Projects", value: analytics.projectCount, color: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },
            { label: "Tasks", value: analytics.taskCount, color: 'rgba(167, 139, 250, 0.08)', border: 'rgba(167, 139, 250, 0.25)' },
            { label: "Admins", value: analytics.roleBreakdown.adminCount, color: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)' },
          ].map((s, i) => (
            <motion.div className="col-6 col-md-3" key={i} variants={itemVariants}>
              <div className="tp-glass p-3" style={{ background: s.color, border: `1px solid ${s.border}` }}>
                <div className="small" style={{ color: '#94A3B8' }}>{s.label}</div>
                <div className="fs-4 fw-bold" style={{ color: 'var(--tp-text)' }}>{s.value}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.div className="d-flex gap-2 mb-3" variants={itemVariants}>
        {["users", "projects", "risk", "activity"].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? "tp-btn-primary" : "btn-light"}`} style={{ borderRadius: 10 }} onClick={() => setTab(t)}>
            {t === "risk" ? "Risk Settings" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </motion.div>

      {tab === "users" && (
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          <input className="form-control mb-3" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u._id}>
                    <td style={{ color: 'var(--tp-text)' }}>{u.name}</td>
                    <td className="small" style={{ color: '#94A3B8' }}>{u.email}</td>
                    <td>
                      <select className="form-select form-select-sm" value={u.role} onChange={(e) => changeRole(u._id, e.target.value)} style={{ borderRadius: 8 }}>
                        <option>Admin</option><option>Manager</option><option>Member</option>
                      </select>
                    </td>
                    <td><span className="badge" style={{ background: u.isActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)', color: u.isActive ? '#22C55E' : '#94A3B8', border: `1px solid ${u.isActive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.3)'}` }}>{u.isActive ? "Active" : "Inactive"}</span></td>
                    <td><button className="btn btn-sm btn-light" style={{ borderRadius: 8 }} onClick={() => toggleStatus(u._id)}>
                      {u.isActive ? "Deactivate" : "Activate"}
                    </button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {tab === "projects" && (
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Progress</th></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p._id}>
                    <td style={{ color: 'var(--tp-text)' }}>{p.name}</td>
                    <td className="small" style={{ color: '#94A3B8' }}>{p.owner?.name}</td>
                    <td><span className="badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8', border: '1px solid rgba(148, 163, 184, 0.3)' }}>{p.status}</span></td>
                    <td style={{ color: 'var(--tp-text)' }}>{p.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {tab === "risk" && (
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          <h6 className="fw-bold mb-1">Risk Thresholds</h6>
          <p className="small mb-3" style={{ color: '#94A3B8' }}>
            Used by the risk engine for scoring and classification.
            {threshSource && <> Current source: <strong>{threshSource}</strong></>}
          </p>
          <div className="row g-3">
            {[
              { key: "moderate", label: "Moderate (score >=)" },
              { key: "high", label: "High (score >=)" },
              { key: "critical", label: "Critical (score >=)" },
            ].map(({ key, label }) => (
              <div className="col-md-4" key={key}>
                <label className="small" style={{ color: '#94A3B8' }}>{label}</label>
                <input type="number" min="0" max="100" className="form-control mt-1"
                  value={thresholds[key]}
                  onChange={(e) => setThresholds({ ...thresholds, [key]: Number(e.target.value) })}
                  style={{ borderRadius: 8 }} />
              </div>
            ))}
          </div>
          <button className="btn tp-btn-primary mt-3" style={{ borderRadius: 10 }} onClick={saveThresholds}>
            Save Thresholds
          </button>
        </motion.div>
      )}

      {tab === "activity" && (
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          {logs.map((l) => (
            <div key={l._id} className="d-flex justify-content-between py-2 small" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ color: 'var(--tp-text)' }}><strong>{l.user?.name}</strong> — {l.action} {l.details && <span style={{ color: '#94A3B8' }}>({l.details})</span>}</div>
              <span style={{ color: '#94A3B8' }}>{new Date(l.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};

export default Admin;
