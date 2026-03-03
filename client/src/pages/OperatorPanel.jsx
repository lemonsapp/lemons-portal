import { useEffect, useMemo, useRef, useState } from "react";
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

const DEFAULT_RATES_FALLBACK = {
  usa_normal: 45,
  usa_express: 55,
  china_normal: 58,
  china_express: 68,
  europa_normal: 58,
};

const num = (v, fallback = 0) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const fmtDate = (v) => {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
};

function normalizeOrigin(v) {
  const o = String(v || "").toUpperCase().trim();
  return ORIGINS.includes(o) ? o : "USA";
}

function normalizeService(origin, v) {
  const o = normalizeOrigin(origin);
  if (o === "EUROPA") return "NORMAL";
  const s = String(v || "").toUpperCase().trim();
  return s === "EXPRESS" ? "EXPRESS" : "NORMAL";
}

function getLaneRate({ origin, service, rates, defaults }) {
  const r = rates || {};
  const d = defaults || DEFAULT_RATES_FALLBACK;

  const usaN = numOrNull(r.usa_normal);
  const usaE = numOrNull(r.usa_express);
  const chN = numOrNull(r.china_normal);
  const chE = numOrNull(r.china_express);
  const euN = numOrNull(r.europa_normal);

  if (origin === "USA" && service === "NORMAL") return usaN ?? num(d.usa_normal);
  if (origin === "USA" && service === "EXPRESS") return usaE ?? num(d.usa_express);
  if (origin === "CHINA" && service === "NORMAL") return chN ?? num(d.china_normal);
  if (origin === "CHINA" && service === "EXPRESS") return chE ?? num(d.china_express);
  if (origin === "EUROPA") return euN ?? num(d.europa_normal);

  return 0;
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

  // Buscar cliente
  const [clientNumber, setClientNumber] = useState("");
  const [client, setClient] = useState(null);

  // Tarifas por cliente
  const [defaults, setDefaults] = useState(DEFAULT_RATES_FALLBACK);
  const [rates, setRates] = useState({
    usa_normal: "",
    usa_express: "",
    china_normal: "",
    china_express: "",
    europa_normal: "",
  });
  const [savingRates, setSavingRates] = useState(false);

  // Crear envío
  const [packageCode, setPackageCode] = useState("");
  const [description, setDescription] = useState("");
  const [boxCode, setBoxCode] = useState("");
  const [tracking, setTracking] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [status, setStatus] = useState("Recibido en depósito");
  const [origin, setOrigin] = useState("USA");
  const [service, setService] = useState("NORMAL");

  // Override (crear envío)
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideRate, setOverrideRate] = useState("");

  // Tabla operador
  const [opSearch, setOpSearch] = useState("");
  const [opClientNumber, setOpClientNumber] = useState("");
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [statusDraft, setStatusDraft] = useState({});

  // Historial
  const [openId, setOpenId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Editar envío
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [savingEditId, setSavingEditId] = useState(null);

  // ctx tarifas para edición (cache)
  const [editRateCtx, setEditRateCtx] = useState(null);
  const [editRateLoading, setEditRateLoading] = useState(false);
  const editRateCacheRef = useRef(new Map());

  // ===== helpers crear envío =====
  const laneRate = useMemo(() => {
    return getLaneRate({
      origin: normalizeOrigin(origin),
      service: normalizeService(origin, service),
      rates,
      defaults,
    });
  }, [origin, service, rates, defaults]);

  const appliedRate = useMemo(() => {
    if (!overrideEnabled) return Number(laneRate || 0);
    const o = numOrNull(overrideRate);
    return o ?? 0;
  }, [overrideEnabled, overrideRate, laneRate]);

  const estimated = useMemo(() => {
    const w = num(weightKg, NaN);
    if (!Number.isFinite(w) || w <= 0) return 0;
    return w * Number(appliedRate || 0);
  }, [weightKg, appliedRate]);

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
    if (!res.ok) return setMsg(data?.error || "Error buscando cliente");
    if (!data.user) return setMsg("Cliente no encontrado");

    setClient(data.user);

    const nextDefaults = data.defaults || DEFAULT_RATES_FALLBACK;
    setDefaults(nextDefaults);

    const r = data.rates || null;
    setRates({
      usa_normal: r?.usa_normal ?? "",
      usa_express: r?.usa_express ?? "",
      china_normal: r?.china_normal ?? "",
      china_express: r?.china_express ?? "",
      europa_normal: r?.europa_normal ?? "",
    });
  }

  async function saveClientRates() {
    setMsg("");
    if (!client?.id) return setMsg("Primero buscá un cliente");

    setSavingRates(true);
    try {
      const payload = {
        usa_normal: numOrNull(rates.usa_normal),
        usa_express: numOrNull(rates.usa_express),
        china_normal: numOrNull(rates.china_normal),
        china_express: numOrNull(rates.china_express),
        europa_normal: numOrNull(rates.europa_normal),
      };

      const res = await fetch(`${API}/operator/clients/${client.id}/rates`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) return setMsg(data?.error || "Error guardando tarifas");

      setDefaults(data.defaults || DEFAULT_RATES_FALLBACK);
      setRates({
        usa_normal: data?.rates?.usa_normal ?? "",
        usa_express: data?.rates?.usa_express ?? "",
        china_normal: data?.rates?.china_normal ?? "",
        china_express: data?.rates?.china_express ?? "",
        europa_normal: data?.rates?.europa_normal ?? "",
      });

      editRateCacheRef.current.delete(String(client.client_number));
      setMsg("Tarifas guardadas ✅");
    } catch {
      setMsg("Error guardando tarifas");
    } finally {
      setSavingRates(false);
    }
  }

  async function createShipment() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");
    if (!packageCode || !description || !weightKg)
      return setMsg("Faltan campos obligatorios");

    const weightParsed = num(weightKg, NaN);
    if (!Number.isFinite(weightParsed) || weightParsed <= 0)
      return setMsg("Peso inválido");

    if (overrideEnabled) {
      const r = numOrNull(overrideRate);
      if (r == null || r <= 0) return setMsg("Tarifa manual inválida");
    }

    const body = {
      client_number: client.client_number,
      package_code: packageCode,
      description,
      box_code: boxCode || null,
      tracking: tracking || null,
      weight_kg: weightParsed,
      status,
      origin: normalizeOrigin(origin),
      service: normalizeService(origin, service),
    };

    if (overrideEnabled) {
      const r = Number(numOrNull(overrideRate) || 0);
      body.rate_usd_per_kg = r;
      body.estimated_usd = Number((weightParsed * r).toFixed(2));
    }

    const res = await fetch(`${API}/operator/shipments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
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
    setOverrideEnabled(false);
    setOverrideRate("");

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

    if (openId === shipmentId) await loadEvents(shipmentId);
  }

  async function getRatesCtxForClientNumber(clientNum) {
    const key = String(clientNum);
    const cached = editRateCacheRef.current.get(key);
    if (cached) return cached;

    const res = await fetch(`${API}/operator/clients?client_number=${clientNum}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudieron leer tarifas");

    const ctx = {
      client_number: clientNum,
      defaults: data.defaults || DEFAULT_RATES_FALLBACK,
      rates: data.rates || null,
    };
    editRateCacheRef.current.set(key, ctx);
    return ctx;
  }

  // AUTO: pisa rate con lane; MANUAL: respeta rate escrito y recalcula estimado
  function recalcEdit(nextDraft, row, ctx) {
    const o = normalizeOrigin(nextDraft.origin ?? row.origin ?? "USA");
    const s = normalizeService(o, nextDraft.service ?? row.service ?? "NORMAL");
    const w = num(nextDraft.weight_kg, NaN);
    const override = Boolean(nextDraft.override_edit);

    const autoRate = getLaneRate({
      origin: o,
      service: s,
      rates: {
        usa_normal: ctx?.rates?.usa_normal ?? "",
        usa_express: ctx?.rates?.usa_express ?? "",
        china_normal: ctx?.rates?.china_normal ?? "",
        china_express: ctx?.rates?.china_express ?? "",
        europa_normal: ctx?.rates?.europa_normal ?? "",
      },
      defaults: ctx?.defaults || DEFAULT_RATES_FALLBACK,
    });

    const out = { ...nextDraft, origin: o, service: s };

    if (!override) out.rate_usd_per_kg = String(Number(autoRate || 0).toFixed(2));

    const usedRate = override ? num(out.rate_usd_per_kg, 0) : Number(autoRate || 0);

    if (!Number.isFinite(w) || w <= 0) out.estimated_usd = "";
    else out.estimated_usd = String(Number((w * usedRate).toFixed(2)).toFixed(2));

    return out;
  }

  function updateEditField(field, value) {
    const row = rows.find((x) => x.id === editId);
    if (!row) return;

    const ctx =
      editRateCtx && editRateCtx.client_number === row.client_number
        ? editRateCtx
        : { client_number: row.client_number, defaults: DEFAULT_RATES_FALLBACK, rates: null };

    setEditDraft(recalcEdit({ ...editDraft, [field]: value }, row, ctx));
  }

  function setEditOverrideMode(mode) {
    const row = rows.find((x) => x.id === editId);
    if (!row) return;

    const ctx =
      editRateCtx && editRateCtx.client_number === row.client_number
        ? editRateCtx
        : { client_number: row.client_number, defaults: DEFAULT_RATES_FALLBACK, rates: null };

    const enabled = mode === "MANUAL";
    let base = { ...editDraft, override_edit: enabled };

    if (enabled) {
      // si paso a MANUAL y estaba vacío, arranco con el auto como base
      const o = normalizeOrigin(base.origin ?? row.origin ?? "USA");
      const s = normalizeService(o, base.service ?? row.service ?? "NORMAL");
      const autoRate = getLaneRate({
        origin: o,
        service: s,
        rates: {
          usa_normal: ctx?.rates?.usa_normal ?? "",
          usa_express: ctx?.rates?.usa_express ?? "",
          china_normal: ctx?.rates?.china_normal ?? "",
          china_express: ctx?.rates?.china_express ?? "",
          europa_normal: ctx?.rates?.europa_normal ?? "",
        },
        defaults: ctx?.defaults || DEFAULT_RATES_FALLBACK,
      });

      if (String(base.rate_usd_per_kg ?? "").trim() === "") {
        base.rate_usd_per_kg = String(Number(autoRate || 0).toFixed(2));
      }
    }

    setEditDraft(recalcEdit(base, row, ctx));
  }

  async function startEdit(r) {
    setMsg("");
    setEditId(r.id);

    const initialDraft = {
      package_code: r.code ?? r.package_code ?? "",
      description: r.description ?? "",
      box_code: r.box_code ?? "",
      tracking: r.tracking ?? "",
      weight_kg: String(r.weight_kg ?? ""),
      origin: r.origin ?? "USA",
      service: r.service ?? "NORMAL",
      override_edit: false,
      rate_usd_per_kg: r.rate_usd_per_kg != null ? String(r.rate_usd_per_kg) : "",
      estimated_usd: r.estimated_usd != null ? String(r.estimated_usd) : "",
    };

    setEditDraft(initialDraft);

    setEditRateLoading(true);
    try {
      const ctx = await getRatesCtxForClientNumber(r.client_number);
      setEditRateCtx(ctx);
      setEditDraft(recalcEdit(initialDraft, r, ctx));
    } catch (e) {
      console.error("LOAD EDIT RATES ERROR", e);
      setMsg(String(e?.message || "No se pudieron leer tarifas"));
      setEditRateCtx(null);
      setEditDraft(recalcEdit(initialDraft, r, { defaults: DEFAULT_RATES_FALLBACK, rates: null }));
    } finally {
      setEditRateLoading(false);
    }
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft({});
    setEditRateCtx(null);
    setEditRateLoading(false);
  }

  async function saveEdit(shipmentId) {
    setMsg("");
    setSavingEditId(shipmentId);

    const payload = {
      package_code: (editDraft.package_code || "").trim(),
      description: (editDraft.description || "").trim(),
      box_code: (editDraft.box_code || "").trim() ? (editDraft.box_code || "").trim() : null,
      tracking: (editDraft.tracking || "").trim() ? (editDraft.tracking || "").trim() : null,
      weight_kg: num(editDraft.weight_kg, NaN),

      origin: normalizeOrigin(editDraft.origin),
      service: normalizeService(editDraft.origin, editDraft.service),
      rate_usd_per_kg: editDraft.rate_usd_per_kg === "" ? null : num(editDraft.rate_usd_per_kg, NaN),
      estimated_usd: editDraft.estimated_usd === "" ? null : num(editDraft.estimated_usd, NaN),
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

      {/* CREAR + BUSCAR CLIENTE */}
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

              <div style={{ marginTop: 10 }}>
                <b>Tarifas (USD/kg)</b>
                <div className="muted" style={{ marginBottom: 8 }}>
                  Guardá para que el modo AUTO use estas tarifas.
                </div>

                <div className="grid2" style={{ gap: 10 }}>
                  <div className="col">
                    <label className="muted">USA Normal</label>
                    <input
                      className="input"
                      value={rates.usa_normal}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, usa_normal: e.target.value }))
                      }
                      placeholder={String(defaults.usa_normal)}
                    />
                  </div>

                  <div className="col">
                    <label className="muted">USA Express</label>
                    <input
                      className="input"
                      value={rates.usa_express}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, usa_express: e.target.value }))
                      }
                      placeholder={String(defaults.usa_express)}
                    />
                  </div>

                  <div className="col">
                    <label className="muted">China Normal</label>
                    <input
                      className="input"
                      value={rates.china_normal}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, china_normal: e.target.value }))
                      }
                      placeholder={String(defaults.china_normal)}
                    />
                  </div>

                  <div className="col">
                    <label className="muted">China Express</label>
                    <input
                      className="input"
                      value={rates.china_express}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, china_express: e.target.value }))
                      }
                      placeholder={String(defaults.china_express)}
                    />
                  </div>

                  <div className="col" style={{ gridColumn: "1 / span 2" }}>
                    <label className="muted">Europa</label>
                    <input
                      className="input"
                      value={rates.europa_normal}
                      onChange={(e) =>
                        setRates((r) => ({ ...r, europa_normal: e.target.value }))
                      }
                      placeholder={String(defaults.europa_normal)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={saveClientRates}
                    disabled={savingRates}
                  >
                    {savingRates ? "Guardando..." : "Guardar tarifas"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREAR ENVÍO */}
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

            <select
              className="input"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              title="Origen"
            >
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
              title="Servicio"
            >
              {(SERVICES_BY_ORIGIN[origin] || ["NORMAL"]).map((s) => (
                <option key={s} value={s}>
                  Servicio: {s}
                </option>
              ))}
            </select>
          </div>

          <div className="row">
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", alignItems: "center" }}>
              <StatusBadge status={status} />
            </div>

            <select
              className="input"
              style={{ minWidth: 170, marginLeft: "auto" }}
              value={overrideEnabled ? "MANUAL" : "AUTO"}
              onChange={(e) => {
                const manual = e.target.value === "MANUAL";
                setOverrideEnabled(manual);
                if (!manual) setOverrideRate("");
              }}
              title="Modo tarifa"
            >
              <option value="AUTO">Tarifa: AUTO</option>
              <option value="MANUAL">Tarifa: MANUAL</option>
            </select>
          </div>

          {overrideEnabled && (
            <div className="row">
              <input
                className="input"
                placeholder="Tarifa manual USD/kg"
                value={overrideRate}
                onChange={(e) => setOverrideRate(e.target.value)}
              />
              <div className="muted" style={{ display: "flex", alignItems: "center" }}>
                Se usa solo en este envío
              </div>
            </div>
          )}

          <div className="note" style={{ marginTop: 10 }}>
            <div className="muted">Tarifa aplicada</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>
                {origin} {origin === "EUROPA" ? "" : service}
              </b>
              <b>${Number(appliedRate || 0).toFixed(2)} / kg</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">Estimado (USD)</span>
              <b>${Number(estimated || 0).toFixed(2)}</b>
            </div>
          </div>

          <button className="btn" onClick={createShipment}>
            Guardar envío
          </button>
        </div>
      </div>

      {/* GESTIÓN ENVÍOS */}
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
                <th>ORIGEN</th>
                <th>SERVICIO</th>
                <th>TARIFA</th>
                <th>ESTIMADO</th>
                <th>OVERRIDE</th>
                <th>ESTADO</th>
                <th>GUARDAR</th>
                <th>HISTORIAL</th>
                <th>EDITAR</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const isEditing = editId === r.id;
                const o = normalizeOrigin(isEditing ? editDraft.origin : r.origin);
                const serviceOptions = SERVICES_BY_ORIGIN[o] || ["NORMAL"];
                const override = Boolean(editDraft.override_edit);

                return (
                  <tr key={r.id}>
                    <td>
                      <span className="pill">#{r.client_number}</span>
                      <div className="muted">{r.email}</div>
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.package_code || ""}
                          onChange={(e) => updateEditField("package_code", e.target.value)}
                        />
                      ) : (
                        <span className="pill">{r.code || r.package_code}</span>
                      )}
                    </td>

                    <td>{fmtDate(r.date_in)}</td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.description || ""}
                          onChange={(e) => updateEditField("description", e.target.value)}
                        />
                      ) : (
                        r.description
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.box_code || ""}
                          onChange={(e) => updateEditField("box_code", e.target.value)}
                        />
                      ) : (
                        r.box_code || "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.tracking || ""}
                          onChange={(e) => updateEditField("tracking", e.target.value)}
                        />
                      ) : (
                        r.tracking || "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.weight_kg || ""}
                          onChange={(e) => updateEditField("weight_kg", e.target.value)}
                        />
                      ) : (
                        Number(r.weight_kg).toFixed(2)
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="input"
                          value={editDraft.origin || "USA"}
                          onChange={(e) => updateEditField("origin", e.target.value)}
                        >
                          {ORIGINS.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.origin || "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="input"
                          value={o === "EUROPA" ? "NORMAL" : editDraft.service || "NORMAL"}
                          onChange={(e) => updateEditField("service", e.target.value)}
                          disabled={o === "EUROPA"}
                        >
                          {serviceOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.service || "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={editDraft.rate_usd_per_kg || ""}
                          onChange={(e) => updateEditField("rate_usd_per_kg", e.target.value)}
                          readOnly={!override}
                          title={!override ? "Poné MANUAL para editar tarifa" : "Tarifa manual"}
                        />
                      ) : r.rate_usd_per_kg != null ? (
                        `$${Number(r.rate_usd_per_kg).toFixed(2)}/kg`
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input className="input" value={editDraft.estimated_usd || ""} readOnly />
                      ) : r.estimated_usd != null ? (
                        `$${Number(r.estimated_usd).toFixed(2)}`
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="input"
                          value={override ? "MANUAL" : "AUTO"}
                          onChange={(e) => setEditOverrideMode(e.target.value)}
                          disabled={editRateLoading}
                          title="Modo tarifa"
                        >
                          <option value="AUTO">AUTO</option>
                          <option value="MANUAL">MANUAL</option>
                        </select>
                      ) : (
                        "-"
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
                          disabled={isEditing}
                          title={isEditing ? "Guardá/Cancelá la edición primero" : "Estado"}
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
                        disabled={savingId === r.id || isEditing}
                        title={isEditing ? "Guardá/Cancelá la edición primero" : "Guardar estado"}
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
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn"
                            onClick={() => saveEdit(r.id)}
                            disabled={savingEditId === r.id || editRateLoading}
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
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="muted" style={{ padding: 14 }}>
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

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: cambiás el estado → Guardar → el cliente lo ve al instante en su tabla.
        </div>
      </div>

      {msg && <div className="banner">{msg}</div>}
    </div>
  );
}