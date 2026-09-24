import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AnimatedBackground3D from "../components/AnimatedBackground3D.jsx";

const Landing = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <AnimatedBackground3D />

      <nav className="d-flex justify-content-between align-items-center px-4 px-md-5 py-4" style={{ position: "relative", zIndex: 10 }}>
        <div className="d-flex align-items-center gap-2">
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #38BDF8, #6366F1)',
            boxShadow: '0 4px 16px rgba(56, 189, 248, 0.3)',
          }} />
          <span className="fw-bold fs-4" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            <span style={{ color: 'var(--tp-text)' }}>Task</span>
            <span className="tp-gradient-text">Pilot AI</span>
          </span>
        </div>
        <div className="d-flex gap-2">
          <Link to="/login" className="btn btn-outline-light rounded-pill px-4">Login</Link>
          <Link to="/register" className="btn tp-btn-primary rounded-pill px-4">Get Started</Link>
        </div>
      </nav>

      <motion.div
        className="container py-5 text-center"
        style={{ position: "relative", zIndex: 10 }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <div style={{
            display: 'inline-block',
            padding: '0.4rem 1rem',
            borderRadius: 20,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            color: '#38BDF8',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            letterSpacing: '0.5px',
          }}>
            AI-Powered Project Intelligence
          </div>
        </motion.div>

        <motion.h1
          variants={itemVariants}
          className="fw-bold mb-3"
          style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
            lineHeight: 1.15,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          <span style={{ color: 'var(--tp-text)' }}>Manage projects with</span>
          <br />
          <span className="tp-gradient-text">an AI co-pilot</span>
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="mb-4 mx-auto"
          style={{ maxWidth: 580, color: '#94A3B8', fontSize: '1.1rem', lineHeight: 1.7 }}
        >
          TaskPilot AI brings Kanban boards, real-time collaboration, and Gemini-powered
          insights together in one premium workspace for your team.
        </motion.p>

        <motion.div variants={itemVariants} className="d-flex gap-3 justify-content-center">
          <Link to="/register" className="btn tp-btn-primary btn-lg rounded-pill px-5">
            Start Free <i className="bi bi-arrow-right ms-2" />
          </Link>
          <Link to="/login" className="btn btn-light btn-lg rounded-pill px-5">
            View Demo
          </Link>
        </motion.div>
      </motion.div>

      <motion.div
        className="container pb-5"
        style={{ position: "relative", zIndex: 10 }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="row g-4">
          {[
            { icon: "bi-kanban", title: "Kanban Boards", desc: "Drag-and-drop task management across custom workflows with AI prioritization.", accent: '#38BDF8' },
            { icon: "bi-stars", title: "AI Insights", desc: "Get AI-generated summaries, risk analysis, cost predictions and priorities.", accent: '#A78BFA' },
            { icon: "bi-chat-dots", title: "Real-time Chat", desc: "Collaborate instantly with your team, per-project, with instant notifications.", accent: '#6366F1' },
          ].map((f) => (
            <div className="col-md-4" key={f.title}>
              <motion.div
                className="tp-glass p-4 h-100 text-start"
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: `${f.accent}15`,
                  border: `1px solid ${f.accent}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem',
                }}>
                  <i className={`bi ${f.icon}`} style={{ fontSize: '1.3rem', color: f.accent }} />
                </div>
                <h5 className="fw-bold mb-2" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>{f.title}</h5>
                <p className="mb-0" style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Landing;
