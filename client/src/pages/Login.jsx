import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");

  const clearToken = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
  };

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
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
      return;
    }

    if (!res.ok) {
      setMsg(data?.error || "Error al iniciar sesión");
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

    // Validar token con /auth/me (esto corta el loop)
    try {
      const meRes = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json().catch(() => ({}));

      if (!meRes.ok || !meData.user) {
        clearToken();
        setMsg(meData?.error || "Token inválido. Probá de nuevo.");
        return;
      }

      const role = meData.user.role;
      if (role === "operator" || role === "admin") {
        window.location.href = "/operator";
      } else {
        window.location.href = "/client/shipments";
      }
    } catch {
      clearToken();
      setMsg("Falló la verificación de sesión (/auth/me). Revisá la API.");
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginHeader">
          <div className="logoCircle">L</div>
          <div className="brandText">LEMON&apos;s</div>
        </div>

        <form onSubmit={onSubmit} className="loginGrid">
          <label className="muted">Email</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tuemail@dominio.com"
            autoComplete="email"
          />

          <label className="muted" style={{ marginTop: 6 }}>
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

          <div className="loginRow">
            <label className="loginLeft">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Recuérdeme
            </label>

            {msg ? (
              <div style={{ color: "#ef4444", fontWeight: 800 }}>{msg}</div>
            ) : null}
          </div>

          <div className="loginFooter">
            <a className="loginLink" href="#">
              Olvidaste tu contraseña?
            </a>

            <button className="btn btnPrimary btnSmall" type="submit">
              INICIAR SESIÓN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}