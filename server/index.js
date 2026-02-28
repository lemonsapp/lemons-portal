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

const STATUSES = [
  "Recibido en depósito",
  "En preparación",
  "Despachado",
  "En tránsito",
  "Listo para entrega",
  "Entregado",
];

// --------- helpers ----------
function signToken(user) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    secret,
    { expiresIn: "30d" }
  );
}

function safeJson(res, data) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// --------- health ----------
app.get("/", (req, res) => {
  res.send("LEMON's API OK ✅ — probá /health");
});

app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1 as ok");
    safeJson(res, { ok: true });
  } catch (e) {
    safeJson(res, { ok: false, error: String(e?.message || e) });
  }
});

// --------- auth ----------
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
      [email]
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
      "SELECT id, client_number, name, email, role FROM users WHERE id=$1",
      [req.user.id]
    );
    return res.json({ user: q.rows[0] || null });
  } catch (e) {
    console.error("[ME] ERROR:", e);
    return res.status(500).json({ error: "Error interno" });
  }
});

// --------- operator/admin: crear cliente ----------
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
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const { client_number, name, email, password, role = "client" } = p.data;
    const hash = bcrypt.hashSync(password, 10);

    try {
      const ins = await db.query(
        `INSERT INTO users (client_number, name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, client_number, name, email, role`,
        [client_number, name, email, hash, role]
      );
      res.status(201).json({ user: ins.rows[0] });
    } catch (e) {
      return res.status(409).json({ error: "Email o número de cliente ya existe" });
    }
  }
);

// --------- operator/admin: buscar cliente ----------
app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const clientNumber = Number(req.query.client_number);
    if (Number.isNaN(clientNumber))
      return res.status(400).json({ error: "client_number inválido" });

    const q = await db.query(
      "SELECT id, client_number, name, email, role FROM users WHERE client_number=$1",
      [clientNumber]
    );
    res.json({ user: q.rows[0] || null });
  }
);

// --------- operator/admin: crear envío ----------
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
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const d = p.data;

    // dueño
app.post(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const d = req.body;

    // ✅ ESTA LÍNEA VA DENTRO DEL async
    const u = await db.query(
      "SELECT id, client_number, name, email FROM users WHERE client_number=$1",
      [d.client_number]
    );

    const client = u.rows[0];
    if (!client) {
      return res.status(404).json({ error: "Cliente no existe" });
    }

    // resto del código...
  }
);
    const client = u.rows[0];
    if (!client) return res.status(404).json({ error: "Cliente no existe" });

    // insert shipment
    const ins = await db.query(
      `INSERT INTO shipments (user_id, package_code, description, box_code, tracking, weight_kg, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [client.id, d.package_code, d.description, d.box_code, d.tracking, d.weight_kg, d.status]
    );

    const shipment = ins.rows[0];

    // insert first event
    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipment.id, null, shipment.status, d.note || null, req.user.id]
    );

    // mail
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
        </div>
      `;
      await sendEmail({ to, subject, html });
      console.log("[MAIL] Nuevo envío enviado a:", to);
    } catch (e) {
      console.log("[MAIL] ERROR (nuevo envío):", e?.message || e);
    }

    return res.status(201).json({ shipment });
  }
);

// --------- operator/admin: cambiar estado ----------
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

    // traer actual + dueño
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
       RETURNING *`,
      [newStatus, shipmentId]
    );

    const updated = upd.rows[0];

    // evento
    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipmentId, oldStatus, newStatus, p.data.note || null, req.user.id]
    );

    // mail
    try {
      const to = current.email;
      const subject = `LEMON's — Actualización de estado (${newStatus})`;
      const html = `
        <div style="font-family:Arial,sans-serif">
          <h2>Actualización de estado</h2>
          <p><b>Cliente:</b> #${current.client_number} — ${current.name}</p>
          <p><b>Código:</b> ${current.package_code}</p>
          <p><b>Estado anterior:</b> ${oldStatus}</p>
          <p><b>Estado nuevo:</b> ${newStatus}</p>
          ${p.data.note ? `<p><b>Nota:</b> ${p.data.note}</p>` : ""}
        </div>
      `;
      await sendEmail({ to, subject, html });
      console.log("[MAIL] Status update enviado a:", to);
    } catch (e) {
      console.log("[MAIL] ERROR (status update):", e?.message || e);
    }

    return res.json({ shipment: updated });
  }
);

// --------- cliente: ver sus envíos ----------
app.get("/client/shipments", authRequired, async (req, res) => {
  try {
    const q = await db.query(
      `SELECT * FROM shipments
       WHERE user_id=$1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ rows: q.rows });
  } catch (e) {
    console.error("[CLIENT SHIPMENTS] ERROR:", e);
    res.status(500).json({ error: "Error interno" });
  }
});

// --------- historial de eventos (cliente dueño o staff) ----------
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

// --------- start ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API corriendo en http://localhost:${PORT}`));