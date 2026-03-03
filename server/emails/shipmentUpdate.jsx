const React = require("react");
const {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Row,
  Column,
  Button,
} = require("@react-email/components");

function Money({ value }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return React.createElement(React.Fragment, null, "-");
  return React.createElement(React.Fragment, null, `$${n.toFixed(2)}`);
}
function MoneyKg({ value }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return React.createElement(React.Fragment, null, "-");
  return React.createElement(React.Fragment, null, `$${n.toFixed(2)}/kg`);
}
function Kg({ value }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return React.createElement(React.Fragment, null, "-");
  return React.createElement(React.Fragment, null, `${n.toFixed(2)} kg`);
}

function Badge({ children }) {
  return React.createElement(
    "span",
    {
      style: {
        display: "inline-block",
        padding: "8px 12px",
        borderRadius: 999,
        background: "rgba(124,92,255,.14)",
        border: "1px solid rgba(124,92,255,.35)",
        color: "#d9d1ff",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: ".2px",
      },
    },
    children
  );
}

function KV({ label, value }) {
  return React.createElement(
    Row,
    { style: { padding: "10px 0" } },
    React.createElement(
      Column,
      { style: { width: "44%", color: "rgba(233,236,255,.70)", fontSize: 12 } },
      label
    ),
    React.createElement(
      Column,
      { style: { width: "56%", color: "#fff", fontWeight: 800, fontSize: 13 } },
      value ?? "-"
    )
  );
}

function ShipmentUpdateEmail({
  brandName = "LEMONS Portal",
  preheader = "Hay novedades sobre tu envío.",
  title = "Actualización de envío",
  subtitle = "Tu envío cambió de estado. Abajo tenés el detalle.",
  shipmentCode = "-",
  clientName = "",
  clientNumber = "",
  oldStatus = null,
  newStatus = "-",

  origin = "-",
  service = "-",
  weightKg = null,
  rateUsdKg = null,
  estimatedUsd = null,
  tracking = null,
  boxCode = null,

  ctaUrl = "",
  ctaText = "Ver mis envíos",
  supportEmail = "",
}) {
  const hasCta = Boolean(ctaUrl);

  return React.createElement(
    Html,
    { lang: "es" },
    React.createElement(Head, null),
    React.createElement(Preview, null, preheader),

    React.createElement(
      Body,
      {
        style: {
          margin: 0,
          padding: 0,
          backgroundColor: "#0b1020",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
        },
      },

      React.createElement(
        Container,
        { style: { maxWidth: 620, margin: "0 auto", padding: "26px 12px" } },

        // Header glass
        React.createElement(
          Section,
          {
            style: {
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.10)",
              boxShadow: "0 20px 60px rgba(0,0,0,.35)",
              background:
                "radial-gradient(900px 420px at -10% -20%, rgba(124,92,255,.35), rgba(0,0,0,0)), linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02))",
            },
          },

          React.createElement(
            Section,
            {
              style: {
                padding: "18px 18px 14px 18px",
                background:
                  "linear-gradient(135deg, rgba(124,92,255,.35), rgba(17,24,51,.0))",
              },
            },
            React.createElement(
              Text,
              {
                style: {
                  margin: 0,
                  color: "rgba(255,255,255,.88)",
                  fontWeight: 900,
                  letterSpacing: ".5px",
                },
              },
              brandName
            ),
            React.createElement(
              Heading,
              {
                as: "h1",
                style: {
                  margin: "8px 0 0 0",
                  color: "#fff",
                  fontSize: 22,
                  lineHeight: 1.2,
                  fontWeight: 900,
                },
              },
              title
            ),
            React.createElement(
              Text,
              {
                style: {
                  margin: "8px 0 0 0",
                  color: "rgba(255,255,255,.72)",
                  fontSize: 13,
                },
              },
              "Envío ",
              React.createElement("b", null, "#", shipmentCode),
              clientNumber || clientName
                ? ` · Cliente #${clientNumber || "-"} ${clientName ? `— ${clientName}` : ""}`
                : ""
            )
          ),

          React.createElement(
            Section,
            { style: { padding: "16px 18px 18px 18px" } },
            React.createElement(
              Text,
              {
                style: {
                  margin: 0,
                  color: "rgba(233,236,255,.92)",
                  fontSize: 14,
                  lineHeight: 1.6,
                },
              },
              subtitle
            ),

            React.createElement("div", { style: { height: 14 } }),

            // Status area
            React.createElement(
              Section,
              {
                style: {
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.10)",
                  background: "rgba(255,255,255,.03)",
                },
              },

              React.createElement(
                Text,
                { style: { margin: 0, color: "rgba(233,236,255,.70)", fontSize: 12 } },
                "Estado"
              ),

              oldStatus
                ? React.createElement(
                    Text,
                    { style: { margin: "6px 0 0 0", color: "#fff", fontSize: 14 } },
                    React.createElement(Badge, null, oldStatus),
                    React.createElement(
                      "span",
                      { style: { color: "rgba(233,236,255,.65)", margin: "0 8px" } },
                      "→"
                    ),
                    React.createElement(Badge, null, newStatus)
                  )
                : React.createElement(
                    Text,
                    { style: { margin: "6px 0 0 0", color: "#fff", fontSize: 14 } },
                    React.createElement(Badge, null, newStatus)
                  )
            ),

            React.createElement("div", { style: { height: 14 } }),

            // Details card
            React.createElement(
              Section,
              {
                style: {
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.10)",
                  background: "rgba(255,255,255,.03)",
                },
              },
              React.createElement(KV, { label: "Origen", value: origin }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, { label: "Servicio", value: service }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, {
                label: "Peso",
                value: React.createElement(Kg, { value: weightKg }),
              }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, {
                label: "Tarifa",
                value: React.createElement(MoneyKg, { value: rateUsdKg }),
              }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, {
                label: "Estimado",
                value: React.createElement(Money, { value: estimatedUsd }),
              }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, { label: "Tracking", value: tracking || "-" }),
              React.createElement(Hr, { style: { borderColor: "rgba(255,255,255,.08)" } }),
              React.createElement(KV, { label: "Caja", value: boxCode || "-" })
            ),

            hasCta
              ? React.createElement(
                  Section,
                  { style: { marginTop: 16 } },
                  React.createElement(
                    Button,
                    {
                      href: ctaUrl,
                      style: {
                        backgroundColor: "#7c5cff",
                        color: "#ffffff",
                        borderRadius: 14,
                        fontWeight: 900,
                        padding: "12px 16px",
                        textDecoration: "none",
                        display: "inline-block",
                      },
                    },
                    ctaText,
                    " →"
                  )
                )
              : null,

            React.createElement(
              Text,
              {
                style: {
                  margin: "16px 0 0 0",
                  color: "rgba(233,236,255,.55)",
                  fontSize: 12,
                  lineHeight: 1.5,
                },
              },
              "Si no esperabas este correo, podés ignorarlo.",
              supportEmail ? ` Si necesitás ayuda: ${supportEmail}` : ""
            )
          )
        ),

        React.createElement(
          Text,
          {
            style: {
              margin: "14px 0 0 0",
              textAlign: "center",
              color: "rgba(233,236,255,.45)",
              fontSize: 11,
              lineHeight: 1.5,
            },
          },
          hasCta ? "Si el botón no funciona, copiá y pegá este link: " : "",
          hasCta
            ? React.createElement(
                "span",
                { style: { wordBreak: "break-all" } },
                ctaUrl
              )
            : ""
        )
      )
    )
  );
}

module.exports = { ShipmentUpdateEmail };