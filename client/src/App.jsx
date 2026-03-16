import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./pages/Login.jsx";
import OperatorPanel from "./pages/OperatorPanel.jsx";
import ClientShipments from "./pages/ClientShipments.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CashRegister from "./pages/CashRegister.jsx";
import QuotePublic from "./pages/QuotePublic.jsx";
import QuoteClient from "./pages/QuoteClient.jsx";
import PWAManager from "./components/PWAManager.jsx";
import LemonCoins from "./pages/LemonCoins.jsx";
import CoinsOperator from "./pages/CoinsOperator.jsx";
import ExternalCargo from "./pages/ExternalCargo.jsx";
import LemonNotification from "./components/LemonNotification.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

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
  const [status, setStatus] = useState("loading"); // loading | ok | fail
  const [me, setMe] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    fetchMe().then(user => {
      if (cancelled) return;
      if (user) { setMe(user); setStatus("ok"); }
      else setStatus("fail");
    }).catch(() => { if (!cancelled) setStatus("fail"); });
    return () => { cancelled = true; };
  }, []);

  if (status === "loading") return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "#04060d", color: "rgba(237,233,224,.4)",
      fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "2px"
    }}>
      CARGANDO...
    </div>
  );

  if (status === "fail") return <Navigate to="/" replace state={{ from: location.pathname }} />;

  if (allowRoles && !allowRoles.includes(me.role)) {
    return <Navigate to="/client/shipments" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <PWAManager />
      <LemonNotification />
      <Routes>

        <Route path="/quote" element={<QuotePublic />} />
        <Route path="/client/quote" element={<AuthGate><QuoteClient /></AuthGate>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Login */}
        <Route path="/" element={<Login />} />

        {/* Cliente */}
        <Route
          path="/client/shipments"
          element={
            <AuthGate>
              <ClientShipments />
            </AuthGate>
          }
        />

        {/* Lemon Coins — cliente */}
        <Route
          path="/coins"
          element={
            <AuthGate>
              <LemonCoins />
            </AuthGate>
          }
        />

        {/* Operador/Admin */}
        <Route
          path="/operator"
          element={
            <AuthGate allowRoles={["operator", "admin"]}>
              <OperatorPanel />
            </AuthGate>
          }
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <AuthGate allowRoles={["operator", "admin"]}>
              <Dashboard />
            </AuthGate>
          }
        />

        {/* Caja */}
        <Route
          path="/caja"
          element={
            <AuthGate allowRoles={["operator", "admin"]}>
              <CashRegister />
            </AuthGate>
          }
        />

        {/* Lemon Coins — operador */}
        <Route
          path="/coins/operator"
          element={
            <AuthGate allowRoles={["operator", "admin"]}>
              <CoinsOperator />
            </AuthGate>
          }
        />

        {/* Cargas Externas */}
        <Route
          path="/external"
          element={
            <AuthGate allowRoles={["operator", "admin"]}>
              <ExternalCargo />
            </AuthGate>
          }
        />

        {/* Perfil */}
        <Route
          path="/perfil"
          element={
            <AuthGate>
              <ProfilePage />
            </AuthGate>
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
