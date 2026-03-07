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

// ── Paleta de colores por origen/servicio ──────────────────────────────────
const ORIGIN_COLOR = { USA: "#ffd200", CHINA: "#ff8a00", EUROPA: "#60a5fa", "Sin origen": "#6b7280" };
const SERVICE_COLOR = { NORMAL: "#a78bfa", EXPRESS: "#ffd200" };

// ── Colores pipeline ──────────────────────────────────────────────────────────
const STATUS_COLOR = {
  "Recibido en depósito": "#ffd200",
  "En preparación":       "#ff8a00",
  "Despachado":           "#3b82f6",
  "En tránsito":          "#a78bfa",
  "Listo para entrega":   "#22c55e",
  "Entregado":            "#86efac",
};

// ── Stat card grande ──────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent, wide }) {
  return (
    <div style={{
      position: "relative",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18,
      padding: "18px 20px",
      overflow: "hidden",
      gridColumn: wide ? "span 2" : "span 1",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      {/* Accent bar top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accent || "linear-gradient(90deg,#ffd200,#ff8a00)",
        borderRadius: "18px 18px 0 0",
      }} />
      {/* Glow */}
      <div style={{
        position: "absolute", top: -40, right: -20,
        width: 120, height: 120, borderRadius: "50%",
        background: accent
          ? accent.replace("linear-gradient(90deg,", "radial-gradient(circle,").replace(")", ",transparent)")
          : "radial-gradient(circle,rgba(255,210,0,0.08),transparent)",
        filter: "blur(30px)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px" }}>
          {label.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.5px", color: "#fff", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Gráfico de barras SVG ─────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, colorFn, title, formatValue }) {
  if (!data?.length) return <EmptyChart title={title} />;

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1);
  const BAR_H = 160;
  const width = 100 / data.length;

  return (
    <ChartShell title={title}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: BAR_H, padding: "0 4px" }}>
        {data.map((d, i) => {
          const val = Number(d[valueKey] || 0);
          const pct = (val / maxVal) * 100;
          const color = colorFn ? colorFn(d[labelKey]) : "#ffd200";

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              {/* Valor encima */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                {formatValue ? formatValue(val) : fmtNum(val)}
              </div>
              {/* Barra */}
              <div style={{
                width: "100%", borderRadius: "6px 6px 0 0",
                height: `${Math.max(pct, 2)}%`,
                background: color,
                boxShadow: `0 0 12px ${color}55`,
                transition: "height 0.5s ease",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Shimmer */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: "35%",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: "6px 6px 0 0",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, padding: "0 4px" }}>
        {data.map((d, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", fontSize: 10, fontWeight: 600,
            color: "rgba(255,255,255,0.45)", lineHeight: 1.2,
          }}>
            {d[labelKey]}
          </div>
        ))}
      </div>
    </ChartShell>
  );
}

// ── Gráfico de línea SVG ──────────────────────────────────────────────────────
function LineChart({ data, title }) {
  if (!data?.length) return <EmptyChart title={title} />;

  const W = 500, H = 130, PAD = { t: 10, r: 10, b: 30, l: 40 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const counts  = data.map((d) => Number(d.count || 0));
  const revenues = data.map((d) => Number(d.revenue || 0));
  const maxCount = Math.max(...counts, 1);
  const maxRev   = Math.max(...revenues, 1);

  const xPos = (i) => PAD.l + (i / Math.max(data.length - 1, 1)) * chartW;
  const yCount  = (v) => PAD.t + chartH - (v / maxCount) * chartH;
  const yRevenue = (v) => PAD.t + chartH - (v / maxRev) * chartH;

  const pathCount  = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yCount(Number(d.count || 0))}`).join(" ");
  const pathRev    = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yRevenue(Number(d.revenue || 0))}`).join(" ");

  // Area fill
  const areaCount = `${pathCount} L${xPos(data.length - 1)},${PAD.t + chartH} L${xPos(0)},${PAD.t + chartH} Z`;

  return (
    <ChartShell title={title}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 140 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd200" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffd200" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f}
            x1={PAD.l} y1={PAD.t + chartH * (1 - f)}
            x2={PAD.l + chartW} y2={PAD.t + chartH * (1 - f)}
            stroke="rgba(255,255,255,0.07)" strokeWidth="1"
          />
        ))}

        {/* Area */}
        <path d={areaCount} fill="url(#areaGrad)" />

        {/* Revenue line */}
        <path d={pathRev} fill="none" stroke="#ff8a00" strokeWidth="2" strokeDasharray="4 3" opacity="0.7" />

        {/* Count line */}
        <path d={pathCount} fill="none" stroke="#ffd200" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {data.map((d, i) => (
          <circle key={i}
            cx={xPos(i)} cy={yCount(Number(d.count || 0))}
            r="4" fill="#ffd200"
            stroke="#0a1224" strokeWidth="2"
          />
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i}
            x={xPos(i)} y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.40)"
          >
            {fmtMonth(d.month)}
          </text>
        ))}
      </svg>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
          <div style={{ width: 16, height: 2, background: "#ffd200", borderRadius: 2 }} />
          Envíos (eje izq.)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
          <div style={{ width: 16, height: 2, background: "#ff8a00", borderRadius: 2, borderTop: "1px dashed #ff8a00" }} />
          Revenue (eje der.)
        </div>
      </div>
    </ChartShell>
  );
}

