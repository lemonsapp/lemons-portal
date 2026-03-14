require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const db = require("./db");
const { authRequired, requireRole } = require("./auth");
const { sendEmail } = require("./mailer"); // ✅ mails
const coinsRouter         = require("./routes/coins");         // ✅ Lemon Coins
const externalRouter      = require("./routes/external");      // ✅ Cargas Externas
const notificationsRouter = require("./routes/notifications"); // ✅ Notificaciones LIMÓN

const app = express();

// ── Seguridad: headers HTTP ──
app.use(helmet({
  contentSecurityPolicy: false, // desactivado para no romper la SPA
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting general (todas las rutas) ──
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,                  // máx 200 requests por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intentá de nuevo en 15 minutos." },
}));

// ── Rate limiting estricto para auth ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 intentos de login por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Esperá 15 minutos antes de volver a intentar." },
  skipSuccessfulRequests: true, // no cuenta los logins exitosos
});

// ── Rate limiting para forgot-password ──
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,                    // máx 5 emails por hora por IP
  message: { error: "Demasiadas solicitudes de reset. Esperá 1 hora." },
});

app.use(express.json());

// CORS abierto mientras probás
const allowedOrigins = [
  "https://lemonsarg.com",
  "https://www.lemonsarg.com",
  "https://app.lemonsarg.com",
  "https://lemons-portal-w3of.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (ej: Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

app.get("/", (req, res) => res.send("LEMON's API OK ✅ — probá /health"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ==================== TARIFAS (defaults + helpers) ====================

const DEFAULT_RATES = {
  usa_normal:       45,
  usa_express:      55,
  usa_tech_premium: 75, // Tecnología Premium — solo USA
  china_normal:     58,
  china_express:    68,
  europa_normal:    58, // EUROPA siempre NORMAL
};

// ── Costos reales del operador ───────────────────────────────────────────────
const DEFAULT_OPERATOR_COSTS = {
  usa_normal:       0,
  usa_express:      0,
  usa_tech_premium: 50, // Costo real Tecnología Premium
  china_normal:     0,
  china_express:    0,
  europa_normal:    0,
};

async function getOperatorCosts() {
  try {
    const r = await db.query(
      `SELECT usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal
       FROM operator_costs LIMIT 1`
    );
    return r.rows[0] || DEFAULT_OPERATOR_COSTS;
  } catch {
    return DEFAULT_OPERATOR_COSTS;
  }
}

function normalizeOrigin(origin) {
  const o = (origin || "").toUpperCase().trim();
  if (o === "USA" || o === "CHINA" || o === "EUROPA") return o;
  return null;
}

function normalizeService(service) {
  const s = (service || "").toUpperCase().trim();
  if (s === "NORMAL" || s === "EXPRESS" || s === "TECH_PREMIUM") return s;
  return null;
}

function rateKeyFor(origin, service) {
  if (origin === "EUROPA") return "europa_normal";
  if (origin === "USA" && service === "NORMAL")       return "usa_normal";
  if (origin === "USA" && service === "EXPRESS")      return "usa_express";
  if (origin === "USA" && service === "TECH_PREMIUM") return "usa_tech_premium";
  if (origin === "CHINA" && service === "NORMAL")     return "china_normal";
  if (origin === "CHINA" && service === "EXPRESS")    return "china_express";
  return null;
}

// Descuento por volumen según kg del envío individual
function volumeDiscount(kg) {
  if (kg >= 100) return 7;
  if (kg >= 50)  return 5;
  if (kg >= 10)  return 3;
  return 0;
}

function applyVolumeDiscount(baseRate, kg) {
  return Math.max(0, baseRate - volumeDiscount(kg));
}

async function getClientRatesByUserId(userId) {
  const r = await db.query(
    `SELECT user_id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal, updated_at
     FROM client_rates
     WHERE user_id=$1`,
    [userId]
  );
  return r.rows[0] || null;
}

function resolveRateUsdPerKg({ origin, service, clientRatesRow }) {
  const key = rateKeyFor(origin, service);
  if (!key) return null;

  const v = clientRatesRow?.[key];
  if (v !== null && v !== undefined) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }

  return DEFAULT_RATES[key];
}

function toNumOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MIN_BILLABLE_KG = 1; // Peso mínimo facturable

function billableWeight(weightKg) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  return w < MIN_BILLABLE_KG ? MIN_BILLABLE_KG : w;
}

function computeEstimated(weightKg, rateUsdPerKg) {
  const w = billableWeight(weightKg);
  if (w === null) return null;
  const r = Number(rateUsdPerKg);
  if (!Number.isFinite(r) || r < 0) return null;
  return Number((w * r).toFixed(2));
}

async function computeRateAndEstimatedServer({
  userId,
  originRaw,
  serviceRaw,
  weight_kg,
  rateOverride,
  chargeRealWeight = false,
}) {
  const origin = normalizeOrigin(originRaw);
  if (!origin) {
    return {
      origin: null,
      service: null,
      rate_usd_per_kg: null,
      estimated_usd: null,
    };
  }

  let service = normalizeService(serviceRaw) || "NORMAL";
  if (origin === "EUROPA") service = "NORMAL";
  if (origin !== "USA" && service === "TECH_PREMIUM") service = "NORMAL";

  // Si chargeRealWeight=true y peso < 1kg, cobrar el peso real (no mínimo de 1kg)
  const effectiveWeight = (chargeRealWeight && Number(weight_kg) < MIN_BILLABLE_KG)
    ? Number(weight_kg)
    : weight_kg;

  const override = toNumOrNull(rateOverride);
  if (override !== null) {
    return {
      origin,
      service,
      rate_usd_per_kg: override,
      estimated_usd: computeEstimated(effectiveWeight, override),
    };
  }

  let ratesRow = null;
  try {
    ratesRow = await getClientRatesByUserId(userId);
  } catch (e) {
    console.error("READ CLIENT RATES ERROR", e);
    ratesRow = null;
  }

  const resolved = resolveRateUsdPerKg({
    origin,
    service,
    clientRatesRow: ratesRow,
  });

  // Aplicar descuento por volumen al peso individual del envío
  const kg = Number(effectiveWeight) || 0;
  const discountedRate = applyVolumeDiscount(resolved, kg);

  return {
    origin,
    service,
    rate_usd_per_kg: discountedRate,
    estimated_usd: computeEstimated(effectiveWeight, discountedRate),
  };
}

// ==================== ✅ MAIL TEMPLATE (PRO) ====================

function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toFixed(2)}`;
}

function formatUsdKg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toFixed(2)}/kg`;
}

function formatKg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} kg`;
}

function statusPillColor(status) {
  const s = safeStr(status).toLowerCase();
  if (s.includes("entregado")) return "#16a34a";
  if (s.includes("listo")) return "#0ea5e9";
  if (s.includes("tránsito") || s.includes("transito")) return "#f59e0b";
  if (s.includes("despachado")) return "#8b5cf6";
  if (s.includes("preparación") || s.includes("preparacion")) return "#06b6d4";
  return "#6366f1";
}

function guessTrackingUrl(trackingRaw) {
  const t = safeStr(trackingRaw).trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (/^1Z[A-Z0-9]{16}$/i.test(t)) return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`;
  if (/^\d{12,15}$/.test(t)) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
  if (/^\d{20,22}$/.test(t)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
  return `https://www.17track.net/en/track?nums=${encodeURIComponent(t)}`;
}

