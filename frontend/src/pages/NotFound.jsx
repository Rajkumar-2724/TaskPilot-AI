import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ minHeight: "100vh" }}>
    <h1 className="display-1 fw-bold tp-gradient-text" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>404</h1>
    <p className="mb-4" style={{ color: '#94A3B8' }}>The page you're looking for doesn't exist.</p>
    <Link to="/" className="tp-btn-primary" style={{ borderRadius: 14 }}>Go Home</Link>
  </div>
);

export default NotFound;
