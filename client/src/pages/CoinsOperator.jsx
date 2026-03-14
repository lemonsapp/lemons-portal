// client/src/pages/CoinsOperator.jsx
// Panel del operador para gestionar Lemon Coins
import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const LEVEL_CONFIG = {
  bronze: { label: "Bronce", icon: "🥉", color: "#CD7F32" },
  silver: { label: "Plata",  icon: "🥈", color: "#C0C0C0" },
  gold:   { label: "Oro",    icon: "🥇", color: "#FFD700" },
};
const REWARD_CONFIG = {
  free_shipment: { icon: "✈️", label: "Envío Gratis",     coins: 9500 },
  free_5kg:      { icon: "📦", label: "5kg Gratis",       coins: 4500 },
  discount_15:   { icon: "💸", label: "USD 15 Descuento", coins: 500  },
  discount_8:    { icon: "💰", label: "USD 8 Descuento",  coins: 100  },
};
const fmtDate = (v) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(v); }
};

export default function CoinsOperator() {
  const [tab, setTab]         = useState("ranking");
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState("");

  // Gestión de canjes pendientes
  const [pendingRedemptions, setPendingRedemptions] = useState([]);

  // Ajuste manual
  const [adjForm, setAdjForm] = useState({ client_number: "", amount: "", reason: "" });
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjClientData, setAdjClientData] = useState(null);

  // Otorgar coins a un envío manualmente
  const [earnForm, setEarnForm]         = useState({ shipment_id: "", client_number: "" });
  const [earnClientData, setEarnClientData] = useState(null);

  // Notificaciones LIMÓN
  const [notifs, setNotifs]             = useState([]);
  const [notifForm, setNotifForm]       = useState({ message:"", emoji:"🍋", type:"info", target_role:"all" });
  const [savingNotif, setSavingNotif]   = useState(false);

  async function loadRanking() {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/coins`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (res.ok) setRanking(data.rows || []);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }

  async function loadPendingRedemptions() {
    try {
      // Obtener todos los canjes pendientes a través del ranking
      const res  = await fetch(`${API}/coins`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (res.ok) {
        // Buscar canjes pendientes por usuario
        const pending = [];
        for (const user of (data.rows || [])) {
          const rRes = await fetch(`${API}/coins/${user.user_id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
          const rData = await rRes.json();
          if (rRes.ok) {
            (rData.redemptions || []).filter(r => r.status === "pending").forEach(r => {
              pending.push({ ...r, client_name: user.name, client_number: user.client_number });
            });
          }
        }
        setPendingRedemptions(pending.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    } catch { /* no-op */ }
  }

  async function loadNotifs() {
    try {
      const r = await fetch(`${API}/notifications`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const d = await r.json();
      setNotifs(d.notifications || []);
    } catch { /* no-op */ }
  }

  async function saveNotif() {
    if (!notifForm.message.trim()) return setMsg("Escribí un mensaje");
    setSavingNotif(true);
    try {
      const r = await fetch(`${API}/notifications`, {
        method:"POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type":"application/json" },
        body: JSON.stringify(notifForm),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || "Error");
      setMsg("✅ Notificación publicada — ya aparece en todos los portales");
      setNotifForm({ message:"", emoji:"🍋", type:"info", target_role:"all" });
      await loadNotifs();
    } catch { setMsg("Error de red"); }
    finally { setSavingNotif(false); }
  }

  async function deactivateNotif(id) {
    await fetch(`${API}/notifications/${id}`, {
      method:"PATCH",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type":"application/json" },
      body: JSON.stringify({ active: false }),
    });
    await loadNotifs();
  }

  async function deleteNotif(id) {
    await fetch(`${API}/notifications/${id}`, {
      method:"DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await loadNotifs();
  }

  async function findClientForAdj() {
    if (!adjForm.client_number.trim()) return;
    try {
      const res  = await fetch(`${API}/users?client_number=${adjForm.client_number.trim()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.users?.length > 0) {
        const user = data.users[0];
        // Obtener coins del cliente
        const cRes  = await fetch(`${API}/coins/${user.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const cData = await cRes.json();
        setAdjClientData({ ...user, coins: cData });
      } else {
        setMsg("Cliente no encontrado");
      }
    } catch { setMsg("Error de red"); }
  }

  async function applyAdjustment() {
    if (!adjClientData) return setMsg("Buscá un cliente primero");
    const amount = parseInt(adjForm.amount);
    if (!amount || !adjForm.reason.trim()) return setMsg("Completá todos los campos");
    setAdjLoading(true); setMsg("");
    try {
      const res  = await fetch(`${API}/coins/adjust`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: adjClientData.id, amount, reason: adjForm.reason }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Error"); return; }
      setMsg(`✅ Ajuste aplicado — nuevo saldo: ${data.balance} coins`);
      setAdjClientData(null);
      setAdjForm({ client_number: "", amount: "", reason: "" });
      await loadRanking();
    } catch { setMsg("Error de red"); }
    finally { setAdjLoading(false); }
  }

  async function updateRedemption(id, status) {
    try {
      const res = await fetch(`${API}/coins/redemptions/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setMsg(`✅ Canje ${status === "applied" ? "aplicado" : "cancelado"}`);
        await loadPendingRedemptions();
      }
    } catch { setMsg("Error de red"); }
  }

  async function findClientForEarn() {
    if (!earnForm.client_number.trim()) return;
    setEarnClientData(null);
    try {
      const res  = await fetch(`${API}/users?client_number=${earnForm.client_number.trim()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.users?.length > 0) {
        setEarnClientData(data.users[0]);
        setMsg("");
      } else {
        setMsg("Cliente no encontrado");
      }
    } catch { setMsg("Error de red"); }
  }

  async function earnManual() {
    if (!earnForm.shipment_id) return setMsg("Ingresá el ID del envío");
    if (!earnClientData) return setMsg("Buscá el cliente primero");
    try {
      const res  = await fetch(`${API}/coins/earn`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: earnClientData.id, shipment_code: earnForm.shipment_id.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Error"); return; }
      if (data.already_awarded) { setMsg("ℹ️ Ya se otorgaron coins para este envío"); return; }
      setMsg(`✅ Otorgados ${data.earned} coins — saldo: ${data.balance}`);
      setEarnForm({ shipment_id: "", client_number: "" });
      setEarnClientData(null);
      await loadRanking();
    } catch { setMsg("Error de red"); }
  }

  useEffect(() => {
    loadRanking();
    loadPendingRedemptions();
    loadNotifs();
  }, []); // eslint-disable-line

  const totalCoinsCirculating = ranking.reduce((a, r) => a + (r.balance || 0), 0);
  const goldUsers   = ranking.filter(r => r.level?.key === "gold").length;
  const silverUsers = ranking.filter(r => r.level?.key === "silver").length;

  return (
    <div className="screen" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Topbar title="Lemon Coins — Operador" />

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, margin: "14px 0 0",
        padding: "14px 18px",
        background: "rgba(245,230,66,0.05)", border: "1px solid rgba(245,230,66,0.15)",
        borderRadius: 18,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>🍋 Lemon Coins</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>
            Gestión de coins, canjes y niveles
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "En circulación", value: totalCoinsCirculating.toLocaleString("es-AR"), icon: "🍋" },
            { label: "Clientes Oro",   value: goldUsers,   icon: "🥇" },
            { label: "Clientes Plata", value: silverUsers, icon: "🥈" },
            { label: "Canjes pendientes", value: pendingRedemptions.length, icon: "⏳" },
          ].map(k => (
            <div key={k.label} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, padding: "8px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: 18 }}>{k.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#f5e642" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", fontWeight: 700 }}>{k.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div onClick={() => setMsg("")} style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 12, fontSize: 13,
          fontWeight: 600, cursor: "pointer",
          background: msg.startsWith("✅") ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${msg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.startsWith("✅") ? "#86efac" : "#fca5a5",
        }}>{msg}</div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4, marginTop: 16 }}>
        {[
          { key: "ranking",     label: "🏆 Ranking" },
          { key: "redemptions", label: `⏳ Canjes pendientes ${pendingRedemptions.length > 0 ? `(${pendingRedemptions.length})` : ""}` },
          { key: "adjust",      label: "✏️ Ajuste manual" },
          { key: "earn",        label: "⚡ Otorgar coins" },
          { key: "notifs",      label: "🍋 Notificaciones" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, height: 38, borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 12,
            background: tab === t.key ? "linear-gradient(135deg,#f5e642,#ff8a00)" : "transparent",
            color: tab === t.key ? "#0f1b2d" : "rgba(255,255,255,0.55)",
            transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ RANKING ══ */}
      {tab === "ranking" && (
        <div style={{ marginTop: 16 }}>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>CLIENTE</th><th>NIVEL</th>
                  <th>SALDO COINS</th><th>TOTAL GANADO</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)" }}>Cargando…</td></tr>
                )}
                {ranking.map((r, i) => {
                  const lvl = LEVEL_CONFIG[r.level?.key] || LEVEL_CONFIG.bronze;
                  return (
                    <tr key={r.user_id}>
                      <td style={{ fontSize: 13, fontWeight: 800, color: i < 3 ? "#f5e642" : "rgba(255,255,255,0.4)" }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>#{r.client_number} — {r.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{r.email}</div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                          background: `${lvl.color}18`, border: `1px solid ${lvl.color}35`,
                          color: lvl.color,
                        }}>{lvl.icon} {lvl.label}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#f5e642" }}>
                          {(r.balance || 0).toLocaleString("es-AR")}
                        </span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>🍋</span>
                      </td>
                      <td style={{ fontSize: 13, color: "rgba(255,255,255,0.50)" }}>
                        {(r.total_earned || 0).toLocaleString("es-AR")} 🍋
                      </td>
                    </tr>
                  );
                })}
                {!loading && !ranking.length && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)" }}>Sin clientes con coins aún.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ CANJES PENDIENTES ══ */}
      {tab === "redemptions" && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {pendingRedemptions.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.30)", fontSize: 14 }}>
              No hay canjes pendientes 🎉
            </div>
          )}
          {pendingRedemptions.map(r => {
            const reward = REWARD_CONFIG[r.reward_key];
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                background: "rgba(245,230,66,0.05)", border: "1px solid rgba(245,230,66,0.15)",
                borderRadius: 16, padding: "14px 18px",
              }}>
                <div style={{ fontSize: 28 }}>{reward?.icon || "🎁"}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{reward?.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginTop: 2 }}>
                    Cliente #{r.client_number} — {r.client_name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    Solicitado: {fmtDate(r.created_at)} · {r.coins_spent} coins
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => updateRedemption(r.id, "applied")} style={{
                    background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)",
                    color: "#86efac", borderRadius: 8, padding: "6px 14px",
                    cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>✓ Aplicar</button>
                  <button onClick={() => updateRedemption(r.id, "cancelled")} style={{
                    background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
                    color: "#fca5a5", borderRadius: 8, padding: "6px 14px",
                    cursor: "pointer", fontSize: 12, fontWeight: 700,
                  }}>✕ Cancelar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ AJUSTE MANUAL ══ */}
      {tab === "adjust" && (
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "20px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", marginBottom: 16 }}>AJUSTE MANUAL DE COINS</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="Nº de cliente" value={adjForm.client_number}
              onChange={e => setAdjForm(f => ({ ...f, client_number: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && findClientForAdj()}
              style={{ maxWidth: 200 }} />
            <button className="btn" onClick={findClientForAdj} style={{ height: 42, padding: "0 16px" }}>
              Buscar
            </button>
          </div>

          {adjClientData && (
            <div style={{
              background: "rgba(245,230,66,0.06)", border: "1px solid rgba(245,230,66,0.20)",
              borderRadius: 14, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                #{adjClientData.client_number} — {adjClientData.name}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)" }}>
                Saldo actual: <b style={{ color: "#f5e642", fontSize: 16 }}>{adjClientData.coins?.balance?.toLocaleString("es-AR")} 🍋</b>
                {" · "}Nivel: <b style={{ color: LEVEL_CONFIG[adjClientData.coins?.level?.key]?.color || "#fff" }}>
                  {LEVEL_CONFIG[adjClientData.coins?.level?.key]?.icon} {adjClientData.coins?.level?.label}
                </b>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>
                CANTIDAD (positivo = agregar, negativo = quitar)
              </div>
              <input className="input" placeholder="Ej: 50 o -20" value={adjForm.amount}
                onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                inputMode="numeric" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>MOTIVO</div>
              <input className="input" placeholder="Ej: Bonus especial, corrección..."
                value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>

          <button className="btn btnPrimary" onClick={applyAdjustment} disabled={adjLoading || !adjClientData}
            style={{ height: 44, padding: "0 28px", fontWeight: 800 }}>
            {adjLoading ? "Aplicando…" : "Aplicar ajuste"}
          </button>
        </div>
      )}

      {/* ══ OTORGAR COINS MANUAL ══ */}
      {tab === "earn" && (
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "20px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>OTORGAR COINS POR ENVÍO</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
            Esto calcula y otorga automáticamente los coins correspondientes al envío según la fórmula del sistema.
            Se ignora si ya fue procesado.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="Nº de cliente" value={earnForm.client_number}
              onChange={e => { setEarnForm(f => ({ ...f, client_number: e.target.value })); setEarnClientData(null); }}
              onKeyDown={e => e.key === "Enter" && findClientForEarn()}
              style={{ maxWidth: 200 }} />
            <button className="btn" onClick={findClientForEarn} style={{ height: 42, padding: "0 16px" }}>
              Buscar
            </button>
          </div>

          {earnClientData && (
            <div style={{
              background: "rgba(245,230,66,0.06)", border: "1px solid rgba(245,230,66,0.20)",
              borderRadius: 14, padding: "12px 16px", marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700 }}>
                #{earnClientData.client_number} — {earnClientData.name}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                {earnClientData.email}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>ID DEL ENVÍO</div>
              <input className="input" placeholder="Código (ej: TP0002)" value={earnForm.shipment_id}
                onChange={e => setEarnForm(f => ({ ...f, shipment_id: e.target.value }))}
                style={{ width: 200 }} inputMode="numeric" />
            </div>
            <button className="btn btnPrimary" onClick={earnManual}
              disabled={!earnClientData || !earnForm.shipment_id}
              style={{ height: 42, padding: "0 20px", fontWeight: 800 }}>
              ⚡ Otorgar coins
            </button>
          </div>

          <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(245,230,66,0.06)", border: "1px solid rgba(245,230,66,0.15)", borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f5e642", marginBottom: 8 }}>📐 Fórmula activa</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.8 }}>
              • <b>3 coins</b> por kg de peso<br />
              • <b>+10 coins</b> si el envío supera USD 500<br />
              • <b>+15 coins</b> bonus por primer envío (el cliente lo reclama manualmente)<br />
              <br />
              <b>Canjes:</b> 9.500 → envío gratis · 4.500 → 5kg gratis · 500 → USD 15 desc · 100 → USD 8 desc<br />
              <b>Niveles:</b> 🥉 Bronce 0-499 · 🥈 Plata 500-1499 · 🥇 Oro 1500+
            </div>
          </div>
        </div>
      )}
      {/* ══ NOTIFICACIONES ══ */}
      {tab === "notifs" && (
        <div style={{ marginTop: 16, display:"flex", flexDirection:"column", gap:16 }}>

          {/* Form nueva notificación */}
          <div style={{ background:"rgba(245,230,66,0.05)", border:"1px solid rgba(245,230,66,0.15)", borderRadius:18, padding:"20px" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#f5e642", marginBottom:14 }}>🍋 Nueva notificación LIMÓN</div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:700, marginBottom:6 }}>MENSAJE</div>
              <textarea
                value={notifForm.message}
                onChange={e => setNotifForm(f=>({...f,message:e.target.value}))}
                placeholder="Ej: ¡Hay nuevas tarifas disponibles! Chequeá tu cotizador 🚀"
                rows={3}
                style={{
                  width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
                  borderRadius:10, color:"#fff", fontSize:14, padding:"10px 14px",
                  outline:"none", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit",
                }}
              />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:700, marginBottom:6 }}>EMOJI</div>
                <input value={notifForm.emoji} onChange={e => setNotifForm(f=>({...f,emoji:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
                    borderRadius:10, color:"#fff", fontSize:20, padding:"8px 10px", outline:"none", textAlign:"center" }} />
              </div>
              <div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:700, marginBottom:6 }}>TIPO</div>
                <select value={notifForm.type} onChange={e => setNotifForm(f=>({...f,type:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
                    borderRadius:10, color:"#fff", fontSize:13, padding:"10px 12px", outline:"none" }}>
                  <option value="info">ℹ️ Info</option>
                  <option value="promo">🎉 Promo</option>
                  <option value="warning">⚠️ Aviso</option>
                  <option value="update">🆕 Update</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:700, marginBottom:6 }}>PARA QUIÉN</div>
                <select value={notifForm.target_role} onChange={e => setNotifForm(f=>({...f,target_role:e.target.value}))}
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
                    borderRadius:10, color:"#fff", fontSize:13, padding:"10px 12px", outline:"none" }}>
                  <option value="all">👥 Todos</option>
                  <option value="client">👤 Solo clientes</option>
                  <option value="operator">🗂 Solo operadores</option>
                </select>
              </div>
            </div>

            <button onClick={saveNotif} disabled={savingNotif} style={{
              height:44, padding:"0 28px", borderRadius:10, border:"none", cursor:"pointer",
              fontWeight:800, fontSize:14, background:"linear-gradient(135deg,#f5e642,#ff8a00)", color:"#0b1020",
            }}>
              {savingNotif ? "Publicando…" : "📢 Publicar notificación"}
            </button>
          </div>

          {/* Lista de notificaciones existentes */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:10 }}>HISTORIAL</div>
            {notifs.length === 0 ? (
              <div style={{ textAlign:"center", padding:30, color:"rgba(255,255,255,0.3)", fontSize:13 }}>
                No hay notificaciones todavía.
              </div>
            ) : notifs.map(n => (
              <div key={n.id} style={{
                display:"flex", justifyContent:"space-between", alignItems:"center", gap:12,
                background: n.active ? "rgba(245,230,66,0.06)" : "rgba(255,255,255,0.03)",
                border:`1px solid ${n.active ? "rgba(245,230,66,0.2)" : "rgba(255,255,255,0.07)"}`,
                borderRadius:12, padding:"12px 16px", marginBottom:8, opacity: n.active ? 1 : 0.5,
              }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:18 }}>{n.emoji}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
                      background: n.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                      color: n.active ? "#4ade80" : "rgba(255,255,255,0.4)",
                    }}>{n.active ? "ACTIVA" : "INACTIVA"}</span>
                    <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>
                      {n.target_role === "all" ? "👥 Todos" : n.target_role === "client" ? "👤 Clientes" : "🗂 Operadores"}
                      {" · "}{n.type}
                    </span>
                  </div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.75)", lineHeight:1.4 }}>{n.message}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:4 }}>
                    {new Date(n.created_at).toLocaleString("es-AR")}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  {n.active && (
                    <button onClick={() => deactivateNotif(n.id)} style={{
                      height:32, padding:"0 12px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700,
                      border:"1px solid rgba(255,150,0,0.3)", background:"rgba(255,150,0,0.08)", color:"#fb923c",
                    }}>Desactivar</button>
                  )}
                  <button onClick={() => deleteNotif(n.id)} style={{
                    height:32, padding:"0 10px", borderRadius:8, cursor:"pointer", fontSize:13,
                    border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)", color:"#f87171",
                  }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}