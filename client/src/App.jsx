import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import CashRegister from "./pages/CashRegister.jsx";

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

function AuthGate({ children, allowRoles }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const location = useLocation();

  useEffect(() => {
    (async () => {
      const user = await fetchMe();
      setMe(user);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Cargando…</div>;
  if (!me) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  if (allowRoles && !allowRoles.includes(me.role)) {
    return <Navigate to="/client/shipments" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Login />} />
        <Route path="/client/shipments" element={<AuthGate><ClientShipments /></AuthGate>} />
        <Route path="/operator" element={<AuthGate allowRoles={["operator", "admin"]}><OperatorPanel /></AuthGate>} />
        <Route path="/dashboard" element={<AuthGate allowRoles={["operator", "admin"]}><Dashboard /></AuthGate>} />
        <Route path="/caja" element={<AuthGate allowRoles={["operator", "admin"]}><CashRegister /></AuthGate>} />
        <Route path="/client" element={<Navigate to="/client/shipments" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
