// client/src/pages/OperatorPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";

function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
}

const STATUS_OPTIONS = [
  "Recibido",
  "En preparación",
  "Enviado",
  "En tránsito",
  "Listo para retirar",
  "Entregado",
];

const ORIGINS = ["USA", "CHINA", "EUROPA"];
const SERVICES = ["NORMAL", "EXPRESS"];

const DEFAULT_FALLBACKS = {
  usa_normal: 45,
  usa_express: 55,
  china_normal: 58,
  china_express: 68,
  europa_normal: 58,
};

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function normalizeOrigin(origin) {
  const o = (origin || "").toUpperCase();
  if (o === "USA" || o === "CHINA" || o === "EUROPA") return o;
  return "";
}

function normalizeService(service) {
  const s = (service || "").toUpperCase();
  if (s === "NORMAL" || s === "EXPRESS") return s;
  return "";
}

function rateKeyFor(origin, service) {
  if (origin === "EUROPA") return "europa_normal";
  if (origin === "USA" && service === "NORMAL") return "usa_normal";
  if (origin === "USA" && service === "EXPRESS") return "usa_express";
  if (origin === "CHINA" && service === "NORMAL") return "china_normal";
  if (origin === "CHINA" && service === "EXPRESS") return "china_express";
  return null;
}

function resolveRateFromClient({ origin, service, clientRates, defaults }) {
  const key = rateKeyFor(origin, service);
  if (!key) return null;

  const fromClient = clientRates?.[key];
  if (fromClient !== null && fromClient !== undefined && fromClient !== "") {
    const n = Number(fromClient);
    if (Number.isFinite(n)) return n;
  }

  const fromDefaults = defaults?.[key];
  if (fromDefaults !== null && fromDefaults !== undefined) return Number(fromDefaults);

  return DEFAULT_FALLBACKS[key];
}

