// client/src/pages/LemonCoins.jsx
import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const LEVEL_CONFIG = {
  bronze: { label: "Bronce", icon: "🥉", color: "#CD7F32", bg: "rgba(205,127,50,0.12)",  border: "rgba(205,127,50,0.30)", next: 500  },
  silver: { label: "Plata",  icon: "🥈", color: "#C0C0C0", bg: "rgba(192,192,192,0.12)", border: "rgba(192,192,192,0.30)", next: 1500 },
  gold:   { label: "Oro",    icon: "🥇", color: "#FFD700", bg: "rgba(255,215,0,0.12)",   border: "rgba(255,215,0,0.30)",   next: null },
};

const REWARD_CONFIG = {
  free_shipment: { icon: "✈️", label: "Envío Gratis",      desc: "1 envío a elección sin costo", coins: 10000, color: "#f5e642" },
  free_5kg:      { icon: "📦", label: "5kg Gratis",        desc: "5 kilogramos sin cargo",       coins: 5000,  color: "#22c55e" },
  discount_15:   { icon: "💸", label: "USD 15 Descuento",  desc: "Descuento en tu próximo envío", coins: 1000,  color: "#3b82f6" },
  discount_8:    { icon: "💰", label: "USD 8 Descuento",   desc: "Descuento en tu próximo envío", coins: 500,  color: "#a78bfa" },
};

const fmtDate = (v) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(v); }
};

