import { useEffect, useMemo, useState } from "react";
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

const ORIGINS = ["USA", "CHINA", "EUROPA"];
const SERVICES_BY_ORIGIN = {
  USA: ["NORMAL", "EXPRESS"],
  CHINA: ["NORMAL", "EXPRESS"],
  EUROPA: ["NORMAL"],
};

const DEFAULT_RATES = {
  usa_normal: 45,
  usa_express: 55,
  china_normal: 58,
  china_express: 68,
  europa: 58,
};

function toNum(v) {
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

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

  // Buscar cliente (para crear envío)
  const [clientNumber, setClientNumber] = useState("");
  const [client, setClient] = useState(null);

  // ====== TARIFAS (POR CLIENTE - DB) ======
  const [rates, setRates] = useState({ ...DEFAULT_RATES });
  const [savingRates, setSavingRates] = useState(false);

  // Crear envío
  const [packageCode, setPackageCode] = useState("");
  const [description, setDescription] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [tracking, setTracking] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [status, setStatus] = useState("Recibido en depósito");

  // Origen + servicio
  const [origin, setOrigin] = useState("USA");
  const [service, setService] = useState("NORMAL");

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

  // ===== tarifa aplicada según selección =====
  const rateForSelection = useMemo(() => {
    if (origin === "USA" && service === "NORMAL") return toNum(rates.usa_normal);
    if (origin === "USA" && service === "EXPRESS") return toNum(rates.usa_express);
    if (origin === "CHINA" && service === "NORMAL") return toNum(rates.china_normal);
    if (origin === "CHINA" && service === "EXPRESS") return toNum(rates.china_express);
    if (origin === "EUROPA") return toNum(rates.europa);
    return 0;
  }, [origin, service, rates]);

  const estimated = useMemo(() => {
    const w = toNum(weightKg);
    if (!w || w <= 0) return 0;
    return w * rateForSelection;
  }, [weightKg, rateForSelection]);

  useEffect(() => {
    const allowed = SERVICES_BY_ORIGIN[origin] || ["NORMAL"];
    if (!allowed.includes(service)) setService(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

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
      }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error creando cliente");

    setMsg(`Cliente creado: #${data.user.client_number} — ${data.user.email}`);
    setNewClientNumber("");
    setNewName("");
    setNewEmail("");
    setNewPassword("");

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

    // ✅ cargar tarifas por cliente desde DB
    setRates({
      usa_normal: data.user.rate_usa_normal ?? DEFAULT_RATES.usa_normal,
      usa_express: data.user.rate_usa_express ?? DEFAULT_RATES.usa_express,
      china_normal: data.user.rate_china_normal ?? DEFAULT_RATES.china_normal,
      china_express: data.user.rate_china_express ?? DEFAULT_RATES.china_express,
      europa: data.user.rate_europa ?? DEFAULT_RATES.europa,
    });
  }

  async function saveClientRates() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");

    setSavingRates(true);
    try {
      const payload = {
        rate_usa_normal: toNum(rates.usa_normal),
        rate_usa_express: toNum(rates.usa_express),
        rate_china_normal: toNum(rates.china_normal),
        rate_china_express: toNum(rates.china_express),
        rate_europa: toNum(rates.europa),
      };

      const res = await fetch(
        `${API}/operator/clients/${client.client_number}/rates`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data?.error || "Error guardando tarifas");

      setMsg("Tarifas guardadas ✅");

      // refresco client con lo que devolvió backend
      setClient(data.user);
      setRates({
        usa_normal: data.user.rate_usa_normal,
        usa_express: data.user.rate_usa_express,
        china_normal: data.user.rate_china_normal,
        china_express: data.user.rate_china_express,
        europa: data.user.rate_europa,
      });
    } finally {
      setSavingRates(false);
    }
  }

  async function createShipment() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");
    if (!packageCode || !description || !weightKg)
      return setMsg("Faltan campos obligatorios");

    const weightParsed = toNum(weightKg);
    if (!weightParsed || weightParsed <= 0) return setMsg("Peso inválido");

    const appliedRate = rateForSelection;
    const appliedService = origin === "EUROPA" ? "NORMAL" : service;
    const est = Number((weightParsed * appliedRate).toFixed(2));

    const res = await fetch(`${API}/operator/shipments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_number: client.client_number,
        package_code: packageCode.trim(),
        description: description.trim(),
        box_code: (boxCode || "").trim() ? boxCode.trim() : null,
        tracking: (tracking || "").trim() ? tracking.trim() : null,
        weight_kg: weightParsed,
        status,

        origin,
        service: appliedService,
        rate_usd_per_kg: appliedRate,
        estimated_usd: est,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data?.error || "Error interno");

    setMsg(`Envío creado: ${data.shipment?.code || packageCode}`);
    setPackageCode("");
    setDescription("");
    setBoxCode("");
    setTracking("");
    setWeightKg("");
    setStatus("Recibido en depósito");
    setOrigin("USA");
    setService("NORMAL");

    await loadOperatorShipments();
    await loadDashboard();
  }

  async function loadOperatorShipments() {
    setMsg("");
    const qs = new URLSearchParams();
    if (opSearch.trim()) qs.set("search", opSearch.trim());
    if (opClientNumber.trim() !== "") qs.set("client_number", opClientNumber.trim());

    const res = await fetch(`${API}/operator/shipments?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await res.json().catch(() => ({}));
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

    const data = await res.json().catch(() => ({}));
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

    const data = await res.json().catch(() => ({}));
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
      package_code: r.code ?? "",
      description: r.description ?? "",
      box_code: r.box_code ?? "",
      tracking: r.tracking ?? "",
      weight_kg: String(r.weight_kg ?? ""),

      origin: r.origin ?? "USA",
      service: r.service ?? "NORMAL",
      rate_usd_per_kg: String(r.rate_usd_per_kg ?? ""),
      estimated_usd: String(r.estimated_usd ?? ""),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft({});
  }

  async function saveEdit(shipmentId) {
    setMsg("");
    setSavingEditId(shipmentId);

    const payload = {
      package_code: (editDraft.package_code || "").trim(),
      description: (editDraft.description || "").trim(),
      box_code: (editDraft.box_code || "").trim() ? (editDraft.box_code || "").trim() : null,
      tracking: (editDraft.tracking || "").trim() ? (editDraft.tracking || "").trim() : null,
      weight_kg: toNum(editDraft.weight_kg),

      origin: (editDraft.origin || "").trim() || null,
      service: (editDraft.service || "").trim() || null,
      rate_usd_per_kg: editDraft.rate_usd_per_kg === "" ? null : toNum(editDraft.rate_usd_per_kg),
      estimated_usd: editDraft.estimated_usd === "" ? null : toNum(editDraft.estimated_usd),
    };

    if (!payload.package_code || !payload.description || !payload.weight_kg) {
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

    const data = await res.json().catch(() => ({}));
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
          <div className="v">{loadingStats ? "…" : Number(stats?.total_weight ?? 0).toFixed(2)}</div>
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
            <input className="input" placeholder="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="input" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <input
              className="input"
              placeholder="Contraseña (mín 6)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
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

              {/* ✅ Tarifas con labels al lado (como pediste) */}
              <div style={{ marginTop: 12 }}>
                <b>Tarifas del cliente (USD/kg)</b>
                <div className="muted" style={{ marginBottom: 8 }}>
                  Se guardan en la base y se usan al crear envíos.
                </div>

                <div className="col" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 140 }} className="muted">
                      USA NORMAL
                    </div>
                    <input
                      className="input"
                      value={rates.usa_normal}
                      onChange={(e) => setRates((r) => ({ ...r, usa_normal: e.target.value }))}
                    />
                  </div>

                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 140 }} className="muted">
                      USA EXPRESS
                    </div>
                    <input
                      className="input"
                      value={rates.usa_express}
                      onChange={(e) => setRates((r) => ({ ...r, usa_express: e.target.value }))}
                    />
                  </div>

                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 140 }} className="muted">
                      CHINA NORMAL
                    </div>
                    <input
                      className="input"
                      value={rates.china_normal}
                      onChange={(e) => setRates((r) => ({ ...r, china_normal: e.target.value }))}
                    />
                  </div>

                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 140 }} className="muted">
                      CHINA EXPRESS
                    </div>
                    <input
                      className="input"
                      value={rates.china_express}
                      onChange={(e) => setRates((r) => ({ ...r, china_express: e.target.value }))}
                    />
                  </div>

                  <div className="row" style={{ gap: 10 }}>
                    <div style={{ width: 140 }} className="muted">
                      EUROPA
                    </div>
                    <input
                      className="input"
                      value={rates.europa}
                      onChange={(e) => setRates((r) => ({ ...r, europa: e.target.value }))}
                    />
                  </div>

                  <button className="btn" onClick={saveClientRates} disabled={savingRates}>
                    {savingRates ? "Guardando..." : "Guardar tarifas del cliente"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="box" style={{ marginTop: 12 }}>
        <h2>Crear nuevo envío</h2>
        <div className="col">
          <div className="muted">Primero buscá un cliente arriba, y después cargá el envío.</div>

          <input className="input" placeholder="Código de paquete" value={packageCode} onChange={(e) => setPackageCode(e.target.value)} />
          <input className="input" placeholder="Descripción item" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div className="row">
            <input className="input" placeholder="Caja (opcional)" value={boxCode} onChange={(e) => setBoxCode(e.target.value)} />
            <input className="input" placeholder="Tracking (opcional)" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>

          <div className="row">
            <input className="input" placeholder="Peso (kg) ej: 0.5" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />

            <select className="input" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {ORIGINS.map((o) => (
                <option key={o} value={o}>
                  Origen: {o}
                </option>
              ))}
            </select>

            <select
              className="input"
              value={origin === "EUROPA" ? "NORMAL" : service}
              onChange={(e) => setService(e.target.value)}
              disabled={origin === "EUROPA"}
            >
              {(SERVICES_BY_ORIGIN[origin] || ["NORMAL"]).map((s) => (
                <option key={s} value={s}>
                  Servicio: {s}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
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

            <div className="note" style={{ marginLeft: "auto", minWidth: 320 }}>
              <div className="muted">Tarifa aplicada (cliente)</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b>
                  {origin} {origin === "EUROPA" ? "" : service}
                </b>
                <b>${Number(rateForSelection || 0).toFixed(2)} / kg</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Estimado (USD)</span>
                <b>${Number(estimated || 0).toFixed(2)}</b>
              </div>
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
            placeholder="Buscar: código, tracking, descripción..."
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
                <th>ORIGEN</th>
                <th>SERVICIO</th>
                <th>TARIFA</th>
                <th>ESTIMADO</th>
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
                        onChange={(e) => setEditDraft((d) => ({ ...d, package_code: e.target.value }))}
                      />
                    ) : (
                      <span className="pill">{r.code}</span>
                    )}
                  </td>

                  <td>{r.date_in}</td>

                  <td>
                    {editId === r.id ? (
                      <input
                        className="input"
                        value={editDraft.description || ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
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
                        onChange={(e) => setEditDraft((d) => ({ ...d, box_code: e.target.value }))}
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
                        onChange={(e) => setEditDraft((d) => ({ ...d, tracking: e.target.value }))}
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
                        onChange={(e) => setEditDraft((d) => ({ ...d, weight_kg: e.target.value }))}
                      />
                    ) : (
                      Number(r.weight_kg).toFixed(2)
                    )}
                  </td>

                  <td>{r.origin || "-"}</td>
                  <td>{r.service || "-"}</td>
                  <td>{r.rate_usd_per_kg != null ? `$${Number(r.rate_usd_per_kg).toFixed(2)}/kg` : "-"}</td>
                  <td>{r.estimated_usd != null ? `$${Number(r.estimated_usd).toFixed(2)}` : "-"}</td>

                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <select
                        className="input"
                        value={statusDraft[r.id] || r.status}
                        onChange={(e) => setStatusDraft((s) => ({ ...s, [r.id]: e.target.value }))}
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
                    <button className="btn" onClick={() => saveStatus(r.id)} disabled={savingId === r.id}>
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
                        <button className="btn" onClick={() => saveEdit(r.id)} disabled={savingEditId === r.id}>
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
                  <td colSpan={15} className="muted" style={{ padding: 14 }}>
                    No hay resultados.
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

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: cambiás el estado → Guardar → el cliente lo ve al instante en su tabla.
        </div>
      </div>

      {msg && <div className="banner">{msg}</div>}
    </div>
  );
}