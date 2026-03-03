import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPassword() {
  const q = useQuery();
  const navigate = useNavigate();

  const email = q.get("email") || "";
  const token = q.get("token") || "";

  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setMsg("");
    if (!email || !token) return setMsg("Link inválido.");
    if (pass.length < 6) return setMsg("La contraseña debe tener mínimo 6 caracteres.");
    if (pass !== pass2) return setMsg("Las contraseñas no coinciden.");

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          new_password: pass,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data?.error || "Error");

      setMsg("Contraseña actualizada ✅ Ya podés iniciar sesión.");
      setTimeout(() => navigate("/"), 900);
    } catch {
      setMsg("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <Topbar title="Nueva contraseña" />

      <div className="box" style={{ marginTop: 12 }}>
        <h2>Nueva contraseña</h2>
        <div className="muted">Email: <b>{email || "-"}</b></div>

        <input
          className="input"
          type="password"
          placeholder="Nueva contraseña"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Repetir contraseña"
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
        />

        <button className="btn" onClick={submit} disabled={loading} style={{ marginTop: 10 }}>
          {loading ? "..." : "Guardar"}
        </button>

        {msg && <div className="banner">{msg}</div>}
      </div>
    </div>
  );
}