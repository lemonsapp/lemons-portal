import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const RARITY = {
  common:    { label:"Común",      color:"#ede9e0", bg:"rgba(237,233,224,.08)", border:"rgba(237,233,224,.15)" },
  rare:      { label:"Raro",       color:"#60a5fa", bg:"rgba(96,165,250,.08)",  border:"rgba(96,165,250,.25)"  },
  epic:      { label:"Épico",      color:"#a78bfa", bg:"rgba(167,139,250,.08)", border:"rgba(167,139,250,.25)" },
  legendary: { label:"Legendario", color:"#f5e03a", bg:"rgba(245,224,58,.08)",  border:"rgba(245,224,58,.3)"   },
};

const LEVEL = {
  bronze: { label:"Bronce", color:"#CD7F32", bg:"rgba(205,127,50,.12)", icon:"🥉" },
  silver: { label:"Plata",  color:"#C0C0C0", bg:"rgba(192,192,192,.12)", icon:"🥈" },
  gold:   { label:"Oro",    color:"#f5e03a", bg:"rgba(245,224,58,.12)",  icon:"🥇" },
};

const ACHIEVEMENTS = [
  { key:"ach_first",    icon:"🎯", name:"Primer Envío",   desc:"Completaste tu primer envío",       condition: (s)=>s.delivered>=1,    reward:0,    rarity:"common"    },
  { key:"ach_x5",       icon:"📦", name:"Importador",     desc:"5 envíos completados",              condition: (s)=>s.delivered>=5,    reward:50,   rarity:"common"    },
  { key:"ach_x10",      icon:"🔟", name:"Frecuente",      desc:"10 envíos completados",             condition: (s)=>s.delivered>=10,   reward:100,  rarity:"rare"      },
  { key:"ach_x25",      icon:"🏅", name:"Veterano",       desc:"25 envíos completados",             condition: (s)=>s.delivered>=25,   reward:300,  rarity:"epic"      },
  { key:"ach_usd1k",    icon:"💵", name:"Mil Dólares",    desc:"Más de USD 1.000 importados",       condition: (s)=>s.total_usd>=1000, reward:100,  rarity:"common"    },
  { key:"ach_usd5k",    icon:"💰", name:"Ballena",        desc:"Más de USD 5.000 importados",       condition: (s)=>s.total_usd>=5000, reward:500,  rarity:"epic"      },
  { key:"ach_usd10k",   icon:"🐋", name:"Mega Ballena",   desc:"Más de USD 10.000 importados",      condition: (s)=>s.total_usd>=10000,reward:1000, rarity:"legendary" },
  { key:"ach_coins500", icon:"🍋", name:"Acumulador",     desc:"500+ Lemon Coins ganados en total", condition: (s,c)=>c>=500,          reward:0,    rarity:"rare"      },
];

function AvatarDisplay({ avatarKey, frameKey, items, size=80 }) {
  const av = items && items.find(i => i.key === avatarKey);
  const fr = items && items.find(i => i.key === frameKey);
  const ad = (av && av.data) || {};
  const fd = (fr && fr.data) || {};
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      display: "grid", placeItems: "center", fontSize: size * 0.42,
      background: ad.bg || "#111627",
      position: "relative", flexShrink: 0,
      border: fd.border || "none",
      boxShadow: fd.shadow || "none",
    }}>
      {ad.emoji || "🍋"}
      {fd.pulse && (
        <div style={{ position:"absolute",inset:-4,borderRadius:"50%",border:"2px solid rgba(167,139,250,.4)",animation:"pu 2s ease-in-out infinite" }} />
      )}
    </div>
  );
}

