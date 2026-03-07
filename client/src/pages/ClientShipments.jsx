import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtDate = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
};

const fmtDateShort = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("es-AR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
};

const num = (v, fallback = NaN) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
const fmtKg = (v) => { const n = num(v); return Number.isFinite(n) ? `${n.toFixed(2)} kg` : "-"; };
const fmtUsdKg = (v) => { const n = num(v); return Number.isFinite(n) ? `$${n.toFixed(2)}/kg` : "-"; };
const fmtUsd = (v) => { const n = num(v); return Number.isFinite(n) ? `$${n.toFixed(2)}` : "-"; };

// ── Tracking URL guesser ──────────────────────────────────────────────────────
function guessTrackingUrl(trackingRaw) {
  const t = String(trackingRaw || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (/^1Z[A-Z0-9]{16}$/i.test(t))
    return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`;
  if (/^\d{12,15}$/.test(t))
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
  if (/^\d{20,22}$/.test(t))
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(t)}`;
}

// ── Mapa visual de estados (orden del pipeline) ───────────────────────────────
const STATUS_PIPELINE = [
  { key: "Recibido en depósito", icon: "📦", short: "Recibido" },
  { key: "En preparación",       icon: "🔧", short: "Preparación" },
  { key: "Despachado",           icon: "🚀", short: "Despachado" },
  { key: "En tránsito",          icon: "✈️", short: "Tránsito" },
  { key: "Listo para entrega",   icon: "📬", short: "Listo" },
  { key: "Entregado",            icon: "✅", short: "Entregado" },
];

function getStatusIndex(status) {
  return STATUS_PIPELINE.findIndex((s) => s.key === status);
}

// ── Mini progress bar de estado ───────────────────────────────────────────────
function StatusProgress({ status }) {
  const idx = getStatusIndex(status);
  const total = STATUS_PIPELINE.length - 1;
  const pct = idx < 0 ? 0 : Math.round((idx / total) * 100);

  return (
    <div style={{ width: "100%", marginTop: 6 }}>
      {/* Steps */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        {STATUS_PIPELINE.map((s, i) => {
          const done = i <= idx;
          const active = i === idx;
          return (
            <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
              <div style={{
                width: active ? 28 : 22,
                height: active ? 28 : 22,
                borderRadius: "50%",
                display: "grid", placeItems: "center",
                fontSize: active ? 14 : 11,
                background: done
                  ? (active ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "rgba(255,210,0,0.22)")
                  : "rgba(255,255,255,0.07)",
                border: active ? "none" : done ? "1px solid rgba(255,210,0,0.35)" : "1px solid rgba(255,255,255,0.12)",
                transition: "all 0.25s",
                boxShadow: active ? "0 0 14px rgba(255,210,0,0.40)" : "none",
              }}>
                {s.icon}
              </div>
              <span style={{
                fontSize: 9, fontWeight: active ? 800 : 500,
                color: active ? "#ffd200" : done ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)",
                textAlign: "center", lineHeight: 1.2, maxWidth: 52,
              }}>
                {s.short}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barra de progreso */}
      <div style={{
        height: 4, borderRadius: 999,
        background: "rgba(255,255,255,0.09)",
        overflow: "hidden",
        marginTop: 2,
      }}>
        <div style={{
          height: "100%", borderRadius: 999,
          width: `${pct}%`,
          background: "linear-gradient(90deg,#ffd200,#ff8a00)",
          transition: "width 0.4s ease",
          boxShadow: "0 0 8px rgba(255,138,0,0.50)",
        }} />
      </div>
    </div>
  );
}

// ── Tarjeta de envío ──────────────────────────────────────────────────────────
function ShipmentCard({ r, isOpen, onToggle }) {
  const trackingUrl = guessTrackingUrl(r.tracking);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: isOpen
        ? "1px solid rgba(255,210,0,0.25)"
        : "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18,
      overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* ── Cabecera de la card ── */}
      <div style={{ padding: "14px 16px" }}>
        {/* Fila top: código + estado + fecha */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              background: "linear-gradient(135deg,rgba(255,210,0,0.15),rgba(255,138,0,0.10))",
              border: "1px solid rgba(255,210,0,0.22)",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 13, fontWeight: 900, letterSpacing: "0.3px",
              color: "#ffd200",
            }}>
              {r.code || "-"}
            </div>
            <StatusBadge status={r.status} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", whiteSpace: "nowrap" }}>
            {fmtDate(r.date_in)}
          </div>
        </div>

        {/* Descripción */}
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
          {r.description || "-"}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 10 }}>
          <StatusProgress status={r.status} />
        </div>

        {/* Fila de datos clave */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "8px 20px",
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 13,
        }}>
          {r.box_code && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>CAJA</span>
              <span style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700,
              }}>{r.box_code}</span>
            </div>
          )}

          {r.tracking && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>TRACKING</span>
              <a
                href={trackingUrl || "#"}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => { if (!trackingUrl) e.preventDefault(); }}
                style={{
                  color: "#ffd200", fontWeight: 700, fontSize: 12,
                  textDecoration: "none", display: "flex", alignItems: "center", gap: 3,
                }}
              >
                {r.tracking}
                <span style={{ fontSize: 10, opacity: 0.7 }}>↗</span>
              </a>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>ORIGEN</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>
              {r.origin || "-"}{r.service && r.service !== "NORMAL" ? ` · ${r.service}` : ""}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>PESO</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>{fmtKg(r.weight_kg)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>TARIFA</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>{fmtUsdKg(r.rate_usd_per_kg)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 11 }}>ESTIMADO</span>
            <span style={{
              fontWeight: 900, fontSize: 13,
              background: "linear-gradient(135deg,#ffd200,#ff8a00)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {fmtUsd(r.estimated_usd)}
            </span>
          </div>
        </div>

        {/* Botón historial */}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onToggle}
            style={{
              background: isOpen ? "rgba(255,210,0,0.10)" : "rgba(255,255,255,0.05)",
              border: isOpen ? "1px solid rgba(255,210,0,0.25)" : "1px solid rgba(255,255,255,0.12)",
              borderRadius: 999,
              color: isOpen ? "#ffd200" : "rgba(255,255,255,0.60)",
              fontSize: 12, fontWeight: 700,
              padding: "6px 14px",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            <span>{isOpen ? "▲" : "▼"}</span>
            {isOpen ? "Cerrar historial" : "Ver historial"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Timeline de eventos ───────────────────────────────────────────────────────
function EventTimeline({ events, loading }) {
  if (loading) {
    return (
      <div style={{ padding: "14px 16px", color: "rgba(255,255,255,0.40)", fontSize: 13 }}>
        Cargando historial…
      </div>
    );
  }
  if (!events.length) {
    return (
      <div style={{ padding: "14px 16px", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
        Sin eventos registrados todavía.
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 16px 16px",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(0,0,0,0.15)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.6px",
        color: "rgba(255,255,255,0.35)", marginBottom: 14,
      }}>
        HISTORIAL DE MOVIMIENTOS
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {events.map((e, i) => {
          const isFirst = i === 0;
          const isLast = i === events.length - 1;
          const pipeIdx = getStatusIndex(e.new_status);
          const pipeStep = STATUS_PIPELINE[pipeIdx];

          return (
            <div key={e.id || e.created_at} style={{ display: "flex", gap: 14 }}>
              {/* Línea de tiempo */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
                <div style={{
                  width: isFirst ? 20 : 14,
                  height: isFirst ? 20 : 14,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isFirst
                    ? "linear-gradient(135deg,#ffd200,#ff8a00)"
                    : "rgba(255,255,255,0.18)",
                  border: isFirst ? "none" : "1px solid rgba(255,255,255,0.15)",
                  boxShadow: isFirst ? "0 0 12px rgba(255,210,0,0.35)" : "none",
                  display: "grid", placeItems: "center",
                  fontSize: 9,
                  marginTop: i === 0 ? 0 : 3,
                }}>
                  {isFirst && "★"}
                </div>
                {!isLast && (
                  <div style={{
                    width: 1, flex: 1,
                    minHeight: 22,
                    background: "rgba(255,255,255,0.10)",
                    marginTop: 3,
                  }} />
                )}
              </div>

              {/* Contenido */}
              <div style={{
                flex: 1, paddingBottom: isLast ? 0 : 16,
                paddingTop: 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 14, fontWeight: isFirst ? 800 : 600,
                    color: isFirst ? "#fff" : "rgba(255,255,255,0.70)",
                  }}>
                    {pipeStep ? `${pipeStep.icon} ` : ""}{e.new_status}
                  </span>
                  {e.old_status && (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                      ← {e.old_status}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
                  {fmtDateShort(e.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat card para el resumen ─────────────────────────────────────────────────
function SummaryCard({ icon, label, value, accent }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 14,
      padding: "12px 14px",
      position: "relative",
      overflow: "hidden",
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accent || "linear-gradient(90deg,#ffd200,#ff8a00)",
        borderRadius: "14px 14px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: "-0.3px" }}>
        {value}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClientShipments() {
  const [msg, setMsg] = useState("");
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("TODOS");

  // Historial
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Vista: cards o tabla
  const [viewMode, setViewMode] = useState("cards");

  const totalEstimated = useMemo(() =>
    rows.reduce((acc, r) => { const n = num(r.estimated_usd); return Number.isFinite(n) ? acc + n : acc; }, 0),
    [rows]);

  const activeCount = useMemo(() =>
    rows.filter((r) => r.status !== "Entregado").length,
    [rows]);

  const filteredRows = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    return rows.filter((r) => {
      if (filterStatus !== "TODOS" && r.status !== filterStatus) return false;
      if (!s) return true;
      return (
        String(r.code || "").toLowerCase().includes(s) ||
        String(r.description || "").toLowerCase().includes(s) ||
        String(r.tracking || "").toLowerCase().includes(s) ||
        String(r.box_code || "").toLowerCase().includes(s) ||
        String(r.status || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, filterStatus]);

  async function fetchMe() {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (res.ok) setMe(data.user);
  }

  async function loadShipments() {
    setMsg(""); setLoading(true);
    try {
      const res = await fetch(`${API}/client/shipments`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error cargando envíos"); setRows([]); return; }
      setRows(data.rows || []);
    } catch { setMsg("Error de red"); setRows([]); }
    finally { setLoading(false); }
  }

  async function loadEvents(shipmentId) {
    setMsg(""); setLoadingEvents(true);
    try {
      const res = await fetch(`${API}/shipments/${shipmentId}/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error cargando historial"); setEvents([]); return; }
      setEvents(data.rows || []);
    } catch { setMsg("Error de red"); setEvents([]); }
    finally { setLoadingEvents(false); }
  }

  async function refreshAll() {
    await fetchMe();
    await loadShipments();
  }

  useEffect(() => { refreshAll(); }, []); // eslint-disable-line

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="screen" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Topbar title="Mis envíos" />

      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, margin: "14px 0 0",
        padding: "14px 16px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>Mis envíos</div>
          {me ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
              Cuenta <b style={{ color: "rgba(255,255,255,0.70)" }}>#{me.client_number}</b> — {me.name}
              <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
              <span style={{ opacity: 0.7 }}>{me.email}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Cargando…</div>
          )}
        </div>
        <button
          className="btn btnPrimary"
          onClick={refreshAll}
          disabled={loading}
          style={{ height: 38, padding: "0 18px", fontSize: 13 }}
        >
          {loading ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </div>

      {msg && (
        <div style={{
          margin: "10px 0", padding: "11px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)", color: "#fca5a5",
        }}>
          ⚠ {msg}
        </div>
      )}

      {/* ── STATS ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <SummaryCard icon="📦" label="TOTAL ENVÍOS" value={rows.length} />
        <SummaryCard icon="🔄" label="EN CURSO" value={activeCount}
          accent="linear-gradient(90deg,#3b82f6,#60a5fa)" />
        <SummaryCard icon="✅" label="ENTREGADOS" value={rows.length - activeCount}
          accent="linear-gradient(90deg,#22c55e,#4ade80)" />
        <SummaryCard
          icon="💰"
          label="TOTAL ESTIMADO"
          value={fmtUsd(totalEstimated)}
          accent="linear-gradient(90deg,#ffd200,#ff8a00)"
        />
      </div>

      {/* ── FILTROS + TOGGLE VISTA ── */}
      <div style={{
        display: "flex", gap: 10, marginTop: 12,
        flexWrap: "wrap", alignItems: "center",
      }}>
        <input
          className="input"
          placeholder="🔍 Buscar: código, descripción, tracking, caja..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />

        {/* Filtro por estado */}
        <select
          className="input"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="TODOS">Todos los estados</option>
          <option value="Recibido en depósito">Recibido en depósito</option>
          <option value="En preparación">En preparación</option>
          <option value="Despachado">Despachado</option>
          <option value="En tránsito">En tránsito</option>
          <option value="Listo para entrega">Listo para entrega</option>
          <option value="Entregado">Entregado</option>
        </select>

        {/* Toggle vista */}
        <div style={{
          display: "flex",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 10,
          overflow: "hidden",
        }}>
          {["cards", "tabla"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "8px 14px", fontSize: 12, fontWeight: 700,
                background: viewMode === mode ? "rgba(255,210,0,0.12)" : "none",
                color: viewMode === mode ? "#ffd200" : "rgba(255,255,255,0.45)",
                border: "none", cursor: "pointer",
                borderRight: mode === "cards" ? "1px solid rgba(255,255,255,0.10)" : "none",
              }}
            >
              {mode === "cards" ? "▦ Cards" : "☰ Tabla"}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
          {filteredRows.length} resultado{filteredRows.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── VISTA CARDS ── */}
      {viewMode === "cards" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredRows.length === 0 && (
            <div style={{
              padding: 32, textAlign: "center",
              color: "rgba(255,255,255,0.30)", fontSize: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.10)",
              borderRadius: 18,
            }}>
              {loading ? "Cargando envíos…" : "No hay resultados con este filtro."}
            </div>
          )}

          {filteredRows.map((r) => (
            <div key={r.id}>
              <ShipmentCard
                r={r}
                isOpen={openId === r.id}
                onToggle={() => {
                  const next = openId === r.id ? null : r.id;
                  setOpenId(next);
                  if (next) loadEvents(r.id);
                }}
              />
              {openId === r.id && (
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,210,0,0.20)",
                  borderTop: "none",
                  borderRadius: "0 0 18px 18px",
                  marginTop: -2,
                }}>
                  <EventTimeline events={events} loading={loadingEvents} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── VISTA TABLA ── */}
      {viewMode === "tabla" && (
        <div style={{ marginTop: 14 }}>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>CÓDIGO</th>
                  <th>FECHA</th>
                  <th>DESCRIPCIÓN</th>
                  <th>CAJA</th>
                  <th>TRACKING</th>
                  <th>PESO</th>
                  <th>ORIGEN</th>
                  <th>SERVICIO</th>
                  <th>TARIFA</th>
                  <th>ESTIMADO</th>
                  <th>ESTADO</th>
                  <th>HISTORIAL</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <>
                    <tr key={r.id}>
                      <td>
                        <span style={{
                          background: "rgba(255,210,0,0.10)",
                          border: "1px solid rgba(255,210,0,0.22)",
                          borderRadius: 8, padding: "2px 8px",
                          fontSize: 12, fontWeight: 800, color: "#ffd200",
                        }}>
                          {r.code || "-"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>
                        {fmtDate(r.date_in)}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.description || "-"}</td>
                      <td>
                        {r.box_code
                          ? <span className="pill">{r.box_code}</span>
                          : <span className="muted">-</span>}
                      </td>
                      <td>
                        {r.tracking ? (
                          <a
                            href={guessTrackingUrl(r.tracking) || "#"}
                            target="_blank" rel="noopener noreferrer"
                            style={{ color: "#ffd200", fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                          >
                            {r.tracking} <span style={{ opacity: 0.6, fontSize: 10 }}>↗</span>
                          </a>
                        ) : <span className="muted">-</span>}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{fmtKg(r.weight_kg)}</td>
                      <td style={{ fontSize: 12 }}>{r.origin || "-"}</td>
                      <td style={{ fontSize: 12 }}>{r.service || "-"}</td>
                      <td style={{ fontSize: 12 }}>{fmtUsdKg(r.rate_usd_per_kg)}</td>
                      <td>
                        <b style={{
                          background: "linear-gradient(135deg,#ffd200,#ff8a00)",
                          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                          fontWeight: 900,
                        }}>
                          {fmtUsd(r.estimated_usd)}
                        </b>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <StatusBadge status={r.status} />
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn"
                          onClick={() => {
                            const next = openId === r.id ? null : r.id;
                            setOpenId(next);
                            if (next) loadEvents(r.id);
                          }}
                          style={{ height: 32, padding: "0 12px", fontSize: 12 }}
                        >
                          {openId === r.id ? "Cerrar" : "Ver"}
                        </button>
                      </td>
                    </tr>

                    {/* Historial expandido en tabla */}
                    {openId === r.id && (
                      <tr key={`events-${r.id}`}>
                        <td colSpan={12} style={{ padding: 0 }}>
                          <div style={{
                            background: "rgba(0,0,0,0.2)",
                            borderTop: "1px solid rgba(255,255,255,0.07)",
                            borderBottom: "1px solid rgba(255,255,255,0.07)",
                            padding: "12px 20px",
                          }}>
                            <EventTimeline events={events} loading={loadingEvents} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
                      {loading ? "Cargando…" : "No hay resultados con este filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
