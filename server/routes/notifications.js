// server/routes/notifications.js
// Sistema de notificaciones del personaje LIMÓN
const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { authRequired, requireRole } = require("../auth");

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lemon_notifications (
      id          SERIAL PRIMARY KEY,
      message     TEXT NOT NULL,
      emoji       TEXT DEFAULT '🍋',
      type        TEXT DEFAULT 'info',   -- info | warning | promo | update
      active      BOOLEAN DEFAULT TRUE,
      target_role TEXT DEFAULT 'all',    -- all | client | operator
      created_by  INTEGER REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
migrate().catch(e => console.error("[NOTIF MIGRATE]", e));

// GET /notifications/active — para todos los usuarios (muestra la activa)
router.get("/active", authRequired, async (req, res) => {
  try {
    const role = req.user.role;
    const q = await db.query(`
      SELECT * FROM lemon_notifications
      WHERE active = TRUE
        AND (target_role = 'all' OR target_role = $1)
      ORDER BY created_at DESC
      LIMIT 1
    `, [role]);
    res.json({ notification: q.rows[0] || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /notifications — todas (operador/admin)
router.get("/", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM lemon_notifications ORDER BY created_at DESC`);
    res.json({ notifications: q.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /notifications — crear nueva (desactiva las anteriores del mismo target)
router.post("/", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const { message, emoji, type, target_role } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Mensaje requerido" });

    // Desactivar las anteriores del mismo target
    await db.query(
      `UPDATE lemon_notifications SET active=FALSE
       WHERE target_role=$1 OR target_role='all'`,
      [target_role || "all"]
    );

    const q = await db.query(`
      INSERT INTO lemon_notifications (message, emoji, type, target_role, active, created_by)
      VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING *
    `, [
      message.trim(),
      emoji || "🍋",
      type || "info",
      target_role || "all",
      req.user.id,
    ]);
    res.json({ notification: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /notifications/:id — editar o activar/desactivar
router.patch("/:id", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    const { message, emoji, type, active, target_role } = req.body;
    const q = await db.query(`
      UPDATE lemon_notifications SET
        message     = COALESCE($1, message),
        emoji       = COALESCE($2, emoji),
        type        = COALESCE($3, type),
        active      = COALESCE($4, active),
        target_role = COALESCE($5, target_role),
        updated_at  = NOW()
      WHERE id=$6 RETURNING *
    `, [message||null, emoji||null, type||null,
        active !== undefined ? active : null,
        target_role||null, req.params.id]);
    res.json({ notification: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /notifications/:id
router.delete("/:id", authRequired, requireRole(["operator","admin"]), async (req, res) => {
  try {
    await db.query(`DELETE FROM lemon_notifications WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;