function ItemCard({ item, owned, equipped, onBuy, onEquip, loading, readOnly }) {
  const r = RARITY[item.rarity] || RARITY.common;
  const d = item.data || {};
  const borderStyle = "1px solid " + (owned ? r.border : "rgba(237,233,224,.07)");
  return (
    <div style={{
      background: owned ? r.bg : "rgba(255,255,255,.02)",
      border: borderStyle,
      borderRadius: 12, padding: "16px 14px",
      position: "relative", overflow: "hidden",
      transition: "all .25s", opacity: owned ? 1 : 0.7,
    }}>
      <div style={{ position:"absolute",top:8,right:8,fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:"1.5px",textTransform:"uppercase",padding:"2px 7px",borderRadius:100,background:r.bg,border:"1px solid "+r.border,color:r.color }}>
        {r.label}
      </div>
      <div style={{ width:48,height:48,borderRadius:"50%",background:d.bg||"#111627",display:"grid",placeItems:"center",fontSize:22,margin:"0 0 10px",border:item.type==="frame"?(d.border||"none"):"none",boxShadow:item.type==="frame"?(d.shadow||"none"):"none" }}>
        {item.emoji || "⭐"}
      </div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:800,letterSpacing:".5px",textTransform:"uppercase",marginBottom:3 }}>
        {item.name}
      </div>
      <div style={{ fontSize:11,color:"rgba(237,233,224,.45)",lineHeight:1.5,marginBottom:12 }}>
        {item.description}
      </div>
      {item.type === "title" && d.color && (
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:d.color,marginBottom:10 }}>
          — {item.name} —
        </div>
      )}
      {!readOnly && (
        owned ? (
          <button onClick={() => onEquip(item)} style={{ width:"100%",height:30,fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",background:equipped?"rgba(245,224,58,.12)":"rgba(237,233,224,.05)",border:"1px solid "+(equipped?"rgba(245,224,58,.28)":"rgba(237,233,224,.1)"),color:equipped?"#f5e03a":"rgba(237,233,224,.6)",borderRadius:7,cursor:"pointer" }}>
            {equipped ? "✓ Equipado" : "Equipar"}
          </button>
        ) : (
          <button onClick={() => onBuy(item)} disabled={loading === item.key} style={{ width:"100%",height:30,fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",background:item.cost_coins===0?"rgba(34,197,94,.1)":"#f5e03a",border:"none",color:item.cost_coins===0?"#22c55e":"#04060d",borderRadius:7,cursor:"pointer",opacity:loading===item.key?0.6:1 }}>
            {loading === item.key ? "..." : item.cost_coins === 0 ? "🎁 Gratis" : "🍋 " + item.cost_coins.toLocaleString()}
          </button>
        )
      )}
    </div>
  );
}

function AchievementCard({ ach, unlocked }) {
  const r = RARITY[ach.rarity] || RARITY.common;
  return (
    <div style={{ background:unlocked?r.bg:"rgba(255,255,255,.02)",border:"1px solid "+(unlocked?r.border:"rgba(237,233,224,.06)"),borderRadius:12,padding:"16px 14px",position:"relative",overflow:"hidden",transition:"all .3s",opacity:unlocked?1:0.5 }}>
      {unlocked && <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,"+r.color+",transparent)" }} />}
      <div style={{ position:"absolute",top:8,right:8,fontFamily:"'DM Mono',monospace",fontSize:8,letterSpacing:"1.5px",textTransform:"uppercase",padding:"2px 7px",borderRadius:100,background:r.bg,border:"1px solid "+r.border,color:r.color }}>{r.label}</div>
      <div style={{ fontSize:28,marginBottom:10 }}>{unlocked ? ach.icon : "🔒"}</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:800,letterSpacing:".5px",textTransform:"uppercase",marginBottom:3 }}>{ach.name}</div>
      <div style={{ fontSize:11,color:"rgba(237,233,224,.45)",lineHeight:1.5,marginBottom:10 }}>{ach.desc}</div>
      {ach.reward > 0 && (
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:unlocked?"#f5e03a":"rgba(237,233,224,.2)" }}>
          {unlocked ? "✓ " : ""}+{ach.reward} coins
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { id: targetId } = useParams();
  const isOwn = !targetId;

  const [profile,  setProfile]  = useState(null);
  const [shop,     setShop]     = useState(null);
  const [tab,      setTab]      = useState("perfil");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading,  setLoading]  = useState(true);
  const [buying,   setBuying]   = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [editBio,  setEditBio]  = useState(false);
  const [bioText,  setBioText]  = useState("");
  const [toast,    setToast]    = useState(null);
  const [equip,    setEquip]    = useState({ avatar_key:"avatar_lemon", frame_key:null, title_key:null, badges:[] });

  const hdrs = { Authorization: "Bearer " + getToken() };

  const showToast = (text, color) => {
    setToast({ text, color: color || "#f5e03a" });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isOwn ? API + "/profile" : API + "/profile/" + targetId;
      const [pRes, sRes] = await Promise.all([
        fetch(url, { headers: hdrs }),
        fetch(API + "/profile/shop", { headers: hdrs }),
      ]);
      const [pData, sData] = await Promise.all([pRes.json(), sRes.json()]);
      setProfile(pData);
      setShop(sData.items || []);
      setBioText(pData.profile && pData.profile.bio ? pData.profile.bio : "");
      setEquip({
        avatar_key: (pData.profile && pData.profile.avatar_key) || "avatar_lemon",
        frame_key:  (pData.profile && pData.profile.frame_key)  || null,
        title_key:  (pData.profile && pData.profile.title_key)  || null,
        badges:     (pData.profile && pData.profile.badges)     || [],
      });
    } catch (e) { setMsg("Error: " + e.message); }
    setLoading(false);
  }, [targetId]);

  useEffect(() => { load(); }, [load]);

  async function handleBuy(item) {
    if (item.cost_coins > 0 && !confirm("Gastar " + item.cost_coins + " Lemon Coins en " + item.name + "?")) return;
    setBuying(item.key); setMsg("");
    try {
      const res = await fetch(API + "/profile/buy", {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ item_key: item.key }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || "Error");
      else { showToast("🎉 " + item.name + " desbloqueado!"); await load(); }
    } catch { setMsg("Error de red"); }
    setBuying(null);
  }

  function handleEquip(item) {
    const e2 = { ...equip };
    if (item.type === "avatar") e2.avatar_key = item.key;
    if (item.type === "frame")  e2.frame_key  = e2.frame_key === item.key ? null : item.key;
    if (item.type === "title")  e2.title_key  = e2.title_key === item.key ? null : item.key;
    if (item.type === "badge") {
      const idx = e2.badges.indexOf(item.key);
      if (idx >= 0) e2.badges = e2.badges.filter(b => b !== item.key);
      else if (e2.badges.length < 4) e2.badges = [...e2.badges, item.key];
      else { showToast("Máximo 4 insignias", "#ff6200"); return; }
    }
    setEquip(e2);
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch(API + "/profile", {
        method: "PATCH",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ ...equip, bio: bioText }),
      });
      const data = await res.json();
      if (res.ok) { showToast("✅ Perfil guardado"); setEditBio(false); await load(); }
      else setMsg(data.error || "Error");
    } catch { setMsg("Error de red"); }
    setSaving(false);
  }

  if (loading) return (
    <div style={{ background:"#04060d",minHeight:"100vh" }}>
      <Topbar />
      <div style={{ display:"grid",placeItems:"center",height:"60vh",color:"rgba(237,233,224,.3)",fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:"3px" }}>
        CARGANDO...
      </div>
    </div>
  );

  const allItems   = shop || [];
  const owned      = (profile && profile.profile && profile.profile.owned_items) || [];
  const level      = (profile && profile.user && profile.user.level) || "bronze";
  const lc         = LEVEL[level];
  const titleItem  = allItems.find(i => i.key === equip.title_key);
  const titleData  = (titleItem && titleItem.data) || {};
  const filtered   = typeFilter === "all" ? allItems : allItems.filter(i => i.type === typeFilter);
  const stats      = (profile && profile.stats) || {};
  const coinsTotal = (profile && profile.coins && profile.coins.total_earned) || 0;
  const unlockedAchs = ACHIEVEMENTS.filter(a => a.condition(stats, coinsTotal));

  const bannerGrad = level === "gold"
    ? "linear-gradient(135deg,rgba(245,224,58,.18),rgba(255,98,0,.1),rgba(245,224,58,.06))"
    : level === "silver"
    ? "linear-gradient(135deg,rgba(192,192,192,.12),rgba(96,165,250,.08),rgba(192,192,192,.04))"
    : "linear-gradient(135deg,rgba(205,127,50,.1),rgba(11,15,30,.8),rgba(167,139,250,.06))";

  return (
    <div style={{ background:"#04060d",minHeight:"100vh" }}>
      <style>{`
        @keyframes pu { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.06)} }
        @keyframes tin { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .ptb { font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:8px 22px;border-radius:8px 8px 0 0;cursor:pointer;transition:all .2s;background:transparent;border:none; }
        .ptb.on { color:#f5e03a;border-bottom:2px solid #f5e03a; }
        .ptb:not(.on) { color:rgba(237,233,224,.4);border-bottom:2px solid transparent; }
        .ptb:not(.on):hover { color:rgba(237,233,224,.7); }
        .pfb { font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:5px 12px;border-radius:100px;cursor:pointer;transition:all .2s; }
        .pfb.on { background:rgba(245,224,58,.1);border:1px solid rgba(245,224,58,.28);color:#f5e03a; }
        .pfb:not(.on) { background:rgba(237,233,224,.03);border:1px solid rgba(237,233,224,.07);color:rgba(237,233,224,.35); }
        .ic { transition:transform .2s; }
        .ic:hover { transform:translateY(-3px); }
      `}</style>

      {toast && (
        <div style={{ position:"fixed",bottom:28,left:"50%",zIndex:9999,background:"#111627",border:"1px solid rgba(245,224,58,.2)",borderRadius:12,padding:"12px 24px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:800,letterSpacing:"1px",color:toast.color,boxShadow:"0 8px 32px rgba(0,0,0,.5)",animation:"tin .3s ease",whiteSpace:"nowrap",transform:"translateX(-50%)" }}>
          {toast.text}
        </div>
      )}

      <Topbar />
      <div style={{ maxWidth:1280,margin:"0 auto",padding:"24px 20px" }}>

        {/* HERO */}
        <div style={{ borderRadius:20,overflow:"hidden",marginBottom:20,border:"1px solid rgba(237,233,224,.08)" }}>
          <div style={{ height:160,background:bannerGrad,position:"relative" }}>
            <div style={{ position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(237,233,224,.01) 1px,transparent 1px),linear-gradient(90deg,rgba(237,233,224,.01) 1px,transparent 1px)",backgroundSize:"48px 48px" }} />
            <div style={{ position:"absolute",right:32,bottom:-20,fontFamily:"'Bebas Neue',sans-serif",fontSize:120,lineHeight:1,color:lc.color,opacity:.06,letterSpacing:4,userSelect:"none" }}>
              {lc.label.toUpperCase()}
            </div>
          </div>
          <div style={{ background:"#0b0f1e",padding:"0 32px 28px" }}>
            <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginTop:-44,marginBottom:16 }}>
              <div style={{ position:"relative" }}>
                <AvatarDisplay avatarKey={equip.avatar_key || "avatar_lemon"} frameKey={equip.frame_key} items={allItems} size={88} />
                <div style={{ position:"absolute",bottom:-4,right:-4,width:24,height:24,borderRadius:"50%",background:lc.bg,border:"1px solid "+lc.color+"50",display:"grid",placeItems:"center",fontSize:12 }}>
                  {lc.icon}
                </div>
              </div>
              {isOwn && (
                <div style={{ display:"flex",gap:8,paddingBottom:4 }}>
                  <button onClick={() => setEditBio(b => !b)} style={{ height:34,padding:"0 16px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",background:"rgba(237,233,224,.06)",border:"1px solid rgba(237,233,224,.12)",color:"rgba(237,233,224,.7)",borderRadius:8,cursor:"pointer" }}>
                    ✏️ {editBio ? "Cancelar" : "Editar bio"}
                  </button>
                  <button onClick={handleSave} disabled={saving} style={{ height:34,padding:"0 20px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",background:"#f5e03a",border:"none",color:"#04060d",borderRadius:8,cursor:"pointer",opacity:saving?0.7:1 }}>
                    {saving ? "..." : "💾 Guardar"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:3,lineHeight:1,marginBottom:4 }}>
              {profile && profile.user && profile.user.name}
            </div>
            {equip.title_key && titleItem && (
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"2.5px",textTransform:"uppercase",color:titleData.color||"#f5e03a",marginBottom:10 }}>
                — {titleItem.name} —
              </div>
            )}

            <div style={{ display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"2px",textTransform:"uppercase",padding:"3px 10px",borderRadius:100,background:lc.bg,border:"1px solid "+lc.color+"40",color:lc.color }}>
                {lc.icon} {lc.label}
              </span>
              <span style={{ fontSize:12,color:"rgba(237,233,224,.35)" }}>#{profile && profile.user && profile.user.client_number}</span>
              {isOwn && <span style={{ fontSize:12,color:"rgba(237,233,224,.35)" }}>{profile && profile.user && profile.user.email}</span>}
              <span style={{ fontSize:12,color:"rgba(237,233,224,.35)" }}>🍋 {profile && profile.coins && profile.coins.balance && profile.coins.balance.toLocaleString()} coins</span>
            </div>

            {editBio ? (
              <textarea value={bioText} onChange={e => setBioText(e.target.value)} placeholder="Contá algo sobre vos..." maxLength={160} rows={2}
                style={{ width:"100%",maxWidth:480,background:"rgba(255,255,255,.04)",border:"1px solid rgba(245,224,58,.3)",borderRadius:10,color:"#ede9e0",fontFamily:"'Barlow',sans-serif",fontSize:14,padding:"10px 14px",outline:"none",resize:"none",marginBottom:12 }}
              />
            ) : bioText ? (
              <div style={{ fontSize:14,color:"rgba(237,233,224,.6)",lineHeight:1.65,maxWidth:480,marginBottom:12,fontStyle:"italic" }}>"{bioText}"</div>
            ) : isOwn ? (
              <div style={{ fontSize:12,color:"rgba(237,233,224,.2)",marginBottom:12 }}>Sin bio todavía. ¡Agregá una!</div>
            ) : null}

            {equip.badges && equip.badges.length > 0 && (
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {equip.badges.map(bk => {
                  const b = allItems.find(i => i.key === bk);
                  if (!b) return null;
                  const bd = b.data || {};
                  return (
                    <div key={bk} style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",padding:"4px 12px",borderRadius:100,background:(bd.color||"#f5e03a")+"15",border:"1px solid "+(bd.color||"#f5e03a")+"30",color:bd.color||"#f5e03a",display:"flex",alignItems:"center",gap:5 }}>
                      {b.emoji} {b.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2,marginBottom:20 }}>
          {[
            { k:"Envíos totales", v:stats.total_shipments||0,   icon:"📦" },
            { k:"Entregados",     v:stats.delivered||0,         icon:"✅" },
            { k:"USD importados", v:"$"+(stats.total_usd||0).toFixed(0), icon:"💰" },
            { k:"Coins ganados",  v:coinsTotal.toLocaleString(), icon:"🍋" },
          ].map((s,i) => (
            <div key={i} style={{ background:"#0b0f1e",border:"1px solid rgba(237,233,224,.07)",borderRadius:i===0?"14px 0 0 14px":i===3?"0 14px 14px 0":"0",padding:"20px 20px" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"2.5px",textTransform:"uppercase",color:"rgba(237,233,224,.35)",marginBottom:10 }}>{s.icon} {s.k}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:40,lineHeight:1,color:"#f5e03a",marginBottom:4 }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display:"flex",gap:4,marginBottom:24,borderBottom:"1px solid rgba(237,233,224,.07)" }}>
          {[
            ["perfil","👤 Perfil"],
            ["logros","🏆 Logros"],
            ...(isOwn ? [["tienda","🛍️ Tienda"],["coleccion","📦 Colección"]] : []),
          ].map(([t,l]) => (
            <button key={t} className={"ptb " + (tab===t?"on":"")} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>

        {msg && <div style={{ marginBottom:16,padding:"11px 16px",borderRadius:10,background:"rgba(255,98,0,.1)",border:"1px solid rgba(255,98,0,.25)",color:"#ff8c2a",fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:700 }}>{msg}</div>}

        {/* TAB PERFIL */}
        {tab === "perfil" && (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
            <div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"3px",textTransform:"uppercase",color:"#ff6200",marginBottom:14,display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ width:20,height:1,background:"#ff6200",display:"block" }} />Avatar
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                {allItems.filter(i => i.type==="avatar" && owned.includes(i.key)).map(item => (
                  <div key={item.key} className="ic">
                    <ItemCard item={item} owned readOnly={!isOwn} equipped={equip.avatar_key===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
              {["frame","title","badge"].map(type => {
                const its = allItems.filter(i => i.type===type && owned.includes(i.key));
                if (!its.length) return null;
                return (
                  <div key={type}>
                    <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"3px",textTransform:"uppercase",color:"#ff6200",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
                      <span style={{ width:20,height:1,background:"#ff6200",display:"block" }} />
                      {type==="frame"?"Marcos":type==="title"?"Títulos":"Insignias"}
                      {type==="badge" && <span style={{ color:"rgba(237,233,224,.25)",fontSize:8 }}>({equip.badges && equip.badges.length}/4)</span>}
                    </div>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                      {its.map(item => (
                        <div key={item.key} className="ic">
                          <ItemCard item={item} owned readOnly={!isOwn} equipped={type==="badge"?(equip.badges&&equip.badges.includes(item.key)):equip[type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB LOGROS */}
        {tab === "logros" && (
          <div>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(237,233,224,.35)",letterSpacing:"1px" }}>
                {unlockedAchs.length} / {ACHIEVEMENTS.length} desbloqueados
              </div>
              <div style={{ height:4,width:200,borderRadius:100,background:"rgba(237,233,224,.06)",overflow:"hidden" }}>
                <div style={{ height:"100%",width:(unlockedAchs.length/ACHIEVEMENTS.length*100)+"%",background:"linear-gradient(90deg,#f5e03a,#ff6200)",borderRadius:100,transition:"width .5s ease" }} />
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10 }}>
              {ACHIEVEMENTS.map(ach => (
                <div key={ach.key} className="ic">
                  <AchievementCard ach={ach} unlocked={unlockedAchs.some(a => a.key===ach.key)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB TIENDA */}
        {tab === "tienda" && isOwn && (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:20,flexWrap:"wrap" }}>
              {[["all","Todo"],["avatar","Avatares"],["frame","Marcos"],["title","Títulos"],["badge","Insignias"]].map(([v,l]) => (
                <button key={v} className={"pfb " + (typeFilter===v?"on":"")} onClick={() => setTypeFilter(v)}>{l}</button>
              ))}
              <span style={{ marginLeft:"auto",fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(237,233,224,.35)" }}>
                🍋 {profile && profile.coins && profile.coins.balance && profile.coins.balance.toLocaleString()} disponibles
              </span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10 }}>
              {filtered.map(item => (
                <div key={item.key} className="ic">
                  <ItemCard item={item} owned={owned.includes(item.key)} equipped={item.type==="badge"?(equip.badges&&equip.badges.includes(item.key)):equip[item.type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB COLECCIÓN */}
        {tab === "coleccion" && isOwn && (
          <div>
            <div style={{ marginBottom:16,fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(237,233,224,.3)",letterSpacing:"1px" }}>
              {owned.length} / {allItems.length} items desbloqueados
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10 }}>
              {allItems.map(item => (
                <div key={item.key} className="ic" style={{ opacity:owned.includes(item.key)?1:0.35 }}>
                  <ItemCard item={item} owned={owned.includes(item.key)} equipped={item.type==="badge"?(equip.badges&&equip.badges.includes(item.key)):equip[item.type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}