import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtUsd  = (v) => `$${Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum  = (v) => Number(v || 0).toLocaleString("es-AR");
const fmtDate = (v) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(v); }
};
const fmtMonth = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};
const num = (v) => Number(v || 0);

// ── Paletas ───────────────────────────────────────────────────────────────────
const ORIGIN_COLOR  = { USA: "#ffd200", CHINA: "#ff8a00", EUROPA: "#60a5fa", "Sin origen": "#6b7280" };
const SERVICE_COLOR = { NORMAL: "#a78bfa", EXPRESS: "#ffd200" };
const STATUS_COLOR  = {
  "Recibido en depósito": "#ffd200",
  "En preparación":       "#ff8a00",
  "Despachado":           "#3b82f6",
  "En tránsito":          "#a78bfa",
  "Listo para entrega":   "#22c55e",
  "Entregado":            "#86efac",
};
const LANE_LABELS = {
  usa_normal:    "🇺🇸 USA · Normal",
  usa_express:   "🇺🇸 USA · Express",
  china_normal:  "🇨🇳 China · Normal",
  china_express: "🇨🇳 China · Express",
  europa_normal: "🇪🇺 Europa · Normal",
};

// ── Componentes UI base ───────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      position: "relative",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18, padding: "18px 20px", overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accent || "linear-gradient(90deg,#ffd200,#ff8a00)",
        borderRadius: "18px 18px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px" }}>
          {label.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", color: "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ChartShell({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text = "Sin datos todavía" }) {
  return (
    <div style={{ height: 100, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
      {text}
    </div>
  );
}

// ── Gráfico de barras agrupadas: Revenue / Costo / Ganancia por mes ───────────
function ProfitBarChart({ data }) {
  if (!data?.length) return <EmptyState />;
  const maxVal = Math.max(...data.flatMap((d) => [num(d.revenue), num(d.cost), num(d.profit)]), 1);
  const BAR_H = 160;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: BAR_H, padding: "0 4px" }}>
        {data.map((d, i) => {
          const rev    = num(d.revenue);
          const cost   = num(d.cost);
          const profit = num(d.profit);
          const isNeg  = profit < 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                {[
                  { val: rev,  color: "#ffd200", title: `Revenue: ${fmtUsd(rev)}` },
                  { val: cost, color: "#ef4444", title: `Costo: ${fmtUsd(cost)}` },
                  { val: Math.abs(profit), color: isNeg ? "#f97316" : "#22c55e", title: `Ganancia: ${fmtUsd(profit)}` },
                ].map((bar, j) => (
                  <div key={j} title={bar.title} style={{
                    flex: 1, maxWidth: 14,
                    height: `${Math.max((bar.val / maxVal) * BAR_H, 2)}px`,
                    background: bar.color,
                    borderRadius: "4px 4px 0 0",
                    boxShadow: `0 0 8px ${bar.color}55`,
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "35%", background: "rgba(255,255,255,0.18)", borderRadius: "4px 4px 0 0" }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, padding: "0 4px" }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.40)" }}>
            {fmtMonth(d.month)}
          </div>
        ))}
      </div>

      {/* Tabla de detalle por mes */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
        {data.map((d, i) => {
          const profit = num(d.profit);
          const margin = num(d.revenue) > 0 ? (profit / num(d.revenue)) * 100 : 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 12,
            }}>
              <span style={{ minWidth: 46, fontWeight: 700, color: "rgba(255,255,255,0.60)" }}>{fmtMonth(d.month)}</span>

              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: "#ffd200" }} />
                <span style={{ color: "rgba(255,255,255,0.50)" }}>Rev.</span>
                <b style={{ color: "#ffd200" }}>{fmtUsd(d.revenue)}</b>
              </div>

              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }} />
                <span style={{ color: "rgba(255,255,255,0.50)" }}>Costo</span>
                <b style={{ color: "#ef4444" }}>{fmtUsd(d.cost)}</b>
              </div>

              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: profit < 0 ? "#f97316" : "#22c55e" }} />
                <span style={{ color: "rgba(255,255,255,0.50)" }}>Ganancia</span>
                <b style={{ color: profit < 0 ? "#f97316" : "#22c55e" }}>{fmtUsd(profit)}</b>
              </div>

              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 800,
                color: margin < 0 ? "#f97316" : margin < 20 ? "#ffd200" : "#22c55e",
              }}>
                {margin.toFixed(1)}% margen
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{d.count} env.</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        {[["#ffd200","Revenue"],["#ef4444","Costo real"],["#22c55e","Ganancia neta"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tabla ganancia por lane ───────────────────────────────────────────────────
function LaneTable({ rows }) {
  if (!rows?.length) return <EmptyState />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => {
        const profit = num(r.profit);
        const margin = num(r.revenue) > 0 ? (profit / num(r.revenue)) * 100 : 0;
        const color  = ORIGIN_COLOR[r.origin] || "#6b7280";
        const maxRev = Math.max(...rows.map((x) => num(x.revenue)), 1);
        const pct    = (num(r.revenue) / maxRev) * 100;
        return (
          <div key={i} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 160 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{r.origin} · {r.service}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 6px",
                  background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 6, color,
                }}>{r.count} env.</span>
              </div>
              <div style={{ display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>REVENUE</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#ffd200" }}>{fmtUsd(r.revenue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>COSTO</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444" }}>{fmtUsd(r.cost)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>GANANCIA</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: profit < 0 ? "#f97316" : "#22c55e" }}>{fmtUsd(profit)}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>MARGEN</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: margin < 0 ? "#f97316" : margin < 20 ? "#ffd200" : "#22c55e" }}>
                    {margin.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)", marginTop: 10 }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width 0.5s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Panel configuración de costos ─────────────────────────────────────────────
function CostsPanel({ costs, onSaved }) {
  const [form, setForm]     = useState({ ...costs });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => { setForm({ ...costs }); }, [costs]);

  async function save() {
    setMsg(""); setSaving(true);
    try {
      const payload = {};
      for (const k of Object.keys(LANE_LABELS)) {
        const n = Number(String(form[k] ?? "0").replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          setMsg(`Valor inválido en ${LANE_LABELS[k]}`);
          setSaving(false); return;
        }
        payload[k] = n;
      }
      const res  = await fetch(`${API}/operator/costs`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error guardando"); setSaving(false); return; }
      setMsg("Costos guardados ✅ — el dashboard se recalculará.");
      onSaved?.();
    } catch { setMsg("Error de red"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
        Ingresá tu <b style={{ color: "#fff" }}>costo real de compra</b> por kg para cada ruta.
        La ganancia neta = <span style={{ color: "#ffd200" }}>tarifa cobrada al cliente</span> − <span style={{ color: "#ef4444" }}>costo real</span>.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {Object.entries(LANE_LABELS).map(([key, label]) => (
          <div key={key} style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.60)", marginBottom: 8 }}>{label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>$</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                value={form[key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ height: 38, fontSize: 14, fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>/kg</span>
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{
          marginTop: 12, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.includes("✅") ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${msg.includes("✅") ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)"}`,
          color: msg.includes("✅") ? "#86efac" : "#fca5a5",
        }}>{msg}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button className="btn btnPrimary" onClick={save} disabled={saving}
          style={{ height: 40, padding: "0 24px", fontSize: 13, fontWeight: 800 }}>
          {saving ? "Guardando…" : "Guardar costos"}
        </button>
      </div>
    </div>
  );
}

