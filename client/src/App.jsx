import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

async function fetchMe() {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data.user : null;
  } catch {
    return null;
  }
}

function Loading() {
  return <div style={{ padding: 20 }}>Cargando…</div>;
}

function RequireAuth({ me, loading, children }) {
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  return children;
}

function RequireRole({ me, loading, roles, redirectTo, children }) {
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/" replace />;
  if (!roles.includes(me.role)) return <Navigate to={redirectTo} replace />;
  return children;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const user = await fetchMe();
      setMe(user);
      setLoading(false);
    })();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* Cliente (solo cliente) */}
        <Route
          path="/client/shipments"
          element={
            <RequireRole
              me={me}
              loading={loading}
              roles={["client"]}
              redirectTo="/operator"
            >
              <ClientShipments />
            </RequireRole>
          }
        />

        {/* Operador/Admin */}
        <Route
          path="/operator"
          element={
            <RequireRole
              me={me}
              loading={loading}
              roles={["operator", "admin"]}
              redirectTo="/client/shipments"
            >
              <OperatorPanel />
            </RequireRole>
          }
        />

        {/* Alias */}
        <Route
          path="/client"
          element={<Navigate to="/client/shipments" replace />}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}