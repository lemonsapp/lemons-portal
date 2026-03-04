import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const clearToken = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setMsg("");
    setLoading(true);
    clearToken();

    let res, data;
    try {
      res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      setMsg("No pude conectar con la API. Revisá VITE_API_URL y Render.");
      setLoading(false);
      return;
    }

    if (!res.ok) {
      setMsg(data?.error || "Error al iniciar sesión");
      setLoading(false);
      return;
    }

    // Guardar token
    if (remember) {
      localStorage.setItem("token", data.token);
      sessionStorage.removeItem("token");
    } else {
      sessionStorage.setItem("token", data.token);
      localStorage.removeItem("token");
    }

    // Validar token con /auth/me
    try {
      const meRes = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json().catch(() => ({}));

      if (!meRes.ok || !meData.user) {
        clearToken();
        setMsg(meData?.error || "Token inválido. Probá de nuevo.");
        setLoading(false);
        return;
      }

      const role = meData.user.role;
      if (role === "operator" || role === "admin") {
        navigate("/operator", { replace: true });
      } else {
        navigate("/client/shipments", { replace: true });
      }
    } catch {
      clearToken();
      setMsg("Falló la verificación de sesión (/auth/me). Revisá la API.");
      setLoading(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginHeader">
          <div className="logoCircle">L</div>
          <div>
            <div className="brandText">LEMON&apos;s</div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>
              Portal de envíos • Acceso seguro
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="loginGrid">
          {msg ? (
            <div
              style={{
                borderRadius: 14,
                padding: "10px 12px",
                border: "1px solid rgba(255, 138, 0, 0.35)",
                background: "rgba(255, 138, 0, 0.10)",
                color: "rgba(255,255,255,0.92)",
                fontWeight: 900,
              }}
            >
              {msg}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 6 }}>
            <label className="muted" style={{ fontWeight: 900, fontSize: 12 }}>
              Email
            </label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tuemail@dominio.com"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label className="muted" style={{ fontWeight: 900, fontSize: 12 }}>
              Contraseña
            </label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
            />
          </div>

          <div className="loginRow">
            <label
              className="loginLeft"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{
                  width: 16,
                  height: 16,
                  accentColor: "#ffd200",
                }}
              />
              <span style={{ fontWeight: 900, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                Recordarme
              </span>
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="link"
                type="button"
                onClick={() => navigate("/forgot-password")}
                style={{
                  borderRadius: 999,
                  padding: "9px 12px",
                  background: "linear-gradient(135deg, rgba(255,210,0,0.18), rgba(255,138,0,0.12))",
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                  textDecoration: "none",
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>

          <div className="loginFooter" style={{ justifyContent: "flex-end" }}>
            <button className="btn btnPrimary" type="submit" disabled={loading}>
              {loading ? "INGRESANDO..." : "INICIAR SESIÓN"}
            </button>
          </div>

          <div className="muted" style={{ fontSize: 12, fontWeight: 800, textAlign: "center" }}>
            Si no recordás tu contraseña, recuperala desde el link de arriba.
          </div>
        </form>
      </div>
    </div>
  );
}