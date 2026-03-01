import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const clearToken = () => {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
};

async function fetchMe() {
  const token = getToken();
  if (!token) return { user: null, ok: false };

  try {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { user: null, ok: false };

    return { user: data.user || null, ok: true };
  } catch {
    return { user: null, ok: false };
  }
}

function RequireAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const { user, ok } = await fetchMe();
      if (!ok) {
        clearToken();
        setMe(null);
      } else {
        setMe(user);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>;
  if (!me) return <Navigate to="/" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const { user, ok } = await fetchMe();
      if (!ok) {
        clearToken();
        setMe(null);
      } else {
        setMe(user);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>;
  if (!me) return <Navigate to="/" replace />;
  if (!roles.includes(me.role)) return <Navigate to="/client/shipments" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* Cliente */}
        <Route
          path="/client/shipments"
          element={
            <RequireAuth>
              <ClientShipments />
            </RequireAuth>
          }
        />

        {/* Operador/Admin */}
        <Route
          path="/operator"
          element={
            <RequireRole roles={["operator", "admin"]}>
              <OperatorPanel />
            </RequireRole>
          }
        />

        {/* Alias */}
        <Route path="/client" element={<Navigate to="/client/shipments" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}