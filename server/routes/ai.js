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

    // Tipo de cambio
    const fxQ = await db.query(`SELECT value FROM app_settings WHERE key='fx_usd_ars' LIMIT 1`);

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
        fx_usd_ars:        fxQ.rows[0] ? Number(fxQ.rows[0].value) : null,
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


// ── POST /api/ai/write/payment — registrar cobro ─────────────────────────────
router.post("/write/payment", async (req, res) => {
  try {
    const { client_number, shipment_codes, method, exchange_rate, amount_ars, notes, account_id } = req.body;

    if (!client_number || !shipment_codes?.length || !method) {
      return res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["client_number", "shipment_codes (array)", "method"],
        valid_methods: ["USD_CASH", "USDT", "ARS_TRANSFER", "ARS_CASH"]
      });
    }

    const validMethods = ["USD_CASH", "USDT", "ARS_TRANSFER", "ARS_CASH"];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: `Método inválido. Válidos: ${validMethods.join(", ")}` });
    }

    // Buscar cliente
    const uq = await db.query(
      `SELECT id, name FROM users WHERE client_number = $1 AND active = true LIMIT 1`,
      [client_number]
    );
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${client_number} no encontrado` });
    const user = uq.rows[0];

    // Buscar envíos por código
    const sq = await db.query(
      `SELECT s.id, s.code, s.estimated_usd, s.weight_kg, s.origin, s.service, s.status
       FROM shipments s
       WHERE UPPER(s.code) = ANY($1::text[]) AND s.user_id = $2`,
      [shipment_codes.map(c => c.toUpperCase()), user.id]
    );
    if (sq.rows.length !== shipment_codes.length) {
      const found = sq.rows.map(r => r.code);
      const missing = shipment_codes.filter(c => !found.includes(c.toUpperCase()));
      return res.status(400).json({ error: `Envíos no encontrados o no pertenecen al cliente: ${missing.join(", ")}` });
    }

    const total_usd = sq.rows.reduce((a, r) => a + Number(r.estimated_usd || 0), 0);

    // Calcular costos y ganancia
    const costsQ = await db.query(`SELECT * FROM operator_costs LIMIT 1`);
    const oc = costsQ.rows[0] || {};
    function getCostPerKg(origin, service) {
      if (origin === 'USA' && service === 'NORMAL')       return Number(oc.usa_normal       || 0);
      if (origin === 'USA' && service === 'EXPRESS')      return Number(oc.usa_express      || 0);
      if (origin === 'USA' && service === 'TECH_PREMIUM') return Number(oc.usa_tech_premium || 0);
      if (origin === 'CHINA' && service === 'NORMAL')     return Number(oc.china_normal     || 0);
      if (origin === 'CHINA' && service === 'EXPRESS')    return Number(oc.china_express    || 0);
      if (origin === 'EUROPA') return Number(oc.europa_normal || 0);
      return 0;
    }
    const total_cost = sq.rows.reduce((a, r) => {
      const kg = Math.max(Number(r.weight_kg || 0), 1);
      return a + (kg * getCostPerKg(r.origin, r.service));
    }, 0);
    const total_profit = total_usd - total_cost;

    // Crear pago
    const payRes = await db.query(
      `INSERT INTO payments (user_id, operator_id, amount_usd, method, exchange_rate, amount_ars, notes, cost_usd, profit_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [user.id, null, total_usd, method, exchange_rate ?? null, amount_ars ?? null,
       notes ?? null, Number(total_cost.toFixed(2)), Number(total_profit.toFixed(2))]
    );
    const payment = payRes.rows[0];

    // Crear payment_items y marcar envíos como entregados
    for (const s of sq.rows) {
      const kg = Math.max(Number(s.weight_kg || 0), 1);
      const shipCost   = Number((kg * getCostPerKg(s.origin, s.service)).toFixed(2));
      const shipProfit = Number((Number(s.estimated_usd) - shipCost).toFixed(2));
      await db.query(
        `INSERT INTO payment_items (payment_id, shipment_id, amount_usd, cost_usd, profit_usd) VALUES ($1,$2,$3,$4,$5)`,
        [payment.id, s.id, s.estimated_usd, shipCost, shipProfit]
      );
      if (s.status !== "Entregado") {
        await db.query(`UPDATE shipments SET status='Entregado', delivered_at=NOW(), updated_at=NOW() WHERE id=$1`, [s.id]);
        await db.query(
          `INSERT INTO shipment_events (shipment_id, old_status, new_status) VALUES ($1,$2,'Entregado')`,
          [s.id, s.status]
        );
      }
    }

    // Acreditar en cuenta si viene account_id
    if (account_id) {
      const accQ = await db.query(`SELECT balance FROM accounts WHERE id=$1`, [account_id]);
      if (accQ.rows[0]) {
        const newBal = Number(accQ.rows[0].balance) + total_usd;
        await db.query(`UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2`, [newBal, account_id]);
        await db.query(
          `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, ref_id, balance_after)
           VALUES ($1, $2, 'in', $3, $4, 'payment', $5, $6)`,
          [account_id, null, total_usd, `Cobro cliente #${client_number}`, payment.id, newBal]
        );
      }
    }

    console.log(`[AI WRITE] Cobro registrado: $${total_usd} USD — cliente #${client_number}`);

    res.status(201).json({
      ok: true,
      message: `Cobro registrado correctamente`,
      payment: {
        id:           payment.id,
        client:       user.name,
        client_number,
        amount_usd:   Number(total_usd.toFixed(2)),
        profit_usd:   Number(total_profit.toFixed(2)),
        method,
        shipments:    sq.rows.map(s => s.code),
      }
    });
  } catch (err) { serverError(res, err, "write/payment POST"); }
});

