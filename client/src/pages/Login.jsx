import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png"; // ✅ tu logo (ponelo en src/assets/logo.png)

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Login() {
  const navigate = useNavigate();

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

    if (remember) {
      localStorage.setItem("token", data.token);
      sessionStorage.removeItem("token");
    } else {
      sessionStorage.setItem("token", data.token);
      localStorage.removeItem("token");
    }

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
      if (role === "operator" || role === "admin") window.location.href = "/operator";
      else window.location.href = "/client/shipments";
    } catch {
      clearToken();
      setMsg("Falló la verificación de sesión (/auth/me). Revisá la API.");
    }
  }

  return (
    <div className="loginPage loginPage--lemons">
      <div className="loginShell">
        <div className="loginCard loginCard--lemons">
          {/* Header */}
          <div className="loginHeader loginHeader--lemons">
            <div className="loginBrand">
              <div className="loginLogoWrap">
                <img src={logo} alt="LEMONS" className="loginLogoImg" />
              </div>

              <div className="loginBrandText">
                <div className="loginBrandTitle">LEMON&apos;s</div>
                <div className="loginBrandSub">Portal de envíos</div>
              </div>
            </div>

            <div className="loginBadge">Acceso</div>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="loginForm">
            <div className="loginField">
              <label>Email</label>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tuemail@dominio.com"
                autoComplete="email"
              />
            </div>

            <div className="loginField">
              <label>Contraseña</label>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
              />
            </div>

            {/* row: remember + error */}
            <div className="loginRow">
              <label className="loginRemember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Recordarme</span>
              </label>

              {msg ? <div className="loginError">{msg}</div> : <div />}
            </div>

            {/* Footer actions */}
            <div className="loginActions">
              <button
                className="btn btnGhost loginForgot"
                type="button"
                onClick={() => navigate("/forgot-password")}
              >
                ¿Olvidaste tu contraseña?
              </button>

              <button className="btn btnPrimary loginSubmit" type="submit">
                Iniciar sesión
              </button>
            </div>

            <div className="loginHint">
              Si sos staff, entrás al panel operador automáticamente.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}