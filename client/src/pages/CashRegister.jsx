import { useEffect, useState, useMemo } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtUsd = (v) => `$${Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtArs = (v) => `$${Number(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (v) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(v); }
};
const fmtDateOnly = (v) => {
  if (!v) return "-";
  try { return new Date(v + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return String(v); }
};
const num = (v) => Number(v || 0);

// ── Constantes ────────────────────────────────────────────────────────────────
const METHODS = [
  { value: "USD_CASH",     label: "💵 USD Efectivo",      color: "#22c55e" },
  { value: "USDT",         label: "🔷 USDT",              color: "#3b82f6" },
  { value: "ARS_TRANSFER", label: "📲 Pesos Transferencia", color: "#a78bfa" },
  { value: "ARS_CASH",     label: "💴 Pesos Efectivo",    color: "#ffd200" },
];
const METHOD_MAP = Object.fromEntries(METHODS.map(m => [m.value, m]));

const EXPENSE_CATEGORIES = [
  "Alquiler / Oficina", "Sueldos / Personal", "Logística / Flete",
  "Marketing", "Servicios", "Otros"
];

// ── Componentes base ──────────────────────────────────────────────────────────
function MsgBanner({ msg, onClose }) {
  if (!msg) return null;
  const isErr = /error|inválid|falt|no se/i.test(msg);
  return (
    <div onClick={onClose} style={{
      padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer",
      marginBottom: 12,
      background: isErr ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
      border: `1px solid ${isErr ? "rgba(239,68,68,0.28)" : "rgba(34,197,94,0.28)"}`,
      color: isErr ? "#fca5a5" : "#86efac",
    }}>
      {isErr ? "⚠ " : "✓ "}{msg}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      position: "relative", background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16,
      padding: "16px 18px", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent || "#ffd200", borderRadius: "16px 16px 0 0" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.5px" }}>{label.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MethodBadge({ method }) {
  const m = METHOD_MAP[method];
  if (!m) return <span>{method}</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
      background: `${m.color}20`, border: `1px solid ${m.color}44`, color: m.color,
      whiteSpace: "nowrap",
    }}>{m.label}</span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — COBROS
// ══════════════════════════════════════════════════════════════════════════════
function CobrosTab() {
  const [msg, setMsg] = useState("");

  // Búsqueda cliente
  const [clientNum, setClientNum] = useState("");
  const [clientData, setClientData] = useState(null); // { user, shipments }
  const [loadingClient, setLoadingClient] = useState(false);

  // Selección de paquetes
  const [selected, setSelected] = useState(new Set());

  // Formulario cobro
  const [method, setMethod] = useState("USD_CASH");
  const [exchangeRate, setExchangeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Historial
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histFilter, setHistFilter] = useState({ from: "", to: "", method: "", client_number: "" });

  // ── Cálculos
  const selectedShipments = useMemo(() =>
    (clientData?.shipments || []).filter(s => selected.has(s.id)),
    [clientData, selected]
  );
  const totalUsd = useMemo(() =>
    selectedShipments.reduce((a, s) => a + num(s.estimated_usd), 0),
    [selectedShipments]
  );
  const needsArs = method === "ARS_TRANSFER" || method === "ARS_CASH";
  const arsEquiv = needsArs && num(exchangeRate) > 0
    ? totalUsd * num(exchangeRate)
    : null;

  // ── API
  async function findClient() {
    setMsg(""); setClientData(null); setSelected(new Set());
    if (!clientNum.trim()) return;
    setLoadingClient(true);
    try {
      const res = await fetch(`${API}/cash/pending/${clientNum.trim()}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setClientData(data);
      if (!data.shipments.length) setMsg("Este cliente no tiene paquetes pendientes de cobro.");
    } catch { setMsg("Error de red"); }
    finally { setLoadingClient(false); }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set((clientData?.shipments || []).map(s => s.id)));
  }

  async function registerPayment() {
    if (!clientData?.user) return setMsg("Buscá un cliente primero");
    if (selected.size === 0) return setMsg("Seleccioná al menos un paquete");
    if (needsArs && (!exchangeRate || num(exchangeRate) <= 0)) return setMsg("Ingresá el tipo de cambio");
    setSaving(true); setMsg("");
    try {
      const body = {
        user_id: clientData.user.id,
        shipment_ids: [...selected],
        method,
        exchange_rate: needsArs ? num(exchangeRate) : null,
        amount_ars: arsEquiv,
        notes: notes || null,
      };
      const res = await fetch(`${API}/cash/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg(`✅ Cobro registrado — ${fmtUsd(totalUsd)} — ${METHOD_MAP[method]?.label}`);
      setClientData(null); setSelected(new Set()); setNotes(""); setExchangeRate("");
      setClientNum("");
      await loadHistory();
    } catch { setMsg("Error de red"); }
    finally { setSaving(false); }
  }

  async function deletePayment(id) {
    if (!confirm("¿Anular este cobro? Los paquetes vuelven a estar pendientes.")) return;
    const res = await fetch(`${API}/cash/payments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) { setMsg("Cobro anulado"); await loadHistory(); }
    else setMsg("Error anulando");
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const qs = new URLSearchParams();
    if (histFilter.from) qs.set("from", histFilter.from);
    if (histFilter.to) qs.set("to", histFilter.to);
    if (histFilter.method) qs.set("method", histFilter.method);
    if (histFilter.client_number) qs.set("client_number", histFilter.client_number);
    try {
      const res = await fetch(`${API}/cash/payments?${qs}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) setHistory(data.rows || []);
    } catch { /* no-op */ }
    finally { setLoadingHistory(false); }
  }

  useEffect(() => { loadHistory(); }, []); // eslint-disable-line

  // ── Totales del historial visible
  const histTotals = useMemo(() => {
    return METHODS.reduce((acc, m) => {
      acc[m.value] = history.filter(h => h.method === m.value).reduce((a, h) => a + num(h.amount_usd), 0);
      return acc;
    }, {});
  }, [history]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MsgBanner msg={msg} onClose={() => setMsg("")} />

      {/* ── KPIs historial ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
        {METHODS.map(m => (
          <KpiCard key={m.value} icon={m.label.split(" ")[0]} label={m.label.slice(2)}
            value={fmtUsd(histTotals[m.value])} sub="En el período"
            accent={m.color} />
        ))}
        <KpiCard icon="💰" label="Total cobrado"
          value={fmtUsd(Object.values(histTotals).reduce((a, b) => a + b, 0))}
          sub="Todos los métodos" accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
      </div>

      {/* ── Nuevo cobro ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>REGISTRAR COBRO</div>

        {/* Buscar cliente */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="Nº de cliente" value={clientNum}
            onChange={e => setClientNum(e.target.value)}
            onKeyDown={e => e.key === "Enter" && findClient()}
            style={{ maxWidth: 220 }} />
          <button className="btn btnPrimary" onClick={findClient} disabled={loadingClient}
            style={{ height: 42, padding: "0 18px" }}>
            {loadingClient ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {clientData && (
          <>
            {/* Info cliente */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
              padding: "10px 14px", background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.22)", borderRadius: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#ffd200,#ff8a00)", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 15, color: "#0b1020" }}>
                {String(clientData.user.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>#{clientData.user.client_number} — {clientData.user.name}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{clientData.user.email}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>PENDIENTE TOTAL</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#ffd200" }}>
                  {fmtUsd(clientData.shipments.reduce((a, s) => a + num(s.estimated_usd), 0))}
                </div>
              </div>
            </div>

            {/* Tabla de paquetes */}
            {clientData.shipments.length > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Paquetes pendientes de cobro</span>
                  <button className="btn" onClick={selectAll} style={{ height: 32, padding: "0 12px", fontSize: 12 }}>
                    Seleccionar todos
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {clientData.shipments.map(s => (
                    <div key={s.id} onClick={() => toggleSelect(s.id)} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      background: selected.has(s.id) ? "rgba(255,210,0,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${selected.has(s.id) ? "rgba(255,210,0,0.30)" : "rgba(255,255,255,0.07)"}`,
                      borderRadius: 12, cursor: "pointer", transition: "all 0.15s",
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: selected.has(s.id) ? "#ffd200" : "rgba(255,255,255,0.10)",
                        display: "grid", placeItems: "center",
                        fontSize: 12, color: selected.has(s.id) ? "#0b1020" : "transparent",
                        fontWeight: 900,
                      }}>✓</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{s.code}</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", background: "rgba(255,255,255,0.07)", padding: "1px 6px", borderRadius: 4 }}>
                            {s.origin}{s.service && s.service !== "NORMAL" ? ` · ${s.service}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{s.description}</div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#ffd200" }}>{fmtUsd(s.estimated_usd)}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{Number(s.weight_kg).toFixed(2)} kg</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumen selección + forma de pago */}
                {selected.size > 0 && (
                  <div style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 16, padding: "16px 18px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", fontWeight: 700 }}>TOTAL A COBRAR</div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: "#ffd200", letterSpacing: "-1px" }}>{fmtUsd(totalUsd)}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>{selected.size} paquete{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}</div>
                      </div>
                      {arsEquiv && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700 }}>EQUIV. PESOS</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#a78bfa" }}>{fmtArs(arsEquiv)}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>@ ${num(exchangeRate).toLocaleString("es-AR")}</div>
                        </div>
                      )}
                    </div>

                    {/* Método de pago */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 8 }}>MÉTODO DE PAGO</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {METHODS.map(m => (
                          <button key={m.value} onClick={() => setMethod(m.value)} style={{
                            height: 38, padding: "0 16px", borderRadius: 10, border: "none", cursor: "pointer",
                            fontWeight: 700, fontSize: 13,
                            background: method === m.value ? m.color : "rgba(255,255,255,0.07)",
                            color: method === m.value ? "#0b1020" : "rgba(255,255,255,0.70)",
                            boxShadow: method === m.value ? `0 0 16px ${m.color}55` : "none",
                            transition: "all 0.15s",
                          }}>{m.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Tipo de cambio si ARS */}
                    {needsArs && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>TIPO DE CAMBIO (ARS por USD)</div>
                        <input className="input" placeholder="Ej: 1250" inputMode="decimal"
                          value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
                          style={{ maxWidth: 200 }} />
                      </div>
                    )}

                    {/* Notas */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>NOTAS (opcional)</div>
                      <input className="input" placeholder="Observaciones del cobro..." value={notes}
                        onChange={e => setNotes(e.target.value)} />
                    </div>

                    <button className="btn btnPrimary" onClick={registerPayment} disabled={saving}
                      style={{ width: "100%", height: 46, fontSize: 15, fontWeight: 900 }}>
                      {saving ? "Registrando…" : `✓ Confirmar cobro ${fmtUsd(totalUsd)}`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
                No hay paquetes pendientes de cobro.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Historial de cobros ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>HISTORIAL DE COBROS</div>

        {/* Filtros */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <input type="date" className="input" value={histFilter.from}
            onChange={e => setHistFilter(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
          <input type="date" className="input" value={histFilter.to}
            onChange={e => setHistFilter(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
          <select className="input" value={histFilter.method}
            onChange={e => setHistFilter(f => ({ ...f, method: e.target.value }))} style={{ width: 180 }}>
            <option value="">Todos los métodos</option>
            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input className="input" placeholder="Nº cliente" value={histFilter.client_number}
            onChange={e => setHistFilter(f => ({ ...f, client_number: e.target.value }))} style={{ width: 130 }} />
          <button className="btn" onClick={loadHistory} disabled={loadingHistory}
            style={{ height: 42, padding: "0 16px" }}>
            {loadingHistory ? "…" : "Filtrar"}
          </button>
        </div>

        {/* Tabla */}
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>CLIENTE</th>
                <th>PAQUETES</th>
                <th>MÉTODO</th>
                <th>MONTO USD</th>
                <th>EQUIV. PESOS</th>
                <th>NOTAS</th>
                <th>ANULAR</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(h.created_at)}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>#{h.client_number}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{h.client_name}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {(h.items || []).map(it => (
                        <div key={it.shipment_id} style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.70)" }}>{it.code}</span>
                          <span style={{ color: "rgba(255,255,255,0.40)" }}>{it.description}</span>
                          <span style={{ color: "#ffd200", fontWeight: 700 }}>{fmtUsd(it.amount_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td><MethodBadge method={h.method} /></td>
                  <td><b style={{ color: "#22c55e" }}>{fmtUsd(h.amount_usd)}</b></td>
                  <td style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    {h.amount_ars ? `${fmtArs(h.amount_ars)} @ $${num(h.exchange_rate).toLocaleString("es-AR")}` : "-"}
                  </td>
                  <td style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{h.notes || "-"}</td>
                  <td>
                    <button onClick={() => deletePayment(h.id)} style={{
                      background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
                      color: "#fca5a5", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    }}>✕</button>
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.30)", fontSize: 13 }}>Sin cobros en el período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — GASTOS
// ══════════════════════════════════════════════════════════════════════════════
function GastosTab() {
  const [msg, setMsg]   = useState("");
  const [form, setForm] = useState({
    type: "empresa", category: EXPENSE_CATEGORIES[0],
    description: "", amount: "", currency: "USD",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const [expenses, setExpenses] = useState([]);
  const [totals, setTotals]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState({ from: "", to: "", type: "", currency: "" });

  async function loadExpenses() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filter.from) qs.set("from", filter.from);
    if (filter.to) qs.set("to", filter.to);
    if (filter.type) qs.set("type", filter.type);
    if (filter.currency) qs.set("currency", filter.currency);
    try {
      const res = await fetch(`${API}/cash/expenses?${qs}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) { setExpenses(data.rows || []); setTotals(data.totals || {}); }
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }

  async function addExpense() {
    if (!form.description.trim()) return setMsg("Ingresá una descripción");
    const amt = Number(String(form.amount).replace(",", "."));
    if (!amt || amt <= 0) return setMsg("Monto inválido");
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${API}/cash/expenses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg("Gasto registrado ✅");
      setForm(f => ({ ...f, description: "", amount: "" }));
      await loadExpenses();
    } catch { setMsg("Error de red"); }
    finally { setSaving(false); }
  }

  async function deleteExpense(id) {
    if (!confirm("¿Eliminar este gasto?")) return;
    const res = await fetch(`${API}/cash/expenses/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) { setMsg("Gasto eliminado"); await loadExpenses(); }
    else setMsg("Error eliminando");
  }

  useEffect(() => { loadExpenses(); }, []); // eslint-disable-line

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MsgBanner msg={msg} onClose={() => setMsg("")} />

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10 }}>
        <KpiCard icon="🏢" label="Gastos empresa USD" value={fmtUsd(totals.empresa_USD)} accent="#3b82f6" />
        <KpiCard icon="🏢" label="Gastos empresa ARS" value={fmtArs(totals.empresa_ARS)} accent="#3b82f6" />
        <KpiCard icon="👤" label="Gastos personales USD" value={fmtUsd(totals.personal_USD)} accent="#a78bfa" />
        <KpiCard icon="👤" label="Gastos personales ARS" value={fmtArs(totals.personal_ARS)} accent="#a78bfa" />
        <KpiCard icon="📊" label="Total USD" value={fmtUsd(totals.USD)} accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
        <KpiCard icon="📊" label="Total ARS" value={fmtArs(totals.ARS)} accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
      </div>

      {/* ── Formulario nuevo gasto ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>REGISTRAR GASTO</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
          {/* Tipo */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>TIPO</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["empresa","🏢 Empresa"],["personal","👤 Personal"]].map(([v,l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))} style={{
                  flex: 1, height: 40, borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                  background: form.type === v ? (v === "empresa" ? "#3b82f6" : "#a78bfa") : "rgba(255,255,255,0.07)",
                  color: form.type === v ? "#fff" : "rgba(255,255,255,0.60)",
                  transition: "all 0.15s",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Categoría */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>CATEGORÍA</div>
            <select className="input" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Moneda */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>MONEDA</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["USD","💵 USD"],["ARS","💴 ARS"]].map(([v,l]) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, currency: v }))} style={{
                  flex: 1, height: 40, borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                  background: form.currency === v ? (v === "USD" ? "#22c55e" : "#ffd200") : "rgba(255,255,255,0.07)",
                  color: form.currency === v ? "#0b1020" : "rgba(255,255,255,0.60)",
                  transition: "all 0.15s",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>FECHA</div>
            <input type="date" className="input" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>DESCRIPCIÓN</div>
              <input className="input" placeholder="Ej: Alquiler local diciembre" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addExpense()} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>
                MONTO ({form.currency})
              </div>
              <input className="input" placeholder="0.00" inputMode="decimal" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addExpense()}
                style={{ maxWidth: 200 }} />
            </div>
          </div>
          <button className="btn btnPrimary" onClick={addExpense} disabled={saving}
            style={{ height: 46, padding: "0 24px", fontWeight: 800, fontSize: 14, alignSelf: "end" }}>
            {saving ? "…" : "+ Agregar"}
          </button>
        </div>
      </div>

      {/* ── Tabla de gastos ── */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>HISTORIAL DE GASTOS</div>

        {/* Filtros */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <input type="date" className="input" value={filter.from}
            onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
          <input type="date" className="input" value={filter.to}
            onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
          <select className="input" value={filter.type}
            onChange={e => setFilter(f => ({ ...f, type: e.target.value }))} style={{ width: 160 }}>
            <option value="">Todos los tipos</option>
            <option value="empresa">🏢 Empresa</option>
            <option value="personal">👤 Personal</option>
          </select>
          <select className="input" value={filter.currency}
            onChange={e => setFilter(f => ({ ...f, currency: e.target.value }))} style={{ width: 130 }}>
            <option value="">Todas las monedas</option>
            <option value="USD">💵 USD</option>
            <option value="ARS">💴 ARS</option>
          </select>
          <button className="btn" onClick={loadExpenses} disabled={loading}
            style={{ height: 42, padding: "0 16px" }}>
            {loading ? "…" : "Filtrar"}
          </button>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>TIPO</th>
                <th>CATEGORÍA</th>
                <th>DESCRIPCIÓN</th>
                <th>MONTO</th>
                <th>MONEDA</th>
                <th>OPERADOR</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDateOnly(e.date)}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: e.type === "empresa" ? "rgba(59,130,246,0.15)" : "rgba(167,139,250,0.15)",
                      border: `1px solid ${e.type === "empresa" ? "rgba(59,130,246,0.35)" : "rgba(167,139,250,0.35)"}`,
                      color: e.type === "empresa" ? "#93c5fd" : "#c4b5fd",
                    }}>
                      {e.type === "empresa" ? "🏢 Empresa" : "👤 Personal"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{e.category}</td>
                  <td style={{ fontSize: 13 }}>{e.description}</td>
                  <td>
                    <b style={{ color: e.currency === "USD" ? "#22c55e" : "#ffd200" }}>
                      {e.currency === "USD" ? fmtUsd(e.amount) : fmtArs(e.amount)}
                    </b>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                      background: e.currency === "USD" ? "rgba(34,197,94,0.15)" : "rgba(255,210,0,0.15)",
                      color: e.currency === "USD" ? "#86efac" : "#ffd200",
                    }}>{e.currency}</span>
                  </td>
                  <td style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{e.operator_name || "-"}</td>
                  <td>
                    <button onClick={() => deleteExpense(e.id)} style={{
                      background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
                      color: "#fca5a5", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                    }}>✕</button>
                  </td>
                </tr>
              ))}
              {!expenses.length && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.30)", fontSize: 13 }}>Sin gastos en el período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function CashRegister() {
  const [tab, setTab] = useState("cobros");

  return (
    <div className="screen" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Topbar title="Caja" />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, margin: "14px 0 0",
        padding: "14px 18px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.3px" }}>Control de Caja</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>
            Cobros a clientes · Gastos · Arqueo
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 }}>
          {[
            { key: "cobros", label: "💵 Cobros" },
            { key: "gastos", label: "📋 Gastos" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              height: 36, padding: "0 20px", borderRadius: 9, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              background: tab === t.key ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "transparent",
              color: tab === t.key ? "#0b1020" : "rgba(255,255,255,0.55)",
              transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === "cobros" ? <CobrosTab /> : <GastosTab />}
      </div>
    </div>
  );
}