// ── POST /api/ai/write/expense — cargar gasto ────────────────────────────────
router.post("/write/expense", async (req, res) => {
  try {
    const { type, category, description, amount, currency, date, account_id } = req.body;

    if (!type || !category || !description || !amount || !currency) {
      return res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["type", "category", "description", "amount", "currency"],
        valid_types: ["empresa", "personal"],
        valid_currencies: ["USD", "ARS", "USDT"]
      });
    }

    if (!["empresa", "personal"].includes(type)) {
      return res.status(400).json({ error: "type inválido. Válidos: empresa, personal" });
    }

    const expDate = date ? new Date(date) : new Date();

    const ins = await db.query(
      `INSERT INTO expenses (operator_id, type, category, description, amount, currency, date, account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [null, type, category, description, amount, currency, expDate, account_id ?? null]
    );

    // Debitar de cuenta si viene account_id
    if (account_id) {
      const accQ = await db.query(`SELECT balance FROM accounts WHERE id=$1`, [account_id]);
      if (accQ.rows[0]) {
        const newBal = Number(accQ.rows[0].balance) - Number(amount);
        await db.query(`UPDATE accounts SET balance=$1, updated_at=NOW() WHERE id=$2`, [newBal, account_id]);
        await db.query(
          `INSERT INTO account_movements (account_id, operator_id, direction, amount, description, ref_type, ref_id, balance_after)
           VALUES ($1,$2,'out',$3,$4,'expense',$5,$6)`,
          [account_id, null, amount, description, ins.rows[0].id, newBal]
        );
      }
    }

    console.log(`[AI WRITE] Gasto cargado: ${description} — ${amount} ${currency}`);

    res.status(201).json({
      ok: true,
      message: `Gasto registrado correctamente`,
      expense: { id: ins.rows[0].id, type, category, description, amount: Number(amount), currency }
    });
  } catch (err) { serverError(res, err, "write/expense POST"); }
});

// ── POST /api/ai/write/income — cargar ingreso adicional ─────────────────────
router.post("/write/income", async (req, res) => {
  try {
    const { category, description, amount, currency, date } = req.body;

    if (!category || !description || !amount || !currency) {
      return res.status(400).json({
        error: "Faltan campos requeridos",
        required: ["category", "description", "amount", "currency"],
        valid_currencies: ["USD", "ARS", "USDT"]
      });
    }

    const incDate = date ? new Date(date) : new Date();

    const ins = await db.query(
      `INSERT INTO additional_income (operator_id, category, description, amount, currency, date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [null, category, description, amount, currency, incDate]
    );

    console.log(`[AI WRITE] Ingreso cargado: ${description} — ${amount} ${currency}`);

    res.status(201).json({
      ok: true,
      message: `Ingreso registrado correctamente`,
      income: { id: ins.rows[0].id, category, description, amount: Number(amount), currency }
    });
  } catch (err) { serverError(res, err, "write/income POST"); }
});


