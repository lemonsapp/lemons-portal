import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const NAV_STAFF = [
  { path: "/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/operator",  label: "Operador",  icon: "🗂" },
  { path: "/caja",      label: "Caja",      icon: "💵" },
];

const NAV_CLIENT = [
  { path: "/client/shipments", label: "Mis envíos", icon: "📦" },
];

export default function Topbar({ title = "LEMON's" }) {
  const [me, setMe]           = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location              = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res  = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setMe(data.user);
      } catch { /* no-op */ }
    })();
  }, []);

  function logout() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "/";
  }

  const isStaff    = me?.role === "operator" || me?.role === "admin";
  const navLinks   = isStaff ? NAV_STAFF : NAV_CLIENT;
  const roleLabel  = me?.role === "admin" ? "Admin" : isStaff ? "Operador" : "Cliente";
  const avatarLetter = (me?.name || "L").trim().slice(0, 1).toUpperCase();

  return (
    <div className="topbarShell">
      <div className="topbarCard--ig">

        {/* ── Izquierda: logo + título ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="topbarLogo--ig">L</div>
          <div>
            <div className="topbarTitle--ig">{title}</div>
            <div className="muted" style={{ fontSize: 11 }}>Portal de envíos</div>
          </div>
        </div>

        {/* ── Centro: navegación (desktop) ── */}
        {me && (
          <nav style={{
            display: "flex", alignItems: "center", gap: 4,
            // ocultar en mobile, mostrar en desktop
          }} className="topbarNav">
            {navLinks.map((link) => {
              const active = location.pathname === link.path;
              return (
                <a
                  key={link.path}
                  href={link.path}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 13px",
                    borderRadius: 10,
                    fontSize: 13, fontWeight: active ? 800 : 600,
                    textDecoration: "none",
                    color: active ? "#ffd200" : "rgba(255,255,255,0.60)",
                    background: active
                      ? "rgba(255,210,0,0.10)"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(255,210,0,0.22)"
                      : "1px solid transparent",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "rgba(255,255,255,0.60)";
                    }
                  }}
                >
                  <span style={{ fontSize: 14 }}>{link.icon}</span>
                  {link.label}
                </a>
              );
            })}
          </nav>
        )}

        {/* ── Derecha: usuario + salir ── */}
        <div className="topbarRight">
          {me && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
            }}>
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg,#ffd200,#ff8a00)",
                display: "grid", placeItems: "center",
                fontWeight: 900, fontSize: 14, color: "#0b1020",
                flexShrink: 0,
              }}>
                {avatarLetter}
              </div>

              {/* Info */}
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    padding: "2px 7px", borderRadius: 999,
                    background: isStaff
                      ? "rgba(255,210,0,0.12)"
                      : "rgba(96,165,250,0.12)",
                    border: isStaff
                      ? "1px solid rgba(255,210,0,0.25)"
                      : "1px solid rgba(96,165,250,0.25)",
                    color: isStaff ? "#ffd200" : "#93c5fd",
                  }}>
                    {roleLabel}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                    {me.name}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>
                  #{me.client_number} · {me.email}
                </div>
              </div>
            </div>
          )}

          <button
            className="btn btnPrimary btnSmall"
            onClick={logout}
            style={{ height: 36, padding: "0 14px", fontSize: 12, whiteSpace: "nowrap" }}
          >
            Salir
          </button>

          {/* ── Hamburger mobile ── */}
          {me && (
            <button
              className="topbarHamburger"
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, width: 36, height: 36,
                display: "none", // mostrado via CSS en mobile
                placeItems: "center",
                cursor: "pointer", color: "#fff", fontSize: 16,
              }}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          )}
        </div>
      </div>

      {/* ── Menú mobile desplegable ── */}
      {me && menuOpen && (
        <div style={{
          margin: "6px 0 0",
          background: "rgba(12,18,34,0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          overflow: "hidden",
        }}>
          {navLinks.map((link) => {
            const active = location.pathname === link.path;
            return (
              <a
                key={link.path}
                href={link.path}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "13px 16px",
                  fontSize: 14, fontWeight: active ? 800 : 600,
                  color: active ? "#ffd200" : "rgba(255,255,255,0.75)",
                  background: active ? "rgba(255,210,0,0.07)" : "none",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  textDecoration: "none",
                }}
              >
                <span>{link.icon}</span>
                {link.label}
                {active && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10,
                    color: "#ffd200", fontWeight: 800,
                  }}>● activo</span>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* ── Estilos inline para responsive ── */}
      <style>{`
        @media (max-width: 860px) {
          .topbarNav { display: none !important; }
          .topbarHamburger { display: grid !important; }
        }
        @media (min-width: 861px) {
          .topbarHamburger { display: none !important; }
        }
      `}</style>
    </div>
  );
}