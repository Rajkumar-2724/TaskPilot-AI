import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";

const statusColor = { "To Do": "#94A3B8", "In Progress": "#38BDF8", Review: "#A78BFA", Completed: "#22C55E", "Not Started": "#94A3B8", Delayed: "#F87171" };

const Gantt = () => {
  const [projects, setProjects] = useState([]);
  const [tasksByProject, setTasksByProject] = useState({});

  useEffect(() => {
    api.get("/projects").then(async ({ data }) => {
      const allProjects = data.projects || [];
      setProjects(allProjects);
      const map = {};
      for (const p of allProjects) {
        try {
          const url = p.projectType === "InfrastructureProject" ? `/infrastructure/projects/${p._id}` : `/projects/${p._id}`;
          const { data: pd } = await api.get(url);
          if (p.projectType === "InfrastructureProject") {
            map[p._id] = (pd.project?.milestones || []).map((m) => ({
              _id: m._id,
              title: m.title,
              status: m.status,
              startDate: m.plannedStartDate,
              dueDate: m.plannedEndDate,
              isMilestone: true,
            }));
          } else {
            map[p._id] = pd.tasks || [];
          }
        } catch {}
      }
      setTasksByProject(map);
    });
  }, []);

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const totalDays = Math.max(1, (rangeEnd - rangeStart) / 86400000);

  const barStyle = (start, end) => {
    const s = new Date(start || now);
    const e = new Date(end || now);
    // If startDate is not set, fall back to createdAt, then use "now" as default
    const startDate = s.getTime() === now.getTime() ? now : s;
    const left = Math.max(0, ((startDate - rangeStart) / 86400000 / totalDays) * 100);
    const duration = Math.max(1, (e - startDate) / 86400000);
    const width = Math.max(2, duration / totalDays * 100);
    return { marginLeft: `${left}%`, width: `${width}%` };
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h3 className="fw-bold mb-2" variants={itemVariants} style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Gantt Chart</span>
      </motion.h3>
      <motion.p className="small mb-4" variants={itemVariants} style={{ color: '#94A3B8' }}>
        Showing a 3-month window. Bars show task/milestone duration. Bar color reflects status.
      </motion.p>
      <div className="gantt-container" style={{ overflowX: 'auto', '-webkitOverflowScrolling': 'touch' }}>
        {projects.map((p) => (
        <motion.div className="tp-glass p-4 mb-3" key={p._id} variants={itemVariants}>
          <h6 className="fw-bold mb-3" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>{p.name}</h6>
          {(tasksByProject[p._id] || []).length === 0 ? (
            <p className="small mb-0" style={{ color: '#94A3B8' }}>No tasks</p>
          ) : (
            (tasksByProject[p._id] || []).map((t) => (
              <div className="mb-2" key={t._id}>
                <div className="small mb-1 d-flex justify-content-between">
                  <span style={{ color: 'var(--tp-text)' }}>
                    {t.isMilestone && <span className="badge me-1" style={{ background: "rgba(167, 139, 250, 0.2)", color: "#A78BFA", fontSize: "0.6rem" }}>Milestone</span>}
                    {t.title}
                  </span>
                  <span style={{ color: '#94A3B8' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "No due date"}</span>
                </div>
                <div style={{ background: "var(--tp-surface-alt)", borderRadius: 6, height: 10, border: '1px solid var(--tp-border-subtle)' }}>
                  <div style={{ ...barStyle(t.startDate, t.dueDate), background: statusColor[t.status], height: 10, borderRadius: 6 }} />
                </div>
              </div>
            ))
          )}
        </motion.div>
      ))}
    </div>
    </motion.div>
  );
};

export default Gantt;
