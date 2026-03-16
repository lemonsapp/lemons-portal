import { useEffect, useState, useCallback } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const RARITY = {
  common:    { label:"Común",      color:"#ede9e0", bg:"rgba(237,233,224,.08)", border:"rgba(237,233,224,.15)" },
  rare:      { label:"Raro",       color:"#60a5fa", bg:"rgba(96,165,250,.08)",  border:"rgba(96,165,250,.25)"  },
  epic:      { label:"Épico",      color:"#a78bfa", bg:"rgba(167,139,250,.08)", border:"rgba(167,139,250,.25)" },
  legendary: { label:"Legendario", color:"#f5e03a", bg:"rgba(245,224,58,.08)",  border:"rgba(245,224,58,.3)"   },
};

const TYPE_LABELS = { avatar:"Avatares", frame:"Marcos", title:"Títulos", badge:"Insignias" };

function AvatarDisplay({ avatarKey, frameKey, items, size=80 }) {
  const av = items?.find(i => i.key === avatarKey);
  const fr = items?.find(i => i.key === frameKey);
  const ad = av?.data || {};
  const fd = fr?.data  || {};
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%",
      display:"grid", placeItems:"center", fontSize:size*.4,
      background:ad.bg||"#111627", position:"relative", flexShrink:0,
      border:fd.border||"none", boxShadow:fd.shadow||"none",
    }}>
      {ad.emoji||"🍋"}
      {fd.pulse && <div style={{ position:"absolute",inset:-3,borderRadius:"50%",border:"2px solid rgba(167,139,250,.5)",animation:"pulse 2s ease-in-out infinite" }} />}
    </div>
  );
}

