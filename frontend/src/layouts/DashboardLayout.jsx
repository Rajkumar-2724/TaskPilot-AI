import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import { useState } from "react";

const navSections = [
  {
    label: "Overview",
    items: [
      { to: "/app/dashboard", icon: "bi-speedometer2", label: "Dashboard" },
      { to: "/app/recent", icon: "bi-activity", label: "Recent Activity" },
      { to: "/app/monitoring", icon: "bi-radar", label: "Monitoring" },
      { to: "/app/benchmarking", icon: "bi-bar-chart-line", label: "Benchmarking" },
      { to: "/app/import", icon: "bi-cloud-arrow-up", label: "Data Import" },
    ],
  },
  {
    label: "Work Management",
    items: [
      { to: "/app/projects", icon: "bi-folder2-open", label: "Projects" },
      { to: "/app/projects/history", icon: "bi-archive", label: "Project History" },
      { to: "/app/tasks", icon: "bi-list-task", label: "Tasks" },
      { to: "/app/tasks/history", icon: "bi-clock-history", label: "Task History" },
      { to: "/app/overdue", icon: "bi-exclamation-octagon", label: "Overdue" },
      { to: "/app/kanban", icon: "bi-kanban", label: "Kanban Board" },
      { to: "/app/calendar", icon: "bi-calendar3", label: "Calendar" },
      { to: "/app/gantt", icon: "bi-diagram-3", label: "Gantt Chart" },
    ],
  },
  {
    label: "AI",
    items: [
      { to: "/app/ai-assistant", icon: "bi-stars", label: "AI Assistant" },
      { to: "/app/cost-prediction", icon: "bi-cash-stack", label: "Cost Prediction" },
      { to: "/app/time-prediction", icon: "bi-clock-history", label: "Time Prediction" },
      { to: "/app/risk-scoring", icon: "bi-shield-check", label: "Risk Scoring" },
      { to: "/app/alerts", icon: "bi-bell", label: "Alerts" },
      { to: "/app/simulation", icon: "bi-lightbulb", label: "What-If Simulation" },
      { to: "/app/data-sufficiency", icon: "bi-database-check", label: "Data Sufficiency" },
      { to: "/app/model-evaluation", icon: "bi-cpu", label: "Model Evaluation" },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { to: "/app/chat", icon: "bi-chat-left-text", label: "Team Chat" },
      { to: "/app/leaderboard", icon: "bi-trophy", label: "Leaderboard" },
    ],
  },
  {
    label: "Account & Admin",
    items: [
      { to: "/app/profile", icon: "bi-person", label: "Profile" },
      { to: "/app/admin", icon: "bi-gear", label: "Admin Panel", adminOnly: true },
    ],
  },
];

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="d-flex">
      <aside
        className={`tp-sidebar d-flex flex-column p-3 position-fixed ${sidebarOpen ? "show" : ""}`}
        style={{
          zIndex: 1100,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s ease",
        }}
      >
        <div className="d-flex align-items-center justify-content-between mb-4 px-2">
          <div className="d-flex align-items-center gap-2">
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #38BDF8, #6366F1)',
              boxShadow: '0 4px 16px rgba(56, 189, 248, 0.3)',
            }} />
            <span className="fw-bold fs-5" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <span style={{ color: 'var(--tp-text)' }}>Task</span>
              <span className="tp-gradient-text">Pilot AI</span>
            </span>
          </div>
          <button
            className="btn btn-sm btn-light d-lg-none"
            onClick={() => setSidebarOpen(false)}
            style={{ borderRadius: 8 }}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <nav className="flex-grow-1 overflow-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="small fw-bold text-uppercase mb-2 px-2" style={{ color: 'var(--tp-text-secondary)', letterSpacing: '0.5px' }}>
                {section.label}
              </div>
              {section.items.map((item) => {
                if (item.adminOnly && user?.role !== "Admin") return null;
                const isActive = location.pathname === item.to || (item.to !== "/app/dashboard" && location.pathname.startsWith(item.to));
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `tp-sidebar-link ${isActive ? "active" : ""}`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <i className={`bi ${item.icon}`} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-3 border-top" style={{ borderColor: 'var(--tp-glass-border)' }}>
          <button className="tp-sidebar-link border-0 bg-transparent text-start w-100" onClick={() => { logout(); navigate("/login"); }}>
            <i className="bi bi-box-arrow-right" /> Logout
          </button>
        </div>
      </aside>

      <button
        className="btn btn-light d-lg-none position-fixed"
        style={{ top: 16, left: 16, zIndex: 1150, borderRadius: 10, boxShadow: 'var(--tp-shadow)' }}
        onClick={() => setSidebarOpen(true)}
      >
        <i className="bi bi-list" style={{ fontSize: '1.2rem' }} />
      </button>

      <main className="flex-grow-1 tp-main-content" style={{ minHeight: "100vh" }}>
        <header className="tp-glass d-flex align-items-center justify-content-between px-4 py-3 mb-4 mx-3 mt-3 sticky-top" style={{ zIndex: 900 }}>
          <div className="d-flex align-items-center gap-3">
            <div className="d-lg-none fw-bold" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              <span style={{ color: 'var(--tp-text)' }}>Task</span>
              <span className="tp-gradient-text">Pilot AI</span>
            </div>
            <div className="d-none d-lg-block text-muted" style={{ fontSize: '0.9rem' }}>
              AI-Powered Infrastructure Command Center
            </div>
          </div>
          <div className="d-flex align-items-center gap-3">
            <button className="btn btn-light rounded-circle" onClick={toggleTheme} style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={`bi ${theme === "light" ? "bi-moon-stars" : "bi-sun"}`} />
            </button>
            <NotificationBell />
            <div className="dropdown">
              <button className="btn d-flex align-items-center gap-2 p-0" data-bs-toggle="dropdown" style={{ border: 'none', background: 'transparent' }}>
                <img
                  src={user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "U")}&background=0D1328&color=38BDF8&bold=true`}
                  alt="avatar"
                  className="rounded-circle"
                  style={{
                    width: 38,
                    height: 38,
                    objectFit: "cover",
                    border: '2px solid var(--tp-accent)',
                    boxShadow: 'var(--tp-shadow-glow)',
                  }}
                />
              </button>
              <ul className="dropdown-menu dropdown-menu-end tp-glass" style={{ border: '1px solid var(--tp-glass-border)', backdropFilter: 'blur(20px)' }}>
                <li><h6 className="dropdown-header" style={{ color: 'var(--tp-text-secondary)' }}>{user?.name}</h6></li>
                <li><span className="dropdown-item-text small" style={{ color: 'var(--tp-text)' }}>{user?.email}</span></li>
                <li><span className="dropdown-item-text small" style={{ color: 'var(--tp-text)' }}>Role: {user?.role}</span></li>
                <li><hr className="dropdown-divider" style={{ borderColor: 'var(--tp-glass-border)' }} /></li>
                <li><NavLink to="/app/profile" className="dropdown-item" style={{ color: 'var(--tp-text)' }} onClick={() => setSidebarOpen(false)}><i className="bi bi-person me-2" /> Profile</NavLink></li>
                <li><hr className="dropdown-divider" style={{ borderColor: 'var(--tp-glass-border)' }} /></li>
                <li><button className="dropdown-item text-danger" style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'left' }} onClick={() => { logout(); navigate("/login"); }}><i className="bi bi-box-arrow-right me-2" /> Logout</button></li>
              </ul>
            </div>
          </div>
        </header>
        <div className="px-3 pb-5" style={{ maxWidth: 1400, margin: "0 auto" }}>
          <Outlet />
        </div>
      </main>

      <nav className="tp-glass d-flex d-lg-none justify-content-around align-items-center position-fixed bottom-0 start-0 end-0 py-2" style={{ zIndex: 950 }}>
        {navSections.flatMap((s) => s.items).slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `fs-5 ${isActive ? "text-white" : "text-muted"}`} onClick={() => setSidebarOpen(false)}>
            <i className={`bi ${item.icon}`} />
          </NavLink>
        ))}
      </nav>

      {sidebarOpen && (
        <div
          className="d-lg-none position-fixed top-0 start-0 end-0 bottom-0"
          style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050, transition: 'background 0.3s' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default DashboardLayout;