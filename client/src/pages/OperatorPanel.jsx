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
  USA: ["NORMAL", "EXPRESS", "TECH_PREMIUM"],
  CHINA: ["NORMAL", "EXPRESS"],
  EUROPA: ["NORMAL"],
};

const DEFAULT_RATES_FALLBACK = {
  usa_normal: 45,
  usa_express:      55,
  usa_tech_premium: 75, // Tecnología Premium
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
    return new Date(v).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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
  if (s === "TECH_PREMIUM" && o === "USA") return "TECH_PREMIUM";
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
  const usaTP = numOrNull(r.usa_tech_premium);
  if (origin === "USA" && service === "NORMAL")       return usaN  ?? num(d.usa_normal);
  if (origin === "USA" && service === "EXPRESS")      return usaE  ?? num(d.usa_express);
  if (origin === "USA" && service === "TECH_PREMIUM") return usaTP ?? num(d.usa_tech_premium ?? 75);
  if (origin === "CHINA" && service === "NORMAL")     return chN   ?? num(d.china_normal);
  if (origin === "CHINA" && service === "EXPRESS")    return chE   ?? num(d.china_express);
  if (origin === "EUROPA") return euN ?? num(d.europa_normal);
  return 0;
}

// ── Mini componente: campo de tarifa ──────────────────────────────────────────
function RateField({ label, value, placeholder, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>USD/kg</span>
      </div>
      <input
        className="input"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Mini componente: stat card del dashboard ──────────────────────────────────
function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      position: "relative",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16,
      padding: "14px 16px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      {/* accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: accent || "linear-gradient(90deg,#ffd200,#ff8a00)",
        borderRadius: "16px 16px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", color: "#fff", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Mini componente: label de sección ─────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
    }}>
      <div style={{
        width: 3, height: 18, borderRadius: 999,
        background: "linear-gradient(180deg,#ffd200,#ff8a00)",
      }} />
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "0.1px" }}>{children}</h2>
    </div>
  );
}

// ── Mini componente: panel colapsable ─────────────────────────────────────────
function Panel({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 18,
      overflow: "hidden",
      marginTop: 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 16px", background: "none", border: "none", cursor: "pointer",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.1px" }}>{title}</span>
        </div>
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,0.40)",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px 16px" }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 14 }} />
          {children}
        </div>
      )}
    </div>
  );
}