export default function LemonCoins({ userId: propUserId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState("");
  const [redeeming, setRedeeming] = useState(null);
  const [tab, setTab]         = useState("overview");

  // Obtener userId del token si no viene por prop
  function getUserId() {
    if (propUserId) return propUserId;
    try {
      const token = getToken();
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.id || payload.userId || payload.user_id;
    } catch { return null; }
  }

  async function load() {
    const uid = getUserId();
    if (!uid) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/coins/${uid}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }

  async function redeem(rewardKey) {
    const uid = getUserId();
    if (!uid) return;
    const reward = REWARD_CONFIG[rewardKey];
    if (!confirm(`¿Canjear ${reward.coins} Lemon Coins por "${reward.label}"?`)) return;
    setRedeeming(rewardKey);
    setMsg("");
    try {
      const res  = await fetch(`${API}/coins/redeem`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, reward_key: rewardKey }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(json.error || "Error al canjear"); return; }
      setMsg(`✅ ¡Canjeaste "${reward.label}"! El operador lo aplicará pronto.`);
      await load();
    } catch { setMsg("Error de red"); }
    finally { setRedeeming(null); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading) return (
    <div className="screen">
      <Topbar title="Lemon Coins" />
      <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
    </div>
  );

  if (!data) return null;

  const level    = LEVEL_CONFIG[data.level?.key] || LEVEL_CONFIG.bronze;
  const progress = data.next_level
    ? Math.min(100, Math.round(((data.balance - data.level.min) / (data.next_level.min - data.level.min)) * 100))
    : 100;

  return (
    <div className="screen" style={{ maxWidth: 900, margin: "0 auto" }}>
      <Topbar title="Lemon Coins" />

      {/* ── Hero card ── */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${level.bg.replace("0.12","0.25")}, rgba(15,27,45,0.95))`,
        border: `1px solid ${level.border}`,
        borderRadius: 24, padding: "28px 28px 24px", marginTop: 14,
      }}>
        {/* Decoración fondo */}
        <div style={{
          position: "absolute", right: -40, top: -40,
          width: 200, height: 200, borderRadius: "50%",
          background: `${level.color}08`,
          border: `60px solid ${level.color}06`,
        }} />
        <div style={{
          position: "absolute", right: 20, top: 20,
          fontSize: 80, opacity: 0.12, userSelect: "none",
        }}>🍋</div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            {/* Nivel badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: level.bg, border: `1px solid ${level.border}`,
              borderRadius: 20, padding: "4px 14px", marginBottom: 14,
            }}>
              <span style={{ fontSize: 16 }}>{level.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: level.color, letterSpacing: "0.5px" }}>
                NIVEL {level.label.toUpperCase()}
              </span>
            </div>

            {/* Saldo */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 56, fontWeight: 900, color: "#f5e642", letterSpacing: "-2px", lineHeight: 1 }}>
                {data.balance.toLocaleString("es-AR")}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "rgba(245,230,66,0.6)" }}>LC</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
              🍋 Lemon Coins · Total ganado: <b style={{ color: "rgba(255,255,255,0.7)" }}>{data.total_earned.toLocaleString("es-AR")}</b>
            </div>
          </div>

          {/* Progress al siguiente nivel */}
          {data.next_level && (
            <div style={{ minWidth: 180, textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>
                PRÓXIMO NIVEL: {data.next_level.label?.toUpperCase()}
              </div>
              <div style={{
                height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 10, overflow: "hidden", marginBottom: 6,
              }}>
                <div style={{
                  height: "100%", width: `${progress}%`,
                  background: `linear-gradient(90deg, ${level.color}, #ff8a00)`,
                  borderRadius: 10, transition: "width 1s ease",
                }} />
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                Faltan <b style={{ color: level.color }}>{data.coins_to_next?.toLocaleString("es-AR")}</b> coins
              </div>
            </div>
          )}
          {!data.next_level && (
            <div style={{
              background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)",
              borderRadius: 14, padding: "12px 18px", textAlign: "center",
            }}>
              <div style={{ fontSize: 24 }}>🥇</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#FFD700", marginTop: 4 }}>NIVEL MÁXIMO</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Mensaje ── */}
      {msg && (
        <div onClick={() => setMsg("")} style={{
          marginTop: 12, padding: "10px 16px", borderRadius: 12, fontSize: 13,
          fontWeight: 600, cursor: "pointer",
          background: msg.startsWith("✅") ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${msg.startsWith("✅") ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: msg.startsWith("✅") ? "#86efac" : "#fca5a5",
        }}>{msg}</div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4, marginTop: 16 }}>
        {[
          { key: "overview",    label: "🎁 Canjear" },
          { key: "history",     label: "📋 Historial" },
          { key: "redemptions", label: "✅ Mis canjes" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, height: 38, borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 13,
            background: tab === t.key ? "linear-gradient(135deg,#f5e642,#ff8a00)" : "transparent",
            color: tab === t.key ? "#0f1b2d" : "rgba(255,255,255,0.55)",
            transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ TAB: CANJEAR ══ */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginTop: 16 }}>
          {Object.entries(REWARD_CONFIG).map(([key, reward]) => {
            const canRedeem = data.balance >= reward.coins;
            return (
              <div key={key} style={{
                background: canRedeem ? `${reward.color}10` : "rgba(255,255,255,0.03)",
                border: `1px solid ${canRedeem ? `${reward.color}35` : "rgba(255,255,255,0.08)"}`,
                borderRadius: 18, padding: "20px 18px",
                transition: "all 0.2s",
                opacity: canRedeem ? 1 : 0.6,
              }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>{reward.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{reward.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 14 }}>{reward.desc}</div>

                {/* Costo en coins */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "rgba(245,230,66,0.12)", border: "1px solid rgba(245,230,66,0.25)",
                  borderRadius: 20, padding: "3px 10px", marginBottom: 14,
                }}>
                  <span style={{ fontSize: 14 }}>🍋</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#f5e642" }}>
                    {reward.coins.toLocaleString("es-AR")} coins
                  </span>
                </div>

                <button
                  onClick={() => canRedeem && redeem(key)}
                  disabled={!canRedeem || redeeming === key}
                  style={{
                    width: "100%", height: 40, borderRadius: 10, border: "none",
                    cursor: canRedeem ? "pointer" : "not-allowed",
                    fontWeight: 800, fontSize: 13,
                    background: canRedeem
                      ? `linear-gradient(135deg, ${reward.color}, ${reward.color}bb)`
                      : "rgba(255,255,255,0.07)",
                    color: canRedeem ? "#0f1b2d" : "rgba(255,255,255,0.30)",
                    transition: "all 0.15s",
                  }}>
                  {redeeming === key ? "Canjeando…" : canRedeem ? "Canjear" : `Faltan ${(reward.coins - data.balance).toLocaleString("es-AR")} coins`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: HISTORIAL ══ */}
      {tab === "history" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.transactions.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.30)", fontSize: 14 }}>
                Todavía no hay movimientos.
              </div>
            )}
            {data.transactions.map(tx => {
              const isEarn = tx.amount > 0;
              return (
                <div key={tx.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "12px 16px",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: isEarn ? "rgba(34,197,94,0.15)" : "rgba(245,230,66,0.12)",
                    display: "grid", placeItems: "center", fontSize: 18,
                  }}>
                    {isEarn ? "⬆️" : "🎁"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{tx.reason}</div>
                    {tx.shipment_code && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>Envío: {tx.shipment_code}</div>
                    )}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>{fmtDate(tx.created_at)}</div>
                  </div>
                  <div style={{
                    fontSize: 18, fontWeight: 900,
                    color: isEarn ? "#22c55e" : "#f5e642",
                    whiteSpace: "nowrap",
                  }}>
                    {isEarn ? "+" : ""}{tx.amount.toLocaleString("es-AR")} 🍋
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TAB: MIS CANJES ══ */}
      {tab === "redemptions" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.redemptions.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.30)", fontSize: 14 }}>
                Todavía no canjeaste ninguna recompensa.
              </div>
            )}
            {data.redemptions.map(r => {
              const reward = REWARD_CONFIG[r.reward_key];
              const statusColor = r.status === "applied" ? "#22c55e" : r.status === "cancelled" ? "#ef4444" : "#f5e642";
              const statusLabel = r.status === "applied" ? "Aplicado" : r.status === "cancelled" ? "Cancelado" : "Pendiente";
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{reward?.icon || "🎁"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{reward?.label || r.reward_key}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{fmtDate(r.created_at)}</div>
                    {r.shipment_code && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Envío: {r.shipment_code}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
                      background: `${statusColor}18`, border: `1px solid ${statusColor}35`,
                      color: statusColor, marginBottom: 4,
                    }}>{statusLabel}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                      -{r.coins_spent.toLocaleString("es-AR")} 🍋
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}