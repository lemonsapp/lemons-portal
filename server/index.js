// server/index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const db = require("./db");
const { authRequired, requireRole } = require("./auth");

const app = express();

app.use(express.json());

// CORS abierto mientras se prueba
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// -----------------------------
// Helpers: tarifas
// -----------------------------
const DEFAULT_RATES = {
  usa_normal: 45,
  usa_express: 55,
  china_normal: 58,
  china_express: 68,
  europa_normal: 58,
};

function normalizeOrigin(origin) {
  const o = (origin || "").toUpperCase();
  if (o === "USA" || o === "CHINA" || o === "EUROPA") return o;
  return null;
}

function normalizeService(service) {
  const s = (service || "").toUpperCase();
  if (s === "NORMAL" || s === "EXPRESS") return s;
  return null;
}

function rateKeyFor(origin, service) {
  // EUROPA siempre NORMAL
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
     WHERE user_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

function resolveRateUsdPerKg({ origin, service, clientRatesRow }) {
  const key = rateKeyFor(origin, service);
  if (!key) return null;

  const fromDb = clientRatesRow?.[key];
  if (fromDb !== null && fromDb !== undefined) return Number(fromDb);

  return DEFAULT_RATES[key];
}

// -----------------------------
// AUTH
// -----------------------------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password, remember } = loginSchema.parse(req.body);

    const u = await db.query(
      `SELECT id, email, name, role, client_number, password_hash
       FROM users
       WHERE email = $1`,
      [email]
    );

    const user = u.rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const expiresIn = remember ? "30d" : "7d";
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn,
    });

    return res.json({
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
    return res.status(400).json({ error: e.message });
  }
});