// ══════════════════════════════════════════════════════════════════════════════
// COINS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/coins/redemptions — canjes pendientes ────────────────────────
router.get("/coins/redemptions", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT cr.*, u.name, u.client_number,
             lc.balance AS current_balance
      FROM coin_redemptions cr
      JOIN users u ON u.id = cr.user_id
      JOIN lemon_coins lc ON lc.user_id = cr.user_id
      WHERE cr.status = 'pending'
      ORDER BY cr.created_at ASC
    `);
    res.json({ redemptions: q.rows, total: q.rows.length });
  } catch(err) { serverError(res, err, "coins/redemptions"); }
});

// ── PATCH /api/ai/coins/redemptions/:id — aplicar o cancelar canje ───────────
router.patch("/coins/redemptions/:id", async (req, res) => {
  try {
    const { status, shipment_code } = req.body;
    if (!["applied","cancelled"].includes(status))
      return res.status(400).json({ error: "status inválido: applied | cancelled" });

    const redQ = await db.query(`SELECT * FROM coin_redemptions WHERE id=$1`, [req.params.id]);
    const red = redQ.rows[0];
    if (!red) return res.status(404).json({ error: "Canje no encontrado" });

    let shipment_id = null;
    if (shipment_code) {
      const sq = await db.query(`SELECT id FROM shipments WHERE UPPER(code)=UPPER($1) LIMIT 1`, [shipment_code]);
      shipment_id = sq.rows[0]?.id || null;
    }

    if (status === "cancelled" && red.status === "pending") {
      await db.query(
        `UPDATE lemon_coins SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2`,
        [red.coins_spent, red.user_id]
      );
      await db.query(
        `INSERT INTO coin_transactions (user_id,type,amount,reason) VALUES ($1,'adjust',$2,'Devolución por canje cancelado')`,
        [red.user_id, red.coins_spent]
      );
    }

    await db.query(
      `UPDATE coin_redemptions SET status=$1, shipment_id=COALESCE($2,shipment_id) WHERE id=$3`,
      [status, shipment_id, req.params.id]
    );

    console.log(`[AI WRITE] Canje ${req.params.id} → ${status}`);
    res.json({ ok: true, message: `Canje ${req.params.id} marcado como ${status}` });
  } catch(err) { serverError(res, err, "coins/redemptions/:id PATCH"); }
});

// ── POST /api/ai/coins/adjust — ajuste manual de coins ───────────────────────
router.post("/coins/adjust", async (req, res) => {
  try {
    const { client_number, amount, reason } = req.body;
    if (!client_number || !amount || !reason)
      return res.status(400).json({ error: "Requeridos: client_number, amount, reason" });

    const uq = await db.query(`SELECT id, name FROM users WHERE client_number=$1 LIMIT 1`, [client_number]);
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${client_number} no encontrado` });
    const user = uq.rows[0];

    await db.query(
      `INSERT INTO lemon_coins (user_id,balance,total_earned) VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );
    await db.query(
      `UPDATE lemon_coins SET balance=GREATEST(0,balance+$1),
       total_earned=CASE WHEN $1>0 THEN total_earned+$1 ELSE total_earned END,
       updated_at=NOW() WHERE user_id=$2`,
      [amount, user.id]
    );
    await db.query(
      `INSERT INTO coin_transactions (user_id,type,amount,reason) VALUES ($1,'adjust',$2,$3)`,
      [user.id, amount, reason]
    );
    const updQ = await db.query(`SELECT balance FROM lemon_coins WHERE user_id=$1`, [user.id]);

    console.log(`[AI WRITE] Ajuste coins: cliente #${client_number} ${amount > 0 ? "+" : ""}${amount}`);
    res.json({ ok: true, client: user.name, client_number, new_balance: Number(updQ.rows[0].balance) });
  } catch(err) { serverError(res, err, "coins/adjust POST"); }
});

