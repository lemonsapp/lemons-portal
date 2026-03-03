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

export default function ClientShipments() {
  const [msg, setMsg] = useState("");

  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Historial
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const totalEstimated = useMemo(() => {
    // suma de estimados válidos
    return rows.reduce((acc, r) => {
      const n = num(r.estimated_usd, NaN);
      if (!Number.isFinite(n)) return acc;
      return acc + n;
    }, 0);
  }, [rows]);

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
              Cliente <b>#{me.client_number}</b> — {me.name} ({me.email})
            </>
          ) : (
            "Cargando..."
          )}
        </div>
      </div>

      <div className="box">
        <div className="filters" style={{ alignItems: "center" }}>
          <button className="btn" onClick={refreshAll} disabled={loading}>
            {loading ? "..." : "↻ Actualizar"}
          </button>

          <div className="note" style={{ marginLeft: "auto", minWidth: 260 }}>
            <div className="muted">Estimado total (USD)</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{rows.length} envíos</b>
              <b>{fmtUsd(totalEstimated)}</b>
            </div>
          </div>
        </div>

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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="pill">{r.code || "-"}</span>
                  </td>

                  <td>{fmtDate(r.date_in)}</td>

                  <td>{r.description || "-"}</td>

                  <td>{r.box_code || "-"}</td>

                  <td>{r.tracking || "-"}</td>

                  <td>{fmtKg(r.weight_kg)}</td>

                  <td>{r.origin || "-"}</td>

                  <td>{r.service || "-"}</td>

                  <td>{fmtUsdKg(r.rate_usd_per_kg)}</td>

                  <td>{fmtUsd(r.estimated_usd)}</td>

                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <StatusBadge status={r.status} />
                      <span>{r.status}</span>
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
                    >
                      {openId === r.id ? "Cerrar" : "Ver"}
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted" style={{ padding: 14 }}>
                    {loading ? "Cargando..." : "No tenés envíos todavía."}
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