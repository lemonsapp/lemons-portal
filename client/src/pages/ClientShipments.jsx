import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

export default function ClientShipments() {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [openId, setOpenId] = useState(null);

  async function loadMe() {
    const res = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (res.ok) setMe(data.user);
  }

  async function loadShipments() {
    const res = await fetch(`${API}/client/shipments`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (res.ok) setRows(data.rows || []);
  }

  async function loadEvents(id) {
    const res = await fetch(`${API}/shipments/${id}/events`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (res.ok) setEvents(data.rows || []);
  }

  useEffect(() => {
    loadMe();
    loadShipments();
  }, []);

  return (
    <div className="screen">
      <Topbar title="Mis envíos" />

      <div className="box">
        <h2>Envíos del cliente</h2>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>FECHA</th>
                <th>DESCRIPCIÓN</th>
                <th>PESO</th>
                <th>ESTADO</th>
                <th>HISTORIAL</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.package_code}</td>
                  <td>{r.date_in}</td>
                  <td>{r.description}</td>
                  <td>{Number(r.weight_kg).toFixed(2)}</td>
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
                  <td colSpan={6}>No hay envíos todavía</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {openId && (
          <div style={{ marginTop: 20 }}>
            <h3>Historial</h3>
            <ul>
              {events.map((e, i) => (
                <li key={i}>
                  {new Date(e.created_at).toLocaleString()} — {e.old_status} →{" "}
                  {e.new_status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}