import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "../services/api.js";
import { toast } from "react-toastify";
import StatCard3D from "../components/StatCard3D.jsx";
import { useDashboardRefresh } from "../context/DashboardContext.jsx";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, LineChart, Line, CartesianGrid,
} from "recharts";

const COLORS = ["#6366F1", "#38BDF8", "#A78BFA", "#22C55E", "#F59E0B", "#EF4444"];

const Dashboard = () => {
  const { refreshKey } = useDashboardRefresh();
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/dashboard/stats")
      .then(({ data }) => {
        setStats(data.stats);
        const charts = data.charts || {};
        setCharts({
          tasksByStatus: Array.isArray(charts.tasksByStatus) ? charts.tasksByStatus : [],
          tasksByPriority: Array.isArray(charts.tasksByPriority) ? charts.tasksByPriority : [],
          weeklyProductivity: Array.isArray(charts.weeklyProductivity) ? charts.weeklyProductivity : [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.15 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  if (loading) {
    return (
      <motion.div className="row g-3" variants={containerVariants} initial="hidden" animate="visible">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div className="col-md-3" key={i} variants={itemVariants}>
            <div className="tp-skeleton" style={{ height: 100 }} />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (!stats) {
    return <div className="tp-glass p-4 text-center" style={{ color: '#94A3B8' }}>Couldn't load dashboard stats. Is the backend running?</div>;
  }

  const tooltipStyle = {
    background: 'var(--tp-surface-elevated)',
    border: '1px solid var(--tp-glass-border)',
    borderRadius: 14,
    backdropFilter: 'blur(20px)',
    boxShadow: 'var(--tp-shadow-tooltip)',
    color: 'var(--tp-text)',
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <motion.h3 className="fw-bold mb-4" variants={itemVariants} style={{ fontSize: "1.8rem", fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
        <span className="tp-gradient-text">Dashboard</span>
      </motion.h3>

      <motion.div className="row g-3 mb-4" variants={containerVariants} initial="hidden" animate="visible">
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="📁" title="Total Projects" value={stats.totalProjects} change={12} color="primary" trend="up" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="⚡" title="Active Projects" value={stats.activeProjects} change={8} color="cyan" trend="up" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="✅" title="Total Tasks" value={stats.totalTasks} change={15} color="success" trend="up" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="⏰" title="Overdue Tasks" value={stats.overdueTasks} change={5} color="danger" trend="down" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="⏳" title="Pending" value={stats.pendingTasks} change={3} color="warning" trend="down" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="🔄" title="In Progress" value={stats.inProgressTasks} change={10} color="primary" trend="up" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="✨" title="Completed" value={stats.completedTasks} change={20} color="cyan" trend="up" />
        </motion.div>
        <motion.div className="col-6 col-md-3" variants={itemVariants}>
          <StatCard3D icon="👥" title="Team Members" value={stats.teamMembers} change={1} color="violet" trend="up" />
        </motion.div>
      </motion.div>

      <motion.div className="row g-3 mb-4" variants={containerVariants} initial="hidden" animate="visible">
        <motion.div className="col-md-4" variants={itemVariants}>
          <motion.div className="tp-card p-4 h-100" whileHover={{ scale: 1.02 }}>
            <h6 className="fw-bold mb-3 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Tasks by Status</h6>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={charts.tasksByStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {charts.tasksByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </motion.div>

        <motion.div className="col-md-4" variants={itemVariants}>
          <motion.div className="tp-card p-4 h-100" whileHover={{ scale: 1.02 }}>
            <h6 className="fw-bold mb-3 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Tasks by Priority</h6>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.tasksByPriority}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="rgba(56, 189, 248, 0.1)" />
                <XAxis dataKey="name" fontSize={12} stroke="rgba(148, 163, 184, 0.5)" />
                <YAxis allowDecimals={false} fontSize={12} stroke="rgba(148, 163, 184, 0.5)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#6366F1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </motion.div>

        <motion.div className="col-md-4" variants={itemVariants}>
          <motion.div className="tp-card p-4 h-100" whileHover={{ scale: 1.02 }}>
            <h6 className="fw-bold mb-3 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Weekly Productivity</h6>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.weeklyProductivity}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="rgba(56, 189, 248, 0.1)" />
                <XAxis dataKey="name" fontSize={12} stroke="rgba(148, 163, 184, 0.5)" />
                <YAxis allowDecimals={false} fontSize={12} stroke="rgba(148, 163, 184, 0.5)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="tasks" stroke="#38BDF8" strokeWidth={2.5} dot={{ r: 4, fill: "#38BDF8", stroke: 'var(--tp-bg-primary)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div className="tp-card p-4" variants={itemVariants}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold mb-0" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Overall Productivity</h6>
          <motion.span className="fw-bold tp-gradient-text fs-5" animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2.5 }}>
            {stats.productivity}%
          </motion.span>
        </div>
        <div className="progress" style={{ height: 10 }}>
          <motion.div
            className="progress-bar"
            style={{ width: 0 }}
            animate={{ width: `${stats.productivity}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;