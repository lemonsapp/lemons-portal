import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

function RequireAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        setMe(null);
        return;
      }

      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMe(data.user);
        else setMe(null);
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
      }
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
      const token = getToken();
      if (!token) {
        setLoading(false);
        setMe(null);
        return;
      }

      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setMe(data.user);
        else setMe(null);
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
      }
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
        <Route path="/" element={<Login />} />

        <Route
          path="/client/shipments"
          element={
            <RequireAuth>
              <ClientShipments />
            </RequireAuth>
          }
        />

        <Route
          path="/operator"
          element={
            <RequireRole roles={["operator", "admin"]}>
              <OperatorPanel />
            </RequireRole>
          }
        />

        <Route path="/client" element={<Navigate to="/client/shipments" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}