// ── Dona ──────────────────────────────────────────────────────────────────────
function DonutChart({ data, valueKey, labelKey, colorMap }) {
  if (!data?.length) return <EmptyState />;
  const total = data.reduce((a, d) => a + num(d[valueKey]), 0);
  if (!total) return <EmptyState />;
  const R = 52, r = 30, CX = 70, CY = 70;
  let startAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const val = num(d[valueKey]);
    const angle = (val / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(startAngle), y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(startAngle + angle), y2 = CY + R * Math.sin(startAngle + angle);
    const ix1 = CX + r * Math.cos(startAngle), iy1 = CY + r * Math.sin(startAngle);
    const ix2 = CX + r * Math.cos(startAngle + angle), iy2 = CY + r * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z`;
    const result = { ...d, path, color: colorMap?.[d[labelKey]] || "#6b7280", pct: Math.round((val / total) * 100) };
    startAngle += angle;
    return result;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg viewBox="0 0 140 140" style={{ width: 110, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#0a1224" strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 4px ${s.color}66)` }} />)}
        <circle cx={CX} cy={CY} r={r - 4} fill="#0a1224" />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff">{total}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.40)">TOTAL</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.70)" }}>{s[labelKey]}</div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{s[valueKey]} <span style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>({s.pct}%)</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top clientes ──────────────────────────────────────────────────────────────
