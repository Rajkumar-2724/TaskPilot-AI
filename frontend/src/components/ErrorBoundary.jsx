import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="d-flex align-items-center justify-content-center min-vh-100 p-4" style={{ background: "#0B1220", color: "#E2E8F0" }}>
        <div className="text-center" style={{ maxWidth: 520 }}>
          <div className="mb-3" style={{ fontSize: "2.5rem" }}>
            <i className="bi bi-exclamation-triangle" style={{ color: "#F59E0B" }} />
          </div>
          <h4 className="fw-bold mb-2">This page ran into a problem</h4>
          <p className="small mb-3" style={{ color: "#94A3B8" }}>
            The rest of the app still works. Reload this page, and if it keeps happening the browser may be
            holding an older cached copy of the site.
          </p>
          <pre
            className="small text-start p-3 mb-3 rounded"
            style={{ background: "rgba(148,163,184,0.08)", color: "#FCA5A5", fontSize: "0.72rem", maxHeight: 160, overflow: "auto" }}
          >
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="d-flex gap-2 justify-content-center">
            <button
              className="btn btn-sm"
              style={{ background: "rgba(148,163,184,0.12)", color: "#E2E8F0", border: "1px solid rgba(148,163,184,0.25)" }}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              className="btn btn-sm"
              style={{ background: "#6366F1", color: "#fff", border: "none" }}
              onClick={() => {
                if (window.caches) window.caches.keys().then((k) => Promise.all(k.map((x) => window.caches.delete(x))));
                window.location.reload();
              }}
            >
              Reload & clear cache
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
