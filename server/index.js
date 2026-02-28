require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const db = require("./db");
const { authRequired, requireRole } = require("./auth");

const app = express();
app.use(express.json());

// CORS abierto mientras probás (después lo cerramos al dominio)
app.use(cors({ origin: true }));

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ==================== HELPERS ====================

function toNumberLoose(v) {
  // acepta "0,5", "0.5", 0.5
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return n;
}

async function ensureSchema() {
  // Crea tablas si no existen, con las columnas que usa esta app.
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      client_number INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_code TEXT NOT NULL,
      description TEXT NOT NULL,
      box_code TEXT NULL,
      tracking TEXT NULL,
      weight_kg NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      date_in TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NULL,
      delivered_at TIMESTAMP NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shipment_events (
      id SERIAL PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      old_status TEXT NULL,
      new_status TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON shipments(user_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_events_shipment_id ON shipment_events(shipment_id);`);
}

// ==================== BASIC ====================

app.get("/", (req, res) => res.send("LEMON's API OK ✅ — probá /health"));
app.get("/health", (req, res) => res.json({ ok: true }));

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
        client_number: z.preprocess((v) => toNumberLoose(v), z.number().int().min(0)),
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
      return res.status(500).json({ error: "Error interno" });
    }
  }
);

app.get(
  "/operator/clients",
  authRequired,
  requireRole(["operator", "admin"]),
  async (req, res) => {
    try {
      const n = toNumberLoose(req.query.client_number);
      if (Number.isNaN(n)) return res.status(400).json({ error: "client_number inválido" });

      const q = await db.query(
        "SELECT id, client_number, name, email, role FROM users WHERE client_number=$1",
        [Number(n)]
      );

      res.json({ user: q.rows[0] || null });
    } catch (e) {
      console.error("GET CLIENT ERROR", e);
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
        client_number: z.preprocess((v) => toNumberLoose(v), z.number().int().min(0)),
        package_code: z.string().min(1),
        description: z.string().min(1),
        box_code: z.string().nullable().optional(),
        tracking: z.string().nullable().optional(),
        weight_kg: z.preprocess((v) => toNumberLoose(v), z.number().min(0)),
        status: z.string().min(1),
      });

      const p = schema.safeParse(req.body);
      if (!p.success) {
        return res.status(400).json({
          error: "Datos inválidos",
          details: p.error.issues?.map((i) => ({ path: i.path, message: i.message })) || [],
        });
      }

      const d = p.data;

      const u = await db.query("SELECT id FROM users WHERE client_number=$1", [
        Number(d.client_number),
      ]);
      const user = u.rows[0];
      if (!user) return res.status(404).json({ error: "Cliente no existe" });

      const ins = await db.query(
        `INSERT INTO shipments
         (user_id, package_code, description, box_code, tracking, weight_kg, status, date_in)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
         RETURNING *`,
        [
          user.id,
          d.package_code,
          d.description,
          d.box_code ?? null,
          d.tracking ?? null,
          d.weight_kg,
          d.status,
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
      res.status(500).json({
        error: "Error interno",
        debug: String(e?.message || e),
      });
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
        const n = toNumberLoose(clientNumber);
        if (!Number.isNaN(n)) {
          params.push(Number(n));
          where += ` AND u.client_number = $${params.length}`;
        }
      }

      if (search) {
        params.push(`%${search}%`);
        const p1 = params.length;
        params.push(`%${search}%`);
        const p2 = params.length;
        where += ` AND (sh.package_code ILIKE $${p1} OR sh.description ILIKE $${p2})`;
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
         RETURNING *`,
        [newStatus, shipmentId]
      );

      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status)
         VALUES ($1,$2,$3)`,
        [shipmentId, oldStatus, newStatus]
      );

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
      `SELECT id, package_code, description, box_code, tracking, weight_kg, status, date_in
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
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='Recibido en depósito')::int AS received,
          COUNT(*) FILTER (WHERE status='En preparación')::int AS prep,
          COUNT(*) FILTER (WHERE status='Despachado')::int AS sent,
          COUNT(*) FILTER (WHERE status='En tránsito')::int AS transit,
          COUNT(*) FILTER (WHERE status='Listo para entrega')::int AS ready,
          COUNT(*) FILTER (WHERE status='Entregado')::int AS delivered,
          COALESCE(SUM(weight_kg),0)::float AS total_weight
        FROM shipments
      `);

      res.json({ stats: stats.rows[0] });
    } catch (err) {
      console.error("DASHBOARD ERROR:", err);
      res.status(500).json({ error: "Error dashboard" });
    }
  }
);

// ==================== START ====================

(async () => {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`API corriendo en http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("BOOT ERROR", e);
    process.exit(1);
  }
})();