// ── POST /api/ai/coins/grant — otorgar coins por envío ───────────────────────
router.post("/coins/grant", async (req, res) => {
  try {
    const { client_number, shipment_code } = req.body;
    if (!client_number || !shipment_code)
      return res.status(400).json({ error: "Requeridos: client_number, shipment_code" });

    const uq = await db.query(`SELECT id, name FROM users WHERE client_number=$1 LIMIT 1`, [client_number]);
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${client_number} no encontrado` });

    const shipQ = await db.query(
      `SELECT s.*, u.first_shipment_bonus_given FROM shipments s JOIN users u ON u.id=s.user_id
       WHERE UPPER(s.code)=UPPER($1) LIMIT 1`, [shipment_code]
    );
    const ship = shipQ.rows[0];
    if (!ship) return res.status(404).json({ error: `Envío ${shipment_code} no encontrado` });

    const existQ = await db.query(
      `SELECT id FROM coin_transactions WHERE shipment_id=$1 AND type='earn' LIMIT 1`, [ship.id]
    );
    if (existQ.rows[0]) return res.json({ ok: false, message: "Ya se otorgaron coins por este envío" });

    const kg = parseFloat(ship.weight_kg || 0);
    const usd = parseFloat(ship.estimated_usd || 0);
    const coinsByKg = Math.floor(kg * 3);
    const coinsBig  = usd >= 500 ? 10 : 0;
    const total = coinsByKg + coinsBig;
    if (total <= 0) return res.json({ ok: false, message: "El envío no genera coins" });

    await db.query(
      `INSERT INTO lemon_coins (user_id,balance,total_earned) VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`,
      [uq.rows[0].id]
    );
    await db.query(
      `INSERT INTO coin_transactions (user_id,type,amount,reason,shipment_id) VALUES ($1,'earn',$2,$3,$4)`,
      [uq.rows[0].id, total, `Envío completado — ${coinsByKg} por kg${coinsBig ? ", 10 bonus grande" : ""}`, ship.id]
    );
    await db.query(
      `UPDATE lemon_coins SET balance=balance+$1,total_earned=total_earned+$1,updated_at=NOW() WHERE user_id=$2`,
      [total, uq.rows[0].id]
    );
    const updQ = await db.query(`SELECT balance FROM lemon_coins WHERE user_id=$1`, [uq.rows[0].id]);

    console.log(`[AI WRITE] Coins otorgados: ${total} a cliente #${client_number} por ${shipment_code}`);
    res.json({ ok: true, earned: total, new_balance: Number(updQ.rows[0].balance) });
  } catch(err) { serverError(res, err, "coins/grant POST"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CARGAS EXTERNAS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/external/boxes — listar cajas ────────────────────────────────
router.get("/external/boxes", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT b.*, COUNT(i.id) AS items_count, COALESCE(SUM(i.weight_kg),0) AS items_kg
      FROM ext_boxes b
      LEFT JOIN ext_items i ON i.box_id = b.id
      GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50
    `);
    res.json({ boxes: q.rows, total: q.rows.length });
  } catch(err) { serverError(res, err, "external/boxes GET"); }
});

// ── POST /api/ai/external/boxes — crear caja ─────────────────────────────────
router.post("/external/boxes", async (req, res) => {
  try {
    const { box_number, date_received, total_kg, notes, cierre_id } = req.body;
    if (!box_number) return res.status(400).json({ error: "Requerido: box_number" });

    const ins = await db.query(
      `INSERT INTO ext_boxes (box_number, date_received, total_kg, notes, cierre_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [box_number, date_received || new Date(), total_kg || 0, notes || null, cierre_id || null]
    );
    console.log(`[AI WRITE] Caja creada: ${box_number}`);
    res.status(201).json({ ok: true, box: ins.rows[0] });
  } catch(err) { serverError(res, err, "external/boxes POST"); }
});

// ── PATCH /api/ai/external/boxes/:id — editar caja ───────────────────────────
router.patch("/external/boxes/:id", async (req, res) => {
  try {
    const { box_number, total_kg, notes, cierre_id } = req.body;
    const q = await db.query(
      `UPDATE ext_boxes SET
        box_number = COALESCE($1, box_number),
        total_kg   = COALESCE($2, total_kg),
        notes      = COALESCE($3, notes),
        cierre_id  = COALESCE($4, cierre_id),
        updated_at = NOW()
       WHERE id=$5 RETURNING *`,
      [box_number||null, total_kg||null, notes||null, cierre_id||null, req.params.id]
    );
    if (!q.rows[0]) return res.status(404).json({ error: "Caja no encontrada" });
    res.json({ ok: true, box: q.rows[0] });
  } catch(err) { serverError(res, err, "external/boxes/:id PATCH"); }
});

// ── POST /api/ai/external/boxes/:boxId/items — agregar item a caja ───────────
router.post("/external/boxes/:boxId/items", async (req, res) => {
  try {
    const { client_name, tracking, weight_kg, tariff_per_kg, is_commission, notes } = req.body;
    if (!client_name || !weight_kg)
      return res.status(400).json({ error: "Requeridos: client_name, weight_kg" });

    const boxQ = await db.query(`SELECT id, box_number FROM ext_boxes WHERE id=$1`, [req.params.boxId]);
    if (!boxQ.rows[0]) return res.status(404).json({ error: "Caja no encontrada" });

    const ins = await db.query(
      `INSERT INTO ext_items (box_id, client_name, tracking, weight_kg, tariff_per_kg, is_commission, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.boxId, client_name, tracking||null, weight_kg,
       tariff_per_kg||2, is_commission||false, notes||null]
    );
    console.log(`[AI WRITE] Item agregado a caja ${boxQ.rows[0].box_number}: ${client_name} ${weight_kg}kg`);
    res.status(201).json({ ok: true, item: ins.rows[0] });
  } catch(err) { serverError(res, err, "external/boxes/:boxId/items POST"); }
});

// ── GET /api/ai/external/cierres — listar todos los cierres ──────────────────
router.get("/external/cierres", async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM ext_cierres ORDER BY created_at DESC`);
    res.json({ cierres: q.rows, total: q.rows.length });
  } catch(err) { serverError(res, err, "external/cierres GET"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CAJA — TIPO DE CAMBIO Y FONDOS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/cash/fx — tipo de cambio actual ───────────────────────────────
router.get("/cash/fx", async (req, res) => {
  try {
    const q = await db.query(`SELECT value FROM app_settings WHERE key='fx_usd_ars' LIMIT 1`);
    res.json({ fx_usd_ars: q.rows[0] ? Number(q.rows[0].value) : null });
  } catch(err) { serverError(res, err, "cash/fx GET"); }
});

// ── PUT /api/ai/cash/fx — actualizar tipo de cambio ──────────────────────────
router.put("/cash/fx", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || isNaN(value)) return res.status(400).json({ error: "Requerido: value (número)" });
    await db.query(
      `INSERT INTO app_settings (key,value,updated_at) VALUES ('fx_usd_ars',$1,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [String(value)]
    );
    console.log(`[AI WRITE] Tipo de cambio actualizado: $${value}`);
    res.json({ ok: true, fx_usd_ars: Number(value) });
  } catch(err) { serverError(res, err, "cash/fx PUT"); }
});

// ── GET /api/ai/cash/accounts — fondos y cuentas ─────────────────────────────
router.get("/cash/accounts", async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM accounts WHERE active=true ORDER BY name`);
    const total = q.rows.reduce((a, r) => a + Number(r.balance || 0), 0);
    res.json({ accounts: q.rows, total_usd: Number(total.toFixed(2)) });
  } catch(err) { serverError(res, err, "cash/accounts GET"); }
});

// ── GET /api/ai/cash/summary — resumen mensual ───────────────────────────────
router.get("/cash/summary", async (req, res) => {
  try {
    const paymentsQ = await db.query(`
      SELECT COALESCE(SUM(amount_usd),0) AS revenue,
             COALESCE(SUM(cost_usd),0)   AS cost,
             COALESCE(SUM(profit_usd),0) AS profit,
             COUNT(*) AS count
      FROM payments
      WHERE DATE_TRUNC('month',created_at) = DATE_TRUNC('month',CURRENT_DATE)
    `);
    const expensesQ = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN currency='USD' THEN amount ELSE 0 END),0) AS total_usd
      FROM expenses
      WHERE DATE_TRUNC('month',date) = DATE_TRUNC('month',CURRENT_DATE)
    `);
    const incomeQ = await db.query(`
      SELECT COALESCE(SUM(CASE WHEN currency='USD' THEN amount ELSE 0 END),0) AS total_usd
      FROM additional_income
      WHERE DATE_TRUNC('month',date) = DATE_TRUNC('month',CURRENT_DATE)
    `);
    const p = paymentsQ.rows[0];
    res.json({
      this_month: {
        revenue_usd:  Number(Number(p.revenue).toFixed(2)),
        cost_usd:     Number(Number(p.cost).toFixed(2)),
        profit_usd:   Number(Number(p.profit).toFixed(2)),
        payments:     Number(p.count),
        expenses_usd: Number(Number(expensesQ.rows[0].total_usd).toFixed(2)),
        income_usd:   Number(Number(incomeQ.rows[0].total_usd).toFixed(2)),
      }
    });
  } catch(err) { serverError(res, err, "cash/summary GET"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// OPERADOR — CLIENTES
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/ai/operator/clients — crear cliente ────────────────────────────
router.post("/operator/clients", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Requeridos: name, email, password" });

    // Verificar que el email no exista
    const emailCheck = await db.query(`SELECT id FROM users WHERE email=$1 LIMIT 1`, [email]);
    if (emailCheck.rows[0]) return res.status(409).json({ error: `El email ${email} ya está registrado` });

    // Obtener próximo client_number
    const maxQ = await db.query(`SELECT MAX(client_number) AS max FROM users`);
    const nextNumber = Number(maxQ.rows[0].max || 0) + 1;

    // Hash del password
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 10);

    const ins = await db.query(
      `INSERT INTO users (client_number, name, email, password_hash, role, active)
       VALUES ($1,$2,$3,$4,'client',true) RETURNING id, client_number, name, email`,
      [nextNumber, name, email, hash]
    );

    console.log(`[AI WRITE] Cliente creado: #${nextNumber} ${name}`);
    res.status(201).json({ ok: true, client: ins.rows[0] });
  } catch(err) { serverError(res, err, "operator/clients POST"); }
});

// ── PATCH /api/ai/operator/clients/:clientNumber — editar cliente ─────────────
router.patch("/operator/clients/:clientNumber", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    const { name, email, active } = req.body;

    const uq = await db.query(`SELECT id FROM users WHERE client_number=$1 LIMIT 1`, [clientNumber]);
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${clientNumber} no encontrado` });

    const q = await db.query(
      `UPDATE users SET
        name   = COALESCE($1, name),
        email  = COALESCE($2, email),
        active = COALESCE($3, active)
       WHERE client_number=$4 RETURNING client_number, name, email, active`,
      [name||null, email||null, active !== undefined ? active : null, clientNumber]
    );
    console.log(`[AI WRITE] Cliente #${clientNumber} actualizado`);
    res.json({ ok: true, client: q.rows[0] });
  } catch(err) { serverError(res, err, "operator/clients/:clientNumber PATCH"); }
});

