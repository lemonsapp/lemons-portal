import { useState, useEffect, useMemo } from "react";
import Topbar from "../components/Topbar.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const WA  = "5491157479346";
const getToken = () => localStorage.getItem("token") || sessionStorage.getItem("token");

const ORIGINS = [
  { key: "usa",    label: "🇺🇸 USA",    services: ["NORMAL","EXPRESS","TECH_PREMIUM"] },
  { key: "china",  label: "🇨🇳 China",  services: ["NORMAL","EXPRESS"] },
  { key: "europa", label: "🇪🇺 Europa", services: ["NORMAL"] },
];

const SERVICE_LABELS = {
  NORMAL:        { label: "Normal",       desc: "Envío estándar",          color: "#ffd200" },
  EXPRESS:       { label: "Express",      desc: "Entrega prioritaria",     color: "#f97316" },
  TECH_PREMIUM:  { label: "Tech Premium", desc: "Tecnología y electrónica", color: "#3b82f6" },
};

function rateKey(origin, service) {
  return `${origin}_${service.toLowerCase()}`;
}

const fmtUsd = v => `$${Number(v||0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtArs = v => `$${Number(v||0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function QuoteClient() {
  const [rates, setRates]             = useState(null);
  const [fx, setFx]                   = useState(null);
  const [personalized, setPersonalized] = useState(false);
  const [origin, setOrigin]           = useState("usa");
  const [service, setService]         = useState("NORMAL");
  const [weight, setWeight]           = useState("");
  const [desc, setDesc]               = useState("");

  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [submittedCode, setSubmittedCode] = useState("");
  const [error, setError]             = useState("");

  useEffect(() => {
    fetch(`${API}/quote/my-rates`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        setRates(d.rates);
        setFx(d.fx_rate);
        setPersonalized(d.personalized || false);
      })
      .catch(() => {});
  }, []);

  const availableServices = useMemo(() =>
    ORIGINS.find(o => o.key === origin)?.services || ["NORMAL"],
  [origin]);

  useEffect(() => {
    if (!availableServices.includes(service)) setService(availableServices[0]);
  }, [origin]); // eslint-disable-line

  const w        = Math.max(parseFloat(weight) || 0, 0);
  const billable = Math.max(w, 1);
  const rate     = rates ? Number(rates[rateKey(origin, service)] || 0) : 0;
  const totalUsd = rate * billable;
  const totalArs = fx ? totalUsd * fx : null;
  const hasResult = w > 0 && rate > 0;

  async function submitRequest() {
    if (!w || !desc.trim()) return setError("Completá el peso y la descripción del producto.");
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API}/quote/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin, service, weight_kg: w,
          description: desc, estimated_usd: totalUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Error al enviar la solicitud.");
      setSubmitted(true);
      setSubmittedCode(data.shipment?.code || "");
    } catch { setError("Error de red. Intentá de nuevo."); }
    finally { setSubmitting(false); }
  }

  if (submitted) return (
    <div style={{ minHeight: "100vh", background: "#080d1c", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#fff" }}>
      <Topbar title="Presupuesto" />
      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>¡Solicitud enviada!</h2>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, marginBottom: 24 }}>
          Tu solicitud fue registrada. Nuestro equipo la va a revisar y te va a contactar pronto.
        </p>
        {submittedCode && (
          <div style={{
            background: "rgba(255,210,0,0.08)", border: "1px solid rgba(255,210,0,0.25)",
            borderRadius: 14, padding: "14px 20px", marginBottom: 24, display: "inline-block",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>CÓDIGO DE SOLICITUD</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ffd200", letterSpacing: 2 }}>{submittedCode}</div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="/client/shipments" style={{
            display: "block", background: "linear-gradient(135deg,#ffd200,#ff8a00)",
            color: "#0b1020", fontWeight: 800, fontSize: 15, padding: "14px 24px",
            borderRadius: 14, textDecoration: "none",
          }}>Ver mis envíos →</a>
          <button onClick={() => { setSubmitted(false); setWeight(""); setDesc(""); }}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.65)", fontWeight: 700, fontSize: 14,
              padding: "13px 24px", borderRadius: 14, cursor: "pointer",
            }}>Calcular otro envío</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080d1c", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#fff" }}>
      <Topbar title="Presupuesto" />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 8px", letterSpacing: "-0.5px" }}>
            Calculá tu envío
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", margin: 0 }}>
            {personalized
              ? "✨ Estás usando tus tarifas personalizadas."
              : "Tarifas estándar. Contactanos para tarifas especiales."}
          </p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 24, padding: "26px 26px",
        }}>

          {/* Origen */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: 1, display: "block", marginBottom: 10 }}>
              ORIGEN
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              {ORIGINS.map(o => (
                <button key={o.key} onClick={() => setOrigin(o.key)} style={{
                  flex: 1, padding: "12px 8px", borderRadius: 14, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 13, transition: "all 0.15s",
                  background: origin === o.key
                    ? "linear-gradient(135deg,#ffd200,#ff8a00)"
                    : "rgba(255,255,255,0.06)",
                  color: origin === o.key ? "#0b1020" : "rgba(255,255,255,0.65)",
                  boxShadow: origin === o.key ? "0 4px 16px rgba(255,210,0,0.25)" : "none",
                }}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* Servicio */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: 1, display: "block", marginBottom: 10 }}>
              TIPO DE SERVICIO
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {availableServices.map(s => {
                const info = SERVICE_LABELS[s];
                const active = service === s;
                return (
                  <button key={s} onClick={() => setService(s)} style={{
                    flex: 1, minWidth: 120, padding: "12px 10px", borderRadius: 14,
                    border: `1.5px solid ${active ? info.color : "rgba(255,255,255,0.08)"}`,
                    cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.15s",
                    background: active ? `${info.color}18` : "rgba(255,255,255,0.03)",
                    color: active ? info.color : "rgba(255,255,255,0.55)",
                  }}>
                    <div>{info.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{info.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Peso */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: 1, display: "block", marginBottom: 10 }}>
              PESO ESTIMADO (kg)
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="number" min="0" step="0.1"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="Ej: 2.5"
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)",
                  border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14,
                  color: "#fff", fontSize: 18, fontWeight: 700,
                  padding: "14px 60px 14px 18px", outline: "none", transition: "border 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = "#ffd200"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
              />
              <span style={{
                position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)",
                fontSize: 14, color: "rgba(255,255,255,0.35)", fontWeight: 700,
              }}>kg</span>
            </div>
            {w > 0 && w < 1 && (
              <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 6 }}>
                ⚠ Peso mínimo facturable: 1 kg
              </div>
            )}
          </div>

          {/* Descripción */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: 1, display: "block", marginBottom: 10 }}>
              ¿QUÉ ESTÁS IMPORTANDO?
            </label>
            <input
              type="text"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Ej: Auriculares Sony, ropa deportiva..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14,
                color: "#fff", fontSize: 15, padding: "13px 18px",
                outline: "none", transition: "border 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#ffd200"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
            />
          </div>

          {/* Resultado */}
          {hasResult && (
            <div style={{
              background: "linear-gradient(135deg,rgba(255,210,0,0.08),rgba(255,138,0,0.06))",
              border: "1.5px solid rgba(255,210,0,0.25)",
              borderRadius: 18, padding: "20px 22px", marginBottom: 20,
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)", letterSpacing: 1, marginBottom: 14 }}>
                TU PRESUPUESTO
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>Tarifa / kg</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{fmtUsd(rate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>Peso facturable</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{billable.toFixed(2)} kg</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>Servicio</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: SERVICE_LABELS[service]?.color }}>
                    {SERVICE_LABELS[service]?.label}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>TOTAL ESTIMADO</div>
                <div style={{ fontSize: 38, fontWeight: 900, color: "#ffd200", letterSpacing: "-1px" }}>
                  {fmtUsd(totalUsd)}
                </div>
                {totalArs && (
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", marginTop: 4 }}>
                    ≈ {fmtArs(totalArs)} ARS <span style={{ fontSize: 11 }}>@ ${Number(fx).toLocaleString("es-AR")}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 10 }}>
                * Estimado. Puede variar según peso real y tipo de producto.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 12, padding: "10px 14px", marginBottom: 14,
              fontSize: 13, color: "#fca5a5",
            }}>{error}</div>
          )}

          {/* Botones */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={submitRequest}
              disabled={!hasResult || submitting}
              style={{
                background: hasResult
                  ? "linear-gradient(135deg,#ffd200,#ff8a00)"
                  : "rgba(255,255,255,0.08)",
                color: hasResult ? "#0b1020" : "rgba(255,255,255,0.35)",
                fontWeight: 900, fontSize: 15, padding: "15px 24px",
                borderRadius: 14, border: "none", cursor: hasResult ? "pointer" : "not-allowed",
                boxShadow: hasResult ? "0 4px 20px rgba(255,210,0,0.25)" : "none",
                transition: "all 0.15s",
              }}
            >
              {submitting ? "Enviando solicitud…" : "📦 Solicitar este envío"}
            </button>

            <a
              href={`https://wa.me/${WA}?text=${encodeURIComponent(`Hola! Quiero consultar sobre un envío.\nOrigen: ${ORIGINS.find(o=>o.key===origin)?.label}\nServicio: ${SERVICE_LABELS[service]?.label}\nPeso: ${w} kg\nProducto: ${desc || "—"}\nEstimado: ${fmtUsd(totalUsd)} USD`)}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.25)",
                color: "#4ade80", fontWeight: 700, fontSize: 14,
                padding: "13px 24px", borderRadius: 14, textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Consultar por WhatsApp
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