function TopClients({ rows }) {
  const maxShip = Math.max(...(rows || []).map((r) => num(r.shipments)), 1);
  return !rows?.length ? <EmptyState /> : (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "rgba(255,255,255,0.10)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 900, color: i === 0 ? "#0b1020" : "rgba(255,255,255,0.50)" }}>{i + 1}</div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>#{r.client_number}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{r.shipments} env.</div>
              <div style={{ fontSize: 11, color: "#ffd200", fontWeight: 700 }}>{fmtUsd(r.revenue)}</div>
            </div>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>
            <div style={{ height: "100%", width: `${(num(r.shipments) / maxShip) * 100}%`, borderRadius: 999, background: i === 0 ? "linear-gradient(90deg,#ffd200,#ff8a00)" : "rgba(255,255,255,0.22)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Actividad reciente ────────────────────────────────────────────────────────
function RecentTable({ rows }) {
  return !rows?.length ? <EmptyState /> : (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
          <div style={{ background: "rgba(255,210,0,0.10)", border: "1px solid rgba(255,210,0,0.22)", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 800, color: "#ffd200", whiteSpace: "nowrap" }}>{r.code || `#${r.id}`}</div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.description}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>Cliente #{r.client_number} — {r.client_name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusBadge status={r.status} />
            {r.origin && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: `${ORIGIN_COLOR[r.origin] || "#6b7280"}22`, border: `1px solid ${ORIGIN_COLOR[r.origin] || "#6b7280"}44`, borderRadius: 6, color: ORIGIN_COLOR[r.origin] || "#fff" }}>{r.origin}</span>}
            {r.estimated_usd != null && <span style={{ fontSize: 12, fontWeight: 800, color: "#ffd200" }}>{fmtUsd(r.estimated_usd)}</span>}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap" }}>{fmtDate(r.date_in)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [showCosts, setShowCosts]   = useState(false);

  async function loadDashboard() {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API}/operator/dashboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || "Error"); return; }
      setData(json);
      setLastUpdate(new Date());
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadDashboard(); }, []); // eslint-disable-line

  const s = data?.stats;
  const totalProfit  = (data?.by_month || []).reduce((a, d) => a + num(d.profit), 0);
  const totalCost    = (data?.by_month || []).reduce((a, d) => a + num(d.cost), 0);
  const totalRevenue = num(s?.total_revenue);
  const margin       = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const costsConfigured = data?.operator_costs &&
    Object.values(data.operator_costs).some((v) => Number(v) > 0);

  return (
    <div className="screen" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Topbar title="Dashboard" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, margin: "14px 0 0", padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>Dashboard</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>
            {lastUpdate ? `Actualizado ${lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "LEMON'S — resumen operativo"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowCosts((v) => !v)}
            style={{ height: 38, padding: "0 16px", fontSize: 13, background: showCosts ? "rgba(255,210,0,0.10)" : undefined, border: showCosts ? "1px solid rgba(255,210,0,0.25)" : undefined, color: showCosts ? "#ffd200" : undefined }}>
            ⚙ Costos reales
          </button>
          <button className="btn btnPrimary" onClick={loadDashboard} disabled={loading}
            style={{ height: 38, padding: "0 18px", fontSize: 13 }}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: "10px 0", padding: "11px 16px", borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)", color: "#fca5a5", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>
      )}

      {/* Aviso costos no configurados */}
      {data && !costsConfigured && (
        <div style={{ margin: "10px 0", padding: "12px 16px", borderRadius: 12, background: "rgba(255,138,0,0.08)", border: "1px solid rgba(255,138,0,0.25)", color: "rgba(255,255,255,0.75)", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>Los <b>costos reales</b> no están configurados — las ganancias muestran $0.{" "}
            <button onClick={() => setShowCosts(true)} style={{ background: "none", border: "none", color: "#ffd200", fontWeight: 800, cursor: "pointer", padding: 0, fontSize: 13 }}>
              Configurar ahora →
            </button>
          </span>
        </div>
      )}

      {loading && !data && (
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: "rgba(255,255,255,0.35)" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(255,210,0,0.20)", borderTop: "3px solid #ffd200", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Cargando dashboard…
        </div>
      )}

      {data && (
        <>
          {/* Panel de costos desplegable */}
          {showCosts && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,210,0,0.18)", borderRadius: 18, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>
                ⚙ CONFIGURACIÓN DE COSTOS REALES (USD/KG)
              </div>
              <CostsPanel costs={data.operator_costs} onSaved={() => { setShowCosts(false); loadDashboard(); }} />
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 10, marginTop: 14 }}>
            <KpiCard icon="📦" label="Total envíos"      value={fmtNum(s?.total)}           sub="Histórico completo" />
            <KpiCard icon="👥" label="Clientes activos"  value={fmtNum(s?.active_clients)}  sub="Con al menos 1 envío"       accent="linear-gradient(90deg,#60a5fa,#818cf8)" />
            <KpiCard icon="💰" label="Revenue total"     value={fmtUsd(totalRevenue)}        sub="Suma de estimados"          accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
            <KpiCard icon="🔴" label="Costo total"       value={fmtUsd(totalCost)}           sub="Costos reales acumulados"   accent="linear-gradient(90deg,#ef4444,#f97316)" />
            <KpiCard icon="📈" label="Ganancia neta"     value={fmtUsd(totalProfit)}         sub={`Margen: ${margin.toFixed(1)}%`}
              accent={totalProfit >= 0 ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#f97316,#ef4444)"} />
            <KpiCard icon="✅" label="Revenue entregado" value={fmtUsd(s?.delivered_revenue)} sub="Solo envíos entregados"    accent="linear-gradient(90deg,#22c55e,#4ade80)" />
          </div>

          {/* Pipeline */}
          <div style={{ marginTop: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 16 }}>PIPELINE DE ESTADOS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "Recibido en depósito", key: "received",  icon: "📦" },
                { label: "En preparación",       key: "prep",      icon: "🔧" },
                { label: "Despachado",           key: "sent",      icon: "🚀" },
                { label: "En tránsito",          key: "transit",   icon: "✈️" },
                { label: "Listo para entrega",   key: "ready",     icon: "📬" },
                { label: "Entregado",            key: "delivered", icon: "✅" },
              ].map((st) => {
                const val = num(s?.[st.key]);
                const pct = Math.round((val / (num(s?.total) || 1)) * 100);
                const color = STATUS_COLOR[st.label] || "#6b7280";
                return (
                  <div key={st.key} style={{ flex: "1 1 130px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `${color}33` }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{st.icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>{val}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.3 }}>{st.label}</div>
                    <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 4 }}>{pct}% del total</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revenue / Costo / Ganancia por mes */}
          <div style={{ marginTop: 12 }}>
            <ChartShell title="Revenue · Costo · Ganancia por mes (últimos 8 meses)">
              <ProfitBarChart data={data.by_month} />
            </ChartShell>
          </div>

          {/* Lane table + dona origen */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginTop: 12 }} className="grid2">
            <ChartShell title="Ganancia neta por lane (histórico)">
              <LaneTable rows={data.by_lane} />
            </ChartShell>
            <ChartShell title="Distribución por origen">
              <DonutChart data={data.by_origin} valueKey="count" labelKey="origin" colorMap={ORIGIN_COLOR} />
            </ChartShell>
          </div>

          {/* Top clientes + servicio */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }} className="grid2">
            <ChartShell title="Top clientes por envíos">
              <TopClients rows={data.top_clients} />
            </ChartShell>
            <ChartShell title="Envíos por servicio">
              <DonutChart data={data.by_service} valueKey="count" labelKey="service" colorMap={SERVICE_COLOR} />
            </ChartShell>
          </div>

          {/* Actividad reciente */}
          <div style={{ marginTop: 12, marginBottom: 24 }}>
            <ChartShell title="Últimos envíos creados">
              <RecentTable rows={data.recent} />
            </ChartShell>
          </div>
        </>
      )}
    </div>
  );
}
