import { Link } from "react-router-dom";

const Unauthorized = () => (
  <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: "100vh" }}>
    <i className="bi bi-shield-lock display-1 mb-3" style={{ color: '#EF4444' }} />
    <h2 className="fw-bold mb-2" style={{ color: 'var(--tp-text)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Access Denied</h2>
    <p className="mb-4" style={{ color: '#94A3B8' }}>You don't have permission to view this page.</p>
    <Link to="/app/dashboard" className="tp-btn-primary" style={{ borderRadius: 14 }}>Back to Dashboard</Link>
  </div>
);

export default Unauthorized;
