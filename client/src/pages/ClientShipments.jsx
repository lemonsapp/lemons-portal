import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

export default function ClientShipments() {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);

  async function loadMe() {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    setMe(data.user);
  }

  async function loadShipments() {
    const res = await fetch(`${API}/client/shipments`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    setRows(data.rows || []);
  }

  async function loadEvents(id) {
    const res = await fetch(`${API}/shipments/${id}/events`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    setEvents(data.rows || []);
  }

  useEffect(() => {
    loadMe();
    loadShipments();
  }, []);

  return (
    <div className="screen">
      <Topbar
        title="Mis envíos"
        right={
          me ? (
            <div className="me">
              <div>
                <b>Cliente #{me.client_number}</b> — {me.name}
              </div>
              <div className="muted">{me.email}</div>
            </div>
          ) : null
        }
      />

      <div className="box">
        <h2>Envíos del usuario</h2>

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
                <th>USD/KG</th>
                <th>ESTIMADO (USD)</th>
                <th>ESTADO</th>
                <th>HISTORIAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="pill">{r.package_code}</span></td>
                  <td>{r.date_in}</td>
                  <td>{r.description}</td>
                  <td>{r.box_code || "-"}</td>
                  <td>{r.tracking || "-"}</td>
                  <td>{Number(r.weight_kg).toFixed(2)}</td>
                  <td>{r.origin_country || "-"}</td>
                  <td>{r.service_level || "-"}</td>
                  <td>{r.rate_usd_per_kg != null ? Number(r.rate_usd_per_kg).toFixed(2) : "-"}</td>
                  <td><b>{r.estimated_usd != null ? Number(r.estimated_usd).toFixed(2) : "-"}</b></td>
                  <td>{r.status}</td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => {
                        setOpenId(r.id);
                        loadEvents(r.id);
                      }}
                    >
                      Ver
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
          <div style={{ marginTop: 16 }}>
            <h3>Historial</h3>
            <ul>
              {events.map((e, idx) => (
                <li key={idx}>
                  {new Date(e.created_at).toLocaleString()} — {e.old_status || "-"} →{" "}
                  <b>{e.new_status}</b>
                </li>
              ))}
              {events.length === 0 && <li className="muted">Sin eventos todavía.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}