// client/src/components/LemonNotification.jsx
// Globito flotante del personaje LIMÓN
import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const TYPE_STYLES = {
  info:    { bg:"linear-gradient(135deg,#1a2540,#0f1628)", accent:"#ffd200", icon:"🍋" },
  warning: { bg:"linear-gradient(135deg,#2a1a0f,#1a0f00)", accent:"#ff8a00", icon:"⚠️" },
  promo:   { bg:"linear-gradient(135deg,#0d2a1a,#071a10)", accent:"#4ade80", icon:"🎉" },
  update:  { bg:"linear-gradient(135deg,#0d1a2a,#071018)", accent:"#60a5fa", icon:"🆕" },
};

// Key para saber qué notificaciones ya cerró el usuario
const DISMISSED_KEY = "lemon_dismissed_notifs";
function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}
function addDismissed(id) {
  const arr = getDismissed();
  if (!arr.includes(id)) arr.push(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
}

export default function LemonNotification() {
  const [notif, setNotif]       = useState(null);
  const [visible, setVisible]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [bounce, setBounce]     = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`${API}/notifications/active`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!d.notification) return;
        const dismissed = getDismissed();
        if (dismissed.includes(d.notification.id)) return;
        setNotif(d.notification);
        // Aparece después de 1.5s
        setTimeout(() => setVisible(true), 1500);
        // Bouncing inicial
        setTimeout(() => setBounce(true), 2000);
        setTimeout(() => setBounce(false), 3500);
      } catch { /* silencioso */ }
    }
    load();
    // Re-chequea cada 5 minutos
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  function dismiss() {
    if (notif) addDismissed(notif.id);
    setExpanded(false);
    setTimeout(() => setVisible(false), 200);
  }

  if (!notif || !visible) return null;

  const style = TYPE_STYLES[notif.type] || TYPE_STYLES.info;

  return (
    <>
      <style>{`
        @keyframes lemonBounce {
          0%,100% { transform: translateY(0) scale(1); }
          30%      { transform: translateY(-12px) scale(1.1); }
          60%      { transform: translateY(-4px) scale(1.05); }
        }
        @keyframes lemonPop {
          from { opacity:0; transform:scale(0.7) translateY(20px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes lemonSlide {
          from { opacity:0; transform:translateY(10px) scale(0.95); }
          to   { opacity:1; transform:none; }
        }
        .lemon-bubble {
          animation: lemonPop 0.4s cubic-bezier(.34,1.56,.64,1) forwards;
        }
        .lemon-bounce {
          animation: lemonBounce 0.6s ease-in-out;
        }
        .lemon-msg {
          animation: lemonSlide 0.3s ease forwards;
        }
      `}</style>

      {/* Burbuja flotante */}
      <div
        className={`lemon-bubble ${bounce ? "lemon-bounce" : ""}`}
        style={{
          position:"fixed", bottom:24, right:24, zIndex:9000,
          display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10,
        }}
      >
        {/* Mensaje expandido */}
        {expanded && (
          <div className="lemon-msg" style={{
            background: style.bg,
            border:`2px solid ${style.accent}40`,
            borderRadius:18, padding:"16px 18px", maxWidth:300,
            boxShadow:`0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${style.accent}20`,
            position:"relative",
          }}>
            {/* Flecha */}
            <div style={{
              position:"absolute", bottom:-8, right:22,
              width:16, height:16,
              background:"#0f1628",
              border:`2px solid ${style.accent}40`,
              borderTop:"none", borderLeft:"none",
              transform:"rotate(45deg)",
            }}/>

            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{
                  width:28, height:28, borderRadius:"50%",
                  background:`${style.accent}20`, border:`1px solid ${style.accent}40`,
                  display:"grid", placeItems:"center", fontSize:14,
                }}>🍋</div>
                <span style={{ fontWeight:800, fontSize:13, color:style.accent }}>LIMÓN</span>
              </div>
              <button onClick={dismiss} style={{
                background:"rgba(255,255,255,0.08)", border:"none", borderRadius:6,
                width:24, height:24, cursor:"pointer", color:"rgba(255,255,255,0.5)",
                fontSize:12, display:"grid", placeItems:"center",
              }}>✕</button>
            </div>

            {/* Mensaje */}
            <p style={{
              margin:0, fontSize:14, color:"#fff", lineHeight:1.5,
              fontWeight:500,
            }}>
              {notif.emoji && <span style={{ marginRight:6 }}>{notif.emoji}</span>}
              {notif.message}
            </p>

            {/* Footer */}
            <button onClick={dismiss} style={{
              marginTop:12, width:"100%", height:34, borderRadius:8, border:"none",
              background:`${style.accent}18`, color:style.accent,
              fontWeight:700, fontSize:12, cursor:"pointer",
            }}>
              Entendido 👍
            </button>
          </div>
        )}

        {/* Botón burbuja */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{
            width:56, height:56, borderRadius:"50%", cursor:"pointer",
            background:`radial-gradient(circle at 35% 35%, ${style.accent}, ${style.accent}88)`,
            boxShadow:`0 4px 20px ${style.accent}50, 0 0 0 3px ${style.accent}20`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:26, userSelect:"none",
            transition:"transform 0.2s",
          }}
        >
          {expanded ? "✕" : "🍋"}
        </div>

        {/* Punto de notificación */}
        {!expanded && (
          <div style={{
            position:"absolute", top:2, right:2,
            width:14, height:14, borderRadius:"50%",
            background:"#ef4444", border:"2px solid #080d1c",
          }}/>
        )}
      </div>
    </>
  );
}