function ItemCard({ item, owned, equipped, onBuy, onEquip, loading }) {
  const r = RARITY[item.rarity] || RARITY.common;
  const d = item.data || {};
  return (
    <div style={{
      background:owned?r.bg:"rgba(255,255,255,.03)",
      border:"1px solid "+(owned?r.border:"rgba(237,233,224,.08)"),
      borderRadius:14, padding:"18px 16px",
      position:"relative", overflow:"hidden", transition:"all .25s",
      opacity:owned?1:.85,
    }}>
      <div style={{
        position:"absolute", top:10, right:10,
        fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase",
        padding:"2px 8px", borderRadius:100,
        background:r.bg, border:"1px solid "+r.border, color:r.color,
      }}>{r.label}</div>

      <div style={{
        width:56, height:56, borderRadius:"50%",
        background:d.bg||"#111627", display:"grid", placeItems:"center",
        fontSize:26, margin:"0 0 12px",
        border:item.type==="frame"?(d.border||"none"):"none",
        boxShadow:item.type==="frame"?(d.shadow||"none"):"none",
      }}>{item.emoji||"⭐"}</div>

      <div style={{ fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:800,letterSpacing:".5px",textTransform:"uppercase",marginBottom:4 }}>
        {item.name}
      </div>
      <div style={{ fontSize:12,color:"rgba(237,233,224,.5)",lineHeight:1.5,marginBottom:14 }}>
        {item.description}
      </div>

      {item.type==="title" && d.color && (
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:d.color,marginBottom:10 }}>
          — {item.name} —
        </div>
      )}

      {owned ? (
        <button onClick={()=>onEquip(item)} style={{
          width:"100%", height:34,
          fontFamily:"'Barlow Condensed',sans-serif", fontSize:12,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",
          background:equipped?"rgba(245,224,58,.15)":"rgba(237,233,224,.06)",
          border:"1px solid "+(equipped?"rgba(245,224,58,.3)":"rgba(237,233,224,.12)"),
          color:equipped?"#f5e03a":"rgba(237,233,224,.7)",
          borderRadius:8, cursor:"pointer", transition:"all .2s",
        }}>
          {equipped?"✓ Equipado":"Equipar"}
        </button>
      ) : (
        <button onClick={()=>onBuy(item)} disabled={loading===item.key} style={{
          width:"100%", height:34,
          fontFamily:"'Barlow Condensed',sans-serif", fontSize:12,fontWeight:800,letterSpacing:"1px",textTransform:"uppercase",
          background:item.cost_coins===0?"rgba(34,197,94,.1)":"#f5e03a",
          border:"none",
          color:item.cost_coins===0?"#22c55e":"#04060d",
          borderRadius:8, cursor:"pointer", transition:"all .2s",
          opacity:loading===item.key?.6:1,
        }}>
          {loading===item.key?"...":item.cost_coins===0?"🎁 Gratis":"🍋 "+item.cost_coins.toLocaleString()}
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
  const [equip,   setEquip]   = useState({ avatar_key:null, frame_key:null, title_key:null, badges:[] });

  const hdrs = { Authorization:"Bearer "+getToken() };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes,sRes] = await Promise.all([
        fetch(API+"/profile", { headers:hdrs }),
        fetch(API+"/profile/shop", { headers:hdrs }),
      ]);
      const [pData,sData] = await Promise.all([pRes.json(),sRes.json()]);
      setProfile(pData);
      setShop(sData.items||[]);
      setEquip({
        avatar_key: pData.profile?.avatar_key||"avatar_lemon",
        frame_key:  pData.profile?.frame_key||null,
        title_key:  pData.profile?.title_key||null,
        badges:     pData.profile?.badges||[],
      });
    } catch(e) { setMsg("Error cargando perfil: "+e.message); }
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); },[load]);

  async function handleBuy(item) {
    if (item.cost_coins>0 && !confirm("Gastar "+item.cost_coins+" Lemon Coins en "+item.name+"?")) return;
    setBuying(item.key); setMsg("");
    try {
      const res = await fetch(API+"/profile/buy", {
        method:"POST", headers:{...hdrs,"Content-Type":"application/json"},
        body:JSON.stringify({ item_key:item.key }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error||"Error");
      else { setMsg("✅ "+item.name+" desbloqueado!"); await load(); }
    } catch { setMsg("Error de red"); }
    setBuying(null);
  }

  async function handleEquip(item) {
    const e2 = { ...equip };
    if (item.type==="avatar") e2.avatar_key = item.key;
    if (item.type==="frame")  e2.frame_key  = e2.frame_key===item.key?null:item.key;
    if (item.type==="title")  e2.title_key  = e2.title_key===item.key?null:item.key;
    if (item.type==="badge") {
      const idx = e2.badges.indexOf(item.key);
      if (idx>=0) e2.badges = e2.badges.filter(b=>b!==item.key);
      else if (e2.badges.length<4) e2.badges = [...e2.badges,item.key];
      else { setMsg("Máximo 4 insignias activas"); return; }
    }
    setEquip(e2);
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    try {
      const res = await fetch(API+"/profile", {
        method:"PATCH", headers:{...hdrs,"Content-Type":"application/json"},
        body:JSON.stringify(equip),
      });
      const data = await res.json();
      if (res.ok) { setMsg("✅ Perfil guardado"); await load(); }
      else setMsg(data.error||"Error");
    } catch { setMsg("Error de red"); }
    setSaving(false);
  }

  if (loading) return (
    <div style={{ background:"#04060d",minHeight:"100vh" }}>
      <Topbar />
      <div style={{ display:"grid",placeItems:"center",height:"60vh",color:"rgba(237,233,224,.4)",fontFamily:"'DM Mono',monospace",fontSize:12,letterSpacing:"2px" }}>
        CARGANDO...
      </div>
    </div>
  );

  const allItems  = shop||[];
  const owned     = profile?.profile?.owned_items||[];
  const level     = profile?.user?.level||"bronze";
  const lc        = { bronze:{label:"Bronce",color:"#CD7F32"}, silver:{label:"Plata",color:"#C0C0C0"}, gold:{label:"Oro",color:"#f5e03a"} }[level];
  const titleItem = allItems.find(i=>i.key===equip.title_key);
  const titleData = titleItem?.data||{};
  const filtered  = typeFilter==="all"?allItems:allItems.filter(i=>i.type===typeFilter);

  return (
    <div style={{ background:"#04060d",minHeight:"100vh" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.05)} }
        .tb { font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:8px 20px;border-radius:8px;cursor:pointer;transition:all .2s;border:1px solid transparent; }
        .tb.on { background:rgba(245,224,58,.1);border-color:rgba(245,224,58,.25);color:#f5e03a; }
        .tb:not(.on) { background:transparent;color:rgba(237,233,224,.45); }
        .tb:not(.on):hover { background:rgba(237,233,224,.05);color:rgba(237,233,224,.75); }
        .fb { font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:6px 14px;border-radius:100px;cursor:pointer;transition:all .2s; }
        .fb.on { background:rgba(245,224,58,.1);border:1px solid rgba(245,224,58,.25);color:#f5e03a; }
        .fb:not(.on) { background:rgba(237,233,224,.04);border:1px solid rgba(237,233,224,.08);color:rgba(237,233,224,.4); }
        .ic:hover { transform:translateY(-2px); }
      `}</style>

      <Topbar />
      <div style={{ maxWidth:1200,margin:"0 auto",padding:"24px 20px" }}>

        {/* Header */}
        <div style={{ background:"#111627",border:"1px solid rgba(237,233,224,.08)",borderRadius:20,overflow:"hidden",marginBottom:24 }}>
          <div style={{ height:120,background:"linear-gradient(135deg,rgba(245,224,58,.12),rgba(255,98,0,.08),rgba(167,139,250,.06))",position:"relative" }}>
            <div style={{ position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(237,233,224,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(237,233,224,.012) 1px,transparent 1px)",backgroundSize:"40px 40px" }} />
          </div>
          <div style={{ padding:"0 28px 24px",position:"relative" }}>
            <div style={{ marginTop:-40,marginBottom:12,display:"flex",alignItems:"flex-end",justifyContent:"space-between" }}>
              <AvatarDisplay avatarKey={equip.avatar_key||"avatar_lemon"} frameKey={equip.frame_key} items={allItems} size={80} />
              <button onClick={handleSave} disabled={saving} className="btn btnPrimary" style={{ height:36,padding:"0 20px",fontSize:12 }}>
                {saving?"Guardando...":"💾 Guardar perfil"}
              </button>
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:2,lineHeight:1,marginBottom:4 }}>{profile?.user?.name}</div>
            {equip.title_key && titleItem && (
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:"2px",textTransform:"uppercase",color:titleData.color||"#f5e03a",marginBottom:8 }}>
                — {titleItem.name} —
              </div>
            )}
            <div style={{ display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginBottom:14 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"2px",textTransform:"uppercase",padding:"3px 10px",borderRadius:100,background:"rgba(245,224,58,.1)",border:"1px solid "+lc.color+"40",color:lc.color }}>
                {level==="gold"?"🥇":level==="silver"?"🥈":"🥉"} {lc.label}
              </span>
              <span style={{ fontSize:12,color:"rgba(237,233,224,.4)" }}>#{profile?.user?.client_number} · {profile?.user?.email}</span>
              <span style={{ fontSize:12,color:"rgba(237,233,224,.4)" }}>🍋 {profile?.coins?.balance?.toLocaleString()} coins</span>
            </div>
            {equip.badges?.length>0 && (
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {equip.badges.map(bk => {
                  const b = allItems.find(i=>i.key===bk);
                  if (!b) return null;
                  const bd = b.data||{};
                  return (
                    <div key={bk} style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"1.5px",textTransform:"uppercase",padding:"4px 12px",borderRadius:100,background:(bd.color||"#f5e03a")+"15",border:"1px solid "+(bd.color||"#f5e03a")+"30",color:bd.color||"#f5e03a",display:"flex",alignItems:"center",gap:6 }}>
                      {b.emoji} {b.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2,marginBottom:24 }}>
          {[
            { k:"Envíos totales", v:profile?.stats?.total_shipments||0,       icon:"📦" },
            { k:"Entregados",     v:profile?.stats?.delivered||0,              icon:"✅" },
            { k:"USD Importados", v:"$"+(profile?.stats?.total_usd||0).toFixed(0), icon:"💰" },
            { k:"Coins ganados",  v:(profile?.coins?.total_earned||0).toLocaleString(), icon:"🍋" },
          ].map((s,i)=>(
            <div key={i} style={{ background:"#111627",border:"1px solid rgba(237,233,224,.08)",borderRadius:i===0?"14px 0 0 14px":i===3?"0 14px 14px 0":"0",padding:"20px 18px" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:"rgba(237,233,224,.4)",marginBottom:8 }}>{s.icon} {s.k}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:36,lineHeight:1,color:"#f5e03a" }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex",gap:8,marginBottom:24 }}>
          {[["perfil","👤 Mi Perfil"],["tienda","🛍️ Tienda"],["coleccion","📦 Colección"]].map(([t,l])=>(
            <button key={t} className={"tb "+(tab===t?"on":"")} onClick={()=>setTab(t)}>{l}</button>
          ))}
        </div>

        {msg && (
          <div style={{ marginBottom:16,padding:"12px 16px",borderRadius:10,background:msg.startsWith("✅")?"rgba(34,197,94,.1)":"rgba(255,98,0,.1)",border:"1px solid "+(msg.startsWith("✅")?"rgba(34,197,94,.25)":"rgba(255,98,0,.25)"),color:msg.startsWith("✅")?"#22c55e":"#ff8c2a",fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:700 }}>
            {msg}
          </div>
        )}

        {/* Tab Perfil */}
        {tab==="perfil" && (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
            <div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:"#ff6200",marginBottom:16,display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ display:"block",width:24,height:1,background:"#ff6200" }} />Avatar
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                {allItems.filter(i=>i.type==="avatar"&&owned.includes(i.key)).map(item=>(
                  <div key={item.key} className="ic" style={{ transition:"transform .2s" }}>
                    <ItemCard item={item} owned={true} equipped={equip.avatar_key===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
              {["frame","title","badge"].map(type=>{
                const items2 = allItems.filter(i=>i.type===type&&owned.includes(i.key));
                if (!items2.length) return null;
                return (
                  <div key={type}>
                    <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"3px",textTransform:"uppercase",color:"#ff6200",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
                      <span style={{ display:"block",width:24,height:1,background:"#ff6200" }} />
                      {TYPE_LABELS[type]}
                      {type==="badge"&&<span style={{ color:"rgba(237,233,224,.3)",fontSize:9 }}>({equip.badges?.length}/4)</span>}
                    </div>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                      {items2.map(item=>(
                        <div key={item.key} className="ic" style={{ transition:"transform .2s" }}>
                          <ItemCard item={item} owned={true} equipped={type==="badge"?equip.badges?.includes(item.key):equip[type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab Tienda */}
        {tab==="tienda" && (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:24,flexWrap:"wrap" }}>
              {[["all","Todo"],["avatar","Avatares"],["frame","Marcos"],["title","Títulos"],["badge","Insignias"]].map(([v,l])=>(
                <button key={v} className={"fb "+(typeFilter===v?"on":"")} onClick={()=>setTypeFilter(v)}>{l}</button>
              ))}
              <span style={{ marginLeft:"auto",fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(237,233,224,.4)" }}>
                🍋 {profile?.coins?.balance?.toLocaleString()} disponibles
              </span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12 }}>
              {filtered.map(item=>(
                <div key={item.key} className="ic" style={{ transition:"transform .2s" }}>
                  <ItemCard item={item} owned={owned.includes(item.key)} equipped={item.type==="badge"?equip.badges?.includes(item.key):equip[item.type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Colección */}
        {tab==="coleccion" && (
          <div>
            <div style={{ marginBottom:20,fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(237,233,224,.4)",letterSpacing:"1px" }}>
              {owned.length} / {allItems.length} items desbloqueados
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12 }}>
              {allItems.map(item=>(
                <div key={item.key} className="ic" style={{ transition:"transform .2s",opacity:owned.includes(item.key)?1:.4 }}>
                  <ItemCard item={item} owned={owned.includes(item.key)} equipped={item.type==="badge"?equip.badges?.includes(item.key):equip[item.type+"_key"]===item.key} onBuy={handleBuy} onEquip={handleEquip} loading={buying} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}