// ── Mensaje de estado (banner) ────────────────────────────────────────────────
function MsgBanner({ msg }) {
  if (!msg) return null;
  const isError = /error|inválid|falt|no se|primero/i.test(msg);
  return (
    <div style={{
      margin: "10px 0",
      padding: "11px 16px",
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      background: isError ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
      border: `1px solid ${isError ? "rgba(239,68,68,0.28)" : "rgba(34,197,94,0.28)"}`,
      color: isError ? "#fca5a5" : "#86efac",
    }}>
      {isError ? "⚠ " : "✓ "}{msg}
    </div>
  );
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
    usa_normal: "", usa_express: "", usa_tech_premium: "",
    china_normal: "", china_express: "",
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

  // ── helpers crear envío ───────────────────────────────────────────────────
  const laneRate = useMemo(() => getLaneRate({
    origin: normalizeOrigin(origin),
    service: normalizeService(origin, service),
    rates, defaults,
  }), [origin, service, rates, defaults]);

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
  }, [origin]); // eslint-disable-line

  // ── API calls ─────────────────────────────────────────────────────────────
  async function loadDashboard() {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API}/operator/dashboard`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) setStats(data.stats);
    } catch { /* no-op */ }
    finally { setLoadingStats(false); }
  }

  async function createClient() {
    setMsg("");
    const n = Number(newClientNumber);
    if (Number.isNaN(n) || n < 0) return setMsg("Número de cliente inválido");
    if (!newName || !newEmail || !newPassword) return setMsg("Completá nombre, email y contraseña");

    const res = await fetch(`${API}/operator/clients`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ client_number: n, name: newName, email: newEmail, password: newPassword, role: "client" }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error creando cliente");
    setMsg(`Cliente creado: #${data.user.client_number} — ${data.user.email}`);
    setNewClientNumber(""); setNewName(""); setNewEmail(""); setNewPassword("");
    await loadDashboard();
  }

  async function findClient() {
    setMsg(""); setClient(null);
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
      usa_normal: r?.usa_normal ?? "", usa_express: r?.usa_express ?? "", usa_tech_premium: r?.usa_tech_premium ?? "",
      china_normal: r?.china_normal ?? "", china_express: r?.china_express ?? "",
      europa_normal: r?.europa_normal ?? "",
    });
  }

  function applyDefaultsToInputs() {
    setRates({
      usa_normal:       String(defaults.usa_normal       ?? DEFAULT_RATES_FALLBACK.usa_normal),
      usa_express:      String(defaults.usa_express      ?? DEFAULT_RATES_FALLBACK.usa_express),
      usa_tech_premium: String(defaults.usa_tech_premium ?? DEFAULT_RATES_FALLBACK.usa_tech_premium ?? 75),
      china_normal: String(defaults.china_normal ?? DEFAULT_RATES_FALLBACK.china_normal),
      china_express: String(defaults.china_express ?? DEFAULT_RATES_FALLBACK.china_express),
      europa_normal: String(defaults.europa_normal ?? DEFAULT_RATES_FALLBACK.europa_normal),
    });
    setMsg("Defaults cargados en los inputs ✅");
  }

  function clearRatesToAuto() {
    setRates({ usa_normal: "", usa_express: "", usa_tech_premium: "", china_normal: "", china_express: "", europa_normal: "" });
    setMsg("Listo: quedó en modo AUTO ✅");
  }

  async function saveClientRates() {
    setMsg("");
    if (!client?.id) return setMsg("Primero buscá un cliente");
    setSavingRates(true);
    try {
      const payload = {
        usa_normal: numOrNull(rates.usa_normal), usa_express: numOrNull(rates.usa_express), usa_tech_premium: numOrNull(rates.usa_tech_premium),
        china_normal: numOrNull(rates.china_normal), china_express: numOrNull(rates.china_express),
        europa_normal: numOrNull(rates.europa_normal),
      };
      const res = await fetch(`${API}/operator/clients/${client.id}/rates`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data?.error || "Error guardando tarifas");
      setDefaults(data.defaults || DEFAULT_RATES_FALLBACK);
      setRates({
        usa_normal: data?.rates?.usa_normal ?? "", usa_express: data?.rates?.usa_express ?? "", usa_tech_premium: data?.rates?.usa_tech_premium ?? "",
        china_normal: data?.rates?.china_normal ?? "", china_express: data?.rates?.china_express ?? "",
        europa_normal: data?.rates?.europa_normal ?? "",
      });
      editRateCacheRef.current.delete(String(client.client_number));
      setMsg("Tarifas guardadas ✅");
    } catch { setMsg("Error guardando tarifas"); }
    finally { setSavingRates(false); }
  }

  async function createShipment() {
    setMsg("");
    if (!client) return setMsg("Primero buscá un cliente");
    if (!packageCode || !description || !weightKg) return setMsg("Faltan campos obligatorios");
    const weightParsed = num(weightKg, NaN);
    if (!Number.isFinite(weightParsed) || weightParsed <= 0) return setMsg("Peso inválido");
    if (overrideEnabled) {
      const r = numOrNull(overrideRate);
      if (r == null || r <= 0) return setMsg("Tarifa manual inválida");
    }
    const body = {
      client_number: client.client_number,
      package_code: packageCode, description,
      box_code: boxCode || null, tracking: tracking || null,
      weight_kg: weightParsed, status,
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
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Error interno");
    setMsg(`Envío creado: ${data.shipment?.code || packageCode}`);
    setPackageCode(""); setDescription(""); setBoxCode(""); setTracking(""); setWeightKg("");
    setStatus("Recibido en depósito"); setOrigin("USA"); setService("NORMAL");
    setOverrideEnabled(false); setOverrideRate("");
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
    if (!res.ok) { setMsg(data?.error || "Error cargando historial"); setEvents([]); return; }
    setEvents(data.rows || []);
  }

  async function saveStatus(shipmentId) {
    setMsg("");
    const newStatus = statusDraft[shipmentId];
    if (!newStatus) return;
    setSavingId(shipmentId);
    const res = await fetch(`${API}/operator/shipments/${shipmentId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
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
    const ctx = { client_number: clientNum, defaults: data.defaults || DEFAULT_RATES_FALLBACK, rates: data.rates || null };
    editRateCacheRef.current.set(key, ctx);
    return ctx;
  }

  function recalcEdit(nextDraft, row, ctx) {
    const o = normalizeOrigin(nextDraft.origin ?? row.origin ?? "USA");
    const s = normalizeService(o, nextDraft.service ?? row.service ?? "NORMAL");
    const w = num(nextDraft.weight_kg, NaN);
    const override = Boolean(nextDraft.override_edit);
    const autoRate = getLaneRate({
      origin: o, service: s,
      rates: {
        usa_normal: ctx?.rates?.usa_normal ?? "", usa_express: ctx?.rates?.usa_express ?? "",
        usa_tech_premium: ctx?.rates?.usa_tech_premium ?? "",
        china_normal: ctx?.rates?.china_normal ?? "", china_express: ctx?.rates?.china_express ?? "",
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
    const ctx = editRateCtx && editRateCtx.client_number === row.client_number
      ? editRateCtx
      : { client_number: row.client_number, defaults: DEFAULT_RATES_FALLBACK, rates: null };
    setEditDraft(recalcEdit({ ...editDraft, [field]: value }, row, ctx));
  }

  function setEditOverrideMode(mode) {
    const row = rows.find((x) => x.id === editId);
    if (!row) return;
    const ctx = editRateCtx && editRateCtx.client_number === row.client_number
      ? editRateCtx
      : { client_number: row.client_number, defaults: DEFAULT_RATES_FALLBACK, rates: null };
    const enabled = mode === "MANUAL";
    let base = { ...editDraft, override_edit: enabled };
    if (enabled) {
      const o = normalizeOrigin(base.origin ?? row.origin ?? "USA");
      const s = normalizeService(o, base.service ?? row.service ?? "NORMAL");
      const autoRate = getLaneRate({
        origin: o, service: s,
        rates: {
          usa_normal: ctx?.rates?.usa_normal ?? "", usa_express: ctx?.rates?.usa_express ?? "",
          china_normal: ctx?.rates?.china_normal ?? "", china_express: ctx?.rates?.china_express ?? "",
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
    setMsg(""); setEditId(r.id);
    const initialDraft = {
      package_code: r.code ?? r.package_code ?? "", description: r.description ?? "",
      box_code: r.box_code ?? "", tracking: r.tracking ?? "",
      weight_kg: String(r.weight_kg ?? ""), origin: r.origin ?? "USA",
      service: r.service ?? "NORMAL", override_edit: false,
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
    } finally { setEditRateLoading(false); }
  }

  function cancelEdit() {
    setEditId(null); setEditDraft({}); setEditRateCtx(null); setEditRateLoading(false);
  }

  async function saveEdit(shipmentId) {
    setMsg(""); setSavingEditId(shipmentId);
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
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSavingEditId(null);
    if (!res.ok) return setMsg(data?.error || "Error guardando cambios");
    setMsg("Cambios guardados ✅");
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
  }, []); // eslint-disable-line

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="screen" style={{ maxWidth: 1600, margin: "0 auto" }}>
      <Topbar title="Panel Operador" />

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
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>Panel Operador</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginTop: 2 }}>
            LEMON&apos;S — carga y control de paquetes
          </div>
        </div>
        <button
          className="btn btnPrimary"
          onClick={refreshAll}
          disabled={loadingStats}
          style={{ height: 38, padding: "0 18px", fontSize: 13 }}
        >
          {loadingStats ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </div>

      <MsgBanner msg={msg} />

      {/* ── DASHBOARD STATS ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 10,
        marginTop: 12,
      }}>
        <StatCard icon="📦" label="TOTAL ENVÍOS" value={loadingStats ? "…" : stats?.total ?? 0} sub="Todos los estados" />
        <StatCard icon="🟡" label="RECIBIDOS" value={loadingStats ? "…" : stats?.received ?? 0} sub="En depósito" accent="linear-gradient(90deg,#ffd200,#ffd200)" />
        <StatCard icon="🔧" label="PREPARACIÓN" value={loadingStats ? "…" : stats?.prep ?? 0} sub="Armado / control" accent="linear-gradient(90deg,#ff8a00,#ff8a00)" />
        <StatCard icon="🚀" label="DESPACHADOS" value={loadingStats ? "…" : stats?.sent ?? 0} sub="Salieron del depósito" accent="linear-gradient(90deg,#3b82f6,#60a5fa)" />
        <StatCard icon="✈️" label="EN TRÁNSITO" value={loadingStats ? "…" : stats?.transit ?? 0} sub="Viajando" accent="linear-gradient(90deg,#a78bfa,#c4b5fd)" />
        <StatCard icon="📬" label="LISTO ENTREGA" value={loadingStats ? "…" : stats?.ready ?? 0} sub="Última milla" accent="linear-gradient(90deg,#22c55e,#4ade80)" />
        <StatCard icon="✅" label="ENTREGADOS" value={loadingStats ? "…" : stats?.delivered ?? 0} sub="Cerrados" accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
        <StatCard icon="⚖️" label="PESO TOTAL" value={loadingStats ? "…" : `${Number(stats?.total_weight ?? 0).toFixed(1)} kg`} sub="Acumulado" />
      </div>

      {/* ── CREAR CLIENTE + BUSCAR CLIENTE ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14,
      }} className="grid2">

        {/* Crear cliente */}
        <Panel title="Crear cliente" icon="👤" defaultOpen={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="input" placeholder="Nº de cliente (ej: 42)" value={newClientNumber}
              onChange={(e) => setNewClientNumber(e.target.value)} />
            <input className="input" placeholder="Nombre completo" value={newName}
              onChange={(e) => setNewName(e.target.value)} />
            <input className="input" placeholder="Email" value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)} />
            <input className="input" placeholder="Contraseña (mín 6 chars)" type="password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
              <button className="btn btnPrimary" onClick={createClient} style={{ height: 40, padding: "0 20px" }}>
                Crear cliente
              </button>
            </div>
          </div>
        </Panel>

        {/* Buscar cliente + Tarifas */}
        <Panel title="Buscar cliente & tarifas" icon="🔍" defaultOpen={true}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="Nº de cliente" value={clientNumber}
              onChange={(e) => setClientNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findClient()}
            />
            <button className="btn" onClick={findClient}
              style={{ height: 42, padding: "0 18px", whiteSpace: "nowrap" }}>
              Buscar
            </button>
          </div>

          {client && (
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 14,
              padding: "12px 14px",
            }}>
              {/* Info cliente */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "linear-gradient(135deg,#ffd200,#ff8a00)",
                  display: "grid", placeItems: "center",
                  fontWeight: 900, fontSize: 15, color: "#0b1020",
                }}>
                  {String(client.name || "?")[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    #{client.client_number} — {client.name}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{client.email}</div>
                </div>
              </div>

              {/* Tarifas */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Tarifas (USD/kg)</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" onClick={applyDefaultsToInputs} disabled={savingRates}
                    style={{ height: 32, padding: "0 12px", fontSize: 12 }}>
                    Restaurar defaults
                  </button>
                  <button className="btn" onClick={clearRatesToAuto} disabled={savingRates}
                    style={{ height: 32, padding: "0 12px", fontSize: 12 }}>
                    Limpiar (AUTO)
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <RateField label="USA • Normal" value={rates.usa_normal} placeholder={String(defaults.usa_normal)}
                  onChange={(v) => setRates((r) => ({ ...r, usa_normal: v }))} />
                <RateField label="USA • Express" value={rates.usa_express} placeholder={String(defaults.usa_express)}
                  onChange={(v) => setRates((r) => ({ ...r, usa_express: v }))} />
                <RateField label="📱 USA • Tecnología Premium" value={rates.usa_tech_premium} placeholder={String(defaults.usa_tech_premium ?? 75)}
                  onChange={(v) => setRates((r) => ({ ...r, usa_tech_premium: v }))} />
                <RateField label="China • Normal" value={rates.china_normal} placeholder={String(defaults.china_normal)}
                  onChange={(v) => setRates((r) => ({ ...r, china_normal: v }))} />
                <RateField label="China • Express" value={rates.china_express} placeholder={String(defaults.china_express)}
                  onChange={(v) => setRates((r) => ({ ...r, china_express: v }))} />
                <div style={{ gridColumn: "1 / span 2" }}>
                  <RateField label="Europa • Normal" value={rates.europa_normal} placeholder={String(defaults.europa_normal)}
                    onChange={(v) => setRates((r) => ({ ...r, europa_normal: v }))} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn btnPrimary" onClick={saveClientRates} disabled={savingRates}
                  style={{ height: 38, padding: "0 18px", fontSize: 13 }}>
                  {savingRates ? "Guardando…" : "Guardar tarifas"}
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── CREAR ENVÍO ── */}
      <Panel title="Crear nuevo envío" icon="📮" defaultOpen={true}>
        {!client && (
          <div style={{
            padding: "12px 14px", borderRadius: 12, marginBottom: 14,
            background: "rgba(255,210,0,0.08)", border: "1px solid rgba(255,210,0,0.20)",
            fontSize: 13, color: "rgba(255,255,255,0.70)",
          }}>
            ⚠ Primero buscá un cliente arriba para cargar tarifas automáticas.
          </div>
        )}

        {client && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)",
            borderRadius: 999, padding: "6px 14px", marginBottom: 14, fontSize: 13,
          }}>
            <span style={{ color: "#4ade80" }}>●</span>
            Cliente activo: <b>#{client.client_number} — {client.name}</b>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 14, alignItems: "start" }}
          className="operatorForm">

          {/* Columna izquierda: campos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="row">
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>CÓDIGO DE PAQUETE *</div>
                <input className="input" placeholder="Ej: PKG-001" value={packageCode}
                  onChange={(e) => setPackageCode(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>CAJA (opcional)</div>
                <input className="input" placeholder="Ej: BOX-A1" value={boxCode}
                  onChange={(e) => setBoxCode(e.target.value)} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>DESCRIPCIÓN *</div>
              <input className="input" placeholder="Descripción del ítem" value={description}
                onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>TRACKING (opcional)</div>
              <input className="input" placeholder="Número de tracking del transportista" value={tracking}
                onChange={(e) => setTracking(e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }} className="row">
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>PESO (kg) *</div>
                <input className="input" placeholder="0.00" value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>ORIGEN</div>
                <select className="input" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>SERVICIO</div>
                <select className="input" value={origin === "EUROPA" ? "NORMAL" : service}
                  onChange={(e) => setService(e.target.value)} disabled={origin === "EUROPA"}>
                  {(SERVICES_BY_ORIGIN[origin] || ["NORMAL"]).map((s) => (
                    <option key={s} value={s}>
                      {s === "TECH_PREMIUM" ? "📱 Tecnología Premium" : s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }} className="row">
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>ESTADO INICIAL</div>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ paddingTop: 22 }}>
                <StatusBadge status={status} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>MODO TARIFA</div>
                <select className="input" value={overrideEnabled ? "MANUAL" : "AUTO"}
                  onChange={(e) => { const m = e.target.value === "MANUAL"; setOverrideEnabled(m); if (!m) setOverrideRate(""); }}>
                  <option value="AUTO">AUTO</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </div>
            </div>

            {overrideEnabled && (
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 600 }}>TARIFA MANUAL (USD/kg)</div>
                <input className="input" placeholder="Tarifa manual USD/kg" value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)} inputMode="decimal" />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 5 }}>
                  Esta tarifa aplica solo a este envío.
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: resumen */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, letterSpacing: "0.5px", marginBottom: 14 }}>
              RESUMEN DEL ENVÍO
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Origen</span>
                <span style={{ fontWeight: 700 }}>{origin} {origin !== "EUROPA" ? service : ""}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Tarifa aplicada</span>
                <span style={{ fontWeight: 700 }}>${Number(appliedRate || 0).toFixed(2)}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>/kg</span></span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Peso</span>
                <span style={{ fontWeight: 700 }}>{num(weightKg, 0) > 0 ? `${num(weightKg, 0).toFixed(2)} kg` : "-"}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 4, padding: "10px 0 0",
              }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>ESTIMADO USD</span>
                <span style={{
                  fontSize: 22, fontWeight: 900,
                  background: "linear-gradient(135deg,#ffd200,#ff8a00)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  ${Number(estimated || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <button
              className="btn btnPrimary"
              onClick={createShipment}
              style={{ marginTop: 20, height: 42, width: "100%", fontWeight: 800, fontSize: 14 }}
            >
              Guardar envío
            </button>
          </div>
        </div>
      </Panel>

      {/* ── GESTIÓN DE ENVÍOS ── */}
      <Panel title="Gestión de envíos" icon="🗂" defaultOpen={true}>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="🔍 Buscar: código, tracking, descripción, caja..."
            value={opSearch}
            onChange={(e) => setOpSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadOperatorShipments()}
            style={{ flex: 1, minWidth: 240 }}
          />
          <input
            className="input"
            placeholder="Filtrar por cliente #"
            value={opClientNumber}
            onChange={(e) => setOpClientNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadOperatorShipments()}
            style={{ width: 180 }}
          />
          <button className="btn" onClick={loadOperatorShipments} style={{ height: 42, padding: "0 18px" }}>
            Buscar
          </button>
          <button className="btn" onClick={refreshAll} style={{ height: 42, padding: "0 14px" }}>
            ↻
          </button>
          <div style={{
            display: "flex", alignItems: "center",
            fontSize: 12, color: "rgba(255,255,255,0.45)",
            whiteSpace: "nowrap",
          }}>
            {rows.length} envío{rows.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Tabla */}
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
                <th>PESO</th>
                <th>ORIGEN</th>
                <th>SERVICIO</th>
                <th>TARIFA</th>
                <th>ESTIMADO</th>
                <th>MODO</th>
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
                  <>
                    <tr key={r.id} style={isEditing ? {
                      background: "rgba(255,210,0,0.04)",
                      outline: "1px solid rgba(255,210,0,0.18)",
                    } : {}}>
                      <td>
                        <span className="pill">#{r.client_number}</span>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.email}</div>
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.package_code || ""}
                            onChange={(e) => updateEditField("package_code", e.target.value)} />
                        ) : (
                          <span className="pill">{r.code || r.package_code}</span>
                        )}
                      </td>

                      <td style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>
                        {fmtDate(r.date_in)}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.description || ""}
                            onChange={(e) => updateEditField("description", e.target.value)} />
                        ) : (
                          <span style={{ fontSize: 13 }}>{r.description}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.box_code || ""}
                            onChange={(e) => updateEditField("box_code", e.target.value)} />
                        ) : (
                          r.box_code ? <span className="pill">{r.box_code}</span> : <span className="muted">-</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.tracking || ""}
                            onChange={(e) => updateEditField("tracking", e.target.value)} />
                        ) : (
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>{r.tracking || "-"}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.weight_kg || ""}
                            onChange={(e) => updateEditField("weight_kg", e.target.value)} inputMode="decimal" />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{Number(r.weight_kg).toFixed(2)}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <select className="input" value={editDraft.origin || "USA"}
                            onChange={(e) => updateEditField("origin", e.target.value)}>
                            {ORIGINS.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{r.origin || "-"}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <select className="input"
                            value={o === "EUROPA" ? "NORMAL" : editDraft.service || "NORMAL"}
                            onChange={(e) => updateEditField("service", e.target.value)}
                            disabled={o === "EUROPA"}>
                            {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12 }}>{r.service || "-"}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.rate_usd_per_kg || ""}
                            onChange={(e) => updateEditField("rate_usd_per_kg", e.target.value)}
                            readOnly={!override} inputMode="decimal"
                            title={!override ? "Poné MANUAL para editar" : "Tarifa manual"} />
                        ) : r.rate_usd_per_kg != null ? (
                          <span style={{ fontSize: 12 }}>${Number(r.rate_usd_per_kg).toFixed(2)}/kg</span>
                        ) : <span className="muted">-</span>}
                      </td>

                      <td>
                        {isEditing ? (
                          <input className="input" value={editDraft.estimated_usd || ""} readOnly />
                        ) : r.estimated_usd != null ? (
                          <b style={{ color: "#ffd200" }}>${Number(r.estimated_usd).toFixed(2)}</b>
                        ) : <span className="muted">-</span>}
                      </td>

                      <td>
                        {isEditing ? (
                          <select className="input" value={override ? "MANUAL" : "AUTO"}
                            onChange={(e) => setEditOverrideMode(e.target.value)} disabled={editRateLoading}>
                            <option value="AUTO">AUTO</option>
                            <option value="MANUAL">MANUAL</option>
                          </select>
                        ) : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                      </td>

                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select className="input" value={statusDraft[r.id] || r.status}
                            onChange={(e) => setStatusDraft((s) => ({ ...s, [r.id]: e.target.value }))}
                            disabled={isEditing}
                            style={{ minWidth: 140 }}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <StatusBadge status={statusDraft[r.id] || r.status} />
                        </div>
                      </td>

                      <td>
                        <button className="btn" onClick={() => saveStatus(r.id)}
                          disabled={savingId === r.id || isEditing}
                          style={{ height: 34, padding: "0 12px", fontSize: 12, whiteSpace: "nowrap" }}>
                          {savingId === r.id ? "…" : "Guardar"}
                        </button>
                      </td>

                      <td>
                        <button className="btn" onClick={() => {
                          const next = openId === r.id ? null : r.id;
                          setOpenId(next);
                          if (next) loadEvents(r.id);
                        }} style={{ height: 34, padding: "0 12px", fontSize: 12 }}>
                          {openId === r.id ? "Cerrar" : "Ver"}
                        </button>
                      </td>

                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btnPrimary" onClick={() => saveEdit(r.id)}
                              disabled={savingEditId === r.id || editRateLoading}
                              style={{ height: 34, padding: "0 12px", fontSize: 12 }}>
                              {savingEditId === r.id ? "…" : "OK"}
                            </button>
                            <button className="btn" onClick={cancelEdit}
                              style={{ height: 34, padding: "0 10px", fontSize: 12 }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button className="btn" onClick={() => startEdit(r)}
                            style={{ height: 34, padding: "0 12px", fontSize: 12 }}>
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* ── Historial inline expandido ── */}
                    {openId === r.id && (
                      <tr key={`events-${r.id}`}>
                        <td colSpan={16} style={{ padding: 0 }}>
                          <div style={{
                            background: "rgba(255,255,255,0.03)",
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                            padding: "12px 16px",
                          }}>
                            <div style={{
                              fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.50)",
                              letterSpacing: "0.5px", marginBottom: 10
                            }}>
                              HISTORIAL — Envío #{r.code || r.id}
                            </div>

                            {loadingEvents ? (
                              <div className="muted" style={{ fontSize: 13 }}>Cargando…</div>
                            ) : events.length === 0 ? (
                              <div className="muted" style={{ fontSize: 13 }}>Sin eventos registrados.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {events.map((e, i) => (
                                  <div key={e.id || e.created_at} style={{
                                    display: "flex", alignItems: "center", gap: 12,
                                    fontSize: 13,
                                  }}>
                                    {/* línea de tiempo */}
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16 }}>
                                      <div style={{
                                        width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                        background: i === 0
                                          ? "linear-gradient(135deg,#ffd200,#ff8a00)"
                                          : "rgba(255,255,255,0.25)",
                                        border: "2px solid rgba(255,255,255,0.15)",
                                      }} />
                                      {i < events.length - 1 && (
                                        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", marginTop: 2 }} />
                                      )}
                                    </div>
                                    <div style={{ color: "rgba(255,255,255,0.40)", minWidth: 130, fontSize: 12 }}>
                                      {fmtDate(e.created_at)}
                                    </div>
                                    <div style={{ color: "rgba(255,255,255,0.50)" }}>{e.old_status || "—"}</div>
                                    <div style={{ color: "rgba(255,255,255,0.35)" }}>→</div>
                                    <div style={{ fontWeight: 700, color: "#fff" }}>{e.new_status}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={16} style={{ padding: 24, textAlign: "center" }}>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
                      No hay envíos. Ajustá el filtro o hacé clic en ↻.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          Tip: cambiás el estado → Guardar → el cliente lo ve al instante.
        </div>
      </Panel>

    </div>
  );
}