function escapeHtml(str) {
  return safeStr(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function trackingHtml(trackingRaw) {
  const t = safeStr(trackingRaw).trim();
  if (!t) return "-";
  const url = guessTrackingUrl(t);
  const label = escapeHtml(t);
  if (!url) return label;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
    style="color:#c7d2fe; font-weight:800; text-decoration:underline;">${label}</a>`;
}

function shipmentUpdateEmailHtml({
  brand = "LEMON'S PORTAL",
  clientName = "",
  clientNumber = "",
  code = "",
  oldStatus = "",
  newStatus = "",
  origin = "",
  service = "",
  weightKg = null,
  rateUsdKg = null,
  estimatedUsd = null,
  tracking = "",
  boxCode = "",
  ctaUrl = "",
}) {
  const pill = statusPillColor(newStatus);
  const preview = `Tu envío #${code} pasó a "${newStatus}".`;
  const showCta = Boolean(ctaUrl && String(ctaUrl).trim().length > 0);
  const trackingBlock = trackingHtml(tracking);

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>${brand}</title>
  <style>
    @media (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 16px !important; padding-right: 16px !important; }
      .grid td { display:block !important; width:100% !important; }
      .btn { width: 100% !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#0b1020;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    ${preview}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1020; padding:24px 0;">
    <tr>
      <td align="center" class="px" style="padding: 0 24px;">
        <table role="presentation" width="600" class="container" cellspacing="0" cellpadding="0" style="width:600px; max-width:600px;">
          
          <tr>
            <td style="padding: 8px 0 16px 0;">
              <div style="font-family: Arial, sans-serif; color:#c7d2fe; font-size:12px; letter-spacing:0.12em; text-transform:uppercase;">
                ${brand}
              </div>
              <div style="font-family: Arial, sans-serif; color:#ffffff; font-size:22px; font-weight:800; margin-top:6px;">
                Actualización de tu envío
              </div>
            </td>
          </tr>

          <tr>
            <td style="background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); border-radius:16px; overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                
                <tr>
                  <td style="padding:16px; background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(168,85,247,0.20)); border-bottom:1px solid rgba(255,255,255,0.10);">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="font-family: Arial, sans-serif; color:#ffffff; font-size:14px;">
                          Hola <b>${safeStr(clientName) || "👋"}</b>
                          ${clientNumber ? `<span style="color:#cbd5e1;">(Cliente #${safeStr(clientNumber)})</span>` : ""}
                        </td>
                        <td align="right" style="font-family: Arial, sans-serif;">
                          <span style="display:inline-block; padding:8px 10px; border-radius:999px; background:${pill}; color:#0b1020; font-weight:800; font-size:12px;">
                            ${safeStr(newStatus)}
                          </span>
                        </td>
                      </tr>
                    </table>

                    <div style="font-family: Arial, sans-serif; color:#e5e7eb; font-size:13px; margin-top:10px;">
                      Tu envío <b style="color:#fff;">#${safeStr(code)}</b> cambió de estado:
                      <div style="margin-top:8px; font-size:14px;">
                        <span style="display:inline-block; padding:6px 10px; border-radius:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.10); color:#e5e7eb;">
                          ${safeStr(oldStatus)}
                        </span>
                        <span style="color:#c7d2fe; font-weight:800; margin:0 8px;">→</span>
                        <span style="display:inline-block; padding:6px 10px; border-radius:10px; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.14); color:#ffffff; font-weight:800;">
                          ${safeStr(newStatus)}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="grid" style="font-family: Arial, sans-serif; font-size:13px; color:#e5e7eb;">
                      <tr>
                        <td style="padding:10px; width:50%; vertical-align:top; background:rgba(255,255,255,0.04); border-radius:12px;">
                          <div style="color:#94a3b8; font-size:12px;">Origen / Servicio</div>
                          <div style="margin-top:4px; font-weight:800; color:#fff;">
                            ${safeStr(origin) || "-"} · ${safeStr(service) || "-"}
                          </div>
                        </td>
                        <td style="padding:10px; width:50%; vertical-align:top;">
                          <div style="background:rgba(255,255,255,0.04); border-radius:12px; padding:10px;">
                            <div style="color:#94a3b8; font-size:12px;">Peso</div>
                            <div style="margin-top:4px; font-weight:800; color:#fff;">
                              ${formatKg(weightKg)}
                            </div>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:10px; width:50%; vertical-align:top;">
                          <div style="background:rgba(255,255,255,0.04); border-radius:12px; padding:10px;">
                            <div style="color:#94a3b8; font-size:12px;">Tarifa</div>
                            <div style="margin-top:4px; font-weight:800; color:#fff;">
                              ${formatUsdKg(rateUsdKg)}
                            </div>
                          </div>
                        </td>
                        <td style="padding:10px; width:50%; vertical-align:top;">
                          <div style="background:rgba(255,255,255,0.04); border-radius:12px; padding:10px;">
                            <div style="color:#94a3b8; font-size:12px;">Estimado</div>
                            <div style="margin-top:4px; font-weight:900; color:#fff; font-size:16px;">
                              ${formatUsd(estimatedUsd)}
                            </div>
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:10px; width:50%; vertical-align:top;">
                          <div style="background:rgba(255,255,255,0.04); border-radius:12px; padding:10px;">
                            <div style="color:#94a3b8; font-size:12px;">Tracking</div>
                            <div style="margin-top:4px; font-weight:800; color:#fff;">
                              ${trackingBlock}
                            </div>
                          </div>
                        </td>
                        <td style="padding:10px; width:50%; vertical-align:top;">
                          <div style="background:rgba(255,255,255,0.04); border-radius:12px; padding:10px;">
                            <div style="color:#94a3b8; font-size:12px;">Caja</div>
                            <div style="margin-top:4px; font-weight:800; color:#fff;">
                              ${safeStr(boxCode) || "-"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>

                    ${
                      showCta
                        ? `
                      <div style="margin-top:16px;">
                        <a class="btn" href="${ctaUrl}"
                           style="display:inline-block; text-decoration:none; font-family: Arial, sans-serif;
                           background: linear-gradient(135deg, #6366f1, #a855f7);
                           color:#ffffff; padding:12px 16px; border-radius:12px; font-weight:900;">
                          Ver mis envíos
                        </a>
                      </div>
                    `
                        : ""
                    }

                    <div style="margin-top:14px; font-family: Arial, sans-serif; color:#94a3b8; font-size:12px;">
                      Si vos no solicitaste este aviso, podés ignorarlo.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 14px 0 0 0; font-family: Arial, sans-serif; color:#64748b; font-size:12px;">
              © ${new Date().getFullYear()} ${brand}. Todos los derechos reservados.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ==================== AUTH ====================

app.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      remember: z.boolean().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const { email, password } = p.data;

    const u = await db.query(
      "SELECT id, email, name, role, client_number, password_hash FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    const user = u.rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_number: user.client_number,
      },
    });
  } catch (e) {
    console.error("LOGIN ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const u = await db.query(
      "SELECT id, email, name, role, client_number FROM users WHERE id=$1",
      [req.user.id]
    );
    const user = u.rows[0];
    if (!user) return res.status(404).json({ error: "Usuario no existe" });
    res.json({ user });
  } catch (e) {
    console.error("ME ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ==================== PASSWORD RESET ====================

function isEmail(x) {
  return typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}

function makeResetToken() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

async function hashToken(token) {
  return bcrypt.hash(token, 10);
}

async function compareToken(token, hash) {
  return bcrypt.compare(token, hash);
}

app.post("/auth/forgot-password", forgotLimiter, async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Email inválido" });

    const email = p.data.email.toLowerCase();
    const okResponse = { ok: true, message: "Si el email existe, te enviamos un link." };

    const u = await db.query("SELECT id, email, name FROM users WHERE email=$1", [email]);
    const user = u.rows[0];
    if (!user) return res.json(okResponse);

    const rawToken = makeResetToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, used_at, created_at)
       VALUES ($1,$2,$3,NULL,NOW())`,
      [user.id, tokenHash, expiresAt]
    );

    const base =
      process.env.APP_URL && String(process.env.APP_URL).trim()
        ? String(process.env.APP_URL).replace(/\/$/, "")
        : "http://localhost:5173";

    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Restablecer contraseña — LEMON'S PORTAL",
        html: `
          <div style="font-family: Arial, sans-serif; font-size:14px; line-height:1.6; color:#111;">
            <h2 style="margin:0 0 12px 0;">Restablecer contraseña</h2>
            <p style="margin:0 0 12px 0;">Hola ${user.name || ""},</p>
            <p style="margin:0 0 12px 0;">
              Recibimos un pedido para restablecer tu contraseña. Hacé click en el botón:
            </p>
            <p style="margin:16px 0;">
              <a href="${resetUrl}"
                 style="display:inline-block; padding:12px 16px; border-radius:10px; background:#4f46e5; color:#fff; text-decoration:none; font-weight:700;">
                Restablecer contraseña
              </a>
            </p>
            <p style="margin:0 0 12px 0; color:#555;">
              Este link vence en <b>30 minutos</b>. Si no fuiste vos, ignorá este mensaje.
            </p>
            <hr style="border:none; border-top:1px solid #eee; margin:16px 0;" />
            <p style="margin:0; color:#777; font-size:12px;">LEMON'S PORTAL</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("[MAIL] forgot-password falló (no rompe flujo):", e?.message || e);
    }

    return res.json(okResponse);
  } catch (e) {
    console.error("FORGOT PASSWORD ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

app.post("/auth/reset-password", async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      token: z.string().min(10),
      new_password: z.string().min(6),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const email = p.data.email.toLowerCase();
    const { token, new_password } = p.data;

    const u = await db.query("SELECT id FROM users WHERE email=$1", [email]);
    const user = u.rows[0];
    if (!user) return res.status(400).json({ error: "Token inválido o vencido" });

    const r = await db.query(
      `SELECT id, token_hash, expires_at, used_at
       FROM password_resets
       WHERE user_id=$1
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 10`,
      [user.id]
    );

    const rows = r.rows || [];
    let match = null;

    for (const row of rows) {
      const ok = await compareToken(token, row.token_hash);
      if (ok) {
        match = row;
        break;
      }
    }

    if (!match) return res.status(400).json({ error: "Token inválido o vencido" });

    const password_hash = await bcrypt.hash(new_password, 10);
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [password_hash, user.id]);
    await db.query("UPDATE password_resets SET used_at=NOW() WHERE id=$1", [match.id]);

    res.json({ ok: true });
  } catch (e) {
    console.error("RESET PASSWORD ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ==================== OPERATOR / ADMIN ====================

app.post(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const schema = z.object({
        client_number: z.number().int().min(0),
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["client", "operator", "admin"]).optional(),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const d = p.data;
      const password_hash = await bcrypt.hash(d.password, 10);
      const role = d.role || "client";

      const ins = await db.query(
        `INSERT INTO users (client_number, name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, client_number, name, email, role`,
        [d.client_number, d.name, d.email.toLowerCase(), password_hash, role]
      );

      res.json({ user: ins.rows[0] });
    } catch (e) {
      console.error("CREATE CLIENT ERROR", e);
      if (String(e?.message || "").includes("duplicate")) {
        return res.status(400).json({ error: "Email o client_number ya existe" });
      }
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const n = Number(req.query.client_number);
      if (Number.isNaN(n)) return res.status(400).json({ error: "client_number inválido" });

      const q = await db.query(
        "SELECT id, client_number, name, email, role FROM users WHERE client_number=$1",
        [n]
      );

      const user = q.rows[0] || null;
      if (!user) return res.json({ user: null, rates: null, defaults: DEFAULT_RATES });

      let ratesRow = null;
      try {
        ratesRow = await getClientRatesByUserId(user.id);
      } catch (e) {
        console.error("GET CLIENT RATES ERROR", e);
        return res.status(500).json({
          error: "No se pudieron leer tarifas. Verificá que exista la tabla client_rates (migración pendiente).",
        });
      }

      const rates = ratesRow
        ? {
            usa_normal: ratesRow.usa_normal,
            usa_express: ratesRow.usa_express,
            china_normal: ratesRow.china_normal,
            china_express: ratesRow.china_express,
            europa_normal: ratesRow.europa_normal,
            updated_at: ratesRow.updated_at,
          }
        : null;

      res.json({ user, rates, defaults: DEFAULT_RATES });
    } catch (e) {
      console.error("GET CLIENT ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ── GET /users — buscar usuario por client_number (para CoinsOperator) ──
app.get("/users", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const { client_number } = req.query;
    if (!client_number) return res.status(400).json({ error: "client_number requerido" });
    const q = await db.query(
      "SELECT id, client_number, name, email, role FROM users WHERE client_number=$1",
      [parseInt(client_number, 10)]
    );
    res.json({ users: q.rows });
  } catch (e) {
    res.status(500).json({ error: "Error interno" });
  }
});

// ── GET /operator/clients/all — listar todos los clientes con stats ──
app.get("/operator/clients/all", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    // Agregar columna active si no existe
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE").catch(() => {});

    const q = await db.query(`
      SELECT
        u.id, u.client_number, u.name, u.email, u.role,
        COALESCE(u.active, true) AS active,
        COUNT(s.id)                              AS shipment_count,
        COALESCE(SUM(s.estimated_usd), 0)        AS total_billed,
        MAX(s.date_in)                           AS last_shipment
      FROM users u
      LEFT JOIN shipments s ON s.user_id = u.id
      WHERE u.role IN ('client', 'operator')
      GROUP BY u.id, u.client_number, u.name, u.email, u.role, u.active
      ORDER BY u.client_number ASC
    `);
    res.json({ clients: q.rows });
  } catch (e) {
    console.error("GET ALL CLIENTS ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── PATCH /operator/clients/:id — editar datos del cliente ──
app.patch("/operator/clients/:id", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const schema = z.object({
      name:          z.string().min(1).optional(),
      email:         z.string().email().optional(),
      client_number: z.number().int().min(0).optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const fields = []; const vals = []; let pi = 1;
    if (p.data.name          !== undefined) { fields.push(`name=$${pi++}`);          vals.push(p.data.name); }
    if (p.data.email         !== undefined) { fields.push(`email=$${pi++}`);         vals.push(p.data.email.toLowerCase()); }
    if (p.data.client_number !== undefined) { fields.push(`client_number=$${pi++}`); vals.push(p.data.client_number); }

    if (fields.length === 0) return res.status(400).json({ error: "Nada para actualizar" });
    vals.push(id);

    const r = await db.query(
      `UPDATE users SET ${fields.join(",")} WHERE id=$${pi} RETURNING id, client_number, name, email, role`,
      vals
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Cliente no existe" });
    res.json({ user: r.rows[0] });
  } catch (e) {
    console.error("PATCH CLIENT ERROR", e);
    if (String(e?.message || "").includes("duplicate"))
      return res.status(400).json({ error: "Email o número de cliente ya existe" });
    res.status(500).json({ error: "Error interno" });
  }
});

// ── PATCH /operator/clients/:id/password — resetear contraseña ──
app.patch("/operator/clients/:id/password", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { new_password } = req.body;
    if (!new_password || String(new_password).length < 6)
      return res.status(400).json({ error: "Contraseña debe tener mínimo 6 caracteres" });

    const hash = await bcrypt.hash(new_password, 10);
    const r = await db.query(
      "UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING id",
      [hash, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Cliente no existe" });
    res.json({ ok: true });
  } catch (e) {
    console.error("RESET PWD ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── PATCH /operator/clients/:id/status — suspender / activar ──
app.patch("/operator/clients/:id/status", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const schema = z.object({ active: z.boolean() });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    // Asegurarse de que la columna exista (add IF NOT EXISTS en runtime si falta)
    try {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE");
    } catch (_) { /* ya existe */ }

    const r = await db.query(
      "UPDATE users SET active=$1 WHERE id=$2 RETURNING id, active",
      [p.data.active, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Cliente no existe" });
    res.json({ ok: true, active: r.rows[0].active });
  } catch (e) {
    console.error("TOGGLE STATUS ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── DELETE /operator/clients/:id — eliminar cliente ──
app.delete("/operator/clients/:id", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    // No permitir eliminar admins ni operators
    const check = await db.query("SELECT role FROM users WHERE id=$1", [id]);
    if (!check.rows[0]) return res.status(404).json({ error: "Usuario no existe" });
    if (["admin", "operator"].includes(check.rows[0].role))
      return res.status(403).json({ error: "No se puede eliminar un admin u operador" });

    await db.query("DELETE FROM users WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE CLIENT ERROR", e);
    if (String(e?.message || "").includes("foreign key") || String(e?.message || "").includes("violates"))
      return res.status(400).json({ error: "No se puede eliminar: el cliente tiene envíos asociados. Suspendélo en su lugar." });
    res.status(500).json({ error: "Error interno" });
  }
});

app.put(
  "/operator/clients/:id/rates",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (Number.isNaN(userId)) return res.status(400).json({ error: "ID inválido" });

      const schema = z.object({
        usa_normal:       z.number().min(0).nullable().optional(),
        usa_express:      z.number().min(0).nullable().optional(),
        usa_tech_premium: z.number().min(0).nullable().optional(),
        china_normal:     z.number().min(0).nullable().optional(),
        china_express:    z.number().min(0).nullable().optional(),
        europa_normal:    z.number().min(0).nullable().optional(),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const u = await db.query("SELECT id, role FROM users WHERE id=$1", [userId]);
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no existe" });

      let up;
      try {
        up = await db.query(
          `INSERT INTO client_rates (user_id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET
             usa_normal       = EXCLUDED.usa_normal,
             usa_express      = EXCLUDED.usa_express,
             usa_tech_premium = EXCLUDED.usa_tech_premium,
             china_normal     = EXCLUDED.china_normal,
             china_express    = EXCLUDED.china_express,
             europa_normal    = EXCLUDED.europa_normal,
             updated_at       = NOW()
           RETURNING user_id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal, updated_at`,
          [
            userId,
            p.data.usa_normal       ?? null,
            p.data.usa_express      ?? null,
            p.data.usa_tech_premium ?? null,
            p.data.china_normal     ?? null,
            p.data.china_express    ?? null,
            p.data.europa_normal    ?? null,
          ]
        );
      } catch (e) {
        console.error("UPSERT CLIENT RATES ERROR", e);
        return res.status(500).json({
          error: "No se pudieron guardar tarifas. Verificá que exista la tabla client_rates (migración pendiente).",
        });
      }

      res.json({
        rates: {
          usa_normal:       up.rows[0].usa_normal,
          usa_express:      up.rows[0].usa_express,
          usa_tech_premium: up.rows[0].usa_tech_premium,
          china_normal:     up.rows[0].china_normal,
          china_express:    up.rows[0].china_express,
          europa_normal:    up.rows[0].europa_normal,
          updated_at: up.rows[0].updated_at,
        },
        defaults: DEFAULT_RATES,
      });
    } catch (e) {
      console.error("PUT CLIENT RATES ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.post(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const schema = z.object({
        client_number: z.number().int().min(0),
        package_code: z.string().min(1),
        description: z.string().min(1),
        box_code: z.string().nullable().optional(),
        tracking: z.string().nullable().optional(),
        weight_kg: z.number().min(0),
        status: z.string().min(1),
        origin: z.enum(["USA", "CHINA", "EUROPA"]).optional(),
        service: z.enum(["NORMAL", "EXPRESS", "TECH_PREMIUM"]).optional(),
        rate_usd_per_kg: z.number().min(0).nullable().optional(),
        estimated_usd: z.number().min(0).nullable().optional(),
        charge_real_weight: z.boolean().optional(), // si true y peso <1kg, cobra el peso real
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const d = p.data;

      const u = await db.query(
        "SELECT id, email, name, client_number FROM users WHERE client_number=$1",
        [d.client_number]
      );
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no existe" });

      const calc = await computeRateAndEstimatedServer({
        userId: user.id,
        originRaw: d.origin ?? null,
        serviceRaw: d.service ?? null,
        weight_kg: d.weight_kg,
        rateOverride: d.rate_usd_per_kg ?? null,
        chargeRealWeight: d.charge_real_weight ?? false,
      });

      const ins = await db.query(
        `INSERT INTO shipments
         (user_id, code, description, box_code, tracking, weight_kg, status, date_in, origin, service, rate_usd_per_kg, estimated_usd, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), $8, $9, $10, $11, NOW())
         RETURNING *`,
        [
          user.id,
          d.package_code,
          d.description,
          d.box_code ?? null,
          d.tracking ?? null,
          d.weight_kg,
          d.status,
          calc.origin,
          calc.service,
          calc.rate_usd_per_kg,
          calc.estimated_usd,
        ]
      );

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status) VALUES ($1,$2,$3)`,
        [ins.rows[0].id, null, d.status]
      );

      try {
        const created = ins.rows[0];
        const code = created?.code || d.package_code || created?.id;
        const ctaUrl =
          process.env.APP_URL && String(process.env.APP_URL).trim()
            ? `${String(process.env.APP_URL).replace(/\/$/, "")}/client/shipments`
            : "";

        const html = shipmentUpdateEmailHtml({
          brand: "LEMON'S PORTAL",
          clientName: user.name || "",
          clientNumber: user.client_number || "",
          code,
          oldStatus: "Creado",
          newStatus: created.status || d.status || "Recibido en depósito",
          origin: created.origin || calc.origin || "",
          service: created.service || calc.service || "",
          weightKg: created.weight_kg,
          rateUsdKg: created.rate_usd_per_kg,
          estimatedUsd: created.estimated_usd,
          tracking: created.tracking || "",
          boxCode: created.box_code || "",
          ctaUrl,
        });

        await sendEmail({ to: user.email, subject: `Envío creado #${code}`, html });
      } catch (e) {
        console.log("[MAIL] Falló envío creación (no rompemos flujo):", e?.message || e);
      }

      res.json({ shipment: ins.rows[0] });
    } catch (e) {
      console.error("CREATE SHIPMENT ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ✅ GET /operator/shipments — con filtros avanzados (fecha, estado, origen, servicio)
app.get(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const search        = (req.query.search        || "").trim();
      const clientNumber  = (req.query.client_number || "").trim();
      const dateFrom      = (req.query.date_from     || "").trim();
      const dateTo        = (req.query.date_to       || "").trim();
      const statusFilter  = (req.query.status        || "").trim();
      const originFilter  = (req.query.origin        || "").trim();
      const serviceFilter = (req.query.service       || "").trim();

      const params = [];
      let where = "WHERE 1=1";

      if (clientNumber !== "") {
        const n = Number(clientNumber);
        if (!Number.isNaN(n)) {
          params.push(n);
          where += ` AND u.client_number = $${params.length}`;
        }
      }

      if (search) {
        params.push(`%${search}%`);
        const p1 = params.length;
        params.push(`%${search}%`);
        const p2 = params.length;
        params.push(`%${search}%`);
        const p3 = params.length;
        where += ` AND (sh.code ILIKE $${p1} OR sh.description ILIKE $${p2} OR sh.tracking ILIKE $${p3})`;
      }

      if (dateFrom) {
        params.push(dateFrom);
        where += ` AND sh.date_in >= $${params.length}`;
      }
      if (dateTo) {
        params.push(dateTo);
        where += ` AND sh.date_in <= $${params.length}::date + INTERVAL '1 day'`;
      }
      if (statusFilter) {
        params.push(statusFilter);
        where += ` AND sh.status = $${params.length}`;
      }
      if (originFilter) {
        params.push(originFilter);
        where += ` AND sh.origin = $${params.length}`;
      }
      if (serviceFilter) {
        params.push(serviceFilter);
        where += ` AND sh.service = $${params.length}`;
      }

      const q = await db.query(
        `SELECT sh.*, u.client_number, u.name, u.email
         FROM shipments sh
         JOIN users u ON u.id = sh.user_id
         ${where}
         ORDER BY sh.id DESC
         LIMIT 500`,
        params
      );

      res.json({ rows: q.rows });
    } catch (e) {
      console.error("OP SHIPMENTS ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.patch(
  "/operator/shipments/:id",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const schema = z.object({
        package_code: z.string().min(1),
        description: z.string().min(1),
        box_code: z.string().nullable().optional(),
        tracking: z.string().nullable().optional(),
        weight_kg: z.number().min(0),
        origin: z.string().nullable().optional(),
        service: z.string().nullable().optional(),
        rate_usd_per_kg: z.number().nullable().optional(),
        estimated_usd: z.number().nullable().optional(),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      const cur = await db.query(`SELECT id, user_id FROM shipments WHERE id=$1`, [id]);
      const current = cur.rows[0];
      if (!current) return res.status(404).json({ error: "Envío no existe" });

      const calc = await computeRateAndEstimatedServer({
        userId: current.user_id,
        originRaw: p.data.origin ?? null,
        serviceRaw: p.data.service ?? null,
        weight_kg: p.data.weight_kg,
        rateOverride: p.data.rate_usd_per_kg ?? null,
      });

      const upd = await db.query(
        `UPDATE shipments
         SET code=$1, description=$2, box_code=$3, tracking=$4, weight_kg=$5,
             origin=$6, service=$7, rate_usd_per_kg=$8, estimated_usd=$9, updated_at=NOW()
         WHERE id=$10
         RETURNING *`,
        [
          p.data.package_code,
          p.data.description,
          p.data.box_code ?? null,
          p.data.tracking ?? null,
          p.data.weight_kg,
          calc.origin,
          calc.service,
          calc.rate_usd_per_kg,
          calc.estimated_usd,
          id,
        ]
      );

      res.json({ shipment: upd.rows[0] });
    } catch (e) {
      console.error("PATCH SHIPMENT ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.patch(
  "/operator/shipments/:id/status",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const schema = z.object({ status: z.string().min(1) });
      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const shipmentId = Number(req.params.id);
      if (Number.isNaN(shipmentId)) return res.status(400).json({ error: "ID inválido" });

      const s = await db.query(
        `SELECT sh.*, u.email, u.name, u.client_number
         FROM shipments sh
         JOIN users u ON u.id = sh.user_id
         WHERE sh.id=$1`,
        [shipmentId]
      );

      const current = s.rows[0];
      if (!current) return res.status(404).json({ error: "Envío no existe" });

      const oldStatus = current.status;
      const newStatus = p.data.status;

      if (oldStatus === newStatus) {
        return res.json({ shipment: current });
      }

      const upd = await db.query(
        `UPDATE shipments
         SET status=$1, updated_at=NOW(),
             delivered_at = CASE WHEN $1='Entregado' THEN NOW() ELSE delivered_at END
         WHERE id=$2
         RETURNING *`,
        [newStatus, shipmentId]
      );

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status) VALUES ($1,$2,$3)`,
        [shipmentId, oldStatus, newStatus]
      );

      // ✅ mail pro update
      try {
        const updated = upd.rows[0] || current;
        const code = updated?.code || current.code || shipmentId;
        const ctaUrl =
          process.env.APP_URL && String(process.env.APP_URL).trim()
            ? `${String(process.env.APP_URL).replace(/\/$/, "")}/client/shipments`
            : "";

        const html = shipmentUpdateEmailHtml({
          brand: "LEMON'S PORTAL",
          clientName: current.name || "",
          clientNumber: current.client_number || "",
          code,
          oldStatus,
          newStatus,
          origin: updated.origin || current.origin || "",
          service: updated.service || current.service || "",
          weightKg: updated.weight_kg ?? current.weight_kg ?? null,
          rateUsdKg: updated.rate_usd_per_kg ?? current.rate_usd_per_kg ?? null,
          estimatedUsd: updated.estimated_usd ?? current.estimated_usd ?? null,
          tracking: updated.tracking || current.tracking || "",
          boxCode: updated.box_code || current.box_code || "",
          ctaUrl,
        });

        await sendEmail({ to: current.email, subject: `Actualización de envío #${code}`, html });
      } catch (e) {
        console.log("[MAIL] Falló envío (no rompemos flujo):", e?.message || e);
      }

      // ══ AUTO LEMON COINS al entregar ══════════════════════════════
      if (newStatus === "Entregado") {
        try {
          const existQ = await db.query(
            `SELECT id FROM coin_transactions WHERE shipment_id=$1 AND type='earn' AND reason NOT LIKE '%primer envío%' LIMIT 1`,
            [shipmentId]
          );
          if (!existQ.rows[0]) {
            const shipFull = (await db.query(
              `SELECT s.*, u.first_shipment_bonus_given
               FROM shipments s JOIN users u ON u.id = s.user_id
               WHERE s.id=$1`, [shipmentId]
            )).rows[0];

            if (shipFull) {
              const kg        = parseFloat(shipFull.weight_kg     || 0);
              const usd       = parseFloat(shipFull.estimated_usd || 0);
              const coinsByKg = Math.floor(kg * 3);
              const coinsBig  = usd >= 500 ? 10 : 0;
              // Bonus primer envío (15 coins) NO se otorga automáticamente — el cliente lo reclama
              const total     = coinsByKg + coinsBig;

              if (total > 0) {
                const breakdown = [];
                if (coinsByKg > 0) breakdown.push(`${coinsByKg} por ${kg.toFixed(2)}kg`);
                if (coinsBig  > 0) breakdown.push(`${coinsBig} bonus envío grande`);

                await db.query(
                  `INSERT INTO lemon_coins (user_id, balance, total_earned)
                   VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
                  [shipFull.user_id]
                );
                await db.query(
                  `INSERT INTO coin_transactions (user_id, type, amount, reason, shipment_id)
                   VALUES ($1,'earn',$2,$3,$4)`,
                  [shipFull.user_id, total, `Envío completado — ${breakdown.join(", ")}`, shipmentId]
                );
                await db.query(
                  `UPDATE lemon_coins
                   SET balance=balance+$1, total_earned=total_earned+$1, updated_at=NOW()
                   WHERE user_id=$2`,
                  [total, shipFull.user_id]
                );
                console.log(`[COINS] +${total} coins → user ${shipFull.user_id} (envío ${shipmentId})`);
              }
            }
          }
        } catch (coinErr) {
          console.error("[COINS] Error otorgando coins:", coinErr.message);
        }
      }
      // ═════════════════════════════════════════════════════════════

      res.json({ shipment: upd.rows[0] });
    } catch (e) {
      console.error("PATCH STATUS ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ==================== CLIENT ====================

app.get("/client/shipments", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      `SELECT id, code, description, box_code, tracking, weight_kg, status, date_in,
              origin, service, rate_usd_per_kg, estimated_usd
       FROM shipments
       WHERE user_id=$1
       ORDER BY id DESC`,
      [req.user.id]
    );
    res.json({ rows: q.rows });
  } catch (e) {
    console.error("CLIENT SHIPMENTS ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/shipments/:id/events", authRequired, async (req, res) => {
  try {
    const shipmentId = Number(req.params.id);
    if (Number.isNaN(shipmentId)) return res.status(400).json({ error: "ID inválido" });

    const sh = await db.query("SELECT id, user_id FROM shipments WHERE id=$1", [shipmentId]);
    const shipment = sh.rows[0];
    if (!shipment) return res.status(404).json({ error: "Envío no existe" });

    const role = req.user.role;
    const isOwner = req.user.id === shipment.user_id;
    const isStaff = role === "operator" || role === "admin";
    if (!isOwner && !isStaff) return res.status(403).json({ error: "No autorizado" });

    const ev = await db.query(
      `SELECT shipment_id, old_status, new_status, created_at
       FROM shipment_events
       WHERE shipment_id=$1
       ORDER BY created_at ASC`,
      [shipmentId]
    );

    res.json({ rows: ev.rows });
  } catch (e) {
    console.error("EVENTS ERROR", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ── GET /operator/costs ──────────────────────────────────────────────────────
app.get("/operator/costs", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const costs = await getOperatorCosts();
    res.json({ costs, defaults: DEFAULT_OPERATOR_COSTS });
  } catch (err) {
    console.error("GET COSTS ERROR:", err);
    res.status(500).json({ error: "Error leyendo costos" });
  }
});

// ── PUT /operator/costs ──────────────────────────────────────────────────────
app.put("/operator/costs", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const schema = z.object({
      usa_normal:       z.number().min(0),
      usa_express:      z.number().min(0),
      usa_tech_premium: z.number().min(0),
      china_normal:     z.number().min(0),
      china_express:    z.number().min(0),
      europa_normal:    z.number().min(0),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const d = p.data;
    await db.query(
      `INSERT INTO operator_costs (id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         usa_normal       = EXCLUDED.usa_normal,
         usa_express      = EXCLUDED.usa_express,
         usa_tech_premium = EXCLUDED.usa_tech_premium,
         china_normal     = EXCLUDED.china_normal,
         china_express    = EXCLUDED.china_express,
         europa_normal    = EXCLUDED.europa_normal,
         updated_at       = NOW()`,
      [d.usa_normal, d.usa_express, d.usa_tech_premium, d.china_normal, d.china_express, d.europa_normal]
    );
    res.json({ ok: true, costs: d });
  } catch (err) {
    console.error("PUT COSTS ERROR:", err);
    res.status(500).json({ error: "Error guardando costos" });
  }
});

// ── GET /operator/dashboard ──────────────────────────────────────────────────
app.get("/operator/dashboard", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const statsQ = await db.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE status='Recibido en depósito')            AS received,
        COUNT(*) FILTER (WHERE status='En preparación')                  AS prep,
        COUNT(*) FILTER (WHERE status='Despachado')                      AS sent,
        COUNT(*) FILTER (WHERE status='En tránsito')                     AS transit,
        COUNT(*) FILTER (WHERE status='Listo para entrega')              AS ready,
        COUNT(*) FILTER (WHERE status='Entregado')                       AS delivered,
        COALESCE(SUM(weight_kg), 0)                                      AS total_weight,
        COALESCE(SUM(estimated_usd), 0)                                  AS total_revenue,
        COALESCE(SUM(estimated_usd) FILTER (WHERE status='Entregado'),0) AS delivered_revenue,
        COUNT(DISTINCT user_id)                                           AS active_clients
      FROM shipments
    `);

    const byOriginQ = await db.query(`
      SELECT COALESCE(origin, 'Sin origen') AS origin, COUNT(*) AS count, COALESCE(SUM(weight_kg), 0) AS weight
      FROM shipments GROUP BY origin ORDER BY count DESC
    `);

    const byServiceQ = await db.query(`
      SELECT COALESCE(service, 'NORMAL') AS service, COUNT(*) AS count
      FROM shipments GROUP BY service ORDER BY count DESC
    `);

    const operatorCosts = await getOperatorCosts();
    const costsParams = [
      Number(operatorCosts.usa_normal)       || 0,
      Number(operatorCosts.usa_express)      || 0,
      Number(operatorCosts.usa_tech_premium) || 0,
      Number(operatorCosts.china_normal)     || 0,
      Number(operatorCosts.china_express)    || 0,
      Number(operatorCosts.europa_normal)    || 0,
    ];

    const byMonthQ = await db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', date_in), 'YYYY-MM') AS month,
        COUNT(*) AS count,
        COALESCE(SUM(estimated_usd), 0) AS revenue,
        COALESCE(SUM(weight_kg * CASE
          WHEN origin='USA'   AND service='NORMAL'       THEN $1::numeric
          WHEN origin='USA'   AND service='EXPRESS'      THEN $2::numeric
          WHEN origin='USA'   AND service='TECH_PREMIUM' THEN $3::numeric
          WHEN origin='CHINA' AND service='NORMAL'       THEN $4::numeric
          WHEN origin='CHINA' AND service='EXPRESS'      THEN $5::numeric
          WHEN origin='EUROPA'                            THEN $6::numeric
          ELSE 0 END), 0) AS cost,
        COALESCE(SUM(estimated_usd), 0) - COALESCE(SUM(weight_kg * CASE
          WHEN origin='USA'   AND service='NORMAL'       THEN $1::numeric
          WHEN origin='USA'   AND service='EXPRESS'      THEN $2::numeric
          WHEN origin='USA'   AND service='TECH_PREMIUM' THEN $3::numeric
          WHEN origin='CHINA' AND service='NORMAL'       THEN $4::numeric
          WHEN origin='CHINA' AND service='EXPRESS'      THEN $5::numeric
          WHEN origin='EUROPA'                            THEN $6::numeric
          ELSE 0 END), 0) AS profit
      FROM shipments
      WHERE date_in >= NOW() - INTERVAL '8 months'
      GROUP BY DATE_TRUNC('month', date_in)
      ORDER BY DATE_TRUNC('month', date_in)
    `, costsParams);

    const byLaneQ = await db.query(`
      SELECT
        COALESCE(origin, '-') AS origin, COALESCE(service, '-') AS service,
        COUNT(*) AS count,
        COALESCE(SUM(estimated_usd), 0) AS revenue,
        COALESCE(SUM(weight_kg * CASE
          WHEN origin='USA'   AND service='NORMAL'       THEN $1::numeric
          WHEN origin='USA'   AND service='EXPRESS'      THEN $2::numeric
          WHEN origin='USA'   AND service='TECH_PREMIUM' THEN $3::numeric
          WHEN origin='CHINA' AND service='NORMAL'       THEN $4::numeric
          WHEN origin='CHINA' AND service='EXPRESS'      THEN $5::numeric
          WHEN origin='EUROPA'                            THEN $6::numeric
          ELSE 0 END), 0) AS cost,
        COALESCE(SUM(estimated_usd), 0) - COALESCE(SUM(weight_kg * CASE
          WHEN origin='USA'   AND service='NORMAL'       THEN $1::numeric
          WHEN origin='USA'   AND service='EXPRESS'      THEN $2::numeric
          WHEN origin='USA'   AND service='TECH_PREMIUM' THEN $3::numeric
          WHEN origin='CHINA' AND service='NORMAL'       THEN $4::numeric
          WHEN origin='CHINA' AND service='EXPRESS'      THEN $5::numeric
          WHEN origin='EUROPA'                            THEN $6::numeric
          ELSE 0 END), 0) AS profit
      FROM shipments GROUP BY origin, service ORDER BY revenue DESC
    `, costsParams);

    const topClientsQ = await db.query(`
      SELECT u.client_number, u.name, COUNT(s.id) AS shipments, COALESCE(SUM(s.estimated_usd),0) AS revenue
      FROM shipments s JOIN users u ON u.id = s.user_id
      GROUP BY u.id, u.client_number, u.name ORDER BY shipments DESC LIMIT 5
    `);

    const recentQ = await db.query(`
      SELECT s.id, s.code, s.description, s.status, s.date_in, s.origin, s.estimated_usd,
             u.client_number, u.name AS client_name
      FROM shipments s JOIN users u ON u.id = s.user_id
      ORDER BY s.date_in DESC LIMIT 5
    `);

    res.json({
      stats:          statsQ.rows[0],
      by_origin:      byOriginQ.rows,
      by_service:     byServiceQ.rows,
      by_month:       byMonthQ.rows,
      by_lane:        byLaneQ.rows,
      top_clients:    topClientsQ.rows,
      recent:         recentQ.rows,
      operator_costs: operatorCosts,
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Error dashboard" });
  }
});

// ════════════════════════════════════════════════════════════════════
// MÓDULO CAJA — pagos y gastos
// ════════════════════════════════════════════════════════════════════

const PAYMENT_METHODS = ["USD_CASH", "USDT", "ARS_TRANSFER", "ARS_CASH"];
const EXPENSE_CATEGORIES = [
  "Alquiler / Oficina", "Sueldos / Personal", "Logística / Flete",
  "Marketing", "Servicios", "Otros"
];

app.get("/cash/pending/:clientNumber", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const cn = parseInt(req.params.clientNumber, 10);
    if (!Number.isFinite(cn)) return res.status(400).json({ error: "Número de cliente inválido" });

    const uq = await db.query(
      "SELECT id, client_number, name, email FROM users WHERE client_number=$1", [cn]
    );
    if (!uq.rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });
    const user = uq.rows[0];

    const sq = await db.query(`
      SELECT s.id, s.code, s.description, s.weight_kg, s.origin, s.service,
             s.status, s.estimated_usd, s.date_in
      FROM shipments s
      WHERE s.user_id = $1
        AND s.estimated_usd IS NOT NULL
        AND s.id NOT IN (SELECT shipment_id FROM payment_items)
      ORDER BY s.date_in DESC
    `, [user.id]);

    res.json({ user, shipments: sq.rows });
  } catch (err) {
    console.error("GET PENDING ERROR:", err);
    res.status(500).json({ error: "Error obteniendo pendientes" });
  }
});

app.post("/cash/payments", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const schema = z.object({
      user_id:       z.number().int().positive(),
      shipment_ids:  z.array(z.number().int().positive()).min(1),
      method:        z.enum(["USD_CASH", "USDT", "ARS_TRANSFER", "ARS_CASH"]),
      exchange_rate: z.number().min(0).nullable().optional(),
      amount_ars:    z.number().min(0).nullable().optional(),
      notes:         z.string().nullable().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos", details: p.error.issues });

    const { user_id, shipment_ids, method, exchange_rate, amount_ars, notes } = p.data;
    const operator_id = req.user?.id || null;

    const sq = await db.query(
      `SELECT id, estimated_usd FROM shipments WHERE id = ANY($1::int[]) AND user_id = $2`,
      [shipment_ids, user_id]
    );
    if (sq.rows.length !== shipment_ids.length) {
      return res.status(400).json({ error: "Algunos paquetes no pertenecen al cliente o no existen" });
    }
    const total_usd = sq.rows.reduce((a, r) => a + Number(r.estimated_usd || 0), 0);

    const client = await db.pool ? db.pool.connect() : null;
    try {
      const payRes = await db.query(
        `INSERT INTO payments (user_id, operator_id, amount_usd, method, exchange_rate, amount_ars, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [user_id, operator_id, total_usd, method, exchange_rate ?? null, amount_ars ?? null, notes ?? null]
      );
      const payment = payRes.rows[0];

      for (const sid of shipment_ids) {
        const shipAmt = sq.rows.find(r => r.id === sid)?.estimated_usd || 0;
        await db.query(
          `INSERT INTO payment_items (payment_id, shipment_id, amount_usd) VALUES ($1, $2, $3)`,
          [payment.id, sid, shipAmt]
        );
        const prevQ = await db.query(`SELECT status FROM shipments WHERE id=$1`, [sid]);
        const prevStatus = prevQ.rows[0]?.status || null;
        if (prevStatus !== "Entregado") {
          await db.query(`UPDATE shipments SET status='Entregado', updated_at=NOW() WHERE id=$1`, [sid]);
          await db.query(
            `INSERT INTO shipment_events (shipment_id, old_status, new_status) VALUES ($1, $2, $3)`,
            [sid, prevStatus, "Entregado"]
          );

          // ── Auto Lemon Coins al cobrar (también marca entregado) ──
          try {
            const existQ = await db.query(
              `SELECT id FROM coin_transactions WHERE shipment_id=$1 AND type='earn' LIMIT 1`, [sid]
            );
            if (!existQ.rows[0]) {
              const shipFull = (await db.query(
                `SELECT s.*, u.first_shipment_bonus_given FROM shipments s JOIN users u ON u.id=s.user_id WHERE s.id=$1`, [sid]
              )).rows[0];
              if (shipFull) {
                const kg = parseFloat(shipFull.weight_kg || 0);
                const usd = parseFloat(shipFull.estimated_usd || 0);
                const coinsByKg = Math.floor(kg * 3);
                const coinsBig = usd >= 500 ? 10 : 0;
                const coinsFirst = !shipFull.first_shipment_bonus_given ? 15 : 0;
                const total = coinsByKg + coinsBig + coinsFirst;
                if (total > 0) {
                  const bd = [];
                  if (coinsByKg  > 0) bd.push(`${coinsByKg} por ${kg.toFixed(2)}kg`);
                  if (coinsBig   > 0) bd.push(`${coinsBig} bonus envío grande`);
                  if (coinsFirst > 0) bd.push(`${coinsFirst} bonus primer envío`);
                  await db.query(`INSERT INTO lemon_coins (user_id,balance,total_earned) VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`, [shipFull.user_id]);
                  await db.query(`INSERT INTO coin_transactions (user_id,type,amount,reason,shipment_id) VALUES ($1,'earn',$2,$3,$4)`, [shipFull.user_id, total, `Envío completado — ${bd.join(", ")}`, sid]);
                  await db.query(`UPDATE lemon_coins SET balance=balance+$1,total_earned=total_earned+$1,updated_at=NOW() WHERE user_id=$2`, [total, shipFull.user_id]);
                  if (coinsFirst > 0) await db.query(`UPDATE users SET first_shipment_bonus_given=TRUE WHERE id=$1`, [shipFull.user_id]);
                }
              }
            }
          } catch (coinErr) { console.error("[COINS] Error en cash/payments:", coinErr.message); }
        }
      }

      if (req.body.account_id) {
        const aid = parseInt(req.body.account_id, 10);
        if (Number.isFinite(aid)) {
          const accQ = await db.query(`SELECT balance FROM accounts WHERE id=$1`, [aid]);
          if (accQ.rows[0]) {
            const newBal = Number(accQ.rows[0].balance) + total_usd;
            await db.query(`UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2`, [newBal, aid]);
            await db.query(
              `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, ref_id, balance_after)
               VALUES ($1,$2,'in',$3,$4,'payment',$5,$6)`,
              [aid, operator_id, total_usd, `Cobro paquetes — cliente #${user_id}`, payment.id, newBal]
            );
            await db.query(`UPDATE payments SET account_id=$1 WHERE id=$2`, [aid, payment.id]);
          }
        }
      }

      res.json({ ok: true, payment });
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    console.error("POST PAYMENT ERROR:", err);
    res.status(500).json({ error: "Error registrando pago" });
  }
});

app.get("/cash/payments", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const { from, to, method, client_number } = req.query;
    const conditions = ["1=1"];
    const params = [];
    let pi = 1;

    if (from)   { conditions.push(`p.created_at >= $${pi++}`); params.push(from); }
    if (to)     { conditions.push(`p.created_at <  $${pi++}`); params.push(to + "T23:59:59"); }
    if (method) { conditions.push(`p.method = $${pi++}`);      params.push(method); }
    if (client_number) {
      conditions.push(`u.client_number = $${pi++}`);
      params.push(parseInt(client_number, 10));
    }

    const q = await db.query(`
      SELECT
        p.id, p.amount_usd, p.method, p.exchange_rate, p.amount_ars,
        p.notes, p.created_at,
        u.client_number, u.name AS client_name,
        op.name AS operator_name,
        (
          SELECT json_agg(json_build_object(
            'shipment_id', pi2.shipment_id,
            'amount_usd',  pi2.amount_usd,
            'code',        s.code,
            'description', s.description
          ))
          FROM payment_items pi2
          JOIN shipments s ON s.id = pi2.shipment_id
          WHERE pi2.payment_id = p.id
        ) AS items
      FROM payments p
      JOIN users u  ON u.id = p.user_id
      LEFT JOIN users op ON op.id = p.operator_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.created_at DESC
      LIMIT 200
    `, params);

    res.json({ rows: q.rows });
  } catch (err) {
    console.error("GET PAYMENTS ERROR:", err);
    res.status(500).json({ error: "Error obteniendo pagos" });
  }
});

app.delete("/cash/payments/:id", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.query("DELETE FROM payment_items WHERE payment_id=$1", [id]);
    await db.query("DELETE FROM payments WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE PAYMENT ERROR:", err);
    res.status(500).json({ error: "Error anulando pago" });
  }
});

app.post("/cash/expenses", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const schema = z.object({
      type:        z.enum(["empresa", "personal"]),
      category:    z.string().min(1),
      description: z.string().min(1),
      amount:      z.number().min(0.01),
      currency:    z.enum(["USD", "ARS"]),
      date:        z.string().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const { type, category, description, amount, currency, date } = p.data;
    const operator_id = req.user?.id || null;

    const r = await db.query(
      `INSERT INTO expenses (operator_id, type, category, description, amount, currency, date, account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [operator_id, type, category, description, amount, currency,
       date || new Date().toISOString().slice(0, 10), req.body.account_id || null]
    );

    if (req.body.account_id) {
      const aid = parseInt(req.body.account_id, 10);
      if (Number.isFinite(aid)) {
        const accQ = await db.query(`SELECT balance FROM accounts WHERE id=$1`, [aid]);
        if (accQ.rows[0]) {
          const newBal = Number(accQ.rows[0].balance) - amount;
          await db.query(`UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2`, [newBal, aid]);
          await db.query(
            `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, ref_id, balance_after)
             VALUES ($1,$2,'out',$3,$4,'expense',$5,$6)`,
            [aid, operator_id, amount, `${type} — ${category}: ${description}`, r.rows[0].id, newBal]
          );
        }
      }
    }
    res.json({ ok: true, expense: r.rows[0] });
  } catch (err) {
    console.error("POST EXPENSE ERROR:", err);
    res.status(500).json({ error: "Error registrando gasto" });
  }
});

app.get("/cash/expenses", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const { from, to, type, currency } = req.query;
    const conditions = ["1=1"];
    const params = [];
    let pi = 1;

    if (from)     { conditions.push(`e.date >= $${pi++}`);    params.push(from); }
    if (to)       { conditions.push(`e.date <= $${pi++}`);    params.push(to); }
    if (type)     { conditions.push(`e.type = $${pi++}`);     params.push(type); }
    if (currency) { conditions.push(`e.currency = $${pi++}`); params.push(currency); }

    const q = await db.query(`
      SELECT e.*, u.name AS operator_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.operator_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT 500
    `, params);

    const totals = q.rows.reduce((acc, r) => {
      const k = r.currency;
      acc[k] = (acc[k] || 0) + Number(r.amount);
      if (r.type === "empresa")  acc[`empresa_${k}`]  = (acc[`empresa_${k}`]  || 0) + Number(r.amount);
      if (r.type === "personal") acc[`personal_${k}`] = (acc[`personal_${k}`] || 0) + Number(r.amount);
      return acc;
    }, {});

    res.json({ rows: q.rows, totals });
  } catch (err) {
    console.error("GET EXPENSES ERROR:", err);
    res.status(500).json({ error: "Error obteniendo gastos" });
  }
});

app.delete("/cash/expenses/:id", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    await db.query("DELETE FROM expenses WHERE id=$1", [parseInt(req.params.id, 10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando gasto" });
  }
});

// ════════════════════════════════════════════════════════════════════
// PRESUPUESTADOR
// ════════════════════════════════════════════════════════════════════

const DEFAULT_RATES_FALLBACK = {
  usa_normal: 45, usa_express: 55, usa_tech_premium: 75,
  china_normal: 58, china_express: 68, europa_normal: 58,
};

app.get("/quote/rates", async (req, res) => {
  try {
    const [costsQ, fxQ] = await Promise.all([
      db.query(`SELECT * FROM operator_costs WHERE id=1`),
      db.query(`SELECT value FROM app_settings WHERE key='fx_usd_ars'`),
    ]);
    const rates = costsQ.rows[0] || DEFAULT_RATES_FALLBACK;
    const fx    = fxQ.rows[0] ? Number(fxQ.rows[0].value) : null;
    res.json({ rates, fx_rate: fx });
  } catch(err) { res.status(500).json({ error: "Error obteniendo tarifas" }); }
});

app.get("/quote/my-rates", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const [ratesQ, fxQ] = await Promise.all([
      db.query(`SELECT * FROM client_rates WHERE user_id=$1`, [userId]),
      db.query(`SELECT value FROM app_settings WHERE key='fx_usd_ars'`),
    ]);
    const defaults = DEFAULT_RATES_FALLBACK;
    const custom   = ratesQ.rows[0] || {};
    const rates = {
      usa_normal:        Number(custom.usa_normal        ?? defaults.usa_normal),
      usa_express:       Number(custom.usa_express       ?? defaults.usa_express),
      usa_tech_premium:  Number(custom.usa_tech_premium  ?? defaults.usa_tech_premium),
      china_normal:      Number(custom.china_normal      ?? defaults.china_normal),
      china_express:     Number(custom.china_express     ?? defaults.china_express),
      europa_normal:     Number(custom.europa_normal     ?? defaults.europa_normal),
    };
    const fx = fxQ.rows[0] ? Number(fxQ.rows[0].value) : null;
    res.json({
      rates,
      fx_rate: fx,
      personalized: !!ratesQ.rows[0],
      volume_discounts: [
        { min_kg: 1,   max_kg: 9,   discount: 0, label: "1–9 kg" },
        { min_kg: 10,  max_kg: 49,  discount: 3, label: "10–49 kg (−$3/kg)" },
        { min_kg: 50,  max_kg: 99,  discount: 5, label: "50–99 kg (−$5/kg)" },
        { min_kg: 100, max_kg: null, discount: 7, label: "100+ kg (−$7/kg)" },
      ],
    });
  } catch(err) { res.status(500).json({ error: "Error obteniendo tarifas" }); }
});

app.post("/quote/request", authRequired, async (req, res) => {
  try {
    const schema = z.object({
      origin:        z.enum(["usa","china","europa","USA","CHINA","EUROPA"]),
      service:       z.enum(["NORMAL","EXPRESS","TECH_PREMIUM","normal","express"]),
      weight_kg:     z.number().min(0.01),
      description:   z.string().min(1),
      estimated_usd: z.number().min(0),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const userId  = req.user.id;
    const origin  = p.data.origin.toUpperCase();
    const service = p.data.service.toUpperCase();
    const { weight_kg, description, estimated_usd } = p.data;

    await db.query(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        code TEXT UNIQUE,
        origin TEXT, service TEXT,
        weight_kg NUMERIC, description TEXT,
        estimated_usd NUMERIC,
        status TEXT DEFAULT 'pendiente',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const code = `SOL-\${Date.now().toString(36).toUpperCase()}`;
    const r = await db.query(`
      INSERT INTO quote_requests
        (user_id, code, origin, service, weight_kg, description, estimated_usd, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente')
      RETURNING *
    `, [userId, code, origin, service, weight_kg, description, estimated_usd]);

    res.json({ ok: true, code, request: r.rows[0] });
  } catch(err) {
    console.error("[QUOTE REQUEST]", err);
    res.status(500).json({ error: "Error creando solicitud" });
  }
});

// ── GET solicitudes (operador) ─────────────────────────────────────
app.get("/quote/requests", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        code TEXT UNIQUE,
        origin TEXT, service TEXT,
        weight_kg NUMERIC, description TEXT,
        estimated_usd NUMERIC,
        status TEXT DEFAULT 'pendiente',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const q = await db.query(`
      SELECT qr.*, u.name AS client_name, u.client_number, u.email AS client_email
      FROM quote_requests qr
      JOIN users u ON u.id = qr.user_id
      ORDER BY qr.created_at DESC
    `);
    res.json({ requests: q.rows });
  } catch(err) {
    console.error("[QUOTE REQUESTS GET]", err);
    res.status(500).json({ error: "Error obteniendo solicitudes" });
  }
});

// ── PATCH solicitud (operador) ─────────────────────────────────────
app.patch("/quote/requests/:id", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;
    const q = await db.query(`
      UPDATE quote_requests
      SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW()
      WHERE id=$3 RETURNING *
    `, [status || null, notes !== undefined ? notes : null, id]);
    if (!q.rows[0]) return res.status(404).json({ error: "Solicitud no encontrada" });
    res.json({ ok: true, request: q.rows[0] });
  } catch(err) {
    res.status(500).json({ error: "Error actualizando solicitud" });
  }
});
// ════════════════════════════════════════════════════════════════════
// TIPO DE CAMBIO
// ════════════════════════════════════════════════════════════════════

app.get("/settings/fx", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`SELECT value, updated_at FROM app_settings WHERE key='fx_usd_ars'`);
    const rate = q.rows[0] ? Number(q.rows[0].value) : null;
    res.json({ rate, updated_at: q.rows[0]?.updated_at || null });
  } catch(err) { res.status(500).json({ error: "Error leyendo tipo de cambio" }); }
});

app.put("/settings/fx", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const { rate } = req.body;
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: "Tipo de cambio inválido" });
    await db.query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('fx_usd_ars', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()
    `, [String(n)]);
    res.json({ ok: true, rate: n });
  } catch(err) { res.status(500).json({ error: "Error guardando tipo de cambio" }); }
});

// ════════════════════════════════════════════════════════════════════
// MÓDULO CUENTAS / FONDOS
// ════════════════════════════════════════════════════════════════════

app.get("/accounts", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`
      SELECT a.*,
        COALESCE((SELECT SUM(CASE WHEN direction='in' THEN amount ELSE -amount END)
                  FROM account_movements WHERE account_id=a.id), 0) AS movements_balance
      FROM accounts a WHERE a.active=true ORDER BY a.id
    `);
    res.json({ accounts: q.rows });
  } catch(err) { res.status(500).json({ error: "Error obteniendo cuentas" }); }
});

app.post("/accounts", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const schema = z.object({
      name:     z.string().min(1),
      type:     z.enum(["usd_cash","usdt","bank_ars","bank_usd","prepaid","other"]),
      currency: z.enum(["USD","ARS","USDT"]),
      balance:  z.number().default(0),
      notes:    z.string().nullable().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });
    const r = await db.query(
      `INSERT INTO accounts (name,type,currency,balance,notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [p.data.name, p.data.type, p.data.currency, p.data.balance, p.data.notes||null]
    );
    res.json({ ok: true, account: r.rows[0] });
  } catch(err) { res.status(500).json({ error: "Error creando cuenta" }); }
});

app.put("/accounts/:id", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      name:    z.string().min(1).optional(),
      balance: z.number().optional(),
      notes:   z.string().nullable().optional(),
      active:  z.boolean().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const fields = []; const vals = []; let pi = 1;
    if (p.data.name    !== undefined) { fields.push(`name=$${pi++}`);    vals.push(p.data.name); }
    if (p.data.balance !== undefined) { fields.push(`balance=$${pi++}`); vals.push(p.data.balance); }
    if (p.data.notes   !== undefined) { fields.push(`notes=$${pi++}`);   vals.push(p.data.notes); }
    if (p.data.active  !== undefined) { fields.push(`active=$${pi++}`);  vals.push(p.data.active); }
    fields.push(`updated_at=NOW()`);
    vals.push(id);

    const r = await db.query(`UPDATE accounts SET ${fields.join(",")} WHERE id=$${pi} RETURNING *`, vals);
    if (p.data.balance !== undefined) {
      await db.query(
        `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, balance_after)
         VALUES ($1,$2,'in',$3,'Ajuste manual de saldo','manual',$4)`,
        [id, req.user?.id||null, p.data.balance, p.data.balance]
      );
    }
    res.json({ ok: true, account: r.rows[0] });
  } catch(err) { res.status(500).json({ error: "Error actualizando cuenta" }); }
});

app.delete("/accounts/:id", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    await db.query(`UPDATE accounts SET active=false WHERE id=$1`, [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: "Error eliminando cuenta" }); }
});

app.post("/accounts/:id/movements", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const account_id = parseInt(req.params.id, 10);
    const schema = z.object({
      direction:   z.enum(["in","out"]),
      amount:      z.number().min(0.01),
      description: z.string().min(1),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const accQ = await db.query(`SELECT balance FROM accounts WHERE id=$1`, [account_id]);
    if (!accQ.rows[0]) return res.status(404).json({ error: "Cuenta no encontrada" });
    const current = Number(accQ.rows[0].balance);
    const delta = p.data.direction === 'in' ? p.data.amount : -p.data.amount;
    const newBalance = current + delta;

    await db.query(`UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2`, [newBalance, account_id]);
    const mv = await db.query(
      `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, balance_after)
       VALUES ($1,$2,$3,$4,$5,'manual',$6) RETURNING *`,
      [account_id, req.user?.id||null, p.data.direction, p.data.amount, p.data.description, newBalance]
    );
    res.json({ ok: true, movement: mv.rows[0], balance: newBalance });
  } catch(err) { res.status(500).json({ error: "Error registrando movimiento" }); }
});

app.get("/accounts/:id/movements", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`
      SELECT m.*, u.name AS operator_name
      FROM account_movements m
      LEFT JOIN users u ON u.id = m.operator_id
      WHERE m.account_id = $1
      ORDER BY m.created_at DESC LIMIT 100
    `, [parseInt(req.params.id,10)]);
    res.json({ rows: q.rows });
  } catch(err) { res.status(500).json({ error: "Error obteniendo movimientos" }); }
});

app.get("/accounts/summary", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`
      SELECT a.*, (SELECT COUNT(*) FROM account_movements WHERE account_id=a.id) AS movement_count
      FROM accounts a WHERE a.active=true ORDER BY a.id
    `);
    const fxQ = await db.query(`SELECT value FROM app_settings WHERE key='fx_usd_ars'`);
    const fxRate = fxQ.rows[0] ? Number(fxQ.rows[0].value) : null;

    const totals = q.rows.reduce((acc, r) => {
      acc[r.currency] = (acc[r.currency]||0) + Number(r.balance);
      return acc;
    }, {});

    let totalCapitalUsd = 0;
    q.rows.forEach(a => {
      if (a.currency === 'USD')  totalCapitalUsd += Number(a.balance);
      if (a.currency === 'USDT') totalCapitalUsd += Number(a.balance);
      if (a.currency === 'ARS' && fxRate) totalCapitalUsd += Number(a.balance) / fxRate;
    });

    res.json({ accounts: q.rows, totals, fx_rate: fxRate, total_capital_usd: Number(totalCapitalUsd.toFixed(2)) });
  } catch(err) { res.status(500).json({ error: "Error summary fondos" }); }
});

app.post("/cash/income", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const schema = z.object({
      category:    z.string().min(1),
      description: z.string().min(1),
      amount:      z.number().min(0.01),
      currency:    z.enum(["USD", "ARS"]),
      date:        z.string().optional(),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });
    const { category, description, amount, currency, date } = p.data;
    const operator_id = req.user?.id || null;
    const r = await db.query(
      `INSERT INTO additional_income (operator_id, category, description, amount, currency, date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [operator_id, category, description, amount, currency, date || new Date().toISOString().slice(0,10)]
    );
    res.json({ ok: true, income: r.rows[0] });
  } catch (err) {
    console.error("POST INCOME ERROR:", err);
    res.status(500).json({ error: "Error registrando ingreso" });
  }
});

app.get("/cash/income", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const { from, to, currency } = req.query;
    const conditions = ["1=1"];
    const params = [];
    let pi = 1;
    if (from)     { conditions.push(`i.date >= $${pi++}`);    params.push(from); }
    if (to)       { conditions.push(`i.date <= $${pi++}`);    params.push(to); }
    if (currency) { conditions.push(`i.currency = $${pi++}`); params.push(currency); }

    const q = await db.query(`
      SELECT i.*, u.name AS operator_name
      FROM additional_income i
      LEFT JOIN users u ON u.id = i.operator_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY i.date DESC, i.created_at DESC
      LIMIT 500
    `, params);

    const totals = q.rows.reduce((acc, r) => {
      acc[r.currency] = (acc[r.currency] || 0) + Number(r.amount);
      return acc;
    }, {});

    res.json({ rows: q.rows, totals });
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo ingresos" });
  }
});

app.delete("/cash/income/:id", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    await db.query("DELETE FROM additional_income WHERE id=$1", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando ingreso" });
  }
});

app.get("/cash/monthly", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const paymentsQ = await db.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount_usd), 0) AS collected
      FROM payments GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 24
    `);

    const expensesQ = await db.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month,
             COALESCE(SUM(amount) FILTER (WHERE currency='USD' AND type='empresa'), 0) AS empresa_usd,
             COALESCE(SUM(amount) FILTER (WHERE currency='ARS' AND type='empresa'), 0) AS empresa_ars,
             COALESCE(SUM(amount) FILTER (WHERE currency='USD' AND type='personal'), 0) AS personal_usd,
             COALESCE(SUM(amount) FILTER (WHERE currency='ARS' AND type='personal'), 0) AS personal_ars
      FROM expenses GROUP BY TO_CHAR(date, 'YYYY-MM') ORDER BY month DESC LIMIT 24
    `);

    const incomeQ = await db.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month,
             COALESCE(SUM(amount) FILTER (WHERE currency='USD'), 0) AS income_usd,
             COALESCE(SUM(amount) FILTER (WHERE currency='ARS'), 0) AS income_ars
      FROM additional_income GROUP BY TO_CHAR(date, 'YYYY-MM') ORDER BY month DESC LIMIT 24
    `);

    const months = new Set([
      ...paymentsQ.rows.map(r => r.month),
      ...expensesQ.rows.map(r => r.month),
      ...incomeQ.rows.map(r => r.month),
    ]);

    const result = [...months].sort((a,b) => b.localeCompare(a)).map(month => {
      const pay = paymentsQ.rows.find(r => r.month === month) || {};
      const exp = expensesQ.rows.find(r => r.month === month) || {};
      const inc = incomeQ.rows.find(r => r.month === month) || {};

      const collected    = Number(pay.collected    || 0);
      const income_usd   = Number(inc.income_usd   || 0);
      const empresa_usd  = Number(exp.empresa_usd  || 0);
      const empresa_ars  = Number(exp.empresa_ars  || 0);
      const personal_usd = Number(exp.personal_usd || 0);
      const personal_ars = Number(exp.personal_ars || 0);

      const total_income = collected + income_usd;
      const net          = total_income - empresa_usd;
      const margin       = total_income > 0 ? (net / total_income * 100) : 0;

      return {
        month, collected, income_usd,
        income_ars:   Number(inc.income_ars   || 0),
        empresa_usd, empresa_ars, personal_usd, personal_ars,
        total_income, net, margin: Number(margin.toFixed(1)),
      };
    });

    res.json({ rows: result });
  } catch (err) {
    console.error("MONTHLY ERROR:", err);
    res.status(500).json({ error: "Error obteniendo P&L mensual" });
  }
});

app.get("/cash/summary", authRequired, requireRole(["operator", "admin"]), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const to   = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0).toISOString().slice(0, 10);

    const payQ = await db.query(`
      SELECT COUNT(*) AS payment_count, COALESCE(SUM(amount_usd), 0) AS total_usd,
             COALESCE(SUM(amount_usd) FILTER (WHERE method='USD_CASH'),    0) AS usd_cash,
             COALESCE(SUM(amount_usd) FILTER (WHERE method='USDT'),        0) AS usdt,
             COALESCE(SUM(amount_usd) FILTER (WHERE method='ARS_TRANSFER'),0) AS ars_transfer_usd,
             COALESCE(SUM(amount_usd) FILTER (WHERE method='ARS_CASH'),    0) AS ars_cash_usd
      FROM payments WHERE created_at >= $1 AND created_at <= $2::date + INTERVAL '1 day'
    `, [from, to]);

    const expQ = await db.query(`
      SELECT COUNT(*) AS expense_count,
             COALESCE(SUM(amount) FILTER (WHERE currency='USD'), 0) AS total_usd,
             COALESCE(SUM(amount) FILTER (WHERE currency='ARS'), 0) AS total_ars,
             COALESCE(SUM(amount) FILTER (WHERE type='empresa'  AND currency='USD'), 0) AS empresa_usd,
             COALESCE(SUM(amount) FILTER (WHERE type='empresa'  AND currency='ARS'), 0) AS empresa_ars,
             COALESCE(SUM(amount) FILTER (WHERE type='personal' AND currency='USD'), 0) AS personal_usd,
             COALESCE(SUM(amount) FILTER (WHERE type='personal' AND currency='ARS'), 0) AS personal_ars
      FROM expenses WHERE date >= $1 AND date <= $2
    `, [from, to]);

    const byDayQ = await db.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COALESCE(SUM(amount_usd), 0) AS collected
      FROM payments WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') ORDER BY day
    `);

    const pendQ = await db.query(`
      SELECT COUNT(*) AS count, COALESCE(SUM(s.estimated_usd), 0) AS total
      FROM shipments s
      WHERE s.estimated_usd IS NOT NULL AND s.id NOT IN (SELECT shipment_id FROM payment_items)
    `);

    const incQ = await db.query(`
      SELECT COUNT(*) AS income_count,
             COALESCE(SUM(amount) FILTER (WHERE currency='USD'), 0) AS total_usd,
             COALESCE(SUM(amount) FILTER (WHERE currency='ARS'), 0) AS total_ars
      FROM additional_income WHERE date >= $1 AND date <= $2
    `, [from, to]);

    res.json({ month, payments: payQ.rows[0], expenses: expQ.rows[0], by_day: byDayQ.rows, pending: pendQ.rows[0], income: incQ.rows[0] });
  } catch (err) {
    console.error("CASH SUMMARY ERROR:", err);
    res.status(500).json({ error: "Error summary caja" });
  }
});

app.get(
  "/operator/next-code",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const origin  = (req.query.origin  || "USA").toUpperCase().trim();
      const service = (req.query.service || "NORMAL").toUpperCase().trim();

      const originPfx  = origin === "CHINA" ? "CHN" : origin === "EUROPA" ? "EUR" : "USA";
      const servicePfx = service === "EXPRESS" ? "E" : "N";
      const prefix     = `${originPfx}-${servicePfx}-`;

      const q = await db.query(
        `SELECT COUNT(*) AS cnt FROM shipments WHERE code LIKE $1`,
        [`${prefix}%`]
      );
      const next = Number(q.rows[0]?.cnt || 0) + 1;
      const code = `${prefix}${String(next).padStart(4, "0")}`;

      const exists = await db.query(`SELECT id FROM shipments WHERE code = $1`, [code]);
      if (exists.rows[0]) {
        const maxQ = await db.query(
          `SELECT code FROM shipments WHERE code LIKE $1 ORDER BY code DESC LIMIT 1`,
          [`${prefix}%`]
        );
        const lastNum = parseInt(
          (maxQ.rows[0]?.code || `${prefix}0000`).replace(prefix, ""), 10
        ) || 0;
        return res.json({ code: `${prefix}${String(lastNum + 1).padStart(4, "0")}`, prefix });
      }

      res.json({ code, prefix });
    } catch (e) {
      console.error("NEXT CODE ERROR", e);
      res.status(500).json({ error: "Error generando código" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════
// ✅ LEMON COINS ROUTER
// ════════════════════════════════════════════════════════════════════
app.use("/coins",         coinsRouter);
app.use("/external",      externalRouter);
app.use("/notifications", notificationsRouter);

// ── Reclamar bonus primer envío (cliente) ──────────────────────────
app.post("/coins/claim-first-bonus", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verificar que el cliente tiene al menos un envío entregado
    const shipQ = await db.query(
      `SELECT id FROM shipments WHERE user_id=$1 AND status='Entregado' LIMIT 1`,
      [userId]
    );
    if (!shipQ.rows[0]) {
      return res.status(400).json({ error: "No tenés envíos entregados todavía." });
    }

    // Verificar que no se otorgó antes
    const userQ = await db.query(
      `SELECT first_shipment_bonus_given FROM users WHERE id=$1`,
      [userId]
    );
    if (userQ.rows[0]?.first_shipment_bonus_given) {
      return res.status(400).json({ error: "Ya reclamaste el bonus de primer envío." });
    }

    // Verificar que no existe ya una transacción de este tipo
    const txQ = await db.query(
      `SELECT id FROM coin_transactions WHERE user_id=$1 AND reason LIKE '%primer envío%' LIMIT 1`,
      [userId]
    );
    if (txQ.rows[0]) {
      return res.status(400).json({ error: "Ya reclamaste el bonus de primer envío." });
    }

    const BONUS = 15;

    await db.query(
      `INSERT INTO lemon_coins (user_id, balance, total_earned)
       VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    await db.query(
      `INSERT INTO coin_transactions (user_id, type, amount, reason)
       VALUES ($1,'earn',$2,'🎉 Bonus primer envío completado')`,
      [userId, BONUS]
    );
    await db.query(
      `UPDATE lemon_coins SET balance=balance+$1, total_earned=total_earned+$1, updated_at=NOW()
       WHERE user_id=$2`,
      [BONUS, userId]
    );
    await db.query(
      `UPDATE users SET first_shipment_bonus_given=TRUE WHERE id=$1`,
      [userId]
    );

    res.json({ ok: true, coins: BONUS, message: `+${BONUS} Lemon Coins acreditados 🎉` });
  } catch (e) {
    console.error("[COINS] claim-first-bonus error:", e.message);
    res.status(500).json({ error: "Error al reclamar bonus" });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});

// Servir frontend
const path = require("path");
const distPath = path.join(__dirname, "../client/dist");
app.use(express.static(distPath));
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});