import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

export default function Topbar({ title = "LEMON's" }) {
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setMe(data.user);
      } catch {
        // no-op
      }
    })();
  }, []);

  function logout() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "/";
  }

  const isStaff = me?.role === "operator" || me?.role === "admin";
  const roleLabel = isStaff ? "Staff" : "Cuenta";

  const avatarLetter = (me?.name || "L").trim().slice(0, 1).toUpperCase();

  return (
    <div className="topbarShell">
      <div className="topbarCard--ig">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="topbarLogo--ig">L</div>

          <div>
            <div className="topbarTitle--ig">{title}</div>
            <div className="muted">Portal de envíos</div>
          </div>
        </div>

        <div className="topbarRight">
          {me ? (
            <div className="topbarUser--ig">
              <div className="topbarAvatar">{avatarLetter}</div>

              <div className="topbarUserText">
                <div className="topbarUserLine">
                  <span className="topbarRolePill">
                    {roleLabel} #{me.client_number}
                  </span>{" "}
                  — <b>{me.name}</b>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {me.email}
                </div>
              </div>
            </div>
          ) : null}

          <button className="btn btnPrimary btnSmall topbarLogoutBtn" onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}