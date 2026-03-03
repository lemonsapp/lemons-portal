require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const db = require("./db");
const { authRequired, requireRole } = require("./auth");
const { sendEmail } = require("./mailer"); // ✅ mails

const app = express();
app.use(express.json());

// CORS abierto mientras probás
app.use(
  cors({
    origin: true,
  })
);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

app.get("/", (req, res) => res.send("LEMON's API OK ✅ — probá /health"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ==================== TARIFAS (defaults + helpers) ====================

const DEFAULT_RATES = {
  usa_normal: 45,
  usa_express: 55,
  china_normal: 58,
  china_express: 68,
  europa_normal: 58, // EUROPA siempre NORMAL
};

function normalizeOrigin(origin) {
  const o = (origin || "").toUpperCase().trim();
  if (o === "USA" || o === "CHINA" || o === "EUROPA") return o;
  return null;
}

function normalizeService(service) {
  const s = (service || "").toUpperCase().trim();
  if (s === "NORMAL" || s === "EXPRESS") return s;
  return null;
}

function rateKeyFor(origin, service) {
  if (origin === "EUROPA") return "europa_normal";
  if (origin === "USA" && service === "NORMAL") return "usa_normal";
  if (origin === "USA" && service === "EXPRESS") return "usa_express";
  if (origin === "CHINA" && service === "NORMAL") return "china_normal";
  if (origin === "CHINA" && service === "EXPRESS") return "china_express";
  return null;
}

async function getClientRatesByUserId(userId) {
  const r = await db.query(
    `SELECT user_id, usa_normal, usa_express, china_normal, china_express, europa_normal, updated_at
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

function computeEstimated(weightKg, rateUsdPerKg) {
  const w = Number(weightKg);
  const r = Number(rateUsdPerKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r < 0) return null;
  return Number((w * r).toFixed(2));
}

/**
 * Regla server-side (fuente de verdad):
 * - Si rateOverride != null => override manual; estimated = weight * rateOverride
 * - Si rateOverride == null => rate = tarifa cliente/default; estimated = weight * rate
 */
async function computeRateAndEstimatedServer({
  userId,
  originRaw,
  serviceRaw,
  weight_kg,
  rateOverride,
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

  const override = toNumOrNull(rateOverride);
  if (override !== null) {
    return {
      origin,
      service,
      rate_usd_per_kg: override,
      estimated_usd: computeEstimated(weight_kg, override),
    };
  }

  let ratesRow = null;
  try {
    ratesRow = await getClientRatesByUserId(userId);
  } catch (e) {
    // si falla leer tabla, igual seguimos con defaults
    console.error("READ CLIENT RATES ERROR", e);
    ratesRow = null;
  }

  const resolved = resolveRateUsdPerKg({
    origin,
    service,
    clientRatesRow: ratesRow,
  });

  return {
    origin,
    service,
    rate_usd_per_kg: resolved,
    estimated_usd: computeEstimated(weight_kg, resolved),
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

  // Responsive + “card” + estética premium
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
          
          <!-- Header -->
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

          <!-- Card -->
          <tr>
            <td style="background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); border-radius:16px; overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                
                <!-- Top strip -->
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

                <!-- Details grid -->
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
                              ${safeStr(tracking) || "-"}
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

          <!-- Footer -->
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

app.post("/auth/login", async (req, res) => {
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

    // mantenemos tu expiración 7d
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

// ✅ devuelve también rates + defaults
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
          error:
            "No se pudieron leer tarifas. Verificá que exista la tabla client_rates (migración pendiente).",
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

// ✅ guardar tarifas por cliente (UPSERT)
app.put(
  "/operator/clients/:id/rates",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (Number.isNaN(userId)) return res.status(400).json({ error: "ID inválido" });

      const schema = z.object({
        usa_normal: z.number().min(0).nullable().optional(),
        usa_express: z.number().min(0).nullable().optional(),
        china_normal: z.number().min(0).nullable().optional(),
        china_express: z.number().min(0).nullable().optional(),
        europa_normal: z.number().min(0).nullable().optional(),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const u = await db.query("SELECT id, role FROM users WHERE id=$1", [userId]);
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no existe" });

      let up;
      try {
        up = await db.query(
          `INSERT INTO client_rates (user_id, usa_normal, usa_express, china_normal, china_express, europa_normal, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET
             usa_normal = EXCLUDED.usa_normal,
             usa_express = EXCLUDED.usa_express,
             china_normal = EXCLUDED.china_normal,
             china_express = EXCLUDED.china_express,
             europa_normal = EXCLUDED.europa_normal,
             updated_at = NOW()
           RETURNING user_id, usa_normal, usa_express, china_normal, china_express, europa_normal, updated_at`,
          [
            userId,
            p.data.usa_normal ?? null,
            p.data.usa_express ?? null,
            p.data.china_normal ?? null,
            p.data.china_express ?? null,
            p.data.europa_normal ?? null,
          ]
        );
      } catch (e) {
        console.error("UPSERT CLIENT RATES ERROR", e);
        return res.status(500).json({
          error:
            "No se pudieron guardar tarifas. Verificá que exista la tabla client_rates (migración pendiente).",
        });
      }

      res.json({
        rates: {
          usa_normal: up.rows[0].usa_normal,
          usa_express: up.rows[0].usa_express,
          china_normal: up.rows[0].china_normal,
          china_express: up.rows[0].china_express,
          europa_normal: up.rows[0].europa_normal,
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

/**
 * CREATE SHIPMENT
 * Paso 4: server calcula SIEMPRE estimated, y calcula rate si no viene override.
 */
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
        service: z.enum(["NORMAL", "EXPRESS"]).optional(),

        // override opcional
        rate_usd_per_kg: z.number().min(0).nullable().optional(),
        estimated_usd: z.number().min(0).nullable().optional(), // (ignorado: server recalcula)
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const d = p.data;

      const u = await db.query("SELECT id FROM users WHERE client_number=$1", [d.client_number]);
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no existe" });

      const calc = await computeRateAndEstimatedServer({
        userId: user.id,
        originRaw: d.origin ?? null,
        serviceRaw: d.service ?? null,
        weight_kg: d.weight_kg,
        rateOverride: d.rate_usd_per_kg ?? null,
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
        `INSERT INTO shipment_events (shipment_id, old_status, new_status)
         VALUES ($1,$2,$3)`,
        [ins.rows[0].id, null, d.status]
      );

      res.json({ shipment: ins.rows[0] });
    } catch (e) {
      console.error("CREATE SHIPMENT ERROR", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.get(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const search = (req.query.search || "").trim();
      const clientNumber = (req.query.client_number || "").trim();

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
        where += ` AND (sh.code ILIKE $${p1} OR sh.description ILIKE $${p2})`;
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

/**
 * PATCH SHIPMENT
 * Paso 4: server asegura consistencia (rate/estimated)
 */
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

        // override opcional (si viene null/undefined => AUTO)
        rate_usd_per_kg: z.number().nullable().optional(),
        estimated_usd: z.number().nullable().optional(), // ignorado: server recalcula
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      // necesitamos user_id actual para sacar tarifas del cliente
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
         SET code=$1,
             description=$2,
             box_code=$3,
             tracking=$4,
             weight_kg=$5,
             origin=$6,
             service=$7,
             rate_usd_per_kg=$8,
             estimated_usd=$9,
             updated_at=NOW()
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

      // ✅ si no cambió el estado, no hacemos nada (ni mail, ni evento)
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
        `INSERT INTO shipment_events (shipment_id, old_status, new_status)
         VALUES ($1,$2,$3)`,
        [shipmentId, oldStatus, newStatus]
      );

      // ==================== ✅ MAIL PRO (NO ROMPE FLUJO) ====================
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

        await sendEmail({
          to: current.email,
          subject: `Actualización de envío #${code}`,
          html,
        });
      } catch (e) {
        console.log("[MAIL] Falló envío (no rompemos flujo):", e?.message || e);
      }
      // ====================================================================

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

app.get(
  "/operator/dashboard",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status='Recibido en depósito') AS received,
          COUNT(*) FILTER (WHERE status='En preparación') AS prep,
          COUNT(*) FILTER (WHERE status='Despachado') AS sent,
          COUNT(*) FILTER (WHERE status='En tránsito') AS transit,
          COUNT(*) FILTER (WHERE status='Listo para entrega') AS ready,
          COUNT(*) FILTER (WHERE status='Entregado') AS delivered,
          COALESCE(SUM(weight_kg),0) AS total_weight
        FROM shipments
      `);

      res.json({ stats: stats.rows[0] });
    } catch (err) {
      console.error("DASHBOARD ERROR:", err);
      res.status(500).json({ error: "Error dashboard" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});