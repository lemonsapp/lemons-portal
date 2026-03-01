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

        const data = await res.json();
        if (res.ok) setMe(data.user);
      } catch {
        // ignore
      }
    })();
  }, []);

  function logout() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "/";
  }

  return (
    <div className="topbarShell">
      <div className="topbarCard">
        <div className="topbarLeft">
          <div className="topbarLogo">L</div>
          <div>
            <div className="topbarTitle">{title}</div>
            <div className="topbarSubtitle">Portal de envíos</div>
          </div>
        </div>

        <div className="topbarRight">
          {me && (
            <div className="topbarUser">
              {me.role === "client" && (
                <>
                  <div>
                    <b>Cliente #{me.client_number}</b> — {me.name}
                  </div>
                  <div className="topbarSubtitle">{me.email}</div>
                </>
              )}

              {(me.role === "operator" || me.role === "admin") && (
                <>
                  <div>
                    <b>{me.role.toUpperCase()}</b> — {me.name}
                  </div>
                  <div className="topbarSubtitle">{me.email}</div>
                </>
              )}
            </div>
          )}

          <button className="btn btnPrimary btnSmall" onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}