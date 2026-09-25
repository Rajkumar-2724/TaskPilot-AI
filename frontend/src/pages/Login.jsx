import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import AnimatedBackground3D from "../components/AnimatedBackground3D.jsx";

const Login = () => {
  const { login, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const passwordRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success("Welcome back!");
      navigate("/app/dashboard");
    } catch (err) {
      const needsVerification = err.response?.data?.code === "EMAIL_NOT_VERIFIED";
      setUnverified(needsVerification);
      toast.error(err.response?.data?.message || "Invalid email or password");
      if (!needsVerification) {
        setForm((f) => ({ ...f, password: "" }));
        passwordRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const data = await resendVerification(form.email);
      toast.success(data.message || "Verification code sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not send a new code");
    } finally {
      setResending(false);
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
          style={{ width: "100%", maxWidth: 420 }}
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
              <i className="bi bi-stars" style={{ color: '#fff', fontSize: '1.3rem' }} />
            </div>
            <h3 className="fw-bold mb-1 tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Welcome back
            </h3>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
              Login to your TaskPilot AI workspace
            </p>
          </motion.div>

          <motion.form onSubmit={handleLogin} variants={containerVariants} initial="hidden" animate="visible">
            {unverified && (
              <motion.div className="alert alert-warning py-2 small" variants={itemVariants}>
                <i className="bi bi-envelope-exclamation me-1" />
                <div>Your email address is not verified yet.</div>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 mt-1"
                  style={{ color: '#38BDF8', textDecoration: 'none' }}
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Resend verification code"}
                </button>
              </motion.div>
            )}
            <motion.div className="mb-3" variants={itemVariants}>
              <label className="form-label">Email</label>
              <motion.input
                type="email"
                required
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@company.com"
                whileFocus={{ scale: 1.01 }}
              />
            </motion.div>

            <motion.div className="mb-4" variants={itemVariants}>
              <label className="form-label">Password</label>
              <motion.input
                ref={passwordRef}
                type="password"
                required
                className="form-control"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                whileFocus={{ scale: 1.01 }}
              />
            </motion.div>

            <motion.button
              type="submit"
              className="tp-btn-primary w-100 mb-3"
              disabled={loading}
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ borderRadius: 14, padding: '0.8rem' }}
            >
              {loading ? (
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  ⏳
                </motion.span>
              ) : (
                "Sign In"
              )}
            </motion.button>
          </motion.form>

          <motion.p className="text-center small mt-4 mb-0" variants={itemVariants} style={{ color: '#94A3B8' }}>
            Don't have an account? <Link to="/register" style={{ color: '#38BDF8', fontWeight: 600 }}>Sign up</Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;