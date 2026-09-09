import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { ApiClient } from "@caddy-manager/shared-api";
import { setApiClient, setUnauthorizedHandler } from "./client";

interface AuthContextType {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem("token"),
  );

  const login = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) return false;
        const { token } = await res.json();
        localStorage.setItem("token", token);
        const client = new ApiClient("/api", token);
        setApiClient(client);
        setIsAuthenticated(true);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setApiClient(new ApiClient("/api"));
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(undefined);
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem("token");
    if (!token) {
      logout();
      return;
    }

    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      logout();
      return;
    }

    try {
      const encodedPayload = tokenParts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(tokenParts[1].length / 4) * 4, "=");
      const payload = JSON.parse(atob(encodedPayload)) as { exp?: number };

      if (!payload.exp) return;

      const delay = payload.exp * 1000 - Date.now();
      if (delay <= 0) {
        logout();
        return;
      }

      const timer = window.setTimeout(logout, delay);
      return () => window.clearTimeout(timer);
    } catch {
      logout();
    }
  }, [isAuthenticated, logout]);

  return (
    <AuthContext.Provider value={{ login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
