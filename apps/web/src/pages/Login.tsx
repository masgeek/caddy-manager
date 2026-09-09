import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const success = await login(username, password);
    setLoading(false);

    if (success) {
      navigate("/");
    } else {
      setError("Invalid credentials or server unreachable");
    }
  };

  if (localStorage.getItem("token")) {
    navigate("/");
    return null;
  }

  return (
    <div className="login-shell">
      <div className="login-atmosphere" aria-hidden="true">
        <div className="login-grid"></div>
        <div className="login-orbit login-orbit-one"></div>
        <div className="login-orbit login-orbit-two"></div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <div className="app-brand justify-content-center p-0 mb-5">
            <span className="app-brand-mark">
              <i className="bi bi-diagram-3"></i>
            </span>
            Caddy Manager
          </div>
          <div className="page-eyebrow">Internal control room</div>
          <h1 className="login-title">Welcome back.</h1>
          <p className="login-subtitle">
            Sign in to manage routes, inspect health, and keep your edge quiet.
          </p>

          {error && (
            <div className="alert alert-danger py-2 small" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                className="form-control form-control-lg"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="mb-4">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                className="form-control form-control-lg"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-100 btn-lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                  ></span>
                  Signing in...
                </>
              ) : (
                <>
                  Enter control room <i className="bi bi-arrow-right ms-1"></i>
                </>
              )}
            </button>
          </form>
          <div className="login-footer">
            <span className="status-dot status-dot-success"></span> Private
            infrastructure workspace
          </div>
        </div>
      </div>
    </div>
  );
}
