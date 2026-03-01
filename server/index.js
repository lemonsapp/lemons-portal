require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const db = require("./db");
const { authRequired, requireRole } = require("./auth");
const { sendEmail } = require("./mailer");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DEFAULT_RATE_PER_KG = Number(process.env.DEFAULT_RATE_PER_KG || 8);

const STATUSES = [
  "Recibido en depósito",
  "En preparación",
  "Despachado",
  "En tránsito",
  "Listo para entrega",
  "Entregado",
];

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

app.get("/", (req, res) => res.send("LEMON's API OK ✅ — probá /health"));

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// ==================== AUTH ====================

app.post("/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    remember: z.boolean().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

  const { email, password } = p.data;

  try {
    const q = await db.query(
      "SELECT id, client_number, name, email, password_hash, role FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    const user = q.rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        client_number: user.client_number,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("[LOGIN] ERROR:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      "SELECT id, client_number, name, email, role, rate_per_kg FROM users WHERE id=$1",
      [req.user.id]
    );
    res.json({ user: q.rows[0] || null });
  } catch (e) {
    console.error("[ME] ERROR:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// ==================== OPERATOR / ADMIN ====================

// Crear cliente (tarifa opcional)
app.post(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const schema = z.object({
      client_number: z.number().int().min(0),
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["client", "operator", "admin"]).optional(),
      rate_per_kg: z.number().positive().optional().nullable(),
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const d = p.data;
    const hash = await bcrypt.hash(d.password, 10);
    const role = d.role || "client";

    try {
      const ins = await db.query(
        `INSERT INTO users (client_number, name, email, password_hash, role, rate_per_kg)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, client_number, name, email, role, rate_per_kg`,
        [d.client_number, d.name, d.email.toLowerCase(), hash, role, d.rate_per_kg ?? null]
      );

      res.status(201).json({ user: ins.rows[0] });
    } catch (e) {
      console.error("[CREATE CLIENT] ERROR:", e);
      res.status(409).json({ error: "Email o número de cliente ya existe" });
    }
  }
);

// Buscar cliente (incluye tarifa)
app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const n = Number(req.query.client_number);
      if (Number.isNaN(n)) return res.status(400).json({ error: "client_number inválido" });

      const q = await db.query(
        "SELECT id, client_number, name, email, role, rate_per_kg FROM users WHERE client_number=$1",
        [n]
      );

      res.json({ user: q.rows[0] || null });
    } catch (e) {
      console.error("[GET CLIENT] ERROR:", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ✅ Actualizar tarifa por cliente
app.patch(
  "/operator/clients/:client_number/rate",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const n = Number(req.params.client_number);
      if (Number.isNaN(n)) return res.status(400).json({ error: "client_number inválido" });

      const schema = z.object({ rate_per_kg: z.number().positive().nullable() });
      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const upd = await db.query(
        `UPDATE users
         SET rate_per_kg=$1
         WHERE client_number=$2
         RETURNING id, client_number, name, email, role, rate_per_kg`,
        [p.data.rate_per_kg ?? null, n]
      );

      if (!upd.rows[0]) return res.status(404).json({ error: "Cliente no existe" });

      res.json({ user: upd.rows[0] });
    } catch (e) {
      console.error("[PATCH RATE] ERROR:", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ✅ Crear envío (calcula tarifa + total y lo guarda)
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
        box_code: z.string().optional().nullable(),
        tracking: z.string().optional().nullable(),
        weight_kg: z.number().positive(),
        status: z.enum(STATUSES).default("Recibido en depósito"),
        extra_fee_usd: z.number().min(0).optional().nullable(),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

      const d = p.data;

      const u = await db.query(
        "SELECT id, client_number, name, email, rate_per_kg FROM users WHERE client_number=$1",
        [d.client_number]
      );
      const client = u.rows[0];
      if (!client) return res.status(404).json({ error: "Cliente no existe" });

      const rate = Number(client.rate_per_kg ?? DEFAULT_RATE_PER_KG);
      const chargeable = Number(d.weight_kg);
      const subtotal = chargeable * rate;
      const extraFee = Number(d.extra_fee_usd ?? 0);
      const total = subtotal + extraFee;

      const ins = await db.query(
        `INSERT INTO shipments
          (user_id, code, description, box_code, tracking, weight_kg, status, date_in,
           rate_per_kg, chargeable_weight_kg, subtotal_usd, extra_fee_usd, total_usd, currency, payment_status)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7, NOW(),
           $8,$9,$10,$11,$12,$13,$14)
         RETURNING
          id,
          user_id,
          code AS package_code,
          description, box_code, tracking,
          weight_kg, status, date_in,
          rate_per_kg, total_usd, currency, payment_status`,
        [
          client.id,
          d.package_code,
          d.description,
          d.box_code ?? null,
          d.tracking ?? null,
          d.weight_kg,
          d.status,
          rate,
          chargeable,
          subtotal,
          extraFee,
          total,
          "USD",
          "pending",
        ]
      );

      const shipment = ins.rows[0];

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status)
         VALUES ($1,$2,$3)`,
        [shipment.id, null, shipment.status]
      );

      // mail opcional (si ya lo tenés andando)
      try {
        const subject = `LEMON's — Nuevo paquete ingresado (${shipment.status})`;
        const html = `
          <div style="font-family:Arial,sans-serif">
            <h2>Nuevo paquete ingresado</h2>
            <p><b>Cliente:</b> #${client.client_number} — ${client.name}</p>
            <p><b>Código:</b> ${shipment.package_code}</p>
            <p><b>Descripción:</b> ${shipment.description}</p>
            <p><b>Peso:</b> ${shipment.weight_kg} kg</p>
            <p><b>Tarifa:</b> USD ${shipment.rate_per_kg}/kg</p>
            <p><b>Total:</b> USD ${Number(shipment.total_usd || 0).toFixed(2)}</p>
          </div>
        `;
        await sendEmail({ to: client.email, subject, html });
      } catch (e) {
        console.log("[MAIL create shipment] error:", e?.message || e);
      }

      res.status(201).json({ shipment });
    } catch (e) {
      console.error("[CREATE SHIPMENT] ERROR:", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ✅ Lista envíos operador (incluye total)
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
        `SELECT
          sh.id,
          sh.user_id,
          sh.code AS package_code,
          sh.description,
          sh.box_code,
          sh.tracking,
          sh.weight_kg,
          sh.status,
          sh.date_in,
          COALESCE(sh.rate_per_kg, 0) AS rate_per_kg,
          COALESCE(sh.total_usd, 0) AS total_usd,
          COALESCE(sh.currency, 'USD') AS currency,
          COALESCE(sh.payment_status, 'pending') AS payment_status,
          u.client_number,
          u.name,
          u.email
         FROM shipments sh
         JOIN users u ON u.id = sh.user_id
         ${where}
         ORDER BY sh.id DESC
         LIMIT 500`,
        params
      );

      res.json({ rows: q.rows });
    } catch (e) {
      console.error("[OP SHIPMENTS] ERROR:", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// Cambiar estado
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

      const upd = await db.query(
        `UPDATE shipments
         SET status=$1, updated_at=NOW(),
             delivered_at = CASE WHEN $1='Entregado' THEN NOW() ELSE delivered_at END
         WHERE id=$2
         RETURNING
           id,
           user_id,
           code AS package_code,
           description,
           box_code,
           tracking,
           weight_kg,
           status,
           date_in,
           COALESCE(rate_per_kg,0) AS rate_per_kg,
           COALESCE(total_usd,0) AS total_usd,
           COALESCE(currency,'USD') AS currency,
           COALESCE(payment_status,'pending') AS payment_status`,
        [newStatus, shipmentId]
      );

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status)
         VALUES ($1,$2,$3)`,
        [shipmentId, oldStatus, newStatus]
      );

      res.json({ shipment: upd.rows[0] });
    } catch (e) {
      console.error("[PATCH STATUS] ERROR:", e);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

// ==================== CLIENT ====================

// ✅ Cliente ve sus envíos (incluye tarifa/total)
app.get("/client/shipments", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      `SELECT
          id,
          code AS package_code,
          description,
          box_code,
          tracking,
          weight_kg,
          status,
          date_in,
          COALESCE(rate_per_kg, 0) AS rate_per_kg,
          COALESCE(total_usd, 0) AS total_usd,
          COALESCE(currency, 'USD') AS currency,
          COALESCE(payment_status, 'pending') AS payment_status
       FROM shipments
       WHERE user_id=$1
       ORDER BY id DESC`,
      [req.user.id]
    );

    res.json({ rows: q.rows });
  } catch (e) {
    console.error("[CLIENT SHIPMENTS] ERROR:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// Historial
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
    console.error("[EVENTS] ERROR:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// Dashboard
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
          COALESCE(SUM(weight_kg),0) AS total_weight,
          COALESCE(SUM(total_usd),0) AS total_billed
        FROM shipments
      `);

      res.json({ stats: stats.rows[0] });
    } catch (e) {
      console.error("[DASHBOARD] ERROR:", e);
      res.status(500).json({ error: "Error dashboard" });
    }
  }
);

app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));