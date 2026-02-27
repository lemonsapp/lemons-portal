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
app.use(cors({ origin: true }));
app.use(express.json());

const STATUSES = [
  "Recibido en depósito",
  "En preparación",
  "Despachado",
  "En tránsito",
  "Listo para entrega",
  "Entregado",
];

// Utils
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      client_number: user.client_number,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function toDateOnly(iso) {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

// -------------------- AUTH --------------------

// Login
app.post("/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    remember: z.boolean().optional(),
  });

  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

  const { email, password } = p.data;

  const u = await db.query(
    "SELECT id, client_number, name, email, password_hash, role FROM users WHERE email=$1",
    [email]
  );
  const user = u.rows[0];
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
});

// Me
app.get("/auth/me", authRequired, async (req, res) => {
  const u = await db.query(
    "SELECT id, client_number, name, email, role FROM users WHERE id=$1",
    [req.user.id]
  );
  res.json({ user: u.rows[0] });
});

// -------------------- OPERATOR: CLIENTS --------------------

// Crear cliente
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

    const { client_number, name, email, password } = p.data;
    const role = p.data.role || "client";

    const exists = await db.query(
      "SELECT id FROM users WHERE client_number=$1 OR email=$2",
      [client_number, email]
    );
    if (exists.rows.length)
      return res.status(409).json({ error: "Cliente/email ya existe" });

    const password_hash = await bcrypt.hash(password, 10);

    const ins = await db.query(
      `INSERT INTO users (client_number, name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, client_number, name, email, role`,
      [client_number, name, email, password_hash, role]
    );

    res.json({ user: ins.rows[0] });
  }
);

// Buscar cliente por client_number
app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const n = Number(req.query.client_number);
    if (Number.isNaN(n))
      return res.status(400).json({ error: "client_number inválido" });

    const u = await db.query(
      "SELECT id, client_number, name, email, role FROM users WHERE client_number=$1",
      [n]
    );

    res.json({ user: u.rows[0] || null });
  }
);

// -------------------- SHIPMENTS --------------------

// OPERATOR: crear envío
app.post(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const schema = z.object({
      client_number: z.number().int().min(0),
      package_code: z.string().min(1),
      description: z.string().min(1),
      box_code: z.string().nullable().optional(),
      tracking: z.string().nullable().optional(),
      weight_kg: z.number().min(0),
      status: z.string().min(1),
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const {
      client_number,
      package_code,
      description,
      box_code,
      tracking,
      weight_kg,
      status,
    } = p.data;

    const u = await db.query(
      "SELECT id, client_number, name, email FROM users WHERE client_number=$1",
      [client_number]
    );
    const owner = u.rows[0];
    if (!owner) return res.status(404).json({ error: "Cliente no existe" });

    if (!STATUSES.includes(status))
      return res.status(400).json({ error: "Estado inválido" });

    const ins = await db.query(
      `INSERT INTO shipments (user_id, package_code, description, box_code, tracking, weight_kg, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        owner.id,
        package_code,
        description,
        box_code || null,
        tracking || null,
        weight_kg,
        status,
      ]
    );

    const shipment = ins.rows[0];

    // Crear evento inicial
    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipment.id, null, shipment.status, "Creado", req.user.id]
    );

    // Mail: nuevo paquete ingresado
    try {
      await sendEmail({
        to: owner.email,
        subject: `LEMON’s — Nuevo paquete ingresado (NORMAL MAIL)`,
        html: `
          <div style="font-family: Arial, sans-serif">
            <h2>Nuevo paquete ingresado</h2>
            <p><b>Cliente #${owner.client_number}</b> — ${owner.name}</p>
            <p><b>Código:</b> ${shipment.package_code}</p>
            <p><b>Descripción:</b> ${shipment.description}</p>
            <p><b>Estado:</b> ${shipment.status}</p>
            <p><b>Peso:</b> ${Number(shipment.weight_kg).toFixed(2)} kg</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("[MAIL] no se pudo enviar:", e?.message || e);
    }

    res.json({ shipment });
  }
);

// OPERATOR: listar envíos (con filtros)
app.get(
  "/operator/shipments",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const search = String(req.query.search || "").trim();
    const cn = String(req.query.client_number || "").trim();

    const where = [];
    const vals = [];
    let i = 1;

    if (cn !== "") {
      const n = Number(cn);
      if (!Number.isNaN(n)) {
        where.push(`u.client_number=$${i++}`);
        vals.push(n);
      }
    }

    if (search) {
      where.push(
        `(sh.package_code ILIKE $${i} OR sh.tracking ILIKE $${i} OR sh.description ILIKE $${i} OR sh.box_code ILIKE $${i})`
      );
      vals.push(`%${search}%`);
      i++;
    }

    const sql = `
      SELECT
        sh.*,
        u.client_number,
        u.email,
        u.name
      FROM shipments sh
      JOIN users u ON u.id = sh.user_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY sh.created_at DESC
      LIMIT 200
    `;

    const q = await db.query(sql, vals);

    // Normalizar date_in para UI (YYYY-MM-DD)
    const rows = q.rows.map((r) => ({
      ...r,
      date_in: toDateOnly(r.created_at),
    }));

    res.json({ rows });
  }
);

