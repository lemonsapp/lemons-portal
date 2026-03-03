import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const fmtDate = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
};

const num = (v, fallback = NaN) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const fmtKg = (v) => {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} kg`;
};

const fmtUsdKg = (v) => {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toFixed(2)}/kg`;
};

const fmtUsd = (v) => {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toFixed(2)}`;
};

// ===================== TRACKING CLICKABLE (FRONT) =====================
function guessTrackingUrl(trackingRaw) {
  const t = String(trackingRaw || "").trim();
  if (!t) return "";

  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;

  // UPS: 1Z...
  if (/^1Z[A-Z0-9]{16}$/i.test(t))
    return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`;

  // FedEx: 12-15 dígitos (aprox)
  if (/^\d{12,15}$/.test(t))
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;

  // USPS: 20-22 dígitos (aprox)
  if (/^\d{20,22}$/.test(t))
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;

  // Fallback universal
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(t)}`;
}

function TrackingCell({ value }) {
  const t = String(value || "").trim();
  if (!t) return <span className="muted">-</span>;

  const url = guessTrackingUrl(t);

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="trackingLink"
      title="Abrir tracking"
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
    >
      {t}
      <span className="trackingIcon" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}

export default function ClientShipments() {
  const [msg, setMsg] = useState("");

  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [q, setQ] = useState("");

  // Historial
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const totalEstimated = useMemo(() => {
    return rows.reduce((acc, r) => {
      const n = num(r.estimated_usd, NaN);
      if (!Number.isFinite(n)) return acc;
      return acc + n;
    }, 0);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const code = String(r.code || "").toLowerCase();
      const desc = String(r.description || "").toLowerCase();
      const tracking = String(r.tracking || "").toLowerCase();
      const box = String(r.box_code || "").toLowerCase();
      const status = String(r.status || "").toLowerCase();
      return (
        code.includes(s) ||
        desc.includes(s) ||
        tracking.includes(s) ||
        box.includes(s) ||
        status.includes(s)
      );
    });
  }, [rows, q]);

  async function fetchMe() {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (res.ok) setMe(data.user);
  }

  async function loadShipments() {
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/client/shipments`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Error cargando envíos");
        setRows([]);
        return;
      }
      setRows(data.rows || []);
    } catch {
      setMsg("Error de red cargando envíos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(shipmentId) {
    setMsg("");
    setLoadingEvents(true);
    try {
      const res = await fetch(`${API}/shipments/${shipmentId}/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Error cargando historial");
        setEvents([]);
        return;
      }
      setEvents(data.rows || []);
    } catch {
      setMsg("Error de red cargando historial");
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function refreshAll() {
    await fetchMe();
    await loadShipments();
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <Topbar title="Mis envíos" />

      <div className="topbar">
        <h1>Mis envíos</h1>
        <div className="muted">
          {me ? (
            <>
              Cuenta <b>#{me.client_number}</b> — {me.name} ({me.email})
            </>
          ) : (
            "Cargando..."
          )}
        </div>
      </div>

      {/* Resumen + Filtros */}
      <div className="box box--ig">
        <div className="igHeaderRow">
          <div className="igStats">
            <div className="igStatCard">
              <div className="muted">Envíos</div>
              <div className="igStatValue">{rows.length}</div>
              <div className="igStatHint">Total registrados</div>
            </div>

            <div className="igStatCard">
              <div className="muted">Estimado total</div>
              <div className="igStatValue">{fmtUsd(totalEstimated)}</div>
              <div className="igStatHint">Suma de estimados</div>
            </div>
          </div>

          <div className="igActions">
            <button className="btn btnPrimary igBtn" onClick={refreshAll} disabled={loading}>
              {loading ? "..." : "↻ Actualizar"}
            </button>
          </div>
        </div>

        <div className="filters" style={{ marginTop: 12 }}>
          <input
            className="input igInput"
            placeholder="Buscar: código, descripción, tracking, caja, estado..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="muted" style={{ minWidth: 140, textAlign: "right" }}>
            Mostrando <b>{filteredRows.length}</b>
          </div>
        </div>

        <div className="tableWrap" style={{ marginTop: 12 }}>
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
                <tr key={r.id}>
                  <td>
                    <span className="pill pill--ig">{r.code || "-"}</span>
                  </td>

                  <td>{fmtDate(r.date_in)}</td>

                  <td>{r.description || "-"}</td>

                  <td>{r.box_code ? <span className="pill">{r.box_code}</span> : "-"}</td>

                  <td>
                    <TrackingCell value={r.tracking} />
                  </td>

                  <td>{fmtKg(r.weight_kg)}</td>

                  <td>{r.origin || "-"}</td>

                  <td>{r.service || "-"}</td>

                  <td>{fmtUsdKg(r.rate_usd_per_kg)}</td>

                  <td>
                    <b>{fmtUsd(r.estimated_usd)}</b>
                  </td>

                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <StatusBadge status={r.status} />
                      <span style={{ opacity: 0.9 }}>{r.status}</span>
                    </div>
                  </td>

                  <td>
                    <button
                      className="btn igBtn"
                      onClick={() => {
                        const next = openId === r.id ? null : r.id;
                        setOpenId(next);
                        if (next) loadEvents(r.id);
                      }}
                    >
                      {openId === r.id ? "Cerrar" : "Ver"}
                    </button>
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted" style={{ padding: 14 }}>
                    {loading ? "Cargando..." : "No hay resultados con ese filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {openId && (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: "8px 0" }}>Historial del envío #{openId}</h3>

            {loadingEvents ? (
              <div className="muted">Cargando...</div>
            ) : events.length === 0 ? (
              <div className="muted">Sin eventos todavía.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>FECHA</th>
                    <th>DE</th>
                    <th>A</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id || e.created_at}>
                      <td>{fmtDate(e.created_at)}</td>
                      <td>{e.old_status || "-"}</td>
                      <td>
                        <b>{e.new_status}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {msg && <div className="banner">{msg}</div>}
      </div>
    </div>
  );
}