// ── PUT /api/ai/operator/clients/:clientNumber/rates — tarifas del cliente ───
router.put("/operator/clients/:clientNumber/rates", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    const { usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal } = req.body;

    const uq = await db.query(`SELECT id FROM users WHERE client_number=$1 LIMIT 1`, [clientNumber]);
    if (!uq.rows[0]) return res.status(404).json({ error: `Cliente #${clientNumber} no encontrado` });

    await db.query(
      `INSERT INTO client_rates (user_id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         usa_normal        = COALESCE($2, client_rates.usa_normal),
         usa_express       = COALESCE($3, client_rates.usa_express),
         usa_tech_premium  = COALESCE($4, client_rates.usa_tech_premium),
         china_normal      = COALESCE($5, client_rates.china_normal),
         china_express     = COALESCE($6, client_rates.china_express),
         europa_normal     = COALESCE($7, client_rates.europa_normal),
         updated_at        = NOW()`,
      [uq.rows[0].id, usa_normal||null, usa_express||null, usa_tech_premium||null,
       china_normal||null, china_express||null, europa_normal||null]
    );
    console.log(`[AI WRITE] Tarifas actualizadas para cliente #${clientNumber}`);
    res.json({ ok: true, message: `Tarifas del cliente #${clientNumber} actualizadas` });
  } catch(err) { serverError(res, err, "operator/clients/:clientNumber/rates PUT"); }
});