app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const u = await db.query(
      `SELECT id, email, name, role, client_number
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );
    const user = u.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

// -----------------------------
// OPERATOR/ADMIN
// -----------------------------
const createClientSchema = z.object({
  client_number: z.number().int(),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(4),
  role: z.enum(["client", "operator", "admin"]).optional(),
});

app.post(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const body = createClientSchema.parse(req.body);
      const role = body.role || "client";

      const password_hash = await bcrypt.hash(body.password, 10);

      const ins = await db.query(
        `INSERT INTO users (client_number, name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, client_number, name, email, role`,
        [body.client_number, body.name, body.email, password_hash, role]
      );

      return res.json({ user: ins.rows[0] });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
);

// ✅ MOD: cuando buscás por client_number, devolvemos también rates (si existe)
app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const client_number = req.query.client_number
        ? Number(req.query.client_number)
        : null;

      if (!client_number || Number.isNaN(client_number)) {
        return res.status(400).json({ error: "client_number requerido" });
      }

      const u = await db.query(
        `SELECT id, client_number, name, email, role
         FROM users
         WHERE client_number = $1`,
        [client_number]
      );

      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no encontrado" });

      const rates = await getClientRatesByUserId(user.id);

      return res.json({
        user,
        rates: rates
          ? {
              usa_normal: rates.usa_normal,
              usa_express: rates.usa_express,
              china_normal: rates.china_normal,
              china_express: rates.china_express,
              europa_normal: rates.europa_normal,
              updated_at: rates.updated_at,
            }
          : null,
        defaults: DEFAULT_RATES,
      });
    } catch (e) {
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// ✅ NUEVO: upsert de tarifas por cliente
const ratesSchema = z.object({
  usa_normal: z.number().nonnegative().optional().nullable(),
  usa_express: z.number().nonnegative().optional().nullable(),
  china_normal: z.number().nonnegative().optional().nullable(),
  china_express: z.number().nonnegative().optional().nullable(),
  europa_normal: z.number().nonnegative().optional().nullable(),
});

app.put(
  "/operator/clients/:id/rates",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ error: "ID inválido" });
      }

      const body = ratesSchema.parse(req.body);

      // Upsert
      const up = await db.query(
        `INSERT INTO client_rates (user_id, usa_normal, usa_express, china_normal, china_express, europa_normal, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           usa_normal   = EXCLUDED.usa_normal,
           usa_express  = EXCLUDED.usa_express,
           china_normal = EXCLUDED.china_normal,
           china_express= EXCLUDED.china_express,
           europa_normal= EXCLUDED.europa_normal,
           updated_at   = NOW()
         RETURNING user_id, usa_normal, usa_express, china_normal, china_express, europa_normal, updated_at`,
        [
          userId,
          body.usa_normal ?? null,
          body.usa_express ?? null,
          body.china_normal ?? null,
          body.china_express ?? null,
          body.europa_normal ?? null,
        ]
      );

      return res.json({
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
      return res.status(400).json({ error: e.message });
    }
  }
);

// -----------------------------
// Shipments (operator)
// -----------------------------
const createShipmentSchema = z.object({
  client_number: z.number().int(),
  package_code: z.string().min(1),
  description: z.string().min(1),
  box_code: z.string().optional().nullable(),
  tracking: z.string().optional().nullable(),
  weight_kg: z.number().positive(),
  status: z.string().min(1),

  origin: z.enum(["USA", "CHINA", "EUROPA"]).optional().nullable(),
  service: z.enum(["NORMAL", "EXPRESS"]).optional().nullable(),
  rate_usd_per_kg: z.number().nonnegative().optional().nullable(), // override opcional
  estimated_usd: z.number().nonnegative().optional().nullable(), // override opcional
});

app.post(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const body = createShipmentSchema.parse(req.body);

      const u = await db.query(
        `SELECT id, client_number, name, email, role
         FROM users
         WHERE client_number = $1`,
        [body.client_number]
      );
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no encontrado" });

      const origin = normalizeOrigin(body.origin);
      let service = normalizeService(body.service);

      if (origin === "EUROPA") service = "NORMAL";

      // ✅ Resolver tarifas desde DB (fallback defaults)
      const clientRates = await getClientRatesByUserId(user.id);
      const resolvedRate =
        body.rate_usd_per_kg !== null && body.rate_usd_per_kg !== undefined
          ? Number(body.rate_usd_per_kg)
          : resolveRateUsdPerKg({ origin, service, clientRatesRow: clientRates });

      const resolvedEstimated =
        body.estimated_usd !== null && body.estimated_usd !== undefined
          ? Number(body.estimated_usd)
          : resolvedRate !== null
          ? Number(body.weight_kg) * Number(resolvedRate)
          : null;

      const ins = await db.query(
        `INSERT INTO shipments
         (user_id, code, description, box_code, tracking, weight_kg, status, date_in, updated_at, origin, service, rate_usd_per_kg, estimated_usd)
         VALUES
         ($1,     $2,   $3,          $4,       $5,      $6,       $7,     NOW(),  NOW(),       $8,     $9,      $10,            $11)
         RETURNING *`,
        [
          user.id,
          body.package_code, // ⚠️ map package_code -> code
          body.description,
          body.box_code ?? null,
          body.tracking ?? null,
          body.weight_kg,
          body.status,
          origin,
          service,
          resolvedRate,
          resolvedEstimated,
        ]
      );

      const shipment = ins.rows[0];

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status, created_at)
         VALUES ($1, NULL, $2, NOW())`,
        [shipment.id, shipment.status]
      );

      return res.json({ shipment });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
);

app.get(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const search = (req.query.search || "").toString().trim();
      const client_number = req.query.client_number
        ? Number(req.query.client_number)
        : null;

      const params = [];
      const where = [];

      if (client_number && !Number.isNaN(client_number)) {
        params.push(client_number);
        where.push(`u.client_number = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        where.push(`(s.code ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
      }

      const sql = `
        SELECT
          s.*,
          u.client_number,
          u.name as client_name,
          u.email as client_email
        FROM shipments s
        JOIN users u ON u.id = s.user_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY s.date_in DESC
        LIMIT 500
      `;

      const r = await db.query(sql, params);
      return res.json({ shipments: r.rows });
    } catch (e) {
      return res.status(500).json({ error: "Server error" });
    }
  }
);

const patchShipmentSchema = z.object({
  code: z.string().optional(),
  description: z.string().optional(),
  box_code: z.string().optional().nullable(),
  tracking: z.string().optional().nullable(),
  weight_kg: z.number().positive().optional(),

  origin: z.enum(["USA", "CHINA", "EUROPA"]).optional().nullable(),
  service: z.enum(["NORMAL", "EXPRESS"]).optional().nullable(),
  rate_usd_per_kg: z.number().nonnegative().optional().nullable(),
  estimated_usd: z.number().nonnegative().optional().nullable(),
});

app.patch(
  "/operator/shipments/:id",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      const body = patchShipmentSchema.parse(req.body);

      // Update dinámico
      const fields = [];
      const params = [];
      const add = (name, val) => {
        params.push(val);
        fields.push(`${name} = $${params.length}`);
      };

      if (body.code !== undefined) add("code", body.code);
      if (body.description !== undefined) add("description", body.description);
      if (body.box_code !== undefined) add("box_code", body.box_code);
      if (body.tracking !== undefined) add("tracking", body.tracking);
      if (body.weight_kg !== undefined) add("weight_kg", body.weight_kg);

      if (body.origin !== undefined) add("origin", body.origin);
      if (body.service !== undefined) add("service", body.service);
      if (body.rate_usd_per_kg !== undefined) add("rate_usd_per_kg", body.rate_usd_per_kg);
      if (body.estimated_usd !== undefined) add("estimated_usd", body.estimated_usd);

      add("updated_at", new Date().toISOString());

      if (!fields.length) return res.status(400).json({ error: "Nada para actualizar" });

      params.push(id);

      const upd = await db.query(
        `UPDATE shipments SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
        params
      );

      return res.json({ shipment: upd.rows[0] });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
);

const patchStatusSchema = z.object({
  status: z.string().min(1),
});

app.patch(
  "/operator/shipments/:id/status",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

      const { status } = patchStatusSchema.parse(req.body);

      const current = await db.query(`SELECT id, status FROM shipments WHERE id = $1`, [id]);
      const s = current.rows[0];
      if (!s) return res.status(404).json({ error: "Shipment no encontrado" });

      const deliveredAt = status === "Entregado" ? new Date().toISOString() : null;

      const upd = await db.query(
        `UPDATE shipments
         SET status = $1,
             updated_at = NOW(),
             delivered_at = COALESCE($2, delivered_at)
         WHERE id = $3
         RETURNING *`,
        [status, deliveredAt, id]
      );

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [id, s.status, status]
      );

      return res.json({ shipment: upd.rows[0] });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
);

app.get(
  "/operator/dashboard",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const r = await db.query(`
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN status = 'Recibido' THEN 1 ELSE 0 END)::int AS received,
          SUM(CASE WHEN status = 'En preparación' THEN 1 ELSE 0 END)::int AS prep,
          SUM(CASE WHEN status = 'Enviado' THEN 1 ELSE 0 END)::int AS sent,
          SUM(CASE WHEN status = 'En tránsito' THEN 1 ELSE 0 END)::int AS transit,
          SUM(CASE WHEN status = 'Listo para retirar' THEN 1 ELSE 0 END)::int AS ready,
          SUM(CASE WHEN status = 'Entregado' THEN 1 ELSE 0 END)::int AS delivered,
          COALESCE(SUM(weight_kg), 0)::numeric AS total_weight
        FROM shipments
      `);

      return res.json({ stats: r.rows[0] });
    } catch (e) {
      return res.status(500).json({ error: "Server error" });
    }
  }
);

// -----------------------------
// CLIENT
// -----------------------------
app.get("/client/shipments", authRequired, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT
         id, code, description, box_code, tracking, weight_kg, status,
         date_in, origin, service, rate_usd_per_kg, estimated_usd
       FROM shipments
       WHERE user_id = $1
       ORDER BY date_in DESC`,
      [req.user.id]
    );
    return res.json({ shipments: r.rows });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/shipments/:id/events", authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const ship = await db.query(`SELECT id, user_id FROM shipments WHERE id = $1`, [id]);
    const s = ship.rows[0];
    if (!s) return res.status(404).json({ error: "Shipment no encontrado" });

    const isOwner = s.user_id === req.user.id;
    const isStaff = req.user.role === "operator" || req.user.role === "admin";
    if (!isOwner && !isStaff) return res.status(403).json({ error: "Forbidden" });

    const ev = await db.query(
      `SELECT id, shipment_id, old_status, new_status, created_at
       FROM shipment_events
       WHERE shipment_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return res.json({ events: ev.rows });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

// Health
app.get("/", (req, res) => res.send("LEMON’S PORTAL API OK"));

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});