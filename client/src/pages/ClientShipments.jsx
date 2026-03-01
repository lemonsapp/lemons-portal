import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

export default function ClientShipments() {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState("");

  async function loadMe() {
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data?.error || "No autorizado");
      setMe(data.user);
    } catch {
      setMsg("No se pudo cargar el usuario.");
    }
  }

  async function loadShipments() {
    try {
      const res = await fetch(`${API}/client/shipments`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data?.error || "No se pudieron cargar envíos");
      setRows(data.rows || []);
    } catch {
      setMsg("No se pudieron cargar los envíos.");
    }
  }

  async function loadEvents(id) {
    try {
      const res = await fetch(`${API}/shipments/${id}/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      setEvents(res.ok ? data.rows || [] : []);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    loadMe();
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <Topbar title="Mis envíos" />

      <div className="box">
        <h2>Envíos</h2>

        {me ? (
          <div className="note" style={{ marginBottom: 12 }}>
            <div>
              <b>Cliente #{me.client_number}</b> — {me.name}
            </div>
            <div className="muted">{me.email}</div>
          </div>
        ) : null}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>FECHA</th>
                <th>DESCRIPCIÓN</th>
                <th>CAJA</th>
                <th>TRACKING</th>
                <th>PESO [KG]</th>
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
                    <span className="pill">{r.package_code || r.code}</span>
                  </td>
                  <td>{r.date_in}</td>
                  <td>{r.description}</td>
                  <td>{r.box_code || "-"}</td>
                  <td>{r.tracking || "-"}</td>
                  <td>{Number(r.weight_kg ?? 0).toFixed(2)}</td>
                  <td>{r.origin || "-"}</td>
                  <td>{r.service || "-"}</td>
                  <td>
                    {r.rate_usd_per_kg != null
                      ? `$${Number(r.rate_usd_per_kg).toFixed(2)}/kg`
                      : "-"}
                  </td>
                  <td>
                    {r.estimated_usd != null
                      ? `$${Number(r.estimated_usd).toFixed(2)}`
                      : "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span>{r.status}</span>
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
                    >
                      {openId === r.id ? "Cerrar" : "Ver"}
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted" style={{ padding: 14 }}>
                    No hay envíos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {openId && (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: "8px 0" }}>Historial del envío #{openId}</h3>

            {events.length === 0 ? (
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
                  {events.map((e, idx) => (
                    <tr key={e.id || idx}>
                      <td>{new Date(e.created_at).toLocaleString()}</td>
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

        {msg ? <div className="banner">{msg}</div> : null}
      </div>
    </div>
  );
}