// ── PUT /api/ai/operator/costs — costos reales del operador ──────────────────
router.put("/operator/costs", async (req, res) => {
  try {
    const { usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal } = req.body;
    await db.query(
      `INSERT INTO operator_costs (id, usa_normal, usa_express, usa_tech_premium, china_normal, china_express, europa_normal)
       VALUES (1,$1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET
         usa_normal        = COALESCE($1, operator_costs.usa_normal),
         usa_express       = COALESCE($2, operator_costs.usa_express),
         usa_tech_premium  = COALESCE($3, operator_costs.usa_tech_premium),
         china_normal      = COALESCE($4, operator_costs.china_normal),
         china_express     = COALESCE($5, operator_costs.china_express),
         europa_normal     = COALESCE($6, operator_costs.europa_normal),
         updated_at        = NOW()`,
      [usa_normal||null, usa_express||null, usa_tech_premium||null,
       china_normal||null, china_express||null, europa_normal||null]
    );
    console.log(`[AI WRITE] Costos del operador actualizados`);
    res.json({ ok: true, message: "Costos actualizados" });
  } catch(err) { serverError(res, err, "operator/costs PUT"); }
});

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES LIMÓN
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/ai/notifications — listar todas ─────────────────────────────────
router.get("/notifications", async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM lemon_notifications ORDER BY created_at DESC`);
    res.json({ notifications: q.rows, total: q.rows.length });
  } catch(err) { serverError(res, err, "notifications GET"); }
});

// ── POST /api/ai/notifications — crear notificación ──────────────────────────
router.post("/notifications", async (req, res) => {
  try {
    const { message, emoji, type, target_role } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Requerido: message" });

    // Desactivar anteriores del mismo target
    await db.query(
      `UPDATE lemon_notifications SET active=FALSE WHERE target_role=$1 OR target_role='all'`,
      [target_role || "all"]
    );

    const ins = await db.query(
      `INSERT INTO lemon_notifications (message, emoji, type, target_role, active)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [message.trim(), emoji||"🍋", type||"info", target_role||"all"]
    );
    console.log(`[AI WRITE] Notificación creada: ${message.substring(0,50)}`);
    res.status(201).json({ ok: true, notification: ins.rows[0] });
  } catch(err) { serverError(res, err, "notifications POST"); }
});

