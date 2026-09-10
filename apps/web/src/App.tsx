import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/index.scss";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { Layout } from "@caddy-manager/ui";
import { AuthProvider, useAuth } from "./api/auth";
import Dashboard from "./pages/Dashboard";
import Servers from "./pages/Servers";
import Sites from "./pages/Sites";
import SiteInventory from "./pages/SiteInventory";
import SiteEditor from "./pages/SiteEditor";
import SiteOverview from "./pages/SiteOverview";
import Settings from "./pages/Settings";
import Logs from "./pages/Logs";
import Audit from "./pages/Audit";
import Login from "./pages/Login";
import { notificationConfig } from "./config/notifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  return <Layout onLogout={logout}>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/servers" element={<Servers />} />
                <Route path="/sites" element={<Sites />} />
                <Route path="/site-inventory" element={<SiteInventory />} />
                <Route path="/sites/new" element={<SiteEditor />} />
                <Route path="/sites/:id" element={<SiteOverview />} />
                <Route path="/sites/:id/edit" element={<SiteEditor />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/audit" element={<Audit />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position={notificationConfig.position}
        gutter={notificationConfig.gutter}
      />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