// ── Gráfico de dona SVG ───────────────────────────────────────────────────────
function DonutChart({ data, valueKey, labelKey, colorMap, title }) {
  if (!data?.length) return <EmptyChart title={title} />;

  const total = data.reduce((a, d) => a + Number(d[valueKey] || 0), 0);
  if (total === 0) return <EmptyChart title={title} />;

  const R = 52, r = 30, CX = 70, CY = 70;
  let startAngle = -Math.PI / 2;

  const slices = data.map((d) => {
    const val = Number(d[valueKey] || 0);
    const angle = (val / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(startAngle + angle);
    const y2 = CY + R * Math.sin(startAngle + angle);
    const ix1 = CX + r * Math.cos(startAngle);
    const iy1 = CY + r * Math.sin(startAngle);
    const ix2 = CX + r * Math.cos(startAngle + angle);
    const iy2 = CY + r * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z`;
    const result = { ...d, path, color: colorMap?.[d[labelKey]] || "#6b7280", pct: Math.round((val / total) * 100) };
    startAngle += angle;
    return result;
  });

  return (
    <ChartShell title={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg viewBox="0 0 140 140" style={{ width: 120, flexShrink: 0 }}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} stroke="#0a1224" strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 4px ${s.color}66)` }} />
          ))}
          {/* Centro */}
          <circle cx={CX} cy={CY} r={r - 4} fill="#0a1224" />
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff">{total}</text>
          <text x={CX} y={CY + 12} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.40)">TOTAL</text>
        </svg>

        {/* Leyenda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.70)", fontWeight: 600 }}>
                {s[labelKey]}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>
                {s[valueKey]}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginLeft: 4 }}>({s.pct}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

// ── Shells helpers ────────────────────────────────────────────────────────────
function ChartShell({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18,
      padding: "16px 18px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ title }) {
  return (
    <ChartShell title={title}>
      <div style={{ height: 100, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
        Sin datos todavía
      </div>
    </ChartShell>
  );
}

// ── Tabla de actividad reciente ───────────────────────────────────────────────
function RecentTable({ rows }) {
  return (
    <ChartShell title="Últimos envíos creados">
      {!rows?.length ? (
        <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 13, padding: "10px 0" }}>Sin envíos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
            }}>
              <div style={{
                background: "rgba(255,210,0,0.10)",
                border: "1px solid rgba(255,210,0,0.22)",
                borderRadius: 8, padding: "2px 8px",
                fontSize: 12, fontWeight: 800, color: "#ffd200",
                whiteSpace: "nowrap",
              }}>
                {r.code || `#${r.id}`}
              </div>

              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                  {r.description}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                  Cliente #{r.client_number} — {r.client_name}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <StatusBadge status={r.status} />
                {r.origin && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px",
                    background: `${ORIGIN_COLOR[r.origin] || "#6b7280"}22`,
                    border: `1px solid ${ORIGIN_COLOR[r.origin] || "#6b7280"}44`,
                    borderRadius: 6, color: ORIGIN_COLOR[r.origin] || "#fff",
                  }}>
                    {r.origin}
                  </span>
                )}
                {r.estimated_usd != null && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#ffd200" }}>
                    {fmtUsd(r.estimated_usd)}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap" }}>
                  {fmtDate(r.date_in)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartShell>
  );
}

// ── Top clientes ──────────────────────────────────────────────────────────────
function TopClients({ rows }) {
  const maxShip = Math.max(...(rows || []).map((r) => Number(r.shipments || 0)), 1);

  return (
    <ChartShell title="Top clientes por envíos">
      {!rows?.length ? (
        <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 13, padding: "10px 0" }}>Sin datos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r, i) => {
            const pct = (Number(r.shipments || 0) / maxShip) * 100;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: i === 0 ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "rgba(255,255,255,0.10)",
                      display: "grid", placeItems: "center",
                      fontSize: 10, fontWeight: 900,
                      color: i === 0 ? "#0b1020" : "rgba(255,255,255,0.50)",
                    }}>
                      {i + 1}
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginLeft: 6 }}>
                        #{r.client_number}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
                      {r.shipments} env.
                    </div>
                    <div style={{ fontSize: 11, color: "#ffd200", fontWeight: 700 }}>
                      {fmtUsd(r.revenue)}
                    </div>
                  </div>
                </div>
                <div style={{
                  height: 4, borderRadius: 999,
                  background: "rgba(255,255,255,0.07)",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 999,
                    width: `${pct}%`,
                    background: i === 0
                      ? "linear-gradient(90deg,#ffd200,#ff8a00)"
                      : "rgba(255,255,255,0.22)",
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartShell>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);

  async function loadDashboard() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/operator/dashboard`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || "Error cargando dashboard"); return; }
      setData(json);
      setLastUpdate(new Date());
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []); // eslint-disable-line

  const s = data?.stats;

  return (
    <div className="screen" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Topbar title="Dashboard" />

      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, margin: "14px 0 0",
        padding: "14px 18px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>Dashboard</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>
            {lastUpdate
              ? `Actualizado ${lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
              : "LEMON'S — resumen operativo"}
          </div>
        </div>
        <button
          className="btn btnPrimary"
          onClick={loadDashboard}
          disabled={loading}
          style={{ height: 38, padding: "0 18px", fontSize: 13 }}
        >
          {loading ? "Cargando…" : "↻ Actualizar"}
        </button>
      </div>

      {error && (
        <div style={{
          margin: "10px 0", padding: "11px 16px", borderRadius: 12,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
          color: "#fca5a5", fontSize: 13, fontWeight: 600,
        }}>
          ⚠ {error}
        </div>
      )}

      {loading && !data && (
        <div style={{
          marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          color: "rgba(255,255,255,0.35)",
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "3px solid rgba(255,210,0,0.20)",
            borderTop: "3px solid #ffd200",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Cargando dashboard…
        </div>
      )}

      {data && (
        <>
          {/* ── KPIs principales ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 10, marginTop: 14,
          }}>
            <KpiCard icon="📦" label="Total envíos"   value={fmtNum(s?.total)}           sub="Histórico completo" />
            <KpiCard icon="👥" label="Clientes activos" value={fmtNum(s?.active_clients)}  sub="Con al menos 1 envío" accent="linear-gradient(90deg,#60a5fa,#818cf8)" />
            <KpiCard icon="⚖️" label="Peso total"     value={`${Number(s?.total_weight || 0).toFixed(1)} kg`} sub="Acumulado" accent="linear-gradient(90deg,#a78bfa,#c4b5fd)" />
            <KpiCard icon="💰" label="Revenue total"  value={fmtUsd(s?.total_revenue)}    sub="Suma de estimados" accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
            <KpiCard icon="✅" label="Revenue entregado" value={fmtUsd(s?.delivered_revenue)} sub="Solo envíos entregados" accent="linear-gradient(90deg,#22c55e,#4ade80)" />
          </div>

          {/* ── Pipeline de estados ── */}
          <div style={{
            marginTop: 14,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 18,
            padding: "16px 18px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 16 }}>
              PIPELINE DE ESTADOS
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                { label: "Recibido en depósito", key: "received",  icon: "📦" },
                { label: "En preparación",       key: "prep",      icon: "🔧" },
                { label: "Despachado",           key: "sent",      icon: "🚀" },
                { label: "En tránsito",          key: "transit",   icon: "✈️" },
                { label: "Listo para entrega",   key: "ready",     icon: "📬" },
                { label: "Entregado",            key: "delivered", icon: "✅" },
              ].map((st) => {
                const val = Number(s?.[st.key] || 0);
                const total = Number(s?.total || 1);
                const pct = Math.round((val / total) * 100);
                const color = STATUS_COLOR[st.label] || "#6b7280";

                return (
                  <div key={st.key} style={{
                    flex: "1 1 140px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "12px 14px",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Barra de fondo */}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                      background: `${color}33`,
                    }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: color,
                        transition: "width 0.5s ease",
                      }} />
                    </div>

                    <div style={{ fontSize: 16, marginBottom: 4 }}>{st.icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{val}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.3 }}>
                      {st.label}
                    </div>
                    <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 4 }}>
                      {pct}% del total
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Fila 1: línea de tiempo + dona origen ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 12, marginTop: 12,
          }} className="grid2">
            <LineChart data={data.by_month} title="Envíos y revenue por mes (últimos 8 meses)" />
            <DonutChart
              data={data.by_origin}
              valueKey="count"
              labelKey="origin"
              colorMap={ORIGIN_COLOR}
              title="Distribución por origen"
            />
          </div>

          {/* ── Fila 2: barras servicio + top clientes ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 12, marginTop: 12,
          }} className="grid2">
            <BarChart
              data={data.by_service}
              valueKey="count"
              labelKey="service"
              colorFn={(s) => SERVICE_COLOR[s] || "#6b7280"}
              title="Envíos por servicio"
            />
            <TopClients rows={data.top_clients} />
          </div>

          {/* ── Fila 3: actividad reciente (full width) ── */}
          <div style={{ marginTop: 12 }}>
            <RecentTable rows={data.recent} />
          </div>
        </>
      )}
    </div>
  );
}