// ── PATCH /api/ai/notifications/:id — editar / activar / desactivar ──────────
router.patch("/notifications/:id", async (req, res) => {
  try {
    const { message, emoji, type, active, target_role } = req.body;
    const q = await db.query(
      `UPDATE lemon_notifications SET
        message     = COALESCE($1, message),
        emoji       = COALESCE($2, emoji),
        type        = COALESCE($3, type),
        active      = COALESCE($4, active),
        target_role = COALESCE($5, target_role),
        updated_at  = NOW()
       WHERE id=$6 RETURNING *`,
      [message||null, emoji||null, type||null,
       active !== undefined ? active : null,
       target_role||null, req.params.id]
    );
    if (!q.rows[0]) return res.status(404).json({ error: "Notificación no encontrada" });
    res.json({ ok: true, notification: q.rows[0] });
  } catch(err) { serverError(res, err, "notifications/:id PATCH"); }
});


// ── PATCH /api/ai/operator/clients/:clientNumber/phone — guardar teléfono ────
router.patch("/operator/clients/:clientNumber/phone", async (req, res) => {
  try {
    const clientNumber = parseInt(req.params.clientNumber);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Requerido: phone" });

    // Agregar columna si no existe
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`).catch(() => {});

    const q = await db.query(
      `UPDATE users SET phone=$1 WHERE client_number=$2 RETURNING client_number, name, phone`,
      [phone, clientNumber]
    );
    if (!q.rows[0]) return res.status(404).json({ error: `Cliente #${clientNumber} no encontrado` });

    console.log(`[AI WRITE] Teléfono actualizado: cliente #${clientNumber} → ${phone}`);
    res.json({ ok: true, client: q.rows[0] });
  } catch(err) { serverError(res, err, "operator/clients/:clientNumber/phone PATCH"); }
});

module.exports = router;