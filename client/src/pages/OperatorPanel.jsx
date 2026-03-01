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

// CORS (para Vercel + pruebas locales)
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

// -------- helpers ----------
function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function n2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

app.get("/", (req, res) => res.send("LEMON's API OK ✅ — probá /health"));

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as ok");
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

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = signToken(user);

    return res.json({
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
    return res.status(500).json({ error: "Error interno" });
  }
});

app.get("/auth/me", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      "SELECT id, client_number, name, email, role, rate_per_kg FROM users WHERE id=$1",
      [req.user.id]
    );
    return res.json({ user: q.rows[0] || null });
  } catch (e) {
    console.error("[ME] ERROR:", e);
    return res.status(500).json({ error: "Error interno" });
  }
});

// ==================== OPERATOR / ADMIN ====================

// Crear cliente (con tarifa opcional)
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

    const {
      client_number,
      name,
      email,
      password,
      role = "client",
      rate_per_kg,
    } = p.data;

    const hash = bcrypt.hashSync(password, 10);

    try {
      const ins = await db.query(
        `INSERT INTO users (client_number, name, email, password_hash, role, rate_per_kg)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, client_number, name, email, role, rate_per_kg`,
        [client_number, name, email.toLowerCase(), hash, role, rate_per_kg ?? null]
      );
      res.status(201).json({ user: ins.rows[0] });
    } catch (e) {
      return res.status(409).json({ error: "Email o número de cliente ya existe" });
    }
  }
);

// Buscar cliente (incluye tarifa)
app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const clientNumber = Number(req.query.client_number);
    if (Number.isNaN(clientNumber))
      return res.status(400).json({ error: "client_number inválido" });

    const q = await db.query(
      "SELECT id, client_number, name, email, role, rate_per_kg FROM users WHERE client_number=$1",
      [clientNumber]
    );
    res.json({ user: q.rows[0] || null });
  }
);

// ✅ Setear/actualizar tarifa por cliente
app.patch(
  "/operator/clients/:client_number/rate",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const clientNumber = Number(req.params.client_number);
    if (Number.isNaN(clientNumber))
      return res.status(400).json({ error: "client_number inválido" });

    const schema = z.object({
      rate_per_kg: z.number().positive().nullable(),
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const upd = await db.query(
      `UPDATE users
       SET rate_per_kg=$1
       WHERE client_number=$2
       RETURNING id, client_number, name, email, role, rate_per_kg`,
      [p.data.rate_per_kg ?? null, clientNumber]
    );

    if (!upd.rows[0]) return res.status(404).json({ error: "Cliente no existe" });
    res.json({ user: upd.rows[0] });
  }
);

// Crear envío (calcula totales con tarifa del cliente)
app.post(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const schema = z.object({
      client_number: z.number().int().min(0),
      package_code: z.string().min(1),
      description: z.string().min(1),
      box_code: z.string().optional().nullable(),
      tracking: z.string().optional().nullable(),
      weight_kg: z.number().positive(),
      status: z.enum(STATUSES).default("Recibido en depósito"),
      note: z.string().optional().nullable(),
      extra_fee_usd: z.number().min(0).optional().nullable(), // opcional
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const d = p.data;

    // dueño + tarifa
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

    // Insert (guardamos valores calculados)
    const ins = await db.query(
      `INSERT INTO shipments
        (user_id, code, description, box_code, tracking, weight_kg, status, date_in,
         rate_per_kg, chargeable_weight_kg, subtotal_usd, extra_fee_usd, total_usd, currency, payment_status)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7, NOW(),
         $8,$9,$10,$11,$12,$13,$14)
       RETURNING
        id, user_id,
        code AS package_code,
        description, box_code, tracking,
        weight_kg, status, date_in,
        rate_per_kg, chargeable_weight_kg, subtotal_usd, extra_fee_usd, total_usd, currency, payment_status`,
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

    // evento inicial
    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipment.id, null, shipment.status, d.note || null, req.user.id]
    );

    // mail (nuevo envío)
    try {
      const to = client.email;
      const subject = `LEMON's — Nuevo paquete ingresado (${shipment.status})`;
      const html = `
        <div style="font-family:Arial,sans-serif">
          <h2>Nuevo paquete ingresado</h2>
          <p><b>Cliente:</b> #${client.client_number} — ${client.name}</p>
          <p><b>Código:</b> ${shipment.package_code}</p>
          <p><b>Descripción:</b> ${shipment.description}</p>
          <p><b>Tracking:</b> ${shipment.tracking || "-"}</p>
          <p><b>Peso:</b> ${shipment.weight_kg} kg</p>
          <p><b>Estado:</b> ${shipment.status}</p>
          <hr/>
          <p><b>Tarifa:</b> USD ${rate}/kg</p>
          <p><b>Total:</b> USD ${Number(shipment.total_usd || 0).toFixed(2)}</p>
        </div>
      `;
      await sendEmail({ to, subject, html });
    } catch (e) {
      console.log("[MAIL] ERROR (nuevo envío):", e?.message || e);
    }

    return res.status(201).json({ shipment });
  }
);

// Listado operador (alias code->package_code)
app.get(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();
      const clientNumber = String(req.query.client_number || "").trim();

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
          sh.id, sh.user_id,
          sh.code AS package_code,
          sh.description, sh.box_code, sh.tracking,
          sh.weight_kg, sh.status, sh.date_in,
          sh.rate_per_kg, sh.total_usd, sh.payment_status,
          u.client_number, u.name, u.email
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
    const schema = z.object({
      status: z.string().min(1),
      note: z.string().optional().nullable(),
    });
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
         id, user_id,
         code AS package_code,
         description, box_code, tracking,
         weight_kg, status, date_in,
         rate_per_kg, total_usd, payment_status`,
      [newStatus, shipmentId]
    );

    const updated = upd.rows[0];

    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipmentId, oldStatus, newStatus, p.data.note || null, req.user.id]
    );

    // mail status update
    try {
      const to = current.email;
      const subject = `LEMON's — Actualización de estado (${newStatus})`;
      const html = `
        <div style="font-family:Arial,sans-serif">
          <h2>Actualización de estado</h2>
          <p><b>Cliente:</b> #${current.client_number} — ${current.name}</p>
          <p><b>Código:</b> ${current.code}</p>
          <p><b>Estado anterior:</b> ${oldStatus}</p>
          <p><b>Estado nuevo:</b> ${newStatus}</p>
          ${p.data.note ? `<p><b>Nota:</b> ${p.data.note}</p>` : ""}
        </div>
      `;
      await sendEmail({ to, subject, html });
    } catch (e) {
      console.log("[MAIL] ERROR (status update):", e?.message || e);
    }

    return res.json({ shipment: updated });
  }
);

// ==================== CLIENT ====================

// Cliente: ver sus envíos (incluye totales)
app.get("/client/shipments", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      `SELECT
        id,
        code AS package_code,
        description, box_code, tracking,
        weight_kg, status, date_in,
        rate_per_kg, total_usd, currency, payment_status
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

// Historial de eventos (cliente dueño o staff)
app.get("/shipments/:id/events", authRequired, async (req, res) => {
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
    `SELECT id, shipment_id, old_status, new_status, note, created_by, created_at
     FROM shipment_events
     WHERE shipment_id=$1
     ORDER BY created_at DESC`,
    [shipmentId]
  );

  res.json({ rows: ev.rows });
});

// Dashboard (sumas básicas)
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
    } catch (err) {
      console.error("DASHBOARD ERROR:", err);
      res.status(500).json({ error: "Error dashboard" });
    }
  }
);

app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));