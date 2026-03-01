import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Login() {
  const [email, setEmail] = useState("admin@lemons.com");
  const [password, setPassword] = useState("admin123");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");


    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMsg(data?.error || "Error al iniciar sesión");
      return;
    }

    if (remember) localStorage.setItem("token", data.token);
    else sessionStorage.setItem("token", data.token);

    const role = data?.user?.role;
    if (role === "operator" || role === "admin") {
      window.location.href = "/operator";
    } else {
      // ✅ ruta real del cliente
      window.location.href = "/client/shipments";
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