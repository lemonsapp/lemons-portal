// server/routes/ai.js
// ══════════════════════════════════════════════════════════════════════════════
// CAPA DE API PARA AGENTE DE IA — Lemons Portal
// Todos los endpoints son internos y requieren API key
// NO exponer estos endpoints a usuarios del portal
// ══════════════════════════════════════════════════════════════════════════════

"use strict";

const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Constantes ────────────────────────────────────────────────────────────────
const AI_API_KEY = process.env.AI_API_KEY || null;

// ── Middleware: validación de API key ─────────────────────────────────────────
function requireAIKey(req, res, next) {
  // Si no hay API key configurada en el servidor, bloquear todo
  if (!AI_API_KEY) {
    return res.status(503).json({
      error: "AI API not configured",
      hint:  "Set AI_API_KEY environment variable on the server",
    });
  }

  const key = req.headers["x-ai-api-key"] || req.query._key;

  if (!key) {
    return res.status(401).json({
      error: "Missing API key",
      hint:  "Provide X-AI-API-KEY header",
    });
  }

  if (key !== AI_API_KEY) {
    // Log del intento fallido (sin revelar la key)
    console.warn(`[AI] Unauthorized attempt from IP ${req.ip} at ${new Date().toISOString()}`);
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
}

// ── Middleware: logging de requests de IA ────────────────────────────────────
function aiLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[AI] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
}

// Aplicar a todas las rutas del router
router.use(requireAIKey);
router.use(aiLogger);

// ── Helper: formatear fechas en español ──────────────────────────────────────
function fmtDate(v) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}

// ── Helper: respuesta de error estandarizada ─────────────────────────────────
function notFound(res, resource) {
  return res.status(404).json({ error: `${resource} no encontrado` });
}

