import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const NAV_STAFF = [
  { path: "/dashboard",      label: "Dashboard",   icon: "📊" },
  { path: "/operator",       label: "Operador",    icon: "🗂" },
  { path: "/caja",           label: "Caja",        icon: "💵" },
  { path: "/external",       label: "Cargas Ext.", icon: "📦" },
  {
    path: "/coins/operator", label: "Coins",       icon: "🍋",
    dropdown: [
      { path: "/coins/operator", label: "Panel Coins" },
    ],
  },
];

const NAV_CLIENT = [
  { path: "/client/shipments", label: "Mis envíos",  icon: "📦" },
  { path: "/perfil",             label: "Mi Perfil",   icon: "👤" },
  { path: "/client/quote",     label: "Presupuesto", icon: "🧮" },
  { path: "/coins",            label: "Coins",       icon: "🍋" },
];

export default function Topbar({ title = "LEMON'S" }) {
  const [me, setMe]             = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(null);
  const [dropPos, setDropPos]   = useState({ top: 0, left: 0 });
  const [scrolled, setScrolled] = useState(false);
  const [userDrop, setUserDrop] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const btnRefs = useRef({});
  const location = useLocation();

  const openDrop = useCallback((path) => {
    const btn = btnRefs.current[path];
    if (btn) {
      const r = btn.getBoundingClientRect();
      const fromRight = window.innerWidth - r.right;
      setDropPos({
        top: r.bottom + 6,
        ...(fromRight < 220
          ? { right: fromRight, left: "auto" }
          : { left: r.left, right: "auto" }),
      });
    }
    setDropOpen(path);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res  = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setMe(data.user);
          // Cargar perfil para el avatar
          try {
            const pRes = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } });
            const pData = await pRes.json().catch(() => ({}));
            if (pRes.ok) setProfileData(pData);
          } catch { /* no-op */ }
        }
      } catch { /* no-op */ }
    })();
  }, []);

  useEffect(() => {
    if (!dropOpen && !userDrop) return;
    const handler = () => { setDropOpen(null); setUserDrop(false); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [dropOpen, userDrop]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.href = "/";
  }

  const isStaff      = me?.role === "operator" || me?.role === "admin";
  const navLinks     = isStaff ? NAV_STAFF : NAV_CLIENT;
  const roleLabel    = me?.role === "admin" ? "Admin" : isStaff ? "Operador" : "Cliente";
  const avatarLetter = (me?.name || "L").trim().slice(0, 1).toUpperCase();
  const avatarItem = profileData?.profile && profileData.profile.avatar_key;
  const shopItems  = [];
  const avatarEmoji = (() => {
    const key = profileData?.profile?.avatar_key || "avatar_lemon";
    const map = {
      avatar_lemon: "🍋", avatar_rocket: "🚀", avatar_globe: "🌍",
      avatar_diamond: "💎", avatar_fire: "🔥", avatar_crown: "👑", avatar_lemon_fly: "🍋",
    };
    return map[key] || "🍋";
  })();
  const avatarBg = (() => {
    const key = profileData?.profile?.avatar_key || "avatar_lemon";
    const map = {
      avatar_lemon: "#f5e03a", avatar_rocket: "#3b82f6", avatar_globe: "#22c55e",
      avatar_diamond: "#a78bfa", avatar_fire: "#ff6200", avatar_crown: "#f5e03a", avatar_lemon_fly: "#f5e03a",
    };
    return map[key] || "#f5e03a";
  })();

  const navLinkStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 8,
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 13, fontWeight: 700, letterSpacing: "1.5px",
    textTransform: "uppercase",
    textDecoration: "none",
    cursor: "pointer", border: "none",
    color: active ? "#f5e03a" : "rgba(237,233,224,0.5)",
    background: active ? "rgba(245,224,58,0.08)" : "transparent",
    transition: "all 0.2s",
  });

  return (
    <>
      <style>{`
        .tb-shell {
          position: sticky; top: 0; z-index: 200;
          background: rgba(4,6,13,${scrolled ? ".97" : ".6"});
          backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(237,233,224,0.08);
          transition: background .4s;
        }
        .tb-inner {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; padding: 0 24px; height: 64px; max-width: 1400px; margin: 0 auto;
        }
        .tb-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px; letter-spacing: 4px;
          color: #ede9e0; text-decoration: none;
          display: flex; align-items: center; gap: 10px;
        }
        .tb-logo .y { color: #f5e03a; }
        .tb-logo .pulse {
          width: 6px; height: 6px; background: #ff6200;
          border-radius: 50%; animation: tbpulse 2.5s ease-in-out infinite;
        }
        @keyframes tbpulse { 0%,100%{opacity:1} 50%{opacity:.2} }
        .tb-nav { display: flex; align-items: center; gap: 4px; }
        .tb-nav a:hover, .tb-nav button:hover {
          color: rgba(237,233,224,0.9) !important;
          background: rgba(237,233,224,0.05) !important;
        }
        .tb-right { display: flex; align-items: center; gap: 10px; }
        .tb-user {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 12px; border-radius: 12px;
          background: rgba(237,233,224,0.05);
          border: 1px solid rgba(237,233,224,0.1);
        }
        .tb-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: #f5e03a; color: #04060d;
          display: grid; place-items: center;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 16px; flex-shrink: 0;
        }
        .tb-role {
          font-family: 'DM Mono', monospace;
          font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
          padding: 2px 8px; border-radius: 100px;
          background: rgba(245,224,58,.1);
          border: 1px solid rgba(245,224,58,.22);
          color: #f5e03a;
        }
        .tb-name { font-size: 13px; font-weight: 700; color: rgba(237,233,224,.9); }
        .tb-sub  { font-size: 11px; color: rgba(237,233,224,.3); margin-top: 1px; }
        .tb-logout {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
          background: rgba(237,233,224,.06); color: rgba(237,233,224,.8);
          border: 1px solid rgba(237,233,224,.12);
          padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all .2s;
          height: 34px; display: flex; align-items: center;
        }
        .tb-logout:hover { background: rgba(237,233,224,.1); color: #ede9e0; }
        .tb-ham {
          display: none; width: 36px; height: 36px; border-radius: 8px;
          background: rgba(237,233,224,.06); border: 1px solid rgba(237,233,224,.12);
          place-items: center; cursor: pointer; color: #ede9e0; font-size: 16px;
        }
        .tb-user-btn {
          cursor: pointer; position: relative;
          transition: all .2s;
        }
        .tb-user-btn:hover { background: rgba(237,233,224,.08) !important; }
        .tb-user-drop {
          position: fixed;
          background: rgba(7,10,20,.98);
          border: 1px solid rgba(237,233,224,.12);
          border-radius: 14px; overflow: hidden; min-width: 220px;
          z-index: 9999; box-shadow: 0 16px 48px rgba(0,0,0,.7);
          backdrop-filter: blur(20px);
        }
        .tb-user-drop-item {
          display: flex; align-items: center; gap: 10px;
          padding: 13px 18px;
          font-family: "Barlow Condensed", sans-serif;
          font-size: 13px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
          color: rgba(237,233,224,.75); text-decoration: none;
          border-bottom: 1px solid rgba(237,233,224,.06); transition: all .15s;
          cursor: pointer; background: none; border-left: none; border-right: none; border-top: none; width: 100%; text-align: left;
        }
        .tb-user-drop-item:hover { background: rgba(245,224,58,.06); color: #f5e03a; }
        .tb-user-drop-item:last-child { border-bottom: none; }
        .tb-dropdown {
          position: fixed;
          background: rgba(11,15,30,.98);
          border: 1px solid rgba(237,233,224,.12);
          border-radius: 12px; overflow: hidden; min-width: 180px;
          z-index: 9999; box-shadow: 0 12px 40px rgba(0,0,0,.6);
        }
        .tb-drop-item {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px; font-size: 13px; font-weight: 700;
          font-family: 'Barlow Condensed', sans-serif;
          letter-spacing: 1px; text-transform: uppercase;
          color: rgba(237,233,224,.75); text-decoration: none;
          border-bottom: 1px solid rgba(237,233,224,.06); transition: all .15s;
        }
        .tb-drop-item:hover { background: rgba(245,224,58,.06); color: #f5e03a; }
        .tb-drop-item.active { background: rgba(245,224,58,.07); color: #f5e03a; }
        .tb-mobile {
          background: rgba(4,6,13,.98); backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(237,233,224,.08);
          padding: 12px 24px 16px;
        }
        .tb-mobile a {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; border-radius: 8px;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(237,233,224,.7); text-decoration: none;
          border-bottom: 1px solid rgba(237,233,224,.06); transition: all .15s;
        }
        .tb-mobile a.active { color: #f5e03a; background: rgba(245,224,58,.06); }
        .tb-mobile-extras {
          display: flex; flex-direction: column; gap: 8px;
          margin-top: 12px; padding-top: 12px;
          border-top: 1px solid rgba(237,233,224,.08);
        }
        @media (max-width: 860px) {
          .tb-nav { display: none !important; }
          .tb-ham { display: grid !important; }
          .tb-user .tb-sub { display: none; }
        }
        @media (min-width: 861px) { .tb-ham { display: none !important; } }
      `}</style>

      <div className="tb-shell">
        <div className="tb-inner">

          {/* Logo */}
          <a href={isStaff ? "/dashboard" : "/client/shipments"} className="tb-logo">
            LEMON<span className="y">'S</span>&nbsp;<span className="pulse"></span>&nbsp;ARG
          </a>

          {/* Nav desktop */}
          {me && (
            <nav className="tb-nav">
              {navLinks.map((link) => {
                const active = location.pathname.startsWith(link.path);
                const hasDropdown = link.dropdown?.length > 0;
                const isDropOpen = dropOpen === link.path;

                if (hasDropdown) {
                  return (
                    <div key={link.path} style={{ position: "relative" }}>
                      <button
                        ref={(el) => { btnRefs.current[link.path] = el; }}
                        onClick={(e) => { e.stopPropagation(); isDropOpen ? setDropOpen(null) : openDrop(link.path); }}
                        style={{ ...navLinkStyle(active), background: active ? "rgba(245,224,58,0.08)" : "transparent" }}
                      >
                        <span style={{ fontSize: 14 }}>{link.icon}</span>
                        {link.label}
                        <span style={{ fontSize: 9, opacity: .5 }}>▼</span>
                      </button>
                      {isDropOpen && (
                        <div
                          className="tb-dropdown"
                          style={{ top: dropPos.top, left: dropPos.left !== "auto" ? dropPos.left : undefined, right: dropPos.right !== "auto" ? dropPos.right : undefined }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {link.dropdown.map((item) => (
                            <a
                              key={item.path}
                              href={item.path}
                              className={`tb-drop-item ${location.pathname === item.path ? "active" : ""}`}
                              onClick={() => setDropOpen(null)}
                            >
                              {item.label}
                              {location.pathname === item.path && (
                                <span style={{ marginLeft: "auto", fontSize: 8, color: "#f5e03a" }}>●</span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <a key={link.path} href={link.path} style={navLinkStyle(active)}>
                    <span style={{ fontSize: 14 }}>{link.icon}</span>
                    {link.label}
                  </a>
                );
              })}
            </nav>
          )}

          {/* Right */}
          <div className="tb-right">
            {me && (
              <div style={{ position: "relative" }}>
                <div
                  className="tb-user tb-user-btn"
                  onClick={(e) => { e.stopPropagation(); setUserDrop(o => !o); }}
                >
                  {/* Avatar con emoji del perfil */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: avatarBg,
                    display: "grid", placeItems: "center",
                    fontSize: 16, flexShrink: 0,
                    color: "#04060d",
                  }}>
                    {avatarEmoji}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="tb-role">{roleLabel}</span>
                      <span className="tb-name">{me.name}</span>
                    </div>
                    <div className="tb-sub">#{me.client_number} · {me.email}</div>
                  </div>
                  <span style={{ fontSize: 9, color: "rgba(237,233,224,.3)", marginLeft: 2 }}>▼</span>
                </div>

                {/* Dropdown de usuario */}
                {userDrop && (
                  <div className="tb-user-drop" style={{ top: 70, right: 0 }} onClick={e => e.stopPropagation()}>
                    {/* Header del dropdown */}
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(237,233,224,.08)", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: avatarBg, display: "grid", placeItems: "center", fontSize: 20, flexShrink: 0 }}>
                        {avatarEmoji}
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 2 }}>{me.name}</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(237,233,224,.4)", marginTop: 2 }}>
                          #{me.client_number} · {profileData?.coins?.balance?.toLocaleString() || 0} 🍋
                        </div>
                      </div>
                    </div>
                    <a href="/perfil" className="tb-user-drop-item" onClick={() => setUserDrop(false)}>
                      👤 Mi perfil
                    </a>
                    <a href="/coins" className="tb-user-drop-item" onClick={() => setUserDrop(false)}>
                      🍋 Lemon Coins
                    </a>
                    {isStaff && (
                      <a href="/dashboard" className="tb-user-drop-item" onClick={() => setUserDrop(false)}>
                        📊 Dashboard
                      </a>
                    )}
                    <button className="tb-user-drop-item" onClick={() => { setUserDrop(false); logout(); }} style={{ color: "rgba(255,98,0,.8)" }}>
                      🚪 Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
            <button className="tb-logout" onClick={logout}>Salir</button>
            {me && (
              <button className="tb-ham" onClick={() => setMenuOpen((o) => !o)}>
                {menuOpen ? "✕" : "☰"}
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {me && menuOpen && (
          <div className="tb-mobile">
            {navLinks.flatMap((link) => {
              const items = link.dropdown
                ? link.dropdown.map((d) => ({ ...d, icon: link.icon }))
                : [link];
              return items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className={active ? "active" : ""}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{item.icon || link.icon}</span>
                    {item.label}
                    {active && <span style={{ marginLeft: "auto", fontSize: 9, color: "#f5e03a" }}>● activo</span>}
                  </a>
                );
              });
            })}
            <div className="tb-mobile-extras">
              <button className="tb-logout" style={{ width: "100%", justifyContent: "center" }} onClick={logout}>
                Salir
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}