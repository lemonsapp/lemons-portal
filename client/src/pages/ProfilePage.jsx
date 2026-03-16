import { useEffect, useState, useCallback } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const RARITY_CONFIG = {
  common:    { label: "Común",     color: "#ede9e0", bg: "rgba(237,233,224,.08)", border: "rgba(237,233,224,.15)" },
  rare:      { label: "Raro",      color: "#60a5fa", bg: "rgba(96,165,250,.08)",  border: "rgba(96,165,250,.25)"  },
  epic:      { label: "Épico",     color: "#a78bfa", bg: "rgba(167,139,250,.08)", border: "rgba(167,139,250,.25)" },
  legendary: { label: "Legendario",color: "#f5e03a", bg: "rgba(245,224,58,.08)",  border: "rgba(245,224,58,.3)"   },
};

const TYPE_LABELS = { avatar: "Avatares", frame: "Marcos", title: "Títulos", badge: "Insignias" };

function AvatarDisplay({ avatarKey, frameKey, items, size = 80 }) {
  const avatarItem = items?.find(i => i.key === avatarKey);
  const frameItem  = items?.find(i => i.key === frameKey);
  const data       = avatarItem?.data || {};
  const frameData  = frameItem?.data  || {};

  const style = {
    width: size, height: size, borderRadius: "50%",
    display: "grid", placeItems: "center",
    fontSize: size * 0.4,
    background: data.bg || "#111627",
    position: "relative", flexShrink: 0,
    ...(frameData.border ? { border: frameData.border } : {}),
    ...(frameData.shadow ? { boxShadow: frameData.shadow } : {}),
  };

  return (
    <div style={style}>
      {data.emoji || "🍋"}
      {frameData.pulse && (
        <div style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: "2px solid rgba(167,139,250,.5)",
          animation: "pulse 2s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}

function ItemCard({ item, owned, equipped, onBuy, onEquip, loading }) {
  const rarity = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
  const data   = item.data || {};

  return (
    <div style={{
      background: owned ? rarity.bg : "rgba(255,255,255,.03)",
      border: "1px solid " + (owned ? rarity.border : "rgba(237,233,224,.08)"),
      borderRadius: 14, padding: "18px 16px",
      position: "relative", overflow: "hidden",
      transition: "all .25s",
      opacity: owned ? 1 : .85,
    }}>
      {/* Rarity badge */}
      <div style={{
        position: "absolute", top: 10, right: 10,
        fontFamily: "'DM Mono', monospace",
        fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase",
        padding: "2px 8px", borderRadius: 100,
        background: rarity.bg, border: `1px solid ${rarity.border}`,
        color: rarity.color,
      }}>{rarity.label}</div>

      {/* Preview */}
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: data.bg || "#111627",
        display: "grid", placeItems: "center",
        fontSize: 26, margin: "0 0 12px",
        border: item.type === "frame" ? (data.border || "none") : "none",
        boxShadow: item.type === "frame" ? (data.shadow || "none") : "none",
      }}>
        {item.emoji || "⭐"}
      </div>

      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, color: "rgba(237,233,224,.5)", lineHeight: 1.5, marginBottom: 14 }}>
        {item.description}
      </div>

      {/* Title preview */}
      {item.type === "title" && data.color && (
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "2px",
          textTransform: "uppercase", color: data.color,
          marginBottom: 10,
        }}>
          — {item.name} —
        </div>
      )}

      {owned ? (
        <button
          onClick={() => onEquip(item)}
          style={{
            width: "100%", height: 34,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
            background: equipped ? "rgba(245,224,58,.15)" : "rgba(237,233,224,.06)",
            border: `1px solid ${equipped ? "rgba(245,224,58,.3)" : "rgba(237,233,224,.12)"}`,
            color: equipped ? "#f5e03a" : "rgba(237,233,224,.7)",
            borderRadius: 8, cursor: "pointer", transition: "all .2s",
          }}
        >
          {equipped ? "✓ Equipado" : "Equipar"}
        </button>
      ) : (
        <button
          onClick={() => onBuy(item)}
          disabled={loading === item.key}
          style={{
            width: "100%", height: 34,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
            background: item.cost_coins === 0 ? "rgba(34,197,94,.1)" : "#f5e03a",
            border: "none",
            color: item.cost_coins === 0 ? "#22c55e" : "#04060d",
            borderRadius: 8, cursor: "pointer", transition: "all .2s",
            opacity: loading === item.key ? .6 : 1,
          }}
        >
          {loading === item.key ? "..." : item.cost_coins === 0 ? "🎁 Gratis" : `🍋 ${item.cost_coins.toLocaleString()}`}
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [shop,    setShop]    = useState(null);
  const [tab,     setTab]     = useState("perfil");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [buying,  setBuying]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const [equip,   setEquip]   = useState({ avatar_key: null, frame_key: null, title_key: null, badges: [] });

  const headers = { Authorization: `Bearer ${getToken()}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/profile`, { headers }),
        fetch(`${API}/profile/shop`, { headers }),
      ]);
      const [pData, sData] = await Promise.all([pRes.json(), sRes.json()]);
      setProfile(pData);
      setShop(sData.items || []);
      setEquip({
        avatar_key: pData.profile?.avatar_key || "avatar_lemon",
        frame_key:  pData.profile?.frame_key  || null,
        title_key:  pData.profile?.title_key  || null,
        badges:     pData.profile?.badges     || [],
      });
    } catch(e) { setMsg("Error cargando perfil"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBuy(item) {
    if (item.cost_coins > 0 && !confirm(`¿Gastar ${item.cost_coins} Lemon Coins en "${item.name}"?`)) return;
    setBuying(item.key);
    setMsg("");
    try {
      const res  = await fetch(`${API}/profile/buy`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ item_key: item.key }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Error"); }
      else { setMsg(`✅ ${item.name} desbloqueado!`); await load(); }
    } catch { setMsg("Error de red"); }
    setBuying(null);
  }

  async function handleEquip(item) {
    const newEquip = { ...equip };
    if (item.type === "avatar") newEquip.avatar_key = item.key;
    if (item.type === "frame")  newEquip.frame_key  = newEquip.frame_key === item.key ? null : item.key;
    if (item.type === "title")  newEquip.title_key  = newEquip.title_key === item.key ? null : item.key;
    if (item.type === "badge") {
      const idx = newEquip.badges.indexOf(item.key);
      if (idx >= 0) newEquip.badges = newEquip.badges.filter(b => b !== item.key);
      else if (newEquip.badges.length < 4) newEquip.badges = [...newEquip.badges, item.key];
      else { setMsg("Máximo 4 insignias activas"); return; }
    }
    setEquip(newEquip);
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(equip),
      });
      const data = await res.json();
      if (res.ok) { setMsg("✅ Perfil guardado"); await load(); }
      else setMsg(data.error || "Error");
    } catch { setMsg("Error de red"); }
    setSaving(false);
  }

  if (loading) return (
    <div style={{ background: "#04060d", minHeight: "100vh" }}>
      <Topbar />
      <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "rgba(237,233,224,.4)", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "2px" }}>
        CARGANDO...
      </div>
    </div>
  );

  const allItems   = shop || [];
  const owned      = profile?.profile?.owned_items || [];
  const levelConf  = { bronze: { label:"Bronce",color:"#CD7F32" }, silver: { label:"Plata",color:"#C0C0C0" }, gold: { label:"Oro",color:"#f5e03a" } };
  const level      = profile?.user?.level || "bronze";
  const lc         = levelConf[level];
  const titleItem  = allItems.find(i => i.key === equip.title_key);
  const titleData  = titleItem?.data || {};

  const filteredItems = typeFilter === "all" ? allItems : allItems.filter(i => i.type === typeFilter);

  return (
    <div style={{ background: "#04060d", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.05)} }
        .item-card:hover { transform: translateY(-2px); }
        .tab-btn { font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; padding:8px 20px; border-radius:8px; cursor:pointer; transition:all .2s; border:1px solid transparent; }
        .tab-btn.active { background:rgba(245,224,58,.1); border-color:rgba(245,224,58,.25); color:#f5e03a; }
        .tab-btn:not(.active) { background:transparent; color:rgba(237,233,224,.45); }
        .tab-btn:not(.active):hover { background:rgba(237,233,224,.05); color:rgba(237,233,224,.75); }
        .filter-btn { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; padding:6px 14px; border-radius:100px; cursor:pointer; transition:all .2s; }
        .filter-btn.on { background:rgba(245,224,58,.1); border:1px solid rgba(245,224,58,.25); color:#f5e03a; }
        .filter-btn:not(.on) { background:rgba(2
cat > /workspaces/lemons-portal/client/src/pages/ProfilePage.jsx << 'ENDOFFILE'
import { useEffect, useState, useCallback } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const RARITY_CONFIG = {
  common:    { label: "Común",     color: "#ede9e0", bg: "rgba(237,233,224,.08)", border: "rgba(237,233,224,.15)" },
  rare:      { label: "Raro",      color: "#60a5fa", bg: "rgba(96,165,250,.08)",  border: "rgba(96,165,250,.25)"  },
  epic:      { label: "Épico",     color: "#a78bfa", bg: "rgba(167,139,250,.08)", border: "rgba(167,139,250,.25)" },
  legendary: { label: "Legendario",color: "#f5e03a", bg: "rgba(245,224,58,.08)",  border: "rgba(245,224,58,.3)"   },
};

const TYPE_LABELS = { avatar: "Avatares", frame: "Marcos", title: "Títulos", badge: "Insignias" };

function AvatarDisplay({ avatarKey, frameKey, items, size = 80 }) {
  const avatarItem = items?.find(i => i.key === avatarKey);
  const frameItem  = items?.find(i => i.key === frameKey);
  const data       = avatarItem?.data || {};
  const frameData  = frameItem?.data  || {};

  const style = {
    width: size, height: size, borderRadius: "50%",
    display: "grid", placeItems: "center",
    fontSize: size * 0.4,
    background: data.bg || "#111627",
    position: "relative", flexShrink: 0,
    ...(frameData.border ? { border: frameData.border } : {}),
    ...(frameData.shadow ? { boxShadow: frameData.shadow } : {}),
  };

  return (
    <div style={style}>
      {data.emoji || "🍋"}
      {frameData.pulse && (
        <div style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: "2px solid rgba(167,139,250,.5)",
          animation: "pulse 2s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}

function ItemCard({ item, owned, equipped, onBuy, onEquip, loading }) {
  const rarity = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
  const data   = item.data || {};

  return (
    <div style={{
      background: owned ? rarity.bg : "rgba(255,255,255,.03)",
      border: "1px solid " + (owned ? rarity.border : "rgba(237,233,224,.08)"),
      borderRadius: 14, padding: "18px 16px",
      position: "relative", overflow: "hidden",
      transition: "all .25s",
      opacity: owned ? 1 : .85,
    }}>
      {/* Rarity badge */}
      <div style={{
        position: "absolute", top: 10, right: 10,
        fontFamily: "'DM Mono', monospace",
        fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase",
        padding: "2px 8px", borderRadius: 100,
        background: rarity.bg, border: `1px solid ${rarity.border}`,
        color: rarity.color,
      }}>{rarity.label}</div>

      {/* Preview */}
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: data.bg || "#111627",
        display: "grid", placeItems: "center",
        fontSize: 26, margin: "0 0 12px",
        border: item.type === "frame" ? (data.border || "none") : "none",
        boxShadow: item.type === "frame" ? (data.shadow || "none") : "none",
      }}>
        {item.emoji || "⭐"}
      </div>

      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 4 }}>
        {item.name}
      </div>
      <div style={{ fontSize: 12, color: "rgba(237,233,224,.5)", lineHeight: 1.5, marginBottom: 14 }}>
        {item.description}
      </div>

      {/* Title preview */}
      {item.type === "title" && data.color && (
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "2px",
          textTransform: "uppercase", color: data.color,
          marginBottom: 10,
        }}>
          — {item.name} —
        </div>
      )}

      {owned ? (
        <button
          onClick={() => onEquip(item)}
          style={{
            width: "100%", height: 34,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
            background: equipped ? "rgba(245,224,58,.15)" : "rgba(237,233,224,.06)",
            border: `1px solid ${equipped ? "rgba(245,224,58,.3)" : "rgba(237,233,224,.12)"}`,
            color: equipped ? "#f5e03a" : "rgba(237,233,224,.7)",
            borderRadius: 8, cursor: "pointer", transition: "all .2s",
          }}
        >
          {equipped ? "✓ Equipado" : "Equipar"}
        </button>
      ) : (
        <button
          onClick={() => onBuy(item)}
          disabled={loading === item.key}
          style={{
            width: "100%", height: 34,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
            background: item.cost_coins === 0 ? "rgba(34,197,94,.1)" : "#f5e03a",
            border: "none",
            color: item.cost_coins === 0 ? "#22c55e" : "#04060d",
            borderRadius: 8, cursor: "pointer", transition: "all .2s",
            opacity: loading === item.key ? .6 : 1,
          }}
        >
          {loading === item.key ? "..." : item.cost_coins === 0 ? "🎁 Gratis" : `🍋 ${item.cost_coins.toLocaleString()}`}
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [shop,    setShop]    = useState(null);
  const [tab,     setTab]     = useState("perfil");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [buying,  setBuying]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const [equip,   setEquip]   = useState({ avatar_key: null, frame_key: null, title_key: null, badges: [] });

  const headers = { Authorization: `Bearer ${getToken()}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/profile`, { headers }),
        fetch(`${API}/profile/shop`, { headers }),
      ]);
      const [pData, sData] = await Promise.all([pRes.json(), sRes.json()]);
      setProfile(pData);
      setShop(sData.items || []);
      setEquip({
        avatar_key: pData.profile?.avatar_key || "avatar_lemon",
        frame_key:  pData.profile?.frame_key  || null,
        title_key:  pData.profile?.title_key  || null,
        badges:     pData.profile?.badges     || [],
      });
    } catch(e) { setMsg("Error cargando perfil"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleBuy(item) {
    if (item.cost_coins > 0 && !confirm(`¿Gastar ${item.cost_coins} Lemon Coins en "${item.name}"?`)) return;
    setBuying(item.key);
    setMsg("");
    try {
      const res  = await fetch(`${API}/profile/buy`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ item_key: item.key }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Error"); }
      else { setMsg(`✅ ${item.name} desbloqueado!`); await load(); }
    } catch { setMsg("Error de red"); }
    setBuying(null);
  }

  async function handleEquip(item) {
    const newEquip = { ...equip };
    if (item.type === "avatar") newEquip.avatar_key = item.key;
    if (item.type === "frame")  newEquip.frame_key  = newEquip.frame_key === item.key ? null : item.key;
    if (item.type === "title")  newEquip.title_key  = newEquip.title_key === item.key ? null : item.key;
    if (item.type === "badge") {
      const idx = newEquip.badges.indexOf(item.key);
      if (idx >= 0) newEquip.badges = newEquip.badges.filter(b => b !== item.key);
      else if (newEquip.badges.length < 4) newEquip.badges = [...newEquip.badges, item.key];
      else { setMsg("Máximo 4 insignias activas"); return; }
    }
    setEquip(newEquip);
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(equip),
      });
      const data = await res.json();
      if (res.ok) { setMsg("✅ Perfil guardado"); await load(); }
      else setMsg(data.error || "Error");
    } catch { setMsg("Error de red"); }
    setSaving(false);
  }

  if (loading) return (
    <div style={{ background: "#04060d", minHeight: "100vh" }}>
      <Topbar />
      <div style={{ display: "grid", placeItems: "center", height: "60vh", color: "rgba(237,233,224,.4)", fontFamily: "'DM Mono',monospace", fontSize: 12, letterSpacing: "2px" }}>
        CARGANDO...
      </div>
    </div>
  );

  const allItems   = shop || [];
  const owned      = profile?.profile?.owned_items || [];
  const levelConf  = { bronze: { label:"Bronce",color:"#CD7F32" }, silver: { label:"Plata",color:"#C0C0C0" }, gold: { label:"Oro",color:"#f5e03a" } };
  const level      = profile?.user?.level || "bronze";
  const lc         = levelConf[level];
  const titleItem  = allItems.find(i => i.key === equip.title_key);
  const titleData  = titleItem?.data || {};

  const filteredItems = typeFilter === "all" ? allItems : allItems.filter(i => i.type === typeFilter);

  return (
    <div style={{ background: "#04060d", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.05)} }
        .item-card:hover { transform: translateY(-2px); }
        .tab-btn { font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; padding:8px 20px; border-radius:8px; cursor:pointer; transition:all .2s; border:1px solid transparent; }
        .tab-btn.active { background:rgba(245,224,58,.1); border-color:rgba(245,224,58,.25); color:#f5e03a; }
        .tab-btn:not(.active) { background:transparent; color:rgba(237,233,224,.45); }
        .tab-btn:not(.active):hover { background:rgba(237,233,224,.05); color:rgba(237,233,224,.75); }
        .filter-btn { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; padding:6px 14px; border-radius:100px; cursor:pointer; transition:all .2s; }
        .filter-btn.on { background:rgba(245,224,58,.1); border:1px solid rgba(245,224,58,.25); color:#f5e03a; }
        .filter-btn:not(.on) { background:rgba(237,233,224,.04); border:1px solid rgba(237,233,224,.08); color:rgba(237,233,224,.4); }
      `}</style>
      <Topbar />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── Header del perfil ── */}
        <div style={{
          background: "#111627", border: "1px solid rgba(237,233,224,.08)",
          borderRadius: 20, overflow: "hidden", marginBottom: 24,
        }}>
          {/* Banner */}
          <div style={{
            height: 120,
            background: "linear-gradient(135deg, rgba(245,224,58,.12), rgba(255,98,0,.08), rgba(167,139,250,.06))",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "linear-gradient(rgba(237,233,224,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(237,233,224,.012) 1px,transparent 1px)",
              backgroundSize: "40px 40px",
            }} />
          </div>

          {/* Info */}
          <div style={{ padding: "0 28px 24px", position: "relative" }}>
            {/* Avatar */}
            <div style={{ marginTop: -40, marginBottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <AvatarDisplay
                avatarKey={equip.avatar_key || "avatar_lemon"}
                frameKey={equip.frame_key}
                items={allItems}
                size={80}
              />
              <button
                onClick={handleSave} disabled={saving}
                className="btnPrimary btn"
                style={{ height: 36, padding: "0 20px", fontSize: 12 }}
              >
                {saving ? "Guardando..." : "💾 Guardar perfil"}
              </button>
            </div>

            {/* Nombre y título */}
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, lineHeight: 1, marginBottom: 4 }}>
              {profile?.user?.name}
            </div>
            {equip.title_key && titleItem && (
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "2px",
                textTransform: "uppercase", color: titleData.color || "#f5e03a",
                marginBottom: 8,
              }}>
                — {titleItem.name} —
              </div>
            )}

            {/* Info row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "2px",
                textTransform: "uppercase", padding: "3px 10px", borderRadius: 100,
                background: `rgba(${level==="gold"?"245,224,58":level==="silver"?"192,192,192":"205,127,50"},.1)`,
                border: `1px solid ${lc.color}40`, color: lc.color,
              }}>
                {level === "gold" ? "🥇" : level === "silver" ? "🥈" : "🥉"} {lc.label}
              </span>
              <span style={{ fontSize: 12, color: "rgba(237,233,224,.4)" }}>
                #{profile?.user?.client_number} · {profile?.user?.email}
              </span>
              <span style={{ fontSize: 12, color: "rgba(237,233,224,.4)" }}>
                🍋 {profile?.coins?.balance?.toLocaleString()} coins disponibles
              </span>
            </div>

            {/* Badges activos */}
            {equip.badges?.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {equip.badges.map(bk => {
                  const b = allItems.find(i => i.key === bk);
                  if (!b) return null;
                  const bd = b.data || {};
                  return (
                    <div key={bk} style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "1.5px",
                      textTransform: "uppercase", padding: "4px 12px", borderRadius: 100,
                      background: `${bd.color || "#f5e03a"}15`,
                      border: `1px solid ${bd.color || "#f5e03a"}30`,
                      color: bd.color || "#f5e03a",
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {b.emoji} {b.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, marginBottom: 24 }}>
          {[
            { k: "Envíos totales",  v: profile?.stats?.total_shipments || 0,  icon: "📦" },
            { k: "Entregados",      v: profile?.stats?.delivered || 0,         icon: "✅" },
            { k: "USD Importados",  v: `$${(profile?.stats?.total_usd||0).toFixed(0)}`, icon: "💰" },
            { k: "Coins ganados",   v: (profile?.coins?.total_earned||0).toLocaleString(), icon: "🍋" },
          ].map((s,i) => (
            <div key={i} style={{
              background: "#111627", border: "1px solid rgba(237,233,224,.08)",
              borderRadius: i===0?"14px 0 0 14px":i===3?"0 14px 14px 0":"0",
              padding: "20px 18px",
            }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(237,233,224,.4)", marginBottom: 8 }}>
                {s.icon} {s.k}
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, lineHeight: 1, color: "#f5e03a" }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[["perfil","👤 Mi Perfil"], ["tienda","🛍️ Tienda"], ["coleccion","📦 Colección"]].map(([t,l]) => (
            <button key={t} className={`tab-btn ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{l}</button>
          ))}
        </div>

        {msg && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 10,
            background: msg.startsWith("✅") ? "rgba(34,197,94,.1)" : "rgba(255,98,0,.1)",
            border: `1px solid ${msg.startsWith("✅") ? "rgba(34,197,94,.25)" : "rgba(255,98,0,.25)"}`,
            color: msg.startsWith("✅") ? "#22c55e" : "#ff8c2a",
            fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700,
          }}>
            {msg}
          </div>
        )}

        {/* ── Tab: Perfil ── */}
        {tab === "perfil" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Avatares */}
            <div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "3px", textTransform: "uppercase", color: "#ff6200", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "block", width: 24, height: 1, background: "#ff6200" }} />
                Avatar
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {allItems.filter(i => i.type === "avatar" && owned.includes(i.key)).map(item => (
                  <ItemCard key={item.key} item={item} owned={true}
                    equipped={equip.avatar_key === item.key}
                    onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                ))}
              </div>
            </div>
            {/* Marcos, Títulos, Insignias */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {["frame","title","badge"].map(type => {
                const typeItems = allItems.filter(i => i.type === type && owned.includes(i.key));
                if (typeItems.length === 0) return null;
                return (
                  <div key={type}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "3px", textTransform: "uppercase", color: "#ff6200", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "block", width: 24, height: 1, background: "#ff6200" }} />
                      {TYPE_LABELS[type]}
                      {type === "badge" && <span style={{ color: "rgba(237,233,224,.3)", fontSize: 9 }}>({equip.badges?.length}/4 activas)</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {typeItems.map(item => (
                        <ItemCard key={item.key} item={item} owned={true}
                          equipped={type==="badge" ? equip.badges?.includes(item.key) : equip[`${type}_key`] === item.key}
                          onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Tab: Tienda ── */}
        {tab === "tienda" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {[["all","Todo"], ["avatar","Avatares"], ["frame","Marcos"], ["title","Títulos"], ["badge","Insignias"]].map(([v,l]) => (
                <button key={v} className={`filter-btn ${typeFilter===v?"on":""}`} onClick={()=>setTypeFilter(v)}>{l}</button>
              ))}
              <span style={{ marginLeft: "auto", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "rgba(237,233,224,.4)" }}>
                🍋 {profile?.coins?.balance?.toLocaleString()} coins disponibles
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
              {filteredItems.map(item => (
                <div key={item.key} className="item-card" style={{ transition: "transform .2s" }}>
                  <ItemCard item={item} owned={owned.includes(item.key)}
                    equipped={item.type==="badge" ? equip.badges?.includes(item.key) : equip[`${item.type}_key`] === item.key}
                    onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Colección ── */}
        {tab === "coleccion" && (
          <div>
            <div style={{ marginBottom: 20, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "rgba(237,233,224,.4)", letterSpacing: "1px" }}>
              {owned.length} / {allItems.length} items desbloqueados
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
              {allItems.map(item => (
                <div key={item.key} className="item-card" style={{ transition: "transform .2s", opacity: owned.includes(item.key) ? 1 : .4 }}>
                  <ItemCard item={item} owned={owned.includes(item.key)}
                    equipped={item.type==="badge" ? equip.badges?.includes(item.key) : equip[`${item.type}_key`] === item.key}
                    onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
