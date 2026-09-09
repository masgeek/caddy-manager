import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PageShell } from "./PageShell";

const navItems = [
  { label: "Dashboard", path: "/", icon: "bi-speedometer2" },
  { label: "Servers", path: "/servers", icon: "bi-hdd-rack" },
  { label: "Sites", path: "/sites", icon: "bi-file-text" },
  { label: "Site Inventory", path: "/site-inventory", icon: "bi-boxes" },
  { label: "Config", path: "/config", icon: "bi-gear" },
  { label: "Logs", path: "/logs", icon: "bi-terminal" },
  { label: "Audit", path: "/audit", icon: "bi-clock-history" },
];

interface LayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}

export function Layout({ children, onLogout }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="d-flex app-shell">
      {/* Mobile offcanvas sidebar */}
      <div
        className={`offcanvas offcanvas-start d-md-none ${mobileOpen ? "show" : ""}`}
        tabIndex={-1}
        style={{ width: 280 }}
      >
        <div className="offcanvas-header">
          <h5 className="offcanvas-title">Caddy Manager</h5>
          <button
            type="button"
            className="btn-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        </div>
        <div className="offcanvas-body p-0">
          <ul className="list-group list-group-flush">
            {navItems.map((item) => (
              <li
                key={item.path}
                className={`list-group-item list-group-item-action ${location.pathname === item.path ? "active" : ""}`}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                style={{ cursor: "pointer" }}
              >
                <i className={`bi ${item.icon} me-2`}></i>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {mobileOpen && (
        <div
          className="offcanvas-backdrop fade show"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="d-none d-md-flex flex-column app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">
            <i className="bi bi-diagram-3"></i>
          </span>
          Caddy Manager
        </div>
        <div className="app-environment">INTERNAL / CONTROL ROOM</div>
        <ul className="nav flex-column app-nav">
          {navItems.map((item) => (
            <li className="nav-item" key={item.path}>
              <button
                className={`app-nav-link ${location.pathname === item.path ? "active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <i className={`bi ${item.icon} me-2`}></i>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main content area */}
      <div className="d-flex flex-column flex-grow-1 app-main">
        {/* Top navbar */}
        <nav className="navbar navbar-dark bg-primary d-md-none">
          <div className="container-fluid">
            <button
              className="navbar-toggler"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <span className="navbar-toggler-icon"></span>
            </button>
            <span className="navbar-brand">Caddy Manager</span>
            {onLogout && (
              <button
                className="btn btn-sm btn-outline-light"
                onClick={onLogout}
              >
                <i className="bi bi-box-arrow-right"></i>
              </button>
            )}
          </div>
        </nav>
        {/* Desktop top bar */}
        <div className="d-none d-md-flex justify-content-between align-items-center app-topbar">
          <span className="app-topbar-label">Infrastructure / Operations</span>
          {onLogout && (
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onLogout}
            >
              <i className="bi bi-box-arrow-right me-1"></i> Logout
            </button>
          )}
        </div>
        <main className="app-content flex-grow-1" tabIndex={-1}>
          <PageShell>{children}</PageShell>
        </main>
      </div>
    </div>
  );
}
