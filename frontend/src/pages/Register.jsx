import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import AnimatedBackground3D from "../components/AnimatedBackground3D.jsx";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Member" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success("Account created!");
      navigate("/app/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.92, y: 30 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <AnimatedBackground3D />
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <motion.div
          className="tp-glass p-4 p-md-5"
          style={{ width: "100%", maxWidth: 460 }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="text-center mb-4">
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #38BDF8, #6366F1)',
              boxShadow: '0 4px 16px rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <i className="bi bi-rocket-takeoff" style={{ color: '#fff', fontSize: '1.3rem' }} />
            </div>
            <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>Create your account</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Start managing projects with AI</p>
          </motion.div>

          <motion.form onSubmit={handleSubmit} variants={containerVariants} initial="hidden" animate="visible">
            <motion.div className="mb-3" variants={itemVariants}>
              <label className="form-label">Full name</label>
              <input required className="form-control" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </motion.div>
            <motion.div className="mb-3" variants={itemVariants}>
              <label className="form-label">Email</label>
              <input type="email" required className="form-control" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
            </motion.div>
            <motion.div className="mb-3" variants={itemVariants}>
              <label className="form-label">Password</label>
              <input type="password" required minLength={6} className="form-control" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
            </motion.div>
            <motion.div className="mb-4" variants={itemVariants}>
              <input type="hidden" value="Member" />
            </motion.div>
            <motion.button
              className="tp-btn-primary w-100 mb-3"
              disabled={loading}
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ borderRadius: 14, padding: '0.8rem' }}
            >
              {loading ? "Creating account..." : "Create account"}
            </motion.button>
          </motion.form>

          <motion.p className="text-center small mb-0" variants={itemVariants} style={{ color: '#94A3B8' }}>
            Already have an account? <Link to="/login" style={{ color: '#38BDF8', fontWeight: 600 }}>Login</Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
