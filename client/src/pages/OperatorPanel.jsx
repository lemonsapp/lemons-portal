import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const STATUSES = [
  "Recibido en depósito",
  "En preparación",
  "Despachado",
  "En tránsito",
  "Listo para entrega",
  "Entregado",
];

const TARIFFS = [
  { code: "USA_NORMAL", label: "USA NORMAL — USD 45/kg" },
  { code: "USA_EXPRESS", label: "USA EXPRESS — USD 55/kg" },
  { code: "CHINA_NORMAL", label: "CHINA NORMAL — USD 58/kg" },
  { code: "CHINA_EXPRESS", label: "CHINA EXPRESS — USD 68/kg" },
  { code: "EUROPA", label: "EUROPA — USD 58/kg" },
];

export default function OperatorPanel() {
  const [msg, setMsg] = useState("");

  // Dashboard stats
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Crear cliente
  const [newClientNumber, setNewClientNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newTariff, setNewTariff] = useState("USA_NORMAL");

  // Buscar cliente (para crear envío)
  const [clientNumber, setClientNumber] = useState("");
  const [client, setClient] = useState(null);

  // Tarifa por cliente
  const [tariffDraft, setTariffDraft] = useState("USA_NORMAL");
  const [savingTariff, setSavingTariff] = useState(false);

  // Crear envío
  const [packageCode, setPackageCode] = useState("");
  const [description, setDescription] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [tracking, setTracking] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [status, setStatus] = useState("Recibido en depósito");

  // Gestión envíos (tabla)
  const [opSearch, setOpSearch] = useState("");
  const [opClientNumber, setOpClientNumber] = useState("");
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [statusDraft, setStatusDraft] = useState({});

  // Historial (events)
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Editar envío
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [savingEditId, setSavingEditId] = useState(null);

  async function loadDashboard() {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API}/operator/dashboard`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) setStats(data.stats);
    } catch {
      // no-op
    } finally {
      setLoadingStats(false);
    }
  }

  async function createClient() {
    setMsg("");
    const n = Number(newClientNumber);
    if (Number.isNaN(n) || n < 0) return setMsg("Número de cliente inválido");
    if (!newName || !newEmail || !newPassword)
      return setMsg("Completá nombre, email y contraseña");

    const res = await fetch(`${API}/operator/clients`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_number: n,
        name: newName,
        email: newEmail,
        password: newPassword,
        role: "client",
        tariff_code: newTariff,
      }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error creando cliente");

    setMsg(`Cliente creado: #${data.user.client_number} — ${data.user.email}`);
    setNewClientNumber("");
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewTariff("USA_NORMAL");

    await loadDashboard();
  }

  async function findClient() {
    setMsg("");
    setClient(null);

    const n = Number(clientNumber);
    if (Number.isNaN(n)) return setMsg("Número inválido");

    const res = await fetch(`${API}/operator/clients?client_number=${n}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await res.json();
    if (!data.user) return setMsg("Cliente no encontrado");

    setClient(data.user);
    setTariffDraft(data.user.tariff_code || "USA_NORMAL");
  }

  async function saveClientTariff() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");
    setSavingTariff(true);

    const res = await fetch(
      `${API}/operator/clients/${client.client_number}/tariff`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tariff_code: tariffDraft }),
      }
    );

    const data = await res.json();
    setSavingTariff(false);

    if (!res.ok) return setMsg(data?.error || "Error guardando tarifa");

    setClient(data.user);
    setMsg(
      `Tarifa actualizada para Cliente #${data.user.client_number}: ${data.user.tariff_code} (USD ${data.user.tariff_usd_per_kg}/kg)`
    );
  }

  function parseKg(input) {
    // acepta 0,5 o 0.5
    const s = String(input || "").trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  async function createShipment() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");
    if (!packageCode || !description || !weightKg)
      return setMsg("Faltan campos obligatorios");

    const kg = parseKg(weightKg);
    if (!Number.isFinite(kg) || kg <= 0) return setMsg("Peso inválido");

    const res = await fetch(`${API}/operator/shipments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_number: client.client_number,
        package_code: packageCode,
        description,
        box_code: boxCode || null,
        tracking: tracking || null,
        weight_kg: kg,
        status,
      }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error creando envío");

    setMsg(`Envío creado: ${data.shipment.package_code}`);
    setPackageCode("");
    setDescription("");
    setBoxCode("");
    setTracking("");
    setWeightKg("");
    setStatus("Recibido en depósito");

    await loadOperatorShipments();
    await loadDashboard();
  }

  async function loadOperatorShipments() {
    setMsg("");
    const qs = new URLSearchParams();
    if (opSearch.trim()) qs.set("search", opSearch.trim());
    if (opClientNumber.trim() !== "")
      qs.set("client_number", opClientNumber.trim());

    const res = await fetch(`${API}/operator/shipments?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error cargando envíos");

    const list = data.rows || [];
    setRows(list);

    const nextDraft = {};
    list.forEach((r) => (nextDraft[r.id] = r.status));
    setStatusDraft(nextDraft);
  }

  async function loadEvents(shipmentId) {
    setLoadingEvents(true);

    const res = await fetch(`${API}/shipments/${shipmentId}/events`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await res.json();
    setLoadingEvents(false);

    if (!res.ok) {
      setMsg(data?.error || "Error cargando historial");
      setEvents([]);
      return;
    }

    setEvents(data.rows || []);
  }

  async function saveStatus(shipmentId) {
    setMsg("");
    const newStatus = statusDraft[shipmentId];
    if (!newStatus) return;

    setSavingId(shipmentId);

    const res = await fetch(`${API}/operator/shipments/${shipmentId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();
    setSavingId(null);

    if (!res.ok) return setMsg(data?.error || "Error actualizando estado");

    setMsg(`Estado actualizado: ${newStatus}`);
    await loadOperatorShipments();
    await loadDashboard();

    if (openId === shipmentId) {
      await loadEvents(shipmentId);
    }
  }

  function startEdit(r) {
    setEditId(r.id);
    setEditDraft({
      package_code: r.package_code ?? "",
      description: r.description ?? "",
      box_code: r.box_code ?? "",
      tracking: r.tracking ?? "",
      weight_kg: String(r.weight_kg ?? ""),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft({});
  }

  async function saveEdit(shipmentId) {
    setMsg("");
    setSavingEditId(shipmentId);

    const kg = parseKg(editDraft.weight_kg);

    const payload = {
      package_code: (editDraft.package_code || "").trim(),
      description: (editDraft.description || "").trim(),
      box_code: (editDraft.box_code || "").trim()
        ? (editDraft.box_code || "").trim()
        : null,
      tracking: (editDraft.tracking || "").trim()
        ? (editDraft.tracking || "").trim()
        : null,
      weight_kg: kg,
    };

    if (!payload.package_code || !payload.description || !Number.isFinite(payload.weight_kg)) {
      setSavingEditId(null);
      return setMsg("Revisá código, descripción y peso (kg)");
    }

    const res = await fetch(`${API}/operator/shipments/${shipmentId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSavingEditId(null);

    if (!res.ok) return setMsg(data?.error || "Error guardando cambios");

    setMsg("Cambios guardados");
    cancelEdit();
    await loadOperatorShipments();
    await loadDashboard();
  }

  async function refreshAll() {
    await loadOperatorShipments();
    await loadDashboard();
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <Topbar title="Panel Operador" />

      <div className="topbar">
        <h1>Panel Operador</h1>
        <div className="muted">LEMON&apos;s — carga y control de paquetes</div>
      </div>

      {/* DASHBOARD */}
      <div className="cards">
        <div className="cardStat">
          <div className="k">Total envíos</div>
          <div className="v">{loadingStats ? "…" : stats?.total ?? 0}</div>
          <div className="s">Todos los estados</div>
        </div>

        <div className="cardStat">
          <div className="k">Recibidos</div>
          <div className="v">{loadingStats ? "…" : stats?.received ?? 0}</div>
          <div className="s">En depósito</div>
        </div>

        <div className="cardStat">
          <div className="k">Preparación</div>
          <div className="v">{loadingStats ? "…" : stats?.prep ?? 0}</div>
          <div className="s">Armado / control</div>
        </div>

        <div className="cardStat">
          <div className="k">Despachados</div>
          <div className="v">{loadingStats ? "…" : stats?.sent ?? 0}</div>
          <div className="s">Salieron del depósito</div>
        </div>

        <div className="cardStat">
          <div className="k">En tránsito</div>
          <div className="v">{loadingStats ? "…" : stats?.transit ?? 0}</div>
          <div className="s">Viajando</div>
        </div>

        <div className="cardStat">
          <div className="k">Listo entrega</div>
          <div className="v">{loadingStats ? "…" : stats?.ready ?? 0}</div>
          <div className="s">Última milla</div>
        </div>

        <div className="cardStat">
          <div className="k">Entregados</div>
          <div className="v">{loadingStats ? "…" : stats?.delivered ?? 0}</div>
          <div className="s">Cerrados</div>
        </div>

        <div className="cardStat">
          <div className="k">Peso total</div>
          <div className="v">
            {loadingStats ? "…" : Number(stats?.total_weight ?? 0).toFixed(2)}
          </div>
          <div className="s">kg acumulados</div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="box">
          <h2>Crear cliente</h2>
          <div className="col">
            <input
              className="input"
              placeholder="Cliente # (0, 1, 2...)"
              value={newClientNumber}
              onChange={(e) => setNewClientNumber(e.target.value)}
            />
            <input
              className="input"
              placeholder="Nombre"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <input
              className="input"
              placeholder="Contraseña (mín 6)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            <select
              className="input"
              value={newTariff}
              onChange={(e) => setNewTariff(e.target.value)}
            >
              {TARIFFS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>

            <button className="btn" onClick={createClient}>
              Crear cliente
            </button>
          </div>
        </div>

        <div className="box">
          <h2>Buscar cliente</h2>
          <div className="row">
            <input
              className="input"
              placeholder="Cliente # (ej: 0)"
              value={clientNumber}
              onChange={(e) => setClientNumber(e.target.value)}
            />
            <button className="btn" onClick={findClient}>
              Buscar
            </button>
          </div>

          {client && (
            <div className="note">
              <div>
                <b>Cliente #{client.client_number}</b> — {client.name}
              </div>
              <div className="muted">{client.email}</div>

              <div style={{ marginTop: 10 }} className="row">
                <select
                  className="input"
                  value={tariffDraft}
                  onChange={(e) => setTariffDraft(e.target.value)}
                >
                  {TARIFFS.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <button className="btn" onClick={saveClientTariff} disabled={savingTariff}>
                  {savingTariff ? "..." : "Guardar tarifa"}
                </button>
              </div>

              <div className="muted" style={{ marginTop: 6 }}>
                Actual: <b>{client.tariff_code}</b> — USD{" "}
                <b>{Number(client.tariff_usd_per_kg || 0).toFixed(2)}</b>/kg
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="box" style={{ marginTop: 12 }}>
        <h2>Crear nuevo envío</h2>
        <div className="col">
          <div className="muted">
            Primero buscá un cliente arriba, y después cargá el envío.
          </div>

          <input
            className="input"
            placeholder="Código de paquete"
            value={packageCode}
            onChange={(e) => setPackageCode(e.target.value)}
          />
          <input
            className="input"
            placeholder="Descripción item"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="row">
            <input
              className="input"
              placeholder="Caja (opcional)"
              value={boxCode}
              onChange={(e) => setBoxCode(e.target.value)}
            />
            <input
              className="input"
              placeholder="Tracking (opcional)"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </div>

          <div className="row">
            <input
              className="input"
              placeholder="Peso (kg) ej: 0.5"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
            />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center" }}>
              <StatusBadge status={status} />
            </div>
          </div>

          <button className="btn" onClick={createShipment}>
            Guardar envío
          </button>
        </div>
      </div>

      <div className="box" style={{ marginTop: 12 }}>
        <h2>Gestión de envíos (Operador)</h2>

        <div className="filters">
          <input
            className="input"
            placeholder="Buscar: código, tracking, descripción, caja..."
            value={opSearch}
            onChange={(e) => setOpSearch(e.target.value)}
          />
          <input
            className="input"
            placeholder="Cliente # (opcional)"
            value={opClientNumber}
            onChange={(e) => setOpClientNumber(e.target.value)}
          />
          <button className="btn" onClick={refreshAll}>
            ↻
          </button>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>CÓDIGO</th>
                <th>FECHA</th>
                <th>DESCRIPCIÓN</th>
                <th>CAJA</th>
                <th>TRACKING</th>
                <th>PESO [KG]</th>
                <th>ESTADO</th>
                <th>GUARDAR</th>
                <th>HISTORIAL</th>
                <th>EDITAR</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="pill">#{r.client_number}</span>
                    <div className="muted">{r.email}</div>
                  </td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.package_code || ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            package_code: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span className="pill">{r.package_code}</span>
                    )}
                  </td>

                  <td>{r.date_in}</td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.description || ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            description: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      r.description
                    )}
                  </td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.box_code || ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            box_code: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      r.box_code || "-"
                    )}
                  </td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.tracking || ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            tracking: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      r.tracking || "-"
                    )}
                  </td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.weight_kg || ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            weight_kg: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      Number(r.weight_kg).toFixed(2)
                    )}
                  </td>

                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <select
                        className="input"
                        value={statusDraft[r.id] || r.status}
                        onChange={(e) =>
                          setStatusDraft((s) => ({ ...s, [r.id]: e.target.value }))
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <StatusBadge status={statusDraft[r.id] || r.status} />
                    </div>
                  </td>

                  <td>
                    <button
                      className="btn"
                      onClick={() => saveStatus(r.id)}
                      disabled={savingId === r.id}
                    >
                      {savingId === r.id ? "..." : "Guardar"}
                    </button>
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

                  <td>
                    {editId === r.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn"
                          onClick={() => saveEdit(r.id)}
                          disabled={savingEditId === r.id}
                        >
                          {savingEditId === r.id ? "..." : "Guardar"}
                        </button>
                        <button className="btn" onClick={cancelEdit}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button className="btn" onClick={() => startEdit(r)}>
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="muted" style={{ padding: 14 }}>
                    No hay resultados. Probá con el botón ↻ o ajustá el filtro.
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
                    <tr key={e.id || `${e.created_at}-${e.new_status}`}>
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

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: cambiás el estado → Guardar → el cliente lo ve al instante en su tabla.
        </div>
      </div>

      {msg && <div className="banner">{msg}</div>}
    </div>
  );
}