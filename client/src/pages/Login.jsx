import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: (email || "").trim().toLowerCase(),
          password,
          remember,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLoading(false);
        return setMsg(data?.error || "Error al iniciar sesión");
      }

      const token = data.token;
      const user = data.user;

      if (!token || !user) {
        setLoading(false);
        return setMsg("Respuesta inválida del servidor");
      }

      // Guardar token
      if (remember) {
        localStorage.setItem("token", token);
        sessionStorage.removeItem("token");
      } else {
        sessionStorage.setItem("token", token);
        localStorage.removeItem("token");
      }

      // (Opcional) guardar user para mostrar arriba sin pedir /me
      localStorage.setItem("me", JSON.stringify(user));

      // ✅ REDIRECT SEGÚN ROL
      if (user.role === "operator" || user.role === "admin") {
        nav("/operator", { replace: true });
      } else {
        nav("/client/shipments", { replace: true });
      }
    } catch (err) {
      setMsg("No se pudo conectar con la API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <div className="box" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>LEMON&apos;s Portal</h1>
        <div className="muted" style={{ marginBottom: 14 }}>
          Iniciá sesión para ver tus envíos.
        </div>

        <form onSubmit={onSubmit} className="col">
          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="input"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="muted">Recordarme</span>
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Entrar"}
          </button>
        </form>

        {msg && <div className="banner" style={{ marginTop: 12 }}>{msg}</div>}
      </div>
    </div>
  );
}