import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

export default function App() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) {
        setMe(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/client/shipments"
          element={
            me ? (
              me.role === "client" ? (
                <ClientShipments />
              ) : (
                <Navigate to="/operator" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/operator"
          element={
            me ? (
              me.role === "operator" || me.role === "admin" ? (
                <OperatorPanel />
              ) : (
                <Navigate to="/client/shipments" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/client"
          element={<Navigate to="/client/shipments" replace />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}