// CLIENT: listar envíos propios
app.get("/client/shipments", authRequired, async (req, res) => {
  const q = await db.query(
    `SELECT
      sh.*,
      to_char(sh.created_at, 'YYYY-MM-DD') AS date_in
     FROM shipments sh
     WHERE sh.user_id=$1
     ORDER BY sh.created_at DESC`,
    [req.user.id]
  );
  res.json({ rows: q.rows });
});

// OPERATOR: editar envío (campos)
app.patch(
  "/operator/shipments/:id",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const schema = z.object({
      package_code: z.string().min(1),
      description: z.string().min(1),
      box_code: z.string().nullable().optional(),
      tracking: z.string().nullable().optional(),
      weight_kg: z.number().min(0),
    });

    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const shipmentId = Number(req.params.id);
    if (Number.isNaN(shipmentId))
      return res.status(400).json({ error: "ID inválido" });

    const upd = await db.query(
      `UPDATE shipments
       SET package_code=$1, description=$2, box_code=$3, tracking=$4, weight_kg=$5, updated_at=NOW()
       WHERE id=$6
       RETURNING *`,
      [
        p.data.package_code,
        p.data.description,
        p.data.box_code || null,
        p.data.tracking || null,
        p.data.weight_kg,
        shipmentId,
      ]
    );

    if (!upd.rows[0]) return res.status(404).json({ error: "Envío no existe" });

    res.json({ shipment: upd.rows[0] });
  }
);

// OPERATOR: cambiar estado + evento + mail
app.patch(
  "/operator/shipments/:id/status",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    const schema = z.object({
      status: z.string().min(1),
    });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Datos inválidos" });

    const shipmentId = Number(req.params.id);
    if (Number.isNaN(shipmentId))
      return res.status(400).json({ error: "ID inválido" });

    // Traer envío actual + user dueño
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

    if (!STATUSES.includes(newStatus))
      return res.status(400).json({ error: "Estado inválido" });

    const upd = await db.query(
      `UPDATE shipments
       SET status=$1, updated_at=NOW(),
           delivered_at = CASE WHEN $1='Entregado' THEN NOW() ELSE delivered_at END
       WHERE id=$2
       RETURNING *`,
      [newStatus, shipmentId]
    );

    const updated = upd.rows[0];

    // Evento
    await db.query(
      `INSERT INTO shipment_events (shipment_id, old_status, new_status, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [shipmentId, oldStatus, newStatus, null, req.user.id]
    );

    // Mail: cambio estado
    try {
      await sendEmail({
        to: current.email,
        subject: `LEMON’s — Actualización de estado: ${newStatus}`,
        html: `
          <div style="font-family: Arial, sans-serif">
            <h2>Actualización de estado</h2>
            <p><b>Cliente #${current.client_number}</b> — ${current.name}</p>
            <p><b>Código:</b> ${current.package_code}</p>
            <p><b>De:</b> ${oldStatus}</p>
            <p><b>A:</b> ${newStatus}</p>
          </div>
        `,
      });
    } catch (e) {
      console.log("[MAIL] no se pudo enviar:", e?.message || e);
    }

    res.json({ shipment: updated });
  }
);

// CLIENT/OPERATOR: historial de estados de un envío
app.get("/shipments/:id/events", authRequired, async (req, res) => {
  const shipmentId = Number(req.params.id);
  if (Number.isNaN(shipmentId))
    return res.status(400).json({ error: "ID inválido" });

  // Traer envío y dueño
  const sh = await db.query(
    "SELECT id, user_id FROM shipments WHERE id=$1",
    [shipmentId]
  );
  const ship = sh.rows[0];
  if (!ship) return res.status(404).json({ error: "Envío no existe" });

  // Permisos: cliente dueño o staff
  const role = req.user.role;
  const isOwner = req.user.id === ship.user_id;
  const isStaff = role === "operator" || role === "admin";
  if (!isOwner && !isStaff) return res.status(403).json({ error: "No autorizado" });

  const ev = await db.query(
    `SELECT id, old_status, new_status, note, created_at, created_by
     FROM shipment_events
     WHERE shipment_id=$1
     ORDER BY created_at ASC`,
    [shipmentId]
  );

  res.json({ rows: ev.rows });
});


// OPERATOR/ADMIN: métricas para dashboard
app.get("/operator/dashboard", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(weight_kg),0)::float AS total_weight,
        SUM(CASE WHEN status='Recibido en depósito' THEN 1 ELSE 0 END)::int AS received,
        SUM(CASE WHEN status='En preparación' THEN 1 ELSE 0 END)::int AS prep,
        SUM(CASE WHEN status='Despachado' THEN 1 ELSE 0 END)::int AS sent,
        SUM(CASE WHEN status='En tránsito' THEN 1 ELSE 0 END)::int AS transit,
        SUM(CASE WHEN status='Listo para entrega' THEN 1 ELSE 0 END)::int AS ready,
        SUM(CASE WHEN status='Entregado' THEN 1 ELSE 0 END)::int AS delivered
      FROM shipments
    `);
    res.json({ stats: q.rows[0] });
  } catch (e) {
    console.error("[DASHBOARD] error:", e);
    res.status(500).json({ error: "Error cargando dashboard" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`API corriendo en http://localhost:${process.env.PORT}`)
);