function serverError(res, err, context) {
  console.error(`[AI ERROR] ${context}:`, err.message);
  return res.status(500).json({ error: "Error interno del servidor", context });
}

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// GET /api/ai/health
// ══════════════════════════════════════════════════════════════════════════════
router.get("/health", (req, res) => {
  res.json({
    ok:        true,
    service:   "Lemons AI API",
    version:   "1.0",
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ENVÍOS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/shipments/:code — buscar envío por código ────────────────────
// Ejemplo: GET /api/ai/shipments/USA-N-0004
// También acepta tracking: GET /api/ai/shipments/9400111899223397233943
router.get("/shipments/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const q = await db.query(`
      SELECT
        s.id,
        s.code,
        s.description,
        s.weight_kg,
        s.status,
        s.origin,
        s.service,
        s.rate_usd_per_kg,
        s.estimated_usd,
        s.date_in,
        s.tracking,
        s.box_code,
        s.delivered_at,
        s.updated_at,
        u.name            AS client_name,
        u.client_number,
        u.email           AS client_email
      FROM shipments s
      JOIN users u ON u.id = s.user_id
      WHERE UPPER(s.code) = UPPER($1)
         OR s.tracking    = $1
      LIMIT 1
    `, [code.trim()]);

    if (!q.rows[0]) return notFound(res, "Envío");

    const s = q.rows[0];
    res.json({
      shipment: {
        id:            s.id,
        code:          s.code,
        description:   s.description,
        weight_kg:     Number(s.weight_kg),
        status:        s.status,
        origin:        s.origin,
        service:       s.service,
        rate_usd_per_kg: s.rate_usd_per_kg ? Number(s.rate_usd_per_kg) : null,
        estimated_usd: s.estimated_usd ? Number(s.estimated_usd) : null,
        tracking:      s.tracking,
        box_code:      s.box_code,
        date_in:       fmtDate(s.date_in),
        delivered_at:  fmtDate(s.delivered_at),
        updated_at:    fmtDate(s.updated_at),
        client: {
          name:           s.client_name,
          client_number:  s.client_number,
          email:          s.client_email,
        },
      },
    });
  } catch (err) { serverError(res, err, "shipments/:code"); }
});

// ── GET /api/ai/shipments/:code/events — historial de estados ────────────────
router.get("/shipments/:code/events", async (req, res) => {
  try {
    const { code } = req.params;

    // Primero buscar el shipment_id
    const sq = await db.query(
      `SELECT id, code FROM shipments WHERE UPPER(code) = UPPER($1) OR tracking = $1 LIMIT 1`,
      [code.trim()]
    );
    if (!sq.rows[0]) return notFound(res, "Envío");

    const shipmentId = sq.rows[0].id;

    const eq = await db.query(`
      SELECT old_status, new_status, created_at
      FROM shipment_events
      WHERE shipment_id = $1
      ORDER BY created_at ASC
    `, [shipmentId]);

    res.json({
      shipment_code: sq.rows[0].code,
      events: eq.rows.map(e => ({
        from:       e.old_status || "—",
        to:         e.new_status,
        date:       fmtDate(e.created_at),
        date_raw:   e.created_at,
      })),
      total: eq.rows.length,
    });
  } catch (err) { serverError(res, err, "shipments/:code/events"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/clients/:clientNumber — datos del cliente ────────────────────
router.get("/clients/:clientNumber", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    if (!Number.isFinite(clientNumber)) return res.status(400).json({ error: "Número de cliente inválido" });

    const uq = await db.query(`
      SELECT id, client_number, name, email, role, active, created_at
      FROM users
      WHERE client_number = $1
      LIMIT 1
    `, [clientNumber]);

    if (!uq.rows[0]) return notFound(res, "Cliente");
    const u = uq.rows[0];

    // Estadísticas del cliente
    const statsQ = await db.query(`
      SELECT
        COUNT(*)                                                AS total_shipments,
        COUNT(*) FILTER (WHERE status = 'Entregado')           AS delivered,
        COUNT(*) FILTER (WHERE status != 'Entregado')          AS active,
        COALESCE(SUM(estimated_usd), 0)                        AS total_billed,
        MAX(date_in)                                           AS last_shipment
      FROM shipments
      WHERE user_id = $1
    `, [u.id]);

    // Coins
    const coinsQ = await db.query(
      `SELECT balance, total_earned FROM lemon_coins WHERE user_id = $1`,
      [u.id]
    );

    const stats = statsQ.rows[0];
    const coins = coinsQ.rows[0];

    res.json({
      client: {
        client_number:    u.client_number,
        name:             u.name,
        email:            u.email,
        active:           u.active,
        member_since:     fmtDate(u.created_at),
        stats: {
          total_shipments: Number(stats.total_shipments),
          delivered:       Number(stats.delivered),
          active_shipments: Number(stats.active),
          total_billed_usd: Number(stats.total_billed),
          last_shipment:    fmtDate(stats.last_shipment),
        },
        coins: coins ? {
          balance:      Number(coins.balance),
          total_earned: Number(coins.total_earned),
          level:        coins.balance >= 1500 ? "Oro 🥇" : coins.balance >= 500 ? "Plata 🥈" : "Bronce 🥉",
        } : { balance: 0, total_earned: 0, level: "Bronce 🥉" },
      },
    });
  } catch (err) { serverError(res, err, "clients/:clientNumber"); }
});

// ── GET /api/ai/clients/:clientNumber/shipments — envíos del cliente ─────────
// Parámetros opcionales: ?status=En tránsito&limit=10
router.get("/clients/:clientNumber/shipments", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    if (!Number.isFinite(clientNumber)) return res.status(400).json({ error: "Número de cliente inválido" });

    const { status, limit = 20, active_only } = req.query;

    const uq = await db.query(
      `SELECT id, name FROM users WHERE client_number = $1 LIMIT 1`,
      [clientNumber]
    );
    if (!uq.rows[0]) return notFound(res, "Cliente");

    const params = [uq.rows[0].id];
    let where = "WHERE s.user_id = $1";

    if (status) {
      params.push(status);
      where += ` AND s.status = $${params.length}`;
    }

    if (active_only === "true") {
      where += ` AND s.status != 'Entregado'`;
    }

    params.push(Math.min(parseInt(limit) || 20, 100));

    const sq = await db.query(`
      SELECT
        s.id, s.code, s.description, s.weight_kg,
        s.status, s.origin, s.service,
        s.estimated_usd, s.date_in, s.tracking,
        s.delivered_at
      FROM shipments s
      ${where}
      ORDER BY s.date_in DESC
      LIMIT $${params.length}
    `, params);

    res.json({
      client_number: clientNumber,
      client_name:   uq.rows[0].name,
      shipments: sq.rows.map(s => ({
        code:          s.code,
        description:   s.description,
        weight_kg:     Number(s.weight_kg),
        status:        s.status,
        origin:        s.origin,
        service:       s.service,
        estimated_usd: s.estimated_usd ? Number(s.estimated_usd) : null,
        tracking:      s.tracking,
        date_in:       fmtDate(s.date_in),
        delivered_at:  fmtDate(s.delivered_at),
      })),
      total: sq.rows.length,
    });
  } catch (err) { serverError(res, err, "clients/:clientNumber/shipments"); }
});

// ── GET /api/ai/clients/:clientNumber/pending — pendientes de cobro ───────────
router.get("/clients/:clientNumber/pending", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    if (!Number.isFinite(clientNumber)) return res.status(400).json({ error: "Número de cliente inválido" });

    const uq = await db.query(
      `SELECT id, name FROM users WHERE client_number = $1 LIMIT 1`,
      [clientNumber]
    );
    if (!uq.rows[0]) return notFound(res, "Cliente");

    // Envíos entregados sin pago registrado
    const sq = await db.query(`
      SELECT s.id, s.code, s.description, s.weight_kg,
             s.origin, s.service, s.estimated_usd, s.delivered_at
      FROM shipments s
      WHERE s.user_id = $1
        AND s.status = 'Entregado'
        AND s.id NOT IN (
          SELECT pi.shipment_id FROM payment_items pi
        )
      ORDER BY s.delivered_at DESC
    `, [uq.rows[0].id]);

    const total = sq.rows.reduce((s, r) => s + Number(r.estimated_usd || 0), 0);

    res.json({
      client_number:  clientNumber,
      client_name:    uq.rows[0].name,
      pending_amount: Number(total.toFixed(2)),
      shipments: sq.rows.map(s => ({
        code:          s.code,
        description:   s.description,
        weight_kg:     Number(s.weight_kg),
        origin:        s.origin,
        service:       s.service,
        estimated_usd: s.estimated_usd ? Number(s.estimated_usd) : null,
        delivered_at:  fmtDate(s.delivered_at),
      })),
      total: sq.rows.length,
    });
  } catch (err) { serverError(res, err, "clients/:clientNumber/pending"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BÚSQUEDA GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/search?q=TEXTO — buscar en envíos, clientes, tracking ────────
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Query demasiado corta (mínimo 2 caracteres)" });
    }

    const pattern = `%${q}%`;

    // Buscar en envíos
    const shipmentsQ = await db.query(`
      SELECT s.code, s.description, s.status, s.origin, s.service,
             s.estimated_usd, s.tracking, s.date_in,
             u.name AS client_name, u.client_number
      FROM shipments s
      JOIN users u ON u.id = s.user_id
      WHERE UPPER(s.code)        LIKE UPPER($1)
         OR UPPER(s.description) LIKE UPPER($1)
         OR s.tracking           LIKE $1
         OR UPPER(s.box_code)    LIKE UPPER($1)
      ORDER BY s.date_in DESC
      LIMIT 10
    `, [pattern]);

    // Buscar en clientes
    const clientsQ = await db.query(`
      SELECT client_number, name, email, active
      FROM users
      WHERE UPPER(name)  LIKE UPPER($1)
         OR UPPER(email) LIKE UPPER($1)
         OR CAST(client_number AS TEXT) LIKE $1
      LIMIT 5
    `, [pattern]);

    res.json({
      query: q,
      results: {
        shipments: shipmentsQ.rows.map(s => ({
          code:          s.code,
          description:   s.description,
          status:        s.status,
          origin:        s.origin,
          service:       s.service,
          estimated_usd: s.estimated_usd ? Number(s.estimated_usd) : null,
          tracking:      s.tracking,
          date_in:       fmtDate(s.date_in),
          client_name:   s.client_name,
          client_number: s.client_number,
        })),
        clients: clientsQ.rows,
      },
      total_found: shipmentsQ.rows.length + clientsQ.rows.length,
    });
  } catch (err) { serverError(res, err, "search"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD / MÉTRICAS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/dashboard/stats — métricas generales del sistema ──────────────
router.get("/dashboard/stats", async (req, res) => {
  try {
    // Pipeline de estados
    const pipelineQ = await db.query(`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE status = 'Recibido en depósito')        AS received,
        COUNT(*) FILTER (WHERE status = 'En preparación')              AS prep,
        COUNT(*) FILTER (WHERE status = 'Despachado')                  AS sent,
        COUNT(*) FILTER (WHERE status = 'En tránsito')                 AS transit,
        COUNT(*) FILTER (WHERE status = 'Listo para entrega')          AS ready,
        COUNT(*) FILTER (WHERE status = 'Entregado')                   AS delivered,
        COALESCE(SUM(weight_kg), 0)                                    AS total_weight_kg,
        COALESCE(SUM(estimated_usd), 0)                                AS total_revenue
      FROM shipments
    `);

    // Clientes activos (con al menos 1 envío)
    const clientsQ = await db.query(`
      SELECT COUNT(DISTINCT user_id) AS active_clients FROM shipments
    `);

    // Envíos del mes actual
    const monthQ = await db.query(`
      SELECT
        COUNT(*) AS this_month,
        COALESCE(SUM(estimated_usd), 0) AS revenue_this_month
      FROM shipments
      WHERE date_in >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    // Profit del mes actual y total histórico (desde pagos registrados)
    const profitQ = await db.query(`
      SELECT
        COALESCE(SUM(profit_usd), 0) AS profit_this_month
      FROM payments
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    const totalProfitQ = await db.query(`
      SELECT COALESCE(SUM(profit_usd), 0) AS total_profit FROM payments
    `);

    // Coins en circulación
    const coinsQ = await db.query(`
      SELECT COALESCE(SUM(balance), 0) AS total_coins FROM lemon_coins
    `);

    const p = pipelineQ.rows[0];
    const m = monthQ.rows[0];

    res.json({
      timestamp: new Date().toISOString(),
      pipeline: {
        total:     Number(p.total),
        received:  Number(p.received),
        prep:      Number(p.prep),
        sent:      Number(p.sent),
        transit:   Number(p.transit),
        ready:     Number(p.ready),
        delivered: Number(p.delivered),
      },
      totals: {
        active_clients:    Number(clientsQ.rows[0].active_clients),
        total_weight_kg:   Number(Number(p.total_weight_kg).toFixed(2)),
        total_revenue:     Number(Number(p.total_revenue).toFixed(2)),
        total_profit_usd:  Number(Number(totalProfitQ.rows[0].total_profit).toFixed(2)),
        coins_circulating: Number(coinsQ.rows[0].total_coins),
      },
      this_month: {
        shipments:    Number(m.this_month),
        revenue_usd:  Number(Number(m.revenue_this_month).toFixed(2)),
        profit_usd:   Number(Number(profitQ.rows[0].profit_this_month).toFixed(2)),
      },
    });
  } catch (err) { serverError(res, err, "dashboard/stats"); }
});

// ── GET /api/ai/dashboard/pipeline — envíos activos por estado ───────────────
// Devuelve listado real de envíos activos (no entregados)
router.get("/dashboard/pipeline", async (req, res) => {
  try {
    const { status } = req.query;

    const params = [];
    let where = "WHERE s.status != 'Entregado'";
    if (status) {
      params.push(status);
      where = `WHERE s.status = $1`;
    }

    const q = await db.query(`
      SELECT
        s.id, s.code, s.description, s.weight_kg,
        s.status, s.origin, s.service, s.estimated_usd,
        s.date_in, s.tracking,
        u.name AS client_name, u.client_number
      FROM shipments s
      JOIN users u ON u.id = s.user_id
      ${where}
      ORDER BY
        CASE s.status
          WHEN 'Recibido en depósito' THEN 1
          WHEN 'En preparación'       THEN 2
          WHEN 'Despachado'           THEN 3
          WHEN 'En tránsito'          THEN 4
          WHEN 'Listo para entrega'   THEN 5
          ELSE 6
        END,
        s.date_in ASC
    `, params);

    // Agrupar por estado
    const grouped = {};
    for (const s of q.rows) {
      if (!grouped[s.status]) grouped[s.status] = [];
      grouped[s.status].push({
        code:          s.code,
        description:   s.description,
        weight_kg:     Number(s.weight_kg),
        origin:        s.origin,
        service:       s.service,
        estimated_usd: s.estimated_usd ? Number(s.estimated_usd) : null,
        date_in:       fmtDate(s.date_in),
        tracking:      s.tracking,
        client_name:   s.client_name,
        client_number: s.client_number,
      });
    }

    res.json({
      total_active: q.rows.length,
      by_status: grouped,
    });
  } catch (err) { serverError(res, err, "dashboard/pipeline"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CARGAS EXTERNAS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/external/summary — resumen de cargas externas ────────────────
router.get("/external/summary", async (req, res) => {
  try {
    // Verificar que existen las tablas
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'ext_boxes'
      ) AS exists
    `);
    if (!tableCheck.rows[0].exists) {
      return res.json({ message: "Módulo de cargas externas no inicializado", boxes: 0, cierres: 0 });
    }

    const boxesQ = await db.query(`
      SELECT
        COUNT(*)                                                     AS total_boxes,
        COALESCE(SUM(total_kg), 0)                                   AS total_kg
      FROM ext_boxes
    `);

    const itemsQ = await db.query(`
      SELECT
        COUNT(*)                                                     AS total_items,
        COUNT(*) FILTER (WHERE status = 'EN DEPOSITO')              AS in_deposit,
        COUNT(*) FILTER (WHERE status = 'ENTREGADO')                AS delivered,
        COALESCE(SUM(CASE WHEN is_commission THEN weight_kg * tariff_per_kg ELSE 0 END), 0) AS total_commission
      FROM ext_items
    `);

    const cierresQ = await db.query(`
      SELECT
        COUNT(*)                                                     AS total,
        COUNT(*) FILTER (WHERE status = 'open')                     AS open_count,
        COUNT(*) FILTER (WHERE status = 'closed')                   AS closed_count
      FROM ext_cierres
    `);

    res.json({
      boxes:  {
        total:    Number(boxesQ.rows[0].total_boxes),
        total_kg: Number(boxesQ.rows[0].total_kg),
      },
      items: {
        total:            Number(itemsQ.rows[0].total_items),
        in_deposit:       Number(itemsQ.rows[0].in_deposit),
        delivered:        Number(itemsQ.rows[0].delivered),
        commission_earned: Number(Number(itemsQ.rows[0].total_commission).toFixed(2)),
      },
      cierres: {
        total:  Number(cierresQ.rows[0].total),
        open:   Number(cierresQ.rows[0].open_count),
        closed: Number(cierresQ.rows[0].closed_count),
      },
    });
  } catch (err) { serverError(res, err, "external/summary"); }
});

// ── GET /api/ai/external/cierres/open — cierre(s) abierto(s) actual(es) ──────
router.get("/external/cierres/open", async (req, res) => {
  try {
    const tableCheck = await db.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ext_cierres') AS exists
    `);
    if (!tableCheck.rows[0].exists) return res.json({ cierres: [] });

    const q = await db.query(`
      SELECT id, label, date_from, date_to, notes, created_at
      FROM ext_cierres
      WHERE status = 'open'
      ORDER BY created_at DESC
    `);

    res.json({
      cierres: q.rows.map(c => ({
        id:        c.id,
        label:     c.label,
        date_from: fmtDate(c.date_from),
        date_to:   fmtDate(c.date_to),
        notes:     c.notes,
        created_at: fmtDate(c.created_at),
      })),
      total: q.rows.length,
    });
  } catch (err) { serverError(res, err, "external/cierres/open"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// COINS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/coins/ranking — top clientes por coins ───────────────────────
router.get("/coins/ranking", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const q = await db.query(`
      SELECT
        lc.balance, lc.total_earned,
        u.name, u.client_number, u.email
      FROM lemon_coins lc
      JOIN users u ON u.id = lc.user_id
      ORDER BY lc.balance DESC
      LIMIT $1
    `, [limit]);

    function getLevel(bal) {
      if (bal >= 1500) return "Oro 🥇";
      if (bal >= 500)  return "Plata 🥈";
      return "Bronce 🥉";
    }

    res.json({
      ranking: q.rows.map((r, i) => ({
        position:      i + 1,
        client_number: r.client_number,
        name:          r.name,
        balance:       Number(r.balance),
        total_earned:  Number(r.total_earned),
        level:         getLevel(Number(r.balance)),
      })),
      total: q.rows.length,
    });
  } catch (err) { serverError(res, err, "coins/ranking"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RESPUESTAS EN LENGUAJE NATURAL (para el agente)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/ask/shipment/:code — respuesta lista para Telegram ────────────
// Devuelve un mensaje formateado listo para enviar al usuario
router.get("/ask/shipment/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const q = await db.query(`
      SELECT s.*, u.name AS client_name, u.client_number
      FROM shipments s
      JOIN users u ON u.id = s.user_id
      WHERE UPPER(s.code) = UPPER($1) OR s.tracking = $1
      LIMIT 1
    `, [code.trim()]);

    if (!q.rows[0]) {
      return res.json({
        found: false,
        message: `No encontré ningún envío con el código *${code}*. Verificá que el código sea correcto.`,
      });
    }

    const s = q.rows[0];
    const statusEmoji = {
      "Recibido en depósito": "📦",
      "En preparación":       "🔧",
      "Despachado":           "🚀",
      "En tránsito":          "✈️",
      "Listo para entrega":   "📬",
      "Entregado":            "✅",
    }[s.status] || "📦";

    const message = [
      `${statusEmoji} *Envío ${s.code}*`,
      ``,
      `👤 Cliente: ${s.client_name} (#${s.client_number})`,
      `📋 Descripción: ${s.description}`,
      `⚖️ Peso: ${Number(s.weight_kg).toFixed(2)} kg`,
      `🌍 Origen: ${s.origin} — ${s.service}`,
      s.estimated_usd ? `💰 Valor estimado: $${Number(s.estimated_usd).toFixed(2)} USD` : null,
      s.tracking ? `🔍 Tracking: ${s.tracking}` : null,
      ``,
      `📌 Estado actual: *${s.status}*`,
      `📅 Ingresó: ${fmtDate(s.date_in)}`,
      s.delivered_at ? `✅ Entregado: ${fmtDate(s.delivered_at)}` : null,
    ].filter(Boolean).join("\n");

    res.json({ found: true, message, shipment: s });
  } catch (err) { serverError(res, err, "ask/shipment/:code"); }
});

// ── GET /api/ai/ask/client/:clientNumber — resumen del cliente para Telegram ──
router.get("/ask/client/:clientNumber", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    if (!Number.isFinite(clientNumber)) {
      return res.json({ found: false, message: "Número de cliente inválido." });
    }

    const uq = await db.query(
      `SELECT id, name, email, active, client_number FROM users WHERE client_number = $1 LIMIT 1`,
      [clientNumber]
    );
    if (!uq.rows[0]) {
      return res.json({
        found: false,
        message: `No encontré ningún cliente con el número *#${clientNumber}*.`,
      });
    }

    const u = uq.rows[0];
    const statsQ = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status != 'Entregado') AS active,
        COALESCE(SUM(estimated_usd) FILTER (WHERE status != 'Entregado' AND id NOT IN (SELECT shipment_id FROM payment_items)), 0) AS pending_usd
      FROM shipments WHERE user_id = $1
    `, [u.id]);

    const coinsQ = await db.query(
      `SELECT balance FROM lemon_coins WHERE user_id = $1`,
      [u.id]
    );

    const stats = statsQ.rows[0];
    const coins = coinsQ.rows[0];
    const level = coins ? (coins.balance >= 1500 ? "Oro 🥇" : coins.balance >= 500 ? "Plata 🥈" : "Bronce 🥉") : "Bronce 🥉";

    const message = [
      `👤 *Cliente #${u.client_number} — ${u.name}*`,
      ``,
      `📧 ${u.email}`,
      `${u.active ? "✅ Activo" : "🚫 Suspendido"}`,
      ``,
      `📦 Envíos totales: ${stats.total}`,
      `🚀 Envíos en curso: ${stats.active}`,
      Number(stats.pending_usd) > 0 ? `💸 Saldo pendiente de cobro: $${Number(stats.pending_usd).toFixed(2)} USD` : `💸 Sin saldo pendiente`,
      ``,
      `🍋 Lemon Coins: ${coins ? coins.balance : 0} — Nivel ${level}`,
    ].join("\n");

    res.json({ found: true, message });
  } catch (err) { serverError(res, err, "ask/client/:clientNumber"); }
});


