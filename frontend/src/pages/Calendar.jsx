import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import api from "../services/api.js";

const Calendar = () => {
  const [current, setCurrent] = useState(new Date());
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/tasks").then(({ data }) => setTasks(data.tasks));
    api.get("/projects").then(({ data }) => {
      const infraProjects = (data.projects || []).filter((p) => p.projectType === "InfrastructureProject");
      const allMilestones = [];
      infraProjects.forEach((p) => {
        (p.milestones || []).forEach((m) => {
          if (m.plannedEndDate) {
            allMilestones.push({
              _id: m._id,
              title: m.title,
              status: m.status,
              dueDate: m.plannedEndDate,
              projectName: p.name,
              isMilestone: true,
            });
          }
        });
      });
      setMilestones(allMilestones);
    }).catch(() => {});
  }, []);

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const tasksOnDay = (day) => {
    if (!day) return [];
    const taskItems = tasks.filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return due.getFullYear() === year && due.getMonth() === month && due.getDate() === day;
    }).map((t) => ({ ...t, isMilestone: false }));
    const milestoneItems = milestones.filter((m) => {
      const due = new Date(m.dueDate);
      return due.getFullYear() === year && due.getMonth() === month && due.getDate() === day;
    });
    return [...taskItems, ...milestoneItems];
  };

  const getPriorityColor = (p) => {
    switch (p) {
      case "Critical": return "#FCA5A5";
      case "High": return "#F87171";
      case "Medium": return "#F59E0B";
      case "Low": return "#38BDF8";
      default: return "#94A3B8";
    }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case "Completed": return "#22C55E";
      case "Review": return "#A78BFA";
      case "In Progress": return "#38BDF8";
      case "To Do": return "#94A3B8";
      default: return "#94A3B8";
    }
  };

  const isOverdue = (t) => new Date(t.dueDate) < new Date() && t.status !== "Completed";

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.div className="d-flex justify-content-between align-items-center mb-4" variants={itemVariants}>
        <h3 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          <span className="tp-gradient-text">Calendar</span>
        </h3>
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-light" style={{ borderRadius: 10 }} onClick={() => setCurrent(new Date(year, month - 1, 1))}><i className="bi bi-chevron-left" /></button>
          <span className="fw-semibold" style={{ color: 'var(--tp-text)' }}>{current.toLocaleString("default", { month: "long", year: "numeric" })}</span>
          <button className="btn btn-outline-light" style={{ borderRadius: 10 }} onClick={() => setCurrent(new Date(year, month + 1, 1))}><i className="bi bi-chevron-right" /></button>
        </div>
      </motion.div>

      <div className="calendar-container">
        <motion.div className="tp-glass p-3" variants={itemVariants}>
          <div className="row row-cols-7 g-1 mb-2 text-center small fw-semibold" style={{ color: '#94A3B8' }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="col" key={d}>{d}</div>)}
          </div>
          <div className="row row-cols-7 g-1">
            {cells.map((day, i) => (
              <div className="col" key={i}>
                <div className="rounded-3 p-2" style={{
                  minHeight: 90,
                  background: day ? "transparent" : "var(--tp-surface-alt)",
                  border: '1px solid var(--tp-border-subtle)',
                }}>
                  {day && <div className="small fw-semibold mb-1" style={{ color: 'var(--tp-text)' }}>{day}</div>}
                  {tasksOnDay(day).map((t) => {
                    const priorityColor = t.isMilestone ? "#A78BFA" : getPriorityColor(t.priority);
                    const isOD = !t.isMilestone && isOverdue(t);
                    return (
                      <div key={t._id}
                        className="small rounded px-1 mb-1 text-truncate"
                        style={{
                          cursor: "pointer",
                          background: t.isMilestone ? 'rgba(167, 139, 250, 0.15)' : isOD ? 'rgba(239, 68, 68, 0.2)' : `rgba(56, 189, 248, 0.1)`,
                          color: isOD ? '#F87171' : priorityColor,
                          border: `1px solid ${t.isMilestone ? 'rgba(167, 139, 250, 0.3)' : isOD ? 'rgba(239, 68, 68, 0.3)' : `rgba(56, 189, 248, 0.2)`}`,
                        }}
                        onClick={() => t.isMilestone ? null : navigate(`/app/tasks/${t._id}`)}
                        title={t.isMilestone ? `${t.title} (${t.projectName})` : t.title}>
                        {t.isMilestone && <span className="badge me-1" style={{ background: "rgba(167, 139, 250, 0.3)", color: "#C4B5FD", fontSize: "0.5rem", padding: "1px 4px" }}>MS</span>}
                        <div className="fw-semibold small">{t.title}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Calendar;