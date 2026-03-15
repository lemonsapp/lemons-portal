// client/src/pages/ExternalCargo.jsx
import { useEffect, useState, useMemo } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");
const h = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

const fmtUsd = v => `$${Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate = v => { try { return new Date(v).toLocaleDateString("es-AR"); } catch { return v||"-"; } };

const STATUS_ITEM = ["EN DEPOSITO","ENTREGADO"];

const STATUS_COLORS = {
  "EN DEPOSITO": { bg:"rgba(239,68,68,0.15)",  border:"rgba(239,68,68,0.35)",  text:"#f87171" },
  "ENTREGADO":   { bg:"rgba(34,197,94,0.15)",  border:"rgba(34,197,94,0.35)",  text:"#4ade80" },
};
function Badge({ text, colors }) {
  const c = colors || STATUS_COLORS[text] || {};
  return (
    <span style={{
      fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6,
      background: c.bg||"rgba(255,255,255,0.08)",
      border:`1px solid ${c.border||"rgba(255,255,255,0.15)"}`,
      color: c.text||"#fff",
    }}>{text}</span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1200,
      background:"rgba(0,0,0,0.65)", display:"grid", placeItems:"center",
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#0f1628", border:"1px solid rgba(255,255,255,0.12)",
        borderRadius:20, padding:"26px 28px", width:"100%", maxWidth:520,
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontWeight:900, fontSize:17 }}>{title}</div>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,0.08)", border:"none", borderRadius:8,
            width:32, height:32, cursor:"pointer", color:"#fff", fontSize:16,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:6, letterSpacing:1 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
  borderRadius:10, color:"#fff", fontSize:14, padding:"10px 14px", outline:"none", boxSizing:"border-box",
};
const sel = { ...inp };
const btn = (primary) => ({
  height:40, padding:"0 20px", borderRadius:10, border:"none", cursor:"pointer",
  fontWeight:700, fontSize:13,
  background: primary ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "rgba(255,255,255,0.08)",
  color: primary ? "#0b1020" : "rgba(255,255,255,0.75)",
  transition:"all 0.15s",
});

// ─────────────────────────────────────────────────────────────────
export default function ExternalCargo() {
  const [tab, setTab]           = useState("boxes");   // boxes | cierres
  const [msg, setMsg]           = useState("");
  const [boxes, setBoxes]       = useState([]);
  const [cierres, setCierres]   = useState([]);
  const [loading, setLoading]   = useState(false);

  // Box modal
  const [boxModal, setBoxModal] = useState(false);
  const [boxForm, setBoxForm]   = useState({ box_number:"", date_received:"", total_kg:"", notes:"" });
  const [savingBox, setSavingBox] = useState(false);

  // Items modal
  const [itemsBox, setItemsBox] = useState(null); // box seleccionada
  const [items, setItems]       = useState([]);
  const [itemForm, setItemForm] = useState({ client_name:"", tracking:"", weight_kg:"", status:"EN DEPOSITO", tariff_per_kg:"2", is_commission:true, notes:"" });
  const [savingItem, setSavingItem] = useState(false);
  const [editItemId, setEditItemId] = useState(null);

  // Cierre modal
  const [cierreModal, setCierreModal] = useState(false);
  const [cierreForm, setCierreForm]   = useState({ label:"", date_from:"", date_to:"", notes:"" });
  const [savingCierre, setSavingCierre] = useState(false);
  const [editCierreModal, setEditCierreModal] = useState(false);
  const [editCierreForm, setEditCierreForm]   = useState({ label:"", date_from:"", date_to:"", notes:"" });
  const [savingEditCierre, setSavingEditCierre] = useState(false);

  // Cierre detalle
  const [activeCierre, setActiveCierre] = useState(null);
  const [cierreDetail, setCierreDetail] = useState(null);
  const [dedForm, setDedForm]           = useState({ description:"", amount:"" });
  const [accounts, setAccounts]         = useState([]);
  const [cierrePayments, setCierrePayments] = useState([]);
  const [payForm, setPayForm]           = useState({ account_id:"", amount:"", currency:"USD", notes:"" });
  const [savingPay, setSavingPay]       = useState(false);
  const [registeringCosts, setRegisteringCosts] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────
  async function loadBoxes() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/external/boxes`, { headers: h() });
      const d = await r.json();
      setBoxes(d.boxes || []);
    } catch { setMsg("Error cargando cajas"); }
    finally { setLoading(false); }
  }

  async function loadCierres() {
    try {
      const r = await fetch(`${API}/external/cierres`, { headers: h() });
      const d = await r.json();
      setCierres(d.cierres || []);
    } catch { setMsg("Error cargando cierres"); }
  }

  async function loadItems(boxId) {
    const r = await fetch(`${API}/external/boxes/${boxId}`, { headers: h() });
    const d = await r.json();
    setItems(d.items || []);
  }

  async function loadCierreDetail(id) {
    const r = await fetch(`${API}/external/cierres/${id}`, { headers: h() });
    const d = await r.json();
    setCierreDetail(d);
  }

  async function loadAccounts() {
    try {
      const r = await fetch(`${API}/accounts/summary`, { headers: h() });
      const d = await r.json();
      setAccounts(d.accounts || []);
    } catch { /* no-op */ }
  }

  async function loadCierrePayments(cierreId) {
    try {
      const r = await fetch(`${API}/external/cierres/${cierreId}/payments`, { headers: h() });
      const d = await r.json();
      setCierrePayments(d.payments || []);
    } catch { /* no-op */ }
  }

  useEffect(() => { loadBoxes(); loadCierres(); loadAccounts(); }, []);

  // ── Cajas ─────────────────────────────────────────────────────
  async function saveBox() {
    if (!boxForm.box_number || !boxForm.date_received) return setMsg("Número y fecha requeridos");
    setSavingBox(true);
    try {
      const r = await fetch(`${API}/external/boxes`, {
        method:"POST", headers:h(), body:JSON.stringify(boxForm),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error);
      setMsg(`Caja ${d.box.box_number} creada`);
      setBoxModal(false);
      setBoxForm({ box_number:"", date_received:"", total_kg:"", notes:"" });
      await loadBoxes();
    } catch { setMsg("Error de red"); }
    finally { setSavingBox(false); }
  }

  async function deleteBox(id) {
    if (!confirm("¿Eliminar caja y todos sus ítems?")) return;
    await fetch(`${API}/external/boxes/${id}`, { method:"DELETE", headers:h() });
    await loadBoxes();
  }

  // ── Ítems ─────────────────────────────────────────────────────
  async function openItems(box) {
    setItemsBox(box);
    await loadItems(box.id);
  }

  async function saveItem() {
    if (!itemForm.client_name || !itemForm.weight_kg) return setMsg("Cliente y peso requeridos");
    setSavingItem(true);
    try {
      const url  = editItemId
        ? `${API}/external/items/${editItemId}`
        : `${API}/external/boxes/${itemsBox.id}/items`;
      const meth = editItemId ? "PATCH" : "POST";
      const r = await fetch(url, { method:meth, headers:h(), body:JSON.stringify({
        ...itemForm,
        weight_kg: Number(itemForm.weight_kg),
        tariff_per_kg: Number(itemForm.tariff_per_kg || 2),
      })});
      const d = await r.json();
      if (!r.ok) return setMsg(d.error);
      setEditItemId(null);
      setItemForm({ client_name:"", tracking:"", weight_kg:"", status:"EN DEPOSITO", tariff_per_kg:"2", is_commission:true, notes:"" });
      await loadItems(itemsBox.id);
      await loadBoxes();
    } catch { setMsg("Error de red"); }
    finally { setSavingItem(false); }
  }

  async function deleteItem(id) {
    await fetch(`${API}/external/items/${id}`, { method:"DELETE", headers:h() });
    await loadItems(itemsBox.id);
    await loadBoxes();
  }

  async function toggleItemStatus(item) {
    const newStatus = item.status === "EN DEPOSITO" ? "ENTREGADO" : "EN DEPOSITO";
    await fetch(`${API}/external/items/${item.id}`, {
      method:"PATCH", headers:h(), body:JSON.stringify({ status:newStatus }),
    });
    await loadItems(itemsBox.id);
  }

  // ── Cierres ───────────────────────────────────────────────────
  async function saveCierre() {
    if (!cierreForm.label) return setMsg("Label requerido");
    setSavingCierre(true);
    try {
      const r = await fetch(`${API}/external/cierres`, {
        method:"POST", headers:h(), body:JSON.stringify(cierreForm),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error);
      setMsg(`Cierre "${d.cierre.label}" creado`);
      setCierreModal(false);
      setCierreForm({ label:"", date_from:"", date_to:"", notes:"" });
      await loadCierres();
    } catch { setMsg("Error de red"); }
    finally { setSavingCierre(false); }
  }

  async function saveEditCierre() {
    if (!editCierreForm.label) return setMsg("Label requerido");
    setSavingEditCierre(true);
    try {
      const r = await fetch(`${API}/external/cierres/${activeCierre.id}`, {
        method:"PATCH", headers:h(), body:JSON.stringify(editCierreForm),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error);
      setMsg(`Cierre "${d.cierre.label}" actualizado`);
      setEditCierreModal(false);
      setActiveCierre(d.cierre);
      await loadCierres();
      await loadCierreDetail(activeCierre.id);
    } catch { setMsg("Error de red"); }
    finally { setSavingEditCierre(false); }
  }

  async function openCierre(cierre) {
    setActiveCierre(cierre);
    setCierrePayments([]);
    await loadCierreDetail(cierre.id);
    await loadCierrePayments(cierre.id);
  }

  async function payCierre() {
    if (!payForm.account_id || !payForm.amount) return setMsg("Completá cuenta y monto");
    setSavingPay(true);
    try {
      const r = await fetch(`${API}/external/cierres/${activeCierre.id}/pay`, {
        method:"POST", headers:h(),
        body:JSON.stringify({
          payments:[{ account_id:payForm.account_id, amount:Number(payForm.amount), currency:payForm.currency }],
          notes:payForm.notes,
        }),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || "Error");
      setMsg(`✅ Pago registrado — descuento aplicado a la cuenta`);
      setPayForm({ account_id:"", amount:"", currency:"USD", notes:"" });
      await loadCierrePayments(activeCierre.id);
    } catch { setMsg("Error de red"); }
    finally { setSavingPay(false); }
  }

  async function registerCosts() {
    if (!cierreDetail?.cierre?.date_from || !cierreDetail?.cierre?.date_to)
      return setMsg("El cierre necesita fechas para registrar costos");
    setRegisteringCosts(true);
    try {
      const r = await fetch(`${API}/external/register-costs`, {
        method:"POST", headers:h(),
        body:JSON.stringify({
          date_from: cierreDetail.cierre.date_from,
          date_to:   cierreDetail.cierre.date_to,
          cierre_label: activeCierre.label,
          account_id: payForm.account_id || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) return setMsg(d.error || "Error");
      setMsg(`✅ Costos registrados en caja — ${fmtUsd(d.total)} USD`);
    } catch { setMsg("Error de red"); }
    finally { setRegisteringCosts(false); }
  }

  async function addDeduction() {
    if (!dedForm.description || dedForm.amount === "") return setMsg("Completá descripción y monto");
    await fetch(`${API}/external/cierres/${activeCierre.id}/deductions`, {
      method:"POST", headers:h(),
      body:JSON.stringify({ description:dedForm.description, amount:Number(dedForm.amount) }),
    });
    setDedForm({ description:"", amount:"" });
    await loadCierreDetail(activeCierre.id);
  }

  async function removeDeduction(id) {
    await fetch(`${API}/external/deductions/${id}`, { method:"DELETE", headers:h() });
    await loadCierreDetail(activeCierre.id);
  }

  async function assignBoxToCierre(boxId, cierreId) {
    await fetch(`${API}/external/cierres/${cierreId}/assign-boxes`, {
      method:"POST", headers:h(), body:JSON.stringify({ box_ids:[boxId] }),
    });
    await loadBoxes();
    if (activeCierre?.id === Number(cierreId)) await loadCierreDetail(cierreId);
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#080d1c", color:"#fff", fontFamily:"'Inter','Segoe UI',sans-serif" }}>
      <Topbar title="Cargas Externas" />

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"20px 16px 60px" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:900 }}>📦 Cargas Externas</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"rgba(255,255,255,0.45)" }}>
              Gestión de cajas, ítems y cierres semanales
            </p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setBoxModal(true)} style={btn(true)}>+ Nueva caja</button>
            <button onClick={() => setCierreModal(true)} style={{...btn(false), border:"1px solid rgba(255,210,0,0.3)", color:"#ffd200"}}>+ Nuevo cierre</button>
          </div>
        </div>

        {msg && (
          <div onClick={() => setMsg("")} style={{
            marginBottom:16, padding:"10px 16px", borderRadius:12, fontSize:13, fontWeight:600, cursor:"pointer",
            background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.3)", color:"#86efac",
          }}>{msg}</div>
        )}

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {[{k:"boxes",label:"📦 Cajas"},{k:"cierres",label:"🔒 Cierres"}].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              height:38, padding:"0 20px", borderRadius:10, border:"none", cursor:"pointer",
              fontWeight:700, fontSize:13, transition:"all 0.15s",
              background: tab===t.k ? "linear-gradient(135deg,#ffd200,#ff8a00)" : "rgba(255,255,255,0.06)",
              color: tab===t.k ? "#0b1020" : "rgba(255,255,255,0.6)",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ══════ TAB: CAJAS ══════ */}
        {tab === "boxes" && (
          <div>
            {loading ? (
              <div style={{ textAlign:"center", padding:60, color:"rgba(255,255,255,0.3)" }}>Cargando…</div>
            ) : boxes.length === 0 ? (
              <div style={{ textAlign:"center", padding:60, color:"rgba(255,255,255,0.3)" }}>
                No hay cajas cargadas. Creá la primera.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {boxes.map(box => (
                  <div key={box.id} style={{
                    background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
                    borderRadius:16, padding:"16px 20px",
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{
                          background:"linear-gradient(135deg,#ffd200,#ff8a00)", borderRadius:10,
                          padding:"8px 14px", fontWeight:900, fontSize:15, color:"#0b1020",
                        }}>{box.box_number}</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:14 }}>
                            📦 Caja
                          </div>
                          <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", marginTop:2 }}>
                            {fmtDate(box.date_received)} · {Number(box.items_kg||0).toFixed(2)} kg · {box.items_count||0} ítems
                          </div>
                          {box.cierre_id && (
                            <div style={{ fontSize:11, color:"#ffd200", marginTop:2 }}>
                              🔒 Asignado a cierre #{box.cierre_id}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>Comisión</div>
                          <div style={{ fontWeight:800, color:"#4ade80" }}>
                            {fmtUsd(Number(box.commission_kg||0) * 2)}
                          </div>
                        </div>
                        <button onClick={() => openItems(box)} style={{...btn(true), height:36, fontSize:12}}>
                          Ver ítems ({box.items_count||0})
                        </button>
                        {/* Asignar a cierre */}
                        <select
                          defaultValue=""
                          onChange={e => { if (e.target.value) assignBoxToCierre(box.id, e.target.value); }}
                          style={{ ...sel, width:160, height:36, fontSize:12, padding:"0 10px" }}
                        >
                          <option value="">Asignar a cierre…</option>
                          {cierres.filter(c=>c.status==="open").map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                        <button onClick={() => deleteBox(box.id)} style={{
                          height:36, width:36, borderRadius:8, border:"1px solid rgba(239,68,68,0.3)",
                          background:"rgba(239,68,68,0.08)", color:"#f87171", cursor:"pointer", fontSize:14,
                        }}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════ TAB: CIERRES ══════ */}
        {tab === "cierres" && (
          <div style={{ display:"grid", gridTemplateColumns: activeCierre ? "1fr 1.4fr" : "1fr", gap:16 }}>
            {/* Lista cierres */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {cierres.length === 0 ? (
                <div style={{ textAlign:"center", padding:60, color:"rgba(255,255,255,0.3)" }}>
                  No hay cierres. Creá el primero.
                </div>
              ) : cierres.map(c => (
                <div key={c.id} onClick={() => openCierre(c)} style={{
                  background: activeCierre?.id===c.id ? "rgba(255,210,0,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${activeCierre?.id===c.id ? "rgba(255,210,0,0.4)" : "rgba(255,255,255,0.09)"}`,
                  borderRadius:14, padding:"14px 18px", cursor:"pointer", transition:"all 0.15s",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:15 }}>{c.label}</div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:3 }}>
                        {c.date_from ? `${fmtDate(c.date_from)} → ${fmtDate(c.date_to)}` : "Sin rango de fechas"}
                      </div>
                    </div>
                    <Badge text={c.status==="open" ? "ABIERTO" : "CERRADO"} colors={
                      c.status==="open"
                        ? {bg:"rgba(34,197,94,0.12)",border:"rgba(34,197,94,0.3)",text:"#4ade80"}
                        : {bg:"rgba(255,255,255,0.06)",border:"rgba(255,255,255,0.15)",text:"rgba(255,255,255,0.5)"}
                    }/>
                  </div>
                </div>
              ))}
            </div>

            {/* Detalle cierre */}
            {activeCierre && cierreDetail && (
              <div style={{
                background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)",
                borderRadius:18, padding:"20px 22px",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <h3 style={{ margin:0, fontSize:17, fontWeight:900 }}>{activeCierre.label}</h3>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <button onClick={() => {
                      setEditCierreForm({
                        label: activeCierre.label,
                        date_from: activeCierre.date_from ? activeCierre.date_from.slice(0,10) : "",
                        date_to: activeCierre.date_to ? activeCierre.date_to.slice(0,10) : "",
                        notes: activeCierre.notes || "",
                      });
                      setEditCierreModal(true);
                    }} style={{
                      height:32, padding:"0 12px", borderRadius:8, border:"1px solid rgba(255,210,0,0.3)",
                      background:"rgba(255,210,0,0.08)", color:"#ffd200", fontSize:12, fontWeight:700, cursor:"pointer",
                    }}>✏️ Editar</button>
                    <button onClick={() => setActiveCierre(null)} style={{
                      background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:18,
                    }}>✕</button>
                  </div>
                </div>

                {/* Grupos de envíos Lemons por origen+fecha */}
                {cierreDetail.grouped?.length > 0 ? cierreDetail.grouped.map((g, i) => (
                  <div key={i} style={{ marginBottom:8 }}>
                    <div style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)",
                      borderRadius:8, padding:"8px 14px", fontWeight:700, fontSize:12,
                    }}>
                      <span style={{ color:"#4ade80" }}>{g.label}</span>
                      <span style={{ color:"#4ade80" }}>{fmtUsd(g.subtotal)}</span>
                    </div>
                    {/* Detalle de envíos del grupo */}
                    {g.shipments?.map(s => (
                      <div key={s.id} style={{
                        display:"flex", justifyContent:"space-between",
                        padding:"5px 14px", fontSize:11, color:"rgba(255,255,255,0.5)",
                        borderLeft:"2px solid rgba(34,197,94,0.2)",
                        marginLeft:4,
                      }}>
                        <span>{s.code} · {s.client_name} · {Number(s.weight_kg).toFixed(2)}kg</span>
                        <span>{fmtUsd(s.cost)}</span>
                      </div>
                    ))}
                  </div>
                )) : (
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)", padding:"8px 0", textAlign:"center" }}>
                    Sin envíos en el período de este cierre
                  </div>
                )}

                {/* Notas adicionales */}
                {cierreDetail.notes?.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{
                      display:"flex", justifyContent:"space-between",
                      background:"rgba(255,255,255,0.06)", borderRadius:8, padding:"8px 14px",
                      fontWeight:700, fontSize:12,
                    }}>
                      <span>NOTAS ADICIONALES</span>
                      <span>{fmtUsd(cierreDetail.summary?.total_notes)}</span>
                    </div>
                  </div>
                )}

                {/* Línea total */}
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", margin:"14px 0", padding:"10px 0" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:14 }}>
                    <span>SUBTOTAL</span>
                    <span>{fmtUsd((cierreDetail.summary?.total_cargas||0) + (cierreDetail.summary?.total_notes||0))}</span>
                  </div>
                </div>

                {/* Comisión automática */}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:8, color:"#4ade80" }}>
                  <span>COMISIÓN ($2/kg clientes externos)</span>
                  <span>-{fmtUsd(cierreDetail.summary?.total_commission)}</span>
                </div>

                {/* Descuentos */}
                {cierreDetail.deductions?.map(d => (
                  <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13, marginBottom:6, color:"#f87171" }}>
                    <span>{d.description}</span>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <span>{Number(d.amount) < 0 ? "-" : "+"}{fmtUsd(Math.abs(d.amount))}</span>
                      <button onClick={() => removeDeduction(d.id)} style={{
                        background:"none", border:"none", color:"rgba(239,68,68,0.6)", cursor:"pointer", fontSize:14,
                      }}>✕</button>
                    </div>
                  </div>
                ))}

                {/* Total final */}
                <div style={{
                  borderTop:"2px solid rgba(255,210,0,0.3)", marginTop:14, paddingTop:14,
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                }}>
                  <span style={{ fontWeight:900, fontSize:16 }}>TOTAL FINAL</span>
                  <span style={{ fontWeight:900, fontSize:24, color:"#ffd200" }}>
                    {fmtUsd(cierreDetail.summary?.total_final)}
                  </span>
                </div>

                {/* Agregar descuento */}
                <div style={{ marginTop:18, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:10 }}>
                    + AGREGAR DESCUENTO / ADICIONAL
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <input placeholder="Descripción (ej: POD DEVOLUCION)"
                      value={dedForm.description}
                      onChange={e => setDedForm(f=>({...f,description:e.target.value}))}
                      style={{...inp, flex:2}}
                    />
                    <input placeholder="-217.60" type="number"
                      value={dedForm.amount}
                      onChange={e => setDedForm(f=>({...f,amount:e.target.value}))}
                      style={{...inp, width:110}}
                    />
                    <button onClick={addDeduction} style={btn(true)}>+</button>
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:6 }}>
                    Negativo (-) para descuento, positivo (+) para adicional
                  </div>
                </div>

                {/* ── Panel de pago ── */}
                <div style={{ marginTop:18, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:10 }}>
                    💳 REGISTRAR PAGO
                  </div>

                  {/* Historial de pagos */}
                  {cierrePayments.length > 0 && (
                    <div style={{ marginBottom:12 }}>
                      {cierrePayments.map(p => (
                        <div key={p.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.6)" }}>
                          <span>💸 {p.account_name || "Sin cuenta"}</span>
                          <span style={{ color:"#4ade80", fontWeight:700 }}>-{fmtUsd(p.amount)}</span>
                        </div>
                      ))}
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginTop:6, fontWeight:800 }}>
                        <span>Total pagado</span>
                        <span style={{ color:"#4ade80" }}>{fmtUsd(cierrePayments.reduce((s,p)=>s+Number(p.amount),0))}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                    <select
                      value={payForm.account_id}
                      onChange={e => setPayForm(f=>({...f, account_id:e.target.value}))}
                      style={{ ...sel, flex:2, minWidth:140 }}
                    >
                      <option value="">Elegir cuenta…</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency} — saldo: {a.currency==="ARS" ? `$${Number(a.balance).toLocaleString("es-AR",{maximumFractionDigits:0})}` : `$${Number(a.balance).toFixed(2)}`})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number" placeholder="Monto"
                      value={payForm.amount}
                      onChange={e => setPayForm(f=>({...f,amount:e.target.value}))}
                      style={{ ...inp, width:110 }}
                    />
                    <select
                      value={payForm.currency}
                      onChange={e => setPayForm(f=>({...f,currency:e.target.value}))}
                      style={{ ...sel, width:80 }}
                    >
                      <option value="USD">USD</option>
                      <option value="USDT">USDT</option>
                      <option value="ARS">ARS</option>
                    </select>
                  </div>
                  <input
                    placeholder="Nota del pago (opcional)"
                    value={payForm.notes}
                    onChange={e => setPayForm(f=>({...f,notes:e.target.value}))}
                    style={{ ...inp, width:"100%", marginBottom:8 }}
                  />
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={payCierre} disabled={savingPay} style={{ ...btn(true), flex:1 }}>
                      {savingPay ? "Registrando…" : "💸 Registrar pago"}
                    </button>
                    <button
                      onClick={registerCosts}
                      disabled={registeringCosts}
                      title="Registra los costos de envíos del período como gasto en caja"
                      style={{ ...btn(false), flex:1, border:"1px solid rgba(99,102,241,0.3)", color:"#a78bfa" }}
                    >
                      {registeringCosts ? "Registrando…" : "📊 Registrar costos en caja"}
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:6 }}>
                    "Registrar pago" descuenta de la cuenta seleccionada y lo anota en gastos empresa.<br/>
                    "Registrar costos" anota el costo por kg de los envíos del período en la caja.
                  </div>
                </div>

                {/* Cerrar cierre */}
                {activeCierre.status === "open" && (
                  <button
                    onClick={async () => {
                      if (!confirm("¿Cerrar este cierre?")) return;
                      await fetch(`${API}/external/cierres/${activeCierre.id}`, {
                        method:"PATCH", headers:h(), body:JSON.stringify({status:"closed"}),
                      });
                      await loadCierres();
                      setActiveCierre(prev => ({...prev, status:"closed"}));
                    }}
                    style={{ ...btn(false), marginTop:16, width:"100%", border:"1px solid rgba(255,210,0,0.3)", color:"#ffd200" }}
                  >
                    🔒 Cerrar cierre
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════ MODAL: NUEVA CAJA ══════ */}
      {boxModal && (
        <Modal title="+ Nueva caja" onClose={() => setBoxModal(false)}>
          <Field label="NÚMERO DE CAJA *">
            <input style={inp} placeholder="Ej: CAJA 21" value={boxForm.box_number}
              onChange={e => setBoxForm(f=>({...f,box_number:e.target.value}))} />
          </Field>
          <Field label="FECHA DE RECEPCIÓN *">
            <input style={{...inp, colorScheme:"dark"}} type="date" value={boxForm.date_received}
              onChange={e => setBoxForm(f=>({...f,date_received:e.target.value}))} />
          </Field>

          <Field label="PESO TOTAL (kg)">
            <input style={inp} type="number" placeholder="Ej: 32" value={boxForm.total_kg}
              onChange={e => setBoxForm(f=>({...f,total_kg:e.target.value}))} />
          </Field>
          <Field label="NOTAS">
            <input style={inp} placeholder="Opcional" value={boxForm.notes}
              onChange={e => setBoxForm(f=>({...f,notes:e.target.value}))} />
          </Field>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button onClick={() => setBoxModal(false)} style={btn(false)}>Cancelar</button>
            <button onClick={saveBox} disabled={savingBox} style={btn(true)}>
              {savingBox ? "Guardando…" : "Crear caja"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════ MODAL: ÍTEMS DE CAJA ══════ */}
      {itemsBox && (
        <div style={{
          position:"fixed", inset:0, zIndex:1200,
          background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"flex-start", justifyContent:"center",
          paddingTop:40, overflowY:"auto",
        }} onClick={() => setItemsBox(null)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#0f1628", border:"1px solid rgba(255,255,255,0.12)",
            borderRadius:20, padding:"26px 28px", width:"100%", maxWidth:700,
            marginBottom:40,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:900, fontSize:17 }}>
                  {itemsBox.box_number}
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
                  {fmtDate(itemsBox.date_received)}
                </div>
              </div>
              <button onClick={() => setItemsBox(null)} style={{
                background:"rgba(255,255,255,0.08)", border:"none", borderRadius:8,
                width:32, height:32, cursor:"pointer", color:"#fff", fontSize:16,
              }}>✕</button>
            </div>

            {/* Lista de ítems */}
            <div style={{ marginBottom:20, maxHeight:300, overflowY:"auto" }}>
              {items.length === 0 ? (
                <div style={{ textAlign:"center", padding:30, color:"rgba(255,255,255,0.3)", fontSize:13 }}>
                  No hay ítems. Agregá el primero.
                </div>
              ) : items.map(item => (
                <div key={item.id} style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 12px", borderRadius:10, marginBottom:6,
                  background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
                }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{item.client_name}</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
                      {Number(item.weight_kg).toFixed(3)} kg
                      {item.tracking && ` · ${item.tracking}`}
                      {item.is_commission && <span style={{ color:"#4ade80", marginLeft:6 }}>$2/kg</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <button onClick={() => toggleItemStatus(item)} style={{
                      ...btn(false), height:30, fontSize:11, padding:"0 10px",
                      border:`1px solid ${STATUS_COLORS[item.status]?.border}`,
                      color: STATUS_COLORS[item.status]?.text,
                      background: STATUS_COLORS[item.status]?.bg,
                    }}>{item.status}</button>
                    <button onClick={() => {
                      setEditItemId(item.id);
                      setItemForm({
                        client_name:item.client_name, tracking:item.tracking||"",
                        weight_kg:String(item.weight_kg), status:item.status,
                        tariff_per_kg:String(item.tariff_per_kg||2),
                        is_commission:item.is_commission, notes:item.notes||"",
                      });
                    }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:14 }}>✏️</button>
                    <button onClick={() => deleteItem(item.id)}
                      style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:14 }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotal comisión */}
            <div style={{
              display:"flex", justifyContent:"space-between",
              background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.2)",
              borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:13,
            }}>
              <span style={{ color:"rgba(255,255,255,0.6)" }}>
                Comisión total ({items.filter(i=>i.is_commission).reduce((s,i)=>s+Number(i.weight_kg),0).toFixed(2)} kg × $2)
              </span>
              <span style={{ fontWeight:800, color:"#4ade80" }}>
                {fmtUsd(items.filter(i=>i.is_commission).reduce((s,i)=>s+Number(i.weight_kg)*Number(i.tariff_per_kg||2),0))}
              </span>
            </div>

            {/* Form nuevo ítem */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:18 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", marginBottom:12 }}>
                {editItemId ? "✏️ EDITANDO ÍTEM" : "+ AGREGAR ÍTEM"}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <input style={inp} placeholder="Cliente *" value={itemForm.client_name}
                  onChange={e => setItemForm(f=>({...f,client_name:e.target.value}))} />
                <input style={inp} placeholder="Tracking" value={itemForm.tracking}
                  onChange={e => setItemForm(f=>({...f,tracking:e.target.value}))} />
                <input style={inp} type="number" placeholder="Peso (kg) *" value={itemForm.weight_kg}
                  onChange={e => setItemForm(f=>({...f,weight_kg:e.target.value}))} />
                <select style={sel} value={itemForm.status}
                  onChange={e => setItemForm(f=>({...f,status:e.target.value}))}>
                  {STATUS_ITEM.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12 }}>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
                  <input type="checkbox" checked={itemForm.is_commission}
                    onChange={e => setItemForm(f=>({...f,is_commission:e.target.checked}))} />
                  Genera comisión
                </label>
                {itemForm.is_commission && (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Tarifa:</span>
                    <input style={{...inp, width:80}} type="number" value={itemForm.tariff_per_kg}
                      onChange={e => setItemForm(f=>({...f,tariff_per_kg:e.target.value}))} />
                    <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>USD/kg</span>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                {editItemId && (
                  <button onClick={() => { setEditItemId(null); setItemForm({client_name:"",tracking:"",weight_kg:"",status:"EN DEPOSITO",tariff_per_kg:"2",is_commission:true,notes:""}); }}
                    style={btn(false)}>Cancelar</button>
                )}
                <button onClick={saveItem} disabled={savingItem} style={btn(true)}>
                  {savingItem ? "Guardando…" : editItemId ? "Guardar cambios" : "Agregar ítem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL: EDITAR CIERRE ══════ */}
      {editCierreModal && (
        <Modal title="✏️ Editar cierre" onClose={() => setEditCierreModal(false)}>
          <Field label="NOMBRE DEL CIERRE *">
            <input style={inp} placeholder="Ej: CIERRE 10/03" value={editCierreForm.label}
              onChange={e => setEditCierreForm(f=>({...f,label:e.target.value}))} />
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="DESDE">
              <input style={{...inp, colorScheme:"dark"}} type="date" value={editCierreForm.date_from}
                onChange={e => setEditCierreForm(f=>({...f,date_from:e.target.value}))} />
            </Field>
            <Field label="HASTA">
              <input style={{...inp, colorScheme:"dark"}} type="date" value={editCierreForm.date_to}
                onChange={e => setEditCierreForm(f=>({...f,date_to:e.target.value}))} />
            </Field>
          </div>
          <Field label="NOTAS">
            <input style={inp} placeholder="Opcional" value={editCierreForm.notes}
              onChange={e => setEditCierreForm(f=>({...f,notes:e.target.value}))} />
          </Field>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button onClick={() => setEditCierreModal(false)} style={btn(false)}>Cancelar</button>
            <button onClick={saveEditCierre} disabled={savingEditCierre} style={btn(true)}>
              {savingEditCierre ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════ MODAL: NUEVO CIERRE ══════ */}
      {cierreModal && (
        <Modal title="+ Nuevo cierre" onClose={() => setCierreModal(false)}>
          <Field label="NOMBRE DEL CIERRE *">
            <input style={inp} placeholder="Ej: CIERRE 10/03" value={cierreForm.label}
              onChange={e => setCierreForm(f=>({...f,label:e.target.value}))} />
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="DESDE">
              <input style={{...inp, colorScheme:"dark"}} type="date" value={cierreForm.date_from}
                onChange={e => setCierreForm(f=>({...f,date_from:e.target.value}))} />
            </Field>
            <Field label="HASTA">
              <input style={{...inp, colorScheme:"dark"}} type="date" value={cierreForm.date_to}
                onChange={e => setCierreForm(f=>({...f,date_to:e.target.value}))} />
            </Field>
          </div>
          <Field label="NOTAS">
            <input style={inp} placeholder="Opcional" value={cierreForm.notes}
              onChange={e => setCierreForm(f=>({...f,notes:e.target.value}))} />
          </Field>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
            <button onClick={() => setCierreModal(false)} style={btn(false)}>Cancelar</button>
            <button onClick={saveCierre} disabled={savingCierre} style={btn(true)}>
              {savingCierre ? "Creando…" : "Crear cierre"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}