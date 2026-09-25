import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { toast } from "react-toastify";
import { motion } from "framer-motion";
import AnimatedBackground3D from "../components/AnimatedBackground3D.jsx";

const Register = () => {
  const { register, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Member" });
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [deliveryFailed, setDeliveryFailed] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNote, setResendNote] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await register(form);
      if (result.requiresEmailVerification) {
        setPendingEmail(result.email);
        setDeliveryFailed(!result.emailDelivered);
        setResendCooldown(30);
        toast.success("Account created. Check your email for the verification code.");
        return;
      }
      toast.success("Account created!");
      navigate("/app/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyEmail(pendingEmail, code);
      toast.success("Email verified. Welcome to TaskPilot AI!");
      navigate("/app/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setVerifying(true);
    setResendNote("");
    try {
      const data = await resendVerification(pendingEmail);
      setResendCooldown(30);
      setDeliveryFailed(!data.sent);
      setResendNote(data.message);
    } catch (err) {
      setResendNote(err.response?.data?.message || "Could not send a new code");
    } finally {
      setVerifying(false);
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
            <h3 className="fw-bold mb-1" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', color: 'var(--tp-text)' }}>
              {pendingEmail ? "Verify your email" : "Create your account"}
            </h3>
            <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
              {pendingEmail ? `Enter the 6-digit code sent to ${pendingEmail}` : "Start managing projects with AI"}
            </p>
          </motion.div>

          {pendingEmail ? (
            <motion.form onSubmit={handleVerify} variants={containerVariants} initial="hidden" animate="visible">
              {deliveryFailed && (
                <motion.div className="alert alert-warning py-2 small" variants={itemVariants}>
                  <i className="bi bi-exclamation-triangle me-1" />
                  The email could not be delivered. Ask an admin to configure SMTP, then request a new code.
                </motion.div>
              )}
              <motion.div className="mb-3" variants={itemVariants}>
                <label className="form-label">Verification code</label>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="form-control text-center"
                  style={{ letterSpacing: 10, fontSize: '1.3rem' }}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </motion.div>
              <motion.button
                className="tp-btn-primary w-100 mb-3"
                disabled={loading || code.length !== 6}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ borderRadius: 14, padding: '0.8rem' }}
              >
                {loading ? "Verifying..." : "Verify and continue"}
              </motion.button>
              <motion.div className="text-center" variants={itemVariants}>
                <button
                  type="button"
                  className="btn btn-link btn-sm"
                  style={{ color: '#38BDF8', textDecoration: 'none' }}
                  onClick={handleResend}
                  disabled={verifying || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : verifying ? "Sending..." : "Resend code"}
                </button>
              </motion.div>
              {resendNote && (
                <p className="text-center small mt-2 mb-0" style={{ color: '#94A3B8' }}>{resendNote}</p>
              )}
            </motion.form>
          ) : (
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
          )}

          <motion.p className="text-center small mb-0" variants={itemVariants} style={{ color: '#94A3B8' }}>
            Already have an account? <Link to="/login" style={{ color: '#38BDF8', fontWeight: 600 }}>Login</Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
