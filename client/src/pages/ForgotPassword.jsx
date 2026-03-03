import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setMsg("");
    if (!email.trim()) return setMsg("Poné tu email.");

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data?.error || "Error");

      setMsg("Listo ✅ Si el email existe, te enviamos un link.");
    } catch {
      setMsg("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <Topbar title="Restablecer contraseña" />

      <div className="box" style={{ marginTop: 12 }}>
        <h2>Restablecer contraseña</h2>
        <p className="muted">Te enviamos un link a tu email para crear una contraseña nueva.</p>

        <input
          className="input"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="btn" onClick={submit} disabled={loading}>
            {loading ? "..." : "Enviar link"}
          </button>
          <button className="btn" onClick={() => navigate("/")} type="button">
            Volver
          </button>
        </div>

        {msg && <div className="banner">{msg}</div>}
      </div>
    </div>
  );
}