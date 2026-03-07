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
  const [accounts, setAccounts] = useState([]);
  const [payAccount, setPayAccount] = useState("");

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
        account_id: payAccount ? parseInt(payAccount, 10) : null,
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

                    {/* Cuenta destino */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>ACREDITAR EN CUENTA (opcional)</div>
                      <select className="input" value={payAccount} onChange={e => setPayAccount(e.target.value)}>
                        <option value="">— Sin asignar —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                      </select>
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
  const [accounts, setAccounts] = useState([]);

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
        body: JSON.stringify({ ...form, amount: amt, account_id: form.account_id ? parseInt(form.account_id,10) : null }),
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

  useEffect(() => {
    loadExpenses();
    fetch(`${API}/accounts`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});
  }, []); // eslint-disable-line

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

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>DEBITADO DE CUENTA (opcional)</div>
          <select className="input" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} style={{ maxWidth: 280 }}>
            <option value="">— Sin asignar —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
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
// TAB 3 — INGRESOS ADICIONALES
// ══════════════════════════════════════════════════════════════════════════════
const INCOME_CATEGORIES = [
  "Servicios", "Comisiones", "Consultoría", "Venta de activos", "Otros"
];

function IngresosTab() {
  const [msg, setMsg]   = useState("");
  const [form, setForm] = useState({
    category: INCOME_CATEGORIES[0],
    description: "", amount: "", currency: "USD",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving]   = useState(false);
  const [income, setIncome]   = useState([]);
  const [totals, setTotals]   = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState({ from: "", to: "", currency: "" });

  async function loadIncome() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filter.from)     qs.set("from", filter.from);
    if (filter.to)       qs.set("to", filter.to);
    if (filter.currency) qs.set("currency", filter.currency);
    try {
      // Cargar ingresos adicionales y cobros de paquetes en paralelo
      const [incRes, payRes] = await Promise.all([
        fetch(`${API}/cash/income?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        fetch(`${API}/cash/payments?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      const incData = await incRes.json();
      const payData = await payRes.json();

      // Unificar en una lista con tipo
      const incRows = (incData.rows || []).map(r => ({
        ...r,
        _type: "additional",
        _label: r.category,
        _detail: r.description,
        _amount_usd: r.currency === "USD" ? Number(r.amount) : null,
        _amount_ars: r.currency === "ARS" ? Number(r.amount) : null,
        _date: r.date,
      }));

      const payRows = (payData.rows || []).map(r => ({
        ...r,
        _type: "payment",
        _label: `Cobro paquetes — #${r.client_number} ${r.client_name}`,
        _detail: (r.items || []).map(i => i.code).join(", "),
        _amount_usd: Number(r.amount_usd),
        _amount_ars: r.amount_ars ? Number(r.amount_ars) : null,
        _date: r.created_at ? r.created_at.slice(0,10) : null,
      }));

      // Ordenar por fecha desc
      const all = [...incRows, ...payRows].sort((a, b) => {
        const da = a._date || ""; const db = b._date || "";
        return db.localeCompare(da);
      });

      setIncome(all);

      // Totales
      const totalUsd = all.reduce((s, r) => s + (r._amount_usd || 0), 0);
      const totalArs = all.reduce((s, r) => s + (r._amount_ars || 0), 0);
      const fromPkg  = payRows.reduce((s, r) => s + (r._amount_usd || 0), 0);
      const fromAdd  = incRows.filter(r => r.currency === "USD").reduce((s, r) => s + Number(r.amount), 0);
      setTotals({ USD: totalUsd, ARS: totalArs, fromPkg, fromAdd });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function addIncome() {
    if (!form.description.trim()) return setMsg("Ingresá una descripción");
    const amt = Number(String(form.amount).replace(",", "."));
    if (!amt || amt <= 0) return setMsg("Monto inválido");
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${API}/cash/income`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg("Ingreso registrado ✅");
      setForm(f => ({ ...f, description: "", amount: "" }));
      await loadIncome();
    } catch { setMsg("Error de red"); }
    finally { setSaving(false); }
  }

  async function deleteIncome(id) {
    if (!confirm("¿Eliminar este ingreso?")) return;
    const res = await fetch(`${API}/cash/income/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) { setMsg("Ingreso eliminado"); await loadIncome(); }
    else setMsg("Error eliminando");
  }

  useEffect(() => { loadIncome(); }, []); // eslint-disable-line

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MsgBanner msg={msg} onClose={() => setMsg("")} />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
        <KpiCard icon="💰" label="Total ingresos USD" value={fmtUsd(totals.USD)} accent="#22c55e" sub="Paquetes + adicionales" />
        <KpiCard icon="💴" label="Total ingresos ARS" value={fmtArs(totals.ARS)} accent="#ffd200" />
        <KpiCard icon="📦" label="Por cobros paquetes" value={fmtUsd(totals.fromPkg)} accent="#3b82f6" sub="USD cobrado" />
        <KpiCard icon="➕" label="Ingresos adicionales" value={fmtUsd(totals.fromAdd)} accent="#a78bfa" sub="Servicios / otros" />
        <KpiCard icon="📋" label="Registros" value={income.length} sub="En el período" accent="linear-gradient(90deg,#ffd200,#ff8a00)" />
      </div>

      {/* Formulario */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>REGISTRAR INGRESO ADICIONAL</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>CATEGORÍA</div>
            <select className="input" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
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
              <input className="input" placeholder="Ej: Comisión por asesoramiento" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addIncome()} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 700, marginBottom: 6 }}>MONTO ({form.currency})</div>
              <input className="input" placeholder="0.00" inputMode="decimal" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addIncome()}
                style={{ maxWidth: 200 }} />
            </div>
          </div>
          <button className="btn btnPrimary" onClick={addIncome} disabled={saving}
            style={{ height: 46, padding: "0 24px", fontWeight: 800, fontSize: 14, alignSelf: "end" }}>
            {saving ? "…" : "+ Agregar"}
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: "0.5px", marginBottom: 14 }}>HISTORIAL DE INGRESOS ADICIONALES</div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <input type="date" className="input" value={filter.from}
            onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} style={{ width: 150 }} />
          <input type="date" className="input" value={filter.to}
            onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} style={{ width: 150 }} />
          <select className="input" value={filter.currency}
            onChange={e => setFilter(f => ({ ...f, currency: e.target.value }))} style={{ width: 130 }}>
            <option value="">Todas</option>
            <option value="USD">💵 USD</option>
            <option value="ARS">💴 ARS</option>
          </select>
          <button className="btn" onClick={loadIncome} disabled={loading}
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
                <th>CONCEPTO</th>
                <th>DETALLE</th>
                <th>MONTO USD</th>
                <th>MONTO ARS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {income.map((i, idx) => (
                <tr key={`${i._type}-${i.id}-${idx}`}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDateOnly(i._date)}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: i._type === "payment" ? "rgba(59,130,246,0.15)" : "rgba(167,139,250,0.15)",
                      border: `1px solid ${i._type === "payment" ? "rgba(59,130,246,0.35)" : "rgba(167,139,250,0.35)"}`,
                      color: i._type === "payment" ? "#93c5fd" : "#c4b5fd",
                    }}>
                      {i._type === "payment" ? "📦 Paquetes" : "➕ Adicional"}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{i._label}</td>
                  <td style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>{i._detail}</td>
                  <td>
                    {i._amount_usd != null
                      ? <b style={{ color: "#22c55e" }}>{fmtUsd(i._amount_usd)}</b>
                      : <span className="muted">-</span>}
                  </td>
                  <td>
                    {i._amount_ars != null
                      ? <b style={{ color: "#ffd200" }}>{fmtArs(i._amount_ars)}</b>
                      : <span className="muted">-</span>}
                  </td>
                  <td>
                    {i._type === "additional" && (
                      <button onClick={() => deleteIncome(i.id)} style={{
                        background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
                        color: "#fca5a5", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                      }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
              {!income.length && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.30)", fontSize: 13 }}>Sin ingresos en el período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — FONDOS / CUENTAS
// ══════════════════════════════════════════════════════════════════════════════
const ACCOUNT_TYPE_LABELS = {
  usd_cash: { label: "💵 USD Efectivo",       color: "#22c55e" },
  usdt:     { label: "🔷 USDT",               color: "#3b82f6" },
  bank_ars: { label: "🏦 Banco ARS",          color: "#a78bfa" },
  bank_usd: { label: "🏦 Banco USD",          color: "#34d399" },
  prepaid:  { label: "💳 Prepaga",            color: "#fbbf24" },
  other:    { label: "📁 Otra",               color: "#94a3b8" },
};

function FondosTab() {
  const [msg, setMsg]           = useState("");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(false);

  // Nuevo movimiento manual
  const [selAccount, setSelAccount] = useState(null);
  const [movements, setMovements]   = useState([]);
  const [loadingMov, setLoadingMov] = useState(false);
  const [movForm, setMovForm]       = useState({ direction: "in", amount: "", description: "" });
  const [savingMov, setSavingMov]   = useState(false);

  // Nuevo saldo manual
  const [editBalId, setEditBalId]   = useState(null);
  const [editBal, setEditBal]       = useState("");
  const [savingBal, setSavingBal]   = useState(false);

  // Nueva cuenta
  const [showNew, setShowNew]       = useState(false);
  const [newAcc, setNewAcc]         = useState({ name: "", type: "usd_cash", currency: "USD", balance: "0", notes: "" });
  const [savingNew, setSavingNew]   = useState(false);

  async function loadAccounts() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/accounts`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (res.ok) setAccounts(data.accounts || []);
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }

  async function loadMovements(accountId) {
    setLoadingMov(true);
    try {
      const res = await fetch(`${API}/accounts/${accountId}/movements`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (res.ok) setMovements(data.rows || []);
    } catch { /* no-op */ }
    finally { setLoadingMov(false); }
  }

  async function saveBalance(accountId) {
    const amt = Number(String(editBal).replace(",","."));
    if (isNaN(amt)) return setMsg("Monto inválido");
    setSavingBal(true);
    try {
      const res = await fetch(`${API}/accounts/${accountId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ balance: amt }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg("Saldo actualizado ✅");
      setEditBalId(null); setEditBal("");
      await loadAccounts();
    } catch { setMsg("Error de red"); }
    finally { setSavingBal(false); }
  }

  async function addMovement(accountId) {
    const amt = Number(String(movForm.amount).replace(",","."));
    if (!amt || amt <= 0) return setMsg("Monto inválido");
    if (!movForm.description.trim()) return setMsg("Ingresá una descripción");
    setSavingMov(true);
    try {
      const res = await fetch(`${API}/accounts/${accountId}/movements`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ direction: movForm.direction, amount: amt, description: movForm.description }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg(`Movimiento registrado ✅ — nuevo saldo: ${data.balance}`);
      setMovForm({ direction: "in", amount: "", description: "" });
      await loadAccounts();
      await loadMovements(accountId);
    } catch { setMsg("Error de red"); }
    finally { setSavingMov(false); }
  }

  async function createAccount() {
    if (!newAcc.name.trim()) return setMsg("Ingresá un nombre");
    setSavingNew(true);
    try {
      const res = await fetch(`${API}/accounts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAcc, balance: Number(newAcc.balance)||0 }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || "Error"); return; }
      setMsg("Cuenta creada ✅");
      setShowNew(false);
      setNewAcc({ name: "", type: "usd_cash", currency: "USD", balance: "0", notes: "" });
      await loadAccounts();
    } catch { setMsg("Error de red"); }
    finally { setSavingNew(false); }
  }

  async function archiveAccount(id) {
    if (!confirm("¿Archivar esta cuenta?")) return;
    await fetch(`${API}/accounts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    await loadAccounts();
  }

  useEffect(() => { loadAccounts(); }, []); // eslint-disable-line
  useEffect(() => {
    if (selAccount) loadMovements(selAccount.id);
  }, [selAccount]); // eslint-disable-line

  // Totales por moneda
  const totals = accounts.reduce((acc, a) => {
    acc[a.currency] = (acc[a.currency]||0) + Number(a.balance);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <MsgBanner msg={msg} onClose={() => setMsg("")} />

      {/* KPIs totales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
        {Object.entries(totals).map(([cur, bal]) => (
          <KpiCard key={cur} icon={cur==="USD"?"💵":cur==="USDT"?"🔷":"💴"}
            label={`Total ${cur}`} value={cur==="ARS"?fmtArs(bal):fmtUsd(bal)}
            accent={cur==="USD"?"#22c55e":cur==="USDT"?"#3b82f6":"#ffd200"} />
        ))}
      </div>

      {/* Cards de cuentas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {accounts.map(a => {
          const typeInfo = ACCOUNT_TYPE_LABELS[a.type] || ACCOUNT_TYPE_LABELS.other;
          const isSelected = selAccount?.id === a.id;
          const isEditing  = editBalId === a.id;
          return (
            <div key={a.id} style={{
              background: isSelected ? "rgba(255,210,0,0.06)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isSelected ? "rgba(255,210,0,0.30)" : "rgba(255,255,255,0.09)"}`,
              borderRadius: 18, padding: "16px 18px", cursor: "pointer",
              transition: "all 0.15s",
            }} onClick={() => setSelAccount(isSelected ? null : a)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    background: `${typeInfo.color}20`, border: `1px solid ${typeInfo.color}44`, color: typeInfo.color,
                  }}>{typeInfo.label}</span>
                  <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>{a.name}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); archiveAccount(a.id); }} style={{
                  background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)",
                  color: "#fca5a5", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11,
                }}>✕</button>
              </div>

              <div style={{ marginBottom: 10 }}>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    <input className="input" value={editBal} onChange={e => setEditBal(e.target.value)}
                      inputMode="decimal" placeholder="Nuevo saldo" style={{ flex: 1 }} autoFocus />
                    <button className="btn btnPrimary" onClick={() => saveBalance(a.id)} disabled={savingBal}
                      style={{ height: 40, padding: "0 14px" }}>{savingBal ? "…" : "✓"}</button>
                    <button className="btn" onClick={() => setEditBalId(null)}
                      style={{ height: 40, padding: "0 10px" }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 26, fontWeight: 900, color: Number(a.balance) >= 0 ? typeInfo.color : "#ef4444" }}>
                      {a.currency === "ARS" ? fmtArs(a.balance) : fmtUsd(a.balance)}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{a.currency}</span>
                    <button onClick={e => { e.stopPropagation(); setEditBalId(a.id); setEditBal(String(a.balance)); }}
                      style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", background: "none", border: "none", cursor: "pointer", marginLeft: 4 }}>
                      ✏
                    </button>
                  </div>
                )}
              </div>

              {a.notes && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{a.notes}</div>}
            </div>
          );
        })}

        {/* Nueva cuenta */}
        {!showNew ? (
          <div onClick={() => setShowNew(true)} style={{
            background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 18, padding: "16px 18px", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(255,255,255,0.35)",
            fontSize: 14, fontWeight: 700, minHeight: 100,
          }}>
            + Nueva cuenta
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,210,0,0.25)", borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 12, color: "#ffd200" }}>NUEVA CUENTA</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input className="input" placeholder="Nombre (ej: Efectivo caja)" value={newAcc.name}
                onChange={e => setNewAcc(a => ({ ...a, name: e.target.value }))} />
              <select className="input" value={newAcc.type}
                onChange={e => setNewAcc(a => ({ ...a, type: e.target.value }))}>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="input" value={newAcc.currency}
                onChange={e => setNewAcc(a => ({ ...a, currency: e.target.value }))}>
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
                <option value="USDT">USDT</option>
              </select>
              <input className="input" placeholder="Saldo inicial" inputMode="decimal" value={newAcc.balance}
                onChange={e => setNewAcc(a => ({ ...a, balance: e.target.value }))} />
              <input className="input" placeholder="Notas (opcional)" value={newAcc.notes}
                onChange={e => setNewAcc(a => ({ ...a, notes: e.target.value }))} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btnPrimary" onClick={createAccount} disabled={savingNew}
                  style={{ flex: 1, height: 40 }}>{savingNew ? "…" : "Crear"}</button>
                <button className="btn" onClick={() => setShowNew(false)} style={{ height: 40, padding: "0 14px" }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panel de movimientos de cuenta seleccionada */}
      {selAccount && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,210,0,0.20)", borderRadius: 18, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: "#ffd200" }}>
            📋 Movimientos — {selAccount.name}
          </div>

          {/* Form movimiento manual */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[["in","⬆ Ingreso","#22c55e"],["out","⬇ Egreso","#ef4444"]].map(([v,l,c]) => (
                <button key={v} onClick={() => setMovForm(f => ({ ...f, direction: v }))} style={{
                  height: 40, padding: "0 16px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 12,
                  background: movForm.direction === v ? c : "rgba(255,255,255,0.07)",
                  color: movForm.direction === v ? "#fff" : "rgba(255,255,255,0.55)",
                }}>{l}</button>
              ))}
            </div>
            <input className="input" placeholder="Monto" inputMode="decimal" value={movForm.amount}
              onChange={e => setMovForm(f => ({ ...f, amount: e.target.value }))} style={{ width: 130 }} />
            <input className="input" placeholder="Descripción" value={movForm.description}
              onChange={e => setMovForm(f => ({ ...f, description: e.target.value }))} style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btnPrimary" onClick={() => addMovement(selAccount.id)} disabled={savingMov}
              style={{ height: 42, padding: "0 18px" }}>{savingMov ? "…" : "Registrar"}</button>
          </div>

          {/* Tabla movimientos */}
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr><th>FECHA</th><th>TIPO</th><th>DESCRIPCIÓN</th><th>MONTO</th><th>SALDO DESPUÉS</th></tr>
              </thead>
              <tbody>
                {loadingMov ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: "rgba(255,255,255,0.30)" }}>Cargando…</td></tr>
                ) : movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(m.created_at)}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: m.direction==="in" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: m.direction==="in" ? "#86efac" : "#fca5a5",
                      }}>{m.direction==="in" ? "⬆ Ingreso" : "⬇ Egreso"}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>{m.description}</td>
                    <td>
                      <b style={{ color: m.direction==="in" ? "#22c55e" : "#ef4444" }}>
                        {m.direction==="in" ? "+" : "-"}{fmtUsd(m.amount)}
                      </b>
                    </td>
                    <td style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                      {m.balance_after != null ? fmtUsd(m.balance_after) : "-"}
                    </td>
                  </tr>
                ))}
                {!loadingMov && !movements.length && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.30)" }}>Sin movimientos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function CashRegister() {
  const [tab, setTab] = useState("cobros");
  const [fxRate, setFxRate]   = useState(null);
  const [fxInput, setFxInput] = useState("");
  const [savingFx, setSavingFx] = useState(false);
  const [fxMsg, setFxMsg]     = useState("");

  React.useEffect(() => {
    fetch(`${API}/settings/fx`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => { if (d.rate) { setFxRate(d.rate); setFxInput(String(d.rate)); } })
      .catch(() => {});
  }, []); // eslint-disable-line

  async function saveFx() {
    const n = Number(String(fxInput).replace(",","."));
    if (!n || n <= 0) return setFxMsg("Valor inválido");
    setSavingFx(true); setFxMsg("");
    try {
      const res = await fetch(`${API}/settings/fx`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rate: n }),
      });
      if (res.ok) setFxMsg("✅ Guardado");
      else setFxMsg("Error");
    } catch { setFxMsg("Error de red"); }
    finally { setSavingFx(false); setTimeout(() => setFxMsg(""), 2500); }
  }

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
            { key: "cobros",   label: "💵 Cobros" },
            { key: "ingresos", label: "➕ Ingresos" },
            { key: "gastos",   label: "📋 Gastos" },
            { key: "fondos",   label: "💳 Fondos" },
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

      {/* FX widget */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "8px 14px" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>💱 USD/ARS hoy</span>
          <input
            className="input"
            value={fxInput}
            onChange={e => setFxInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveFx()}
            inputMode="decimal"
            placeholder="Ej: 1200"
            style={{ width: 110, height: 34, fontSize: 14 }}
          />
          <button className="btn btnPrimary" onClick={saveFx} disabled={savingFx}
            style={{ height: 34, padding: "0 14px", fontSize: 12 }}>
            {savingFx ? "…" : "Guardar"}
          </button>
          {fxMsg
            ? <span style={{ fontSize: 12, color: "#86efac" }}>{fxMsg}</span>
            : fxRate && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Actual: ${Number(fxRate).toLocaleString("es-AR")}</span>
          }
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === "cobros"   ? <CobrosTab />   :
         tab === "ingresos" ? <IngresosTab /> :
         tab === "gastos"   ? <GastosTab />   :
         <FondosTab />}
      </div>
    </div>
  );
}