// ══════════════════════════════════════════════════════════════════════════════
// ESCRITURA — Solo para agente IA autorizado
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/ai/write/shipment — crear envío ─────────────────────────────────
router.post("/write/shipment", async (req, res) => {
  try {
    const {
      user_client_number, code, description,
      weight_kg, origin, service, tracking,
      box_code, rate_usd_per_kg, estimated_usd, date_in
    } = req.body;

    // Validaciones básicas
    if (!user_client_number || !description || !weight_kg || !origin || !service) {
      return res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["user_client_number", "description", "weight_kg", "origin", "service"]
      });
    }

    // Generar código automáticamente si no viene
    let finalCode = code;
    if (!finalCode) {
      const originPfx  = origin === "CHINA" ? "CHN" : origin === "EUROPA" ? "EUR" : "USA";
      const servicePfx = origin === "EUROPA" ? "N" : service === "EXPRESS" ? "E" : service === "TECH_PREMIUM" ? "T" : "N";
      const prefix = `${originPfx}-${servicePfx}-`;
      const cntQ = await db.query(
        `SELECT COUNT(*) AS cnt FROM shipments WHERE code LIKE $1`, [`${prefix}%`]
      );
      let next = Number(cntQ.rows[0]?.cnt || 0) + 1;
      let candidate = `${prefix}${String(next).padStart(4, "0")}`;
      const exists = await db.query(`SELECT id FROM shipments WHERE code = $1`, [candidate]);
      if (exists.rows[0]) {
        const maxQ = await db.query(
          `SELECT code FROM shipments WHERE code LIKE $1 ORDER BY code DESC LIMIT 1`,
          [`${prefix}%`]
        );
        const lastNum = parseInt(
          (maxQ.rows[0]?.code || `${prefix}0000`).replace(prefix, ""), 10
        ) || 0;
        candidate = `${prefix}${String(lastNum + 1).padStart(4, "0")}`;
      }
      finalCode = candidate;
    }

    const validOrigins  = ["USA", "CHINA", "EUROPA"];
    const validServices = ["NORMAL", "EXPRESS", "TECH_PREMIUM"];
    if (!validOrigins.includes(origin))  return res.status(400).json({ error: `origin inválido. Válidos: ${validOrigins.join(", ")}` });
    if (!validServices.includes(service)) return res.status(400).json({ error: `service inválido. Válidos: ${validServices.join(", ")}` });

    // Buscar usuario
    const uq = await db.query(
      `SELECT id, name FROM users WHERE client_number = $1 AND active = true LIMIT 1`,
      [user_client_number]
    );
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${user_client_number} no encontrado o inactivo` });

    // Verificar que el código no exista ya
    const codeCheck = await db.query(
      `SELECT id FROM shipments WHERE UPPER(code) = UPPER($1) LIMIT 1`,
      [finalCode]
    );
    if (codeCheck.rows[0]) return res.status(409).json({ error: `El código ${finalCode} ya existe en el sistema` });

    // Obtener tarifas del cliente o defaults
    const ratesQ = await db.query(
      `SELECT * FROM client_rates WHERE user_id = $1 LIMIT 1`,
      [uq.rows[0].id]
    );
    const costsQ = await db.query(`SELECT * FROM operator_costs WHERE id = 1 LIMIT 1`);

    const defaultRates = {
      USA_NORMAL: 45, USA_EXPRESS: 55, USA_TECH_PREMIUM: 75,
      CHINA_NORMAL: 58, CHINA_EXPRESS: 68, EUROPA_NORMAL: 58
    };
    const key = `${origin}_${service}`.replace("-", "_");
    const clientRate = rate_usd_per_kg || (ratesQ.rows[0]?.[key.toLowerCase()] ?? defaultRates[key] ?? 45);

    // Calcular estimated_usd si no viene
    const peso = Math.max(Number(weight_kg), 1);
    let descuento = 0;
    if (peso >= 100) descuento = 7;
    else if (peso >= 50) descuento = 5;
    else if (peso >= 10) descuento = 3;
    const finalEstimated = estimated_usd ?? Number((peso * (clientRate - descuento)).toFixed(2));

    const dateIn = date_in ? new Date(date_in) : new Date();

    const ins = await db.query(`
      INSERT INTO shipments
        (user_id, code, description, weight_kg, status, origin, service,
         rate_usd_per_kg, estimated_usd, date_in, tracking, box_code)
      VALUES ($1,$2,$3,$4,'Recibido en depósito',$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, code, status, estimated_usd
    `, [
      uq.rows[0].id, finalCode.toUpperCase(), description,
      weight_kg, origin, service,
      clientRate, finalEstimated, dateIn,
      tracking || null, box_code || null
    ]);

    const created = ins.rows[0];
    console.log(`[AI WRITE] Envío creado: ${created.code} para cliente #${user_client_number}`);

    res.status(201).json({
      ok: true,
      message: `Envío ${created.code} creado correctamente`,
      shipment: {
        id:            created.id,
        code:          created.code,
        status:        created.status,
        estimated_usd: Number(created.estimated_usd),
        client:        uq.rows[0].name,
      }
    });
  } catch (err) { serverError(res, err, "write/shipment POST"); }
});