export default function OperatorPanel() {
  const apiUrl = import.meta.env.VITE_API_URL;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Dashboard
  const [stats, setStats] = useState(null);

  // Buscar cliente
  const [clientNumberInput, setClientNumberInput] = useState("");
  const [selectedClient, setSelectedClient] = useState(null); // {id, client_number, name, email, role}
  const [clientRates, setClientRates] = useState(null); // {usa_normal,...}
  const [defaults, setDefaults] = useState(DEFAULT_FALLBACKS);

  // Form crear envío
  const [form, setForm] = useState({
    package_code: "",
    description: "",
    box_code: "",
    tracking: "",
    weight_kg: "",
    status: "Recibido",
    origin: "USA",
    service: "NORMAL",
    override_rate: "", // opcional
  });

  // Tabla envíos
  const [shipments, setShipments] = useState([]);
  const [search, setSearch] = useState("");
  const [filterClientNumber, setFilterClientNumber] = useState("");

  const authHeaders = useMemo(() => {
    const token = getToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, []);

  async function fetchDashboard() {
    const r = await fetch(`${apiUrl}/operator/dashboard`, { headers: authHeaders });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error dashboard");
    setStats(data.stats);
  }

  async function fetchShipments() {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (filterClientNumber.trim()) qs.set("client_number", filterClientNumber.trim());

    const r = await fetch(`${apiUrl}/operator/shipments?${qs.toString()}`, {
      headers: authHeaders,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error shipments");
    setShipments(data.shipments || []);
  }

  useEffect(() => {
    (async () => {
      try {
        setError("");
        setLoading(true);
        await Promise.all([fetchDashboard(), fetchShipments()]);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearchClient() {
    try {
      setError("");
      setLoading(true);

      const cn = Number(clientNumberInput);
      if (!cn || Number.isNaN(cn)) throw new Error("Ingresá un client_number válido");

      const r = await fetch(`${apiUrl}/operator/clients?client_number=${cn}`, {
        headers: authHeaders,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error al buscar cliente");

      setSelectedClient(data.user);
      setClientRates(
        data.rates || {
          usa_normal: null,
          usa_express: null,
          china_normal: null,
          china_express: null,
          europa_normal: null,
        }
      );
      setDefaults(data.defaults || DEFAULT_FALLBACKS);

      // precargar el client_number en el form de envíos
      setFilterClientNumber(String(cn));
    } catch (e) {
      setSelectedClient(null);
      setClientRates(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRates() {
    try {
      setError("");
      if (!selectedClient?.id) throw new Error("Primero buscá un cliente");

      const payload = {
        usa_normal: numOrNull(clientRates?.usa_normal),
        usa_express: numOrNull(clientRates?.usa_express),
        china_normal: numOrNull(clientRates?.china_normal),
        china_express: numOrNull(clientRates?.china_express),
        europa_normal: numOrNull(clientRates?.europa_normal),
      };

      const r = await fetch(`${apiUrl}/operator/clients/${selectedClient.id}/rates`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error guardando tarifas");

      setClientRates(data.rates);
      setDefaults(data.defaults || DEFAULT_FALLBACKS);
    } catch (e) {
      setError(e.message);
    }
  }

  const effectiveOrigin = normalizeOrigin(form.origin);
  const effectiveService = effectiveOrigin === "EUROPA" ? "NORMAL" : normalizeService(form.service);

  const autoRate = useMemo(() => {
    return resolveRateFromClient({
      origin: effectiveOrigin,
      service: effectiveService,
      clientRates,
      defaults,
    });
  }, [effectiveOrigin, effectiveService, clientRates, defaults]);

  const overrideRateNum = useMemo(() => {
    const n = numOrNull(form.override_rate);
    return n;
  }, [form.override_rate]);

  const finalRate = overrideRateNum !== null ? overrideRateNum : autoRate;

  const est = useMemo(() => {
    const w = numOrNull(form.weight_kg);
    if (w === null) return null;
    if (finalRate === null || finalRate === undefined) return null;
    return Number(w) * Number(finalRate);
  }, [form.weight_kg, finalRate]);

  async function handleCreateShipment(e) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);

      if (!selectedClient?.client_number) throw new Error("Primero buscá y seleccioná un cliente");
      const weight = numOrNull(form.weight_kg);
      if (!weight || weight <= 0) throw new Error("Peso inválido (usa decimales si hace falta)");

      const payload = {
        client_number: Number(selectedClient.client_number),
        package_code: form.package_code.trim(),
        description: form.description.trim(),
        box_code: form.box_code.trim() || null,
        tracking: form.tracking.trim() || null,
        weight_kg: Number(weight),
        status: form.status,

        origin: effectiveOrigin,
        service: effectiveService,

        // override opcional (si no, el backend calcula desde DB)
        rate_usd_per_kg: overrideRateNum !== null ? Number(overrideRateNum) : null,
        estimated_usd: overrideRateNum !== null && est !== null ? Number(est) : null,
      };

      if (!payload.package_code) throw new Error("Falta código (package_code)");
      if (!payload.description) throw new Error("Falta descripción");

      const r = await fetch(`${apiUrl}/operator/shipments`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error creando envío");

      // Reset parcial
      setForm((p) => ({
        ...p,
        package_code: "",
        description: "",
        box_code: "",
        tracking: "",
        weight_kg: "",
        override_rate: "",
        status: "Recibido",
      }));

      await Promise.all([fetchDashboard(), fetchShipments()]);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateShipmentField(shipmentId, patch) {
    const r = await fetch(`${apiUrl}/operator/shipments/${shipmentId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify(patch),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error actualizando envío");
    return data.shipment;
  }

  async function updateShipmentStatus(shipmentId, status) {
    const r = await fetch(`${apiUrl}/operator/shipments/${shipmentId}/status`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ status }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Error actualizando status");
    return data.shipment;
  }

  function fmtDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return String(d);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <Topbar />

      <h2 style={{ marginTop: 12 }}>Panel Operador</h2>

      {error ? (
        <div style={{ background: "#ffeded", border: "1px solid #ffb3b3", padding: 10, marginTop: 10 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 10 }}>Cargando…</div> : null}

      {/* Dashboard */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Dashboard</h3>
        {stats ? (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div>Total: <b>{stats.total}</b></div>
            <div>Recibido: <b>{stats.received}</b></div>
            <div>Prep: <b>{stats.prep}</b></div>
            <div>Enviado: <b>{stats.sent}</b></div>
            <div>Tránsito: <b>{stats.transit}</b></div>
            <div>Listo: <b>{stats.ready}</b></div>
            <div>Entregado: <b>{stats.delivered}</b></div>
            <div>Peso total: <b>{Number(stats.total_weight || 0).toFixed(2)} kg</b></div>
          </div>
        ) : (
          <div>Sin datos</div>
        )}
      </div>

      {/* Buscar cliente */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Cliente + Tarifas</h3>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={clientNumberInput}
            onChange={(e) => setClientNumberInput(e.target.value)}
            placeholder="client_number"
            style={{ padding: 8, width: 180 }}
          />
          <button onClick={handleSearchClient} style={{ padding: "8px 12px" }}>
            Buscar cliente
          </button>

          {selectedClient ? (
            <div style={{ marginLeft: 8 }}>
              <b>Cliente #{selectedClient.client_number}</b> — {selectedClient.name} ({selectedClient.email})
            </div>
          ) : null}
        </div>

        {/* Tarifas */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
            Las tarifas del cliente pueden quedar vacías (NULL) y el sistema usa los defaults.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(160px, 1fr))", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>USA Normal (USD/kg)</span>
              <input
                value={clientRates?.usa_normal ?? ""}
                onChange={(e) => setClientRates((p) => ({ ...p, usa_normal: e.target.value }))}
                placeholder={`default ${defaults.usa_normal}`}
                style={{ padding: 8 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>USA Express (USD/kg)</span>
              <input
                value={clientRates?.usa_express ?? ""}
                onChange={(e) => setClientRates((p) => ({ ...p, usa_express: e.target.value }))}
                placeholder={`default ${defaults.usa_express}`}
                style={{ padding: 8 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>China Normal (USD/kg)</span>
              <input
                value={clientRates?.china_normal ?? ""}
                onChange={(e) => setClientRates((p) => ({ ...p, china_normal: e.target.value }))}
                placeholder={`default ${defaults.china_normal}`}
                style={{ padding: 8 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>China Express (USD/kg)</span>
              <input
                value={clientRates?.china_express ?? ""}
                onChange={(e) => setClientRates((p) => ({ ...p, china_express: e.target.value }))}
                placeholder={`default ${defaults.china_express}`}
                style={{ padding: 8 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>Europa Normal (USD/kg)</span>
              <input
                value={clientRates?.europa_normal ?? ""}
                onChange={(e) => setClientRates((p) => ({ ...p, europa_normal: e.target.value }))}
                placeholder={`default ${defaults.europa_normal}`}
                style={{ padding: 8 }}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleSaveRates} style={{ padding: "8px 12px" }} disabled={!selectedClient}>
              Guardar tarifas
            </button>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Defaults actuales: USA N {defaults.usa_normal}, USA E {defaults.usa_express}, CH N {defaults.china_normal}, CH E{" "}
              {defaults.china_express}, EU N {defaults.europa_normal}
            </div>
          </div>
        </div>
      </div>

      {/* Crear envío */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Crear envío</h3>

        <form onSubmit={handleCreateShipment} style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          <input
            value={form.package_code}
            onChange={(e) => setForm((p) => ({ ...p, package_code: e.target.value }))}
            placeholder="Código (package_code)"
            style={{ padding: 8, gridColumn: "span 2" }}
          />
          <input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Descripción"
            style={{ padding: 8, gridColumn: "span 4" }}
          />

          <input
            value={form.box_code}
            onChange={(e) => setForm((p) => ({ ...p, box_code: e.target.value }))}
            placeholder="Caja (opcional)"
            style={{ padding: 8, gridColumn: "span 2" }}
          />
          <input
            value={form.tracking}
            onChange={(e) => setForm((p) => ({ ...p, tracking: e.target.value }))}
            placeholder="Tracking (opcional)"
            style={{ padding: 8, gridColumn: "span 2" }}
          />
          <input
            value={form.weight_kg}
            onChange={(e) => setForm((p) => ({ ...p, weight_kg: e.target.value }))}
            placeholder="Peso kg (ej 1.25)"
            style={{ padding: 8, gridColumn: "span 1" }}
          />

          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            style={{ padding: 8, gridColumn: "span 1" }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={form.origin}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                origin: e.target.value,
                service: e.target.value === "EUROPA" ? "NORMAL" : p.service,
              }))
            }
            style={{ padding: 8, gridColumn: "span 2" }}
          >
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                Origen: {o}
              </option>
            ))}
          </select>

          <select
            value={effectiveService}
            onChange={(e) => setForm((p) => ({ ...p, service: e.target.value }))}
            style={{ padding: 8, gridColumn: "span 2" }}
            disabled={effectiveOrigin === "EUROPA"}
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                Servicio: {s}
              </option>
            ))}
          </select>

          <input
            value={form.override_rate}
            onChange={(e) => setForm((p) => ({ ...p, override_rate: e.target.value }))}
            placeholder="Override tarifa (opcional)"
            style={{ padding: 8, gridColumn: "span 2" }}
          />

          <div style={{ gridColumn: "span 6", display: "flex", gap: 14, alignItems: "center" }}>
            <div>
              Tarifa aplicada: <b>{finalRate !== null && finalRate !== undefined ? `${toMoney(finalRate)} USD/kg` : "—"}</b>{" "}
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                (auto: {autoRate !== null && autoRate !== undefined ? toMoney(autoRate) : "—"})
              </span>
            </div>
            <div>
              Estimado: <b>{est !== null ? `${toMoney(est)} USD` : "—"}</b>
            </div>
            <button type="submit" style={{ padding: "8px 12px" }} disabled={!selectedClient}>
              Crear envío
            </button>
          </div>

          {!selectedClient ? (
            <div style={{ gridColumn: "span 6", fontSize: 13, opacity: 0.8 }}>
              * Primero buscá un cliente para crear envíos.
            </div>
          ) : null}
        </form>
      </div>

      {/* Lista envíos */}
      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Envíos</h3>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar (code/description)"
            style={{ padding: 8, width: 260 }}
          />
          <input
            value={filterClientNumber}
            onChange={(e) => setFilterClientNumber(e.target.value)}
            placeholder="Filtrar client_number"
            style={{ padding: 8, width: 180 }}
          />
          <button
            onClick={async () => {
              try {
                setError("");
                setLoading(true);
                await fetchShipments();
              } catch (e) {
                setError(e.message);
              } finally {
                setLoading(false);
              }
            }}
            style={{ padding: "8px 12px" }}
          >
            Buscar
          </button>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Cliente",
                  "Código",
                  "Fecha",
                  "Descripción",
                  "Caja",
                  "Tracking",
                  "Kg",
                  "Origen",
                  "Servicio",
                  "Tarifa",
                  "Estimado",
                  "Estado",
                  "Acciones",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, whiteSpace: "nowrap" }}>
                    #{s.client_number} {s.client_name}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.code}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, whiteSpace: "nowrap" }}>{fmtDate(s.date_in)}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, minWidth: 240 }}>{s.description}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.box_code || ""}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.tracking || ""}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{Number(s.weight_kg || 0).toFixed(2)}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.origin || ""}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.service || ""}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    {s.rate_usd_per_kg !== null && s.rate_usd_per_kg !== undefined ? toMoney(s.rate_usd_per_kg) : ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    {s.estimated_usd !== null && s.estimated_usd !== undefined ? toMoney(s.estimated_usd) : ""}
                  </td>

                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    <select
                      value={s.status}
                      onChange={async (e) => {
                        try {
                          setError("");
                          setLoading(true);
                          await updateShipmentStatus(s.id, e.target.value);
                          await Promise.all([fetchDashboard(), fetchShipments()]);
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      style={{ padding: 6 }}
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, whiteSpace: "nowrap" }}>
                    <button
                      style={{ padding: "6px 10px" }}
                      onClick={async () => {
                        try {
                          setError("");
                          setLoading(true);
                          // ejemplo: quick recalc (si querés) no lo hago automático acá para no pisar tarifas
                          await fetchShipments();
                        } catch (err) {
                          setError(err.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Refrescar
                    </button>

                    {/* Si querés reintroducir edición inline de todos los campos como tenías, se puede. */}
                  </td>
                </tr>
              ))}

              {!shipments.length ? (
                <tr>
                  <td colSpan={13} style={{ padding: 10, opacity: 0.75 }}>
                    Sin envíos para mostrar
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}