// ── PATCH /api/ai/write/shipment/:code — editar envío o cambiar estado ────────
router.patch("/write/shipment/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const {
      status, description, weight_kg,
      tracking, box_code, estimated_usd
    } = req.body;

    const validStatuses = [
      "Recibido en depósito", "En preparación",
      "Despachado", "En tránsito",
      "Listo para entrega", "Entregado"
    ];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status inválido`,
        valid: validStatuses
      });
    }

    // Buscar el envío
    const sq = await db.query(
      `SELECT id, status, code FROM shipments WHERE UPPER(code) = UPPER($1) LIMIT 1`,
      [code.trim()]
    );
    if (!sq.rows[0]) return res.status(404).json({ error: `Envío ${code} no encontrado` });

    const shipment = sq.rows[0];
    const oldStatus = shipment.status;

    // Armar campos a actualizar dinámicamente
    const fields = [];
    const vals   = [];
    let i = 1;

    if (status)        { fields.push(`status = $${i++}`);        vals.push(status); }
    if (description)   { fields.push(`description = $${i++}`);   vals.push(description); }
    if (weight_kg)     { fields.push(`weight_kg = $${i++}`);     vals.push(weight_kg); }
    if (tracking)      { fields.push(`tracking = $${i++}`);      vals.push(tracking); }
    if (box_code)      { fields.push(`box_code = $${i++}`);      vals.push(box_code); }
    if (estimated_usd) { fields.push(`estimated_usd = $${i++}`); vals.push(estimated_usd); }
    if (status === "Entregado") {
      fields.push(`delivered_at = $${i++}`);
      vals.push(new Date());
    }

    fields.push(`updated_at = $${i++}`);
    vals.push(new Date());

    if (fields.length === 1) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    vals.push(shipment.id);
    await db.query(
      `UPDATE shipments SET ${fields.join(", ")} WHERE id = $${i}`,
      vals
    );

    // Registrar evento si cambió el estado
    if (status && status !== oldStatus) {
      await db.query(
        `INSERT INTO shipment_events (shipment_id, old_status, new_status) VALUES ($1, $2, $3)`,
        [shipment.id, oldStatus, status]
      );
    }

    console.log(`[AI WRITE] Envío ${shipment.code} actualizado — status: ${oldStatus} → ${status || oldStatus}`);

    res.json({
      ok: true,
      message: `Envío ${shipment.code} actualizado correctamente`,
      updated: {
        code:       shipment.code,
        old_status: oldStatus,
        new_status: status || oldStatus,
        fields_updated: fields.length - 1,
      }
    });
  } catch (err) { serverError(res, err, "write/shipment PATCH"); }
});

module.exports = router;