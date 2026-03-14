// server/routes/external.js
// Módulo de Cargas Externas — Cajas, Ítems, Clientes Externos, Cierres
const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { authRequired, requireRole } = require("../auth");

const STAFF = ["operator", "admin"];
const COMISION_PER_KG = 2; // USD por kg de cliente externo

// ══════════════════════════════════════════════════════════════════
// MIGRACIÓN — crear tablas si no existen
// ══════════════════════════════════════════════════════════════════
async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_clients (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      notes       TEXT,
      active      BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_boxes (
      id            SERIAL PRIMARY KEY,
      box_number    TEXT NOT NULL,
      date_received DATE NOT NULL,
      origin        TEXT NOT NULL DEFAULT 'USA',  -- USA | CHINA | EUROPA
      service       TEXT NOT NULL DEFAULT 'NORMAL', -- NORMAL | EXPRESS
      total_kg      NUMERIC(10,2),
      notes         TEXT,
      cierre_id     INTEGER,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_items (
      id            SERIAL PRIMARY KEY,
      box_id        INTEGER NOT NULL REFERENCES ext_boxes(id) ON DELETE CASCADE,
      client_name   TEXT NOT NULL,
      tracking      TEXT,
      weight_kg     NUMERIC(10,3) NOT NULL,
      status        TEXT NOT NULL DEFAULT 'EN DEPOSITO', -- EN DEPOSITO | ENTREGADO
      tariff_per_kg NUMERIC(10,2) DEFAULT 2,
      is_commission BOOLEAN DEFAULT TRUE, -- TRUE = genera comision $2/kg
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_cierres (
      id            SERIAL PRIMARY KEY,
      label         TEXT NOT NULL,       -- ej: "CIERRE 10/03"
      date_from     DATE,
      date_to       DATE,
      status        TEXT DEFAULT 'open', -- open | closed
      total_cargas  NUMERIC(10,2) DEFAULT 0,
      total_commission NUMERIC(10,2) DEFAULT 0,
      total_deductions NUMERIC(10,2) DEFAULT 0,
      total_final   NUMERIC(10,2) DEFAULT 0,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_cierre_deductions (
      id          SERIAL PRIMARY KEY,
      cierre_id   INTEGER NOT NULL REFERENCES ext_cierres(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount      NUMERIC(10,2) NOT NULL, -- negativo = descuento, positivo = adicional
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ext_additional_notes (
      id          SERIAL PRIMARY KEY,
      cierre_id   INTEGER REFERENCES ext_cierres(id),
      date_ref    DATE,
      client_name TEXT,
      codes       TEXT,
      content     TEXT,
      qty         INTEGER DEFAULT 0,
      weight_kg   NUMERIC(10,3),
      tariff      NUMERIC(10,2) DEFAULT 8,
      value       NUMERIC(10,2),
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

migrate().catch(e => console.error("[EXT MIGRATE]", e));

// ══════════════════════════════════════════════════════════════════
// CLIENTES EXTERNOS
// ══════════════════════════════════════════════════════════════════

// GET /external/clients
router.get("/clients", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM ext_clients ORDER BY name`);
    res.json({ clients: q.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /external/clients
router.post("/clients", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nombre requerido" });
    const q = await db.query(
      `INSERT INTO ext_clients (name, notes) VALUES ($1,$2)
       ON CONFLICT (name) DO UPDATE SET notes=EXCLUDED.notes, active=TRUE
       RETURNING *`,
      [name.trim().toUpperCase(), notes || null]
    );
    res.json({ client: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /external/clients/:id
router.delete("/clients/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    await db.query(`UPDATE ext_clients SET active=FALSE WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CAJAS
// ══════════════════════════════════════════════════════════════════

// GET /external/boxes
router.get("/boxes", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { cierre_id, origin } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (cierre_id) { params.push(cierre_id); where += ` AND b.cierre_id=$${params.length}`; }
    if (origin)    { params.push(origin);    where += ` AND b.origin=$${params.length}`; }

    const q = await db.query(`
      SELECT b.*,
        COALESCE(
          (SELECT SUM(weight_kg) FROM ext_items WHERE box_id=b.id), 0
        ) AS items_kg,
        COALESCE(
          (SELECT COUNT(*) FROM ext_items WHERE box_id=b.id), 0
        ) AS items_count,
        COALESCE(
          (SELECT SUM(weight_kg) FROM ext_items WHERE box_id=b.id AND is_commission=TRUE), 0
        ) AS commission_kg
      FROM ext_boxes b
      ${where}
      ORDER BY b.date_received DESC, b.box_number
    `, params);
    res.json({ boxes: q.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /external/boxes/:id — caja + ítems
router.get("/boxes/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const bq = await db.query(`SELECT * FROM ext_boxes WHERE id=$1`, [req.params.id]);
    if (!bq.rows[0]) return res.status(404).json({ error: "Caja no encontrada" });
    const iq = await db.query(
      `SELECT * FROM ext_items WHERE box_id=$1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ box: bq.rows[0], items: iq.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /external/boxes
router.post("/boxes", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { box_number, date_received, origin, service, total_kg, notes } = req.body;
    if (!box_number || !date_received) return res.status(400).json({ error: "Número y fecha requeridos" });
    const q = await db.query(`
      INSERT INTO ext_boxes (box_number, date_received, origin, service, total_kg, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [
      box_number.trim().toUpperCase(),
      date_received,
      (origin || "USA").toUpperCase(),
      (service || "NORMAL").toUpperCase(),
      total_kg || null,
      notes || null,
    ]);
    res.json({ box: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /external/boxes/:id
router.patch("/boxes/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { box_number, date_received, origin, service, total_kg, notes, cierre_id } = req.body;
    const q = await db.query(`
      UPDATE ext_boxes SET
        box_number   = COALESCE($1, box_number),
        date_received= COALESCE($2, date_received),
        origin       = COALESCE($3, origin),
        service      = COALESCE($4, service),
        total_kg     = COALESCE($5, total_kg),
        notes        = COALESCE($6, notes),
        cierre_id    = COALESCE($7, cierre_id),
        updated_at   = NOW()
      WHERE id=$8 RETURNING *
    `, [box_number||null, date_received||null, origin||null, service||null,
        total_kg||null, notes||null, cierre_id||null, req.params.id]);
    res.json({ box: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /external/boxes/:id
router.delete("/boxes/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    await db.query(`DELETE FROM ext_boxes WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// ÍTEMS DE CAJA
// ══════════════════════════════════════════════════════════════════

// POST /external/boxes/:boxId/items
router.post("/boxes/:boxId/items", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { client_name, tracking, weight_kg, status, tariff_per_kg, is_commission, notes } = req.body;
    if (!client_name || !weight_kg) return res.status(400).json({ error: "Cliente y peso requeridos" });
    const q = await db.query(`
      INSERT INTO ext_items
        (box_id, client_name, tracking, weight_kg, status, tariff_per_kg, is_commission, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [
      req.params.boxId,
      client_name.trim().toUpperCase(),
      tracking?.trim() || null,
      weight_kg,
      status || "EN DEPOSITO",
      tariff_per_kg ?? COMISION_PER_KG,
      is_commission !== false,
      notes || null,
    ]);
    res.json({ item: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /external/items/:id
router.patch("/items/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { client_name, tracking, weight_kg, status, tariff_per_kg, is_commission, notes } = req.body;
    const q = await db.query(`
      UPDATE ext_items SET
        client_name   = COALESCE($1, client_name),
        tracking      = COALESCE($2, tracking),
        weight_kg     = COALESCE($3, weight_kg),
        status        = COALESCE($4, status),
        tariff_per_kg = COALESCE($5, tariff_per_kg),
        is_commission = COALESCE($6, is_commission),
        notes         = COALESCE($7, notes),
        updated_at    = NOW()
      WHERE id=$8 RETURNING *
    `, [client_name||null, tracking||null, weight_kg||null, status||null,
        tariff_per_kg||null, is_commission??null, notes||null, req.params.id]);
    res.json({ item: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /external/items/:id
router.delete("/items/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    await db.query(`DELETE FROM ext_items WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// NOTAS ADICIONALES
// ══════════════════════════════════════════════════════════════════

// GET /external/notes
router.get("/notes", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { cierre_id } = req.query;
    const q = cierre_id
      ? await db.query(`SELECT * FROM ext_additional_notes WHERE cierre_id=$1 ORDER BY id`, [cierre_id])
      : await db.query(`SELECT * FROM ext_additional_notes ORDER BY created_at DESC`);
    res.json({ notes: q.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /external/notes
router.post("/notes", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { cierre_id, date_ref, client_name, codes, content, qty, weight_kg, tariff, value, notes } = req.body;
    const calcValue = value ?? (weight_kg && tariff ? Number(weight_kg) * Number(tariff) : 0);
    const q = await db.query(`
      INSERT INTO ext_additional_notes
        (cierre_id, date_ref, client_name, codes, content, qty, weight_kg, tariff, value, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [cierre_id||null, date_ref||null, client_name||null, codes||null,
        content||null, qty||0, weight_kg||null, tariff||8, calcValue, notes||null]);
    res.json({ note: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /external/notes/:id
router.patch("/notes/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { client_name, content, qty, weight_kg, tariff, value, notes, cierre_id } = req.body;
    const calcValue = value ?? (weight_kg && tariff ? Number(weight_kg) * Number(tariff) : null);
    const q = await db.query(`
      UPDATE ext_additional_notes SET
        client_name = COALESCE($1, client_name),
        content     = COALESCE($2, content),
        qty         = COALESCE($3, qty),
        weight_kg   = COALESCE($4, weight_kg),
        tariff      = COALESCE($5, tariff),
        value       = COALESCE($6, value),
        notes       = COALESCE($7, notes),
        cierre_id   = COALESCE($8, cierre_id)
      WHERE id=$9 RETURNING *
    `, [client_name||null, content||null, qty||null, weight_kg||null,
        tariff||null, calcValue, notes||null, cierre_id||null, req.params.id]);
    res.json({ note: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /external/notes/:id
router.delete("/notes/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    await db.query(`DELETE FROM ext_additional_notes WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CIERRES
// ══════════════════════════════════════════════════════════════════

// GET /external/cierres
router.get("/cierres", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const q = await db.query(`SELECT * FROM ext_cierres ORDER BY created_at DESC`);
    res.json({ cierres: q.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /external/cierres/:id — cierre completo con envíos Lemons + notas + descuentos
router.get("/cierres/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const cq = await db.query(`SELECT * FROM ext_cierres WHERE id=$1`, [req.params.id]);
    if (!cq.rows[0]) return res.status(404).json({ error: "Cierre no encontrado" });
    const cierre = cq.rows[0];

    // Costos del operador (lo que vos pagás a la central por kg)
    const costsQ = await db.query(`
      SELECT usa_normal, china_normal, europa_normal
      FROM operator_costs LIMIT 1
    `);
    const costs = costsQ.rows[0] || { usa_normal: 45, china_normal: 58, europa_normal: 58 };

    // Envíos Lemons NORMAL de USA/CHINA/EUROPA dentro del período del cierre
    // Si el cierre no tiene fechas, toma todos los no asignados a otro cierre
    let shipmentsQ;
    if (cierre.date_from && cierre.date_to) {
      shipmentsQ = await db.query(`
        SELECT s.id, s.code, s.origin, s.service, s.weight_kg,
               s.estimated_usd, s.date_in, s.status,
               u.name AS client_name, u.client_number
        FROM shipments s
        JOIN users u ON u.id = s.user_id
        WHERE s.service = 'NORMAL'
          AND s.origin IN ('USA','CHINA','EUROPA')
          AND s.date_in >= $1::date
          AND s.date_in <= $2::date
        ORDER BY s.origin, s.date_in
      `, [cierre.date_from, cierre.date_to]);
    } else {
      shipmentsQ = await db.query(`
        SELECT s.id, s.code, s.origin, s.service, s.weight_kg,
               s.estimated_usd, s.date_in, s.status,
               u.name AS client_name, u.client_number
        FROM shipments s
        JOIN users u ON u.id = s.user_id
        WHERE s.service = 'NORMAL'
          AND s.origin IN ('USA','CHINA','EUROPA')
        ORDER BY s.origin, s.date_in
      `);
    }

    // Calcular costo de cada envío según tarifas del operador
    const shipments = shipmentsQ.rows.map(s => {
      const kg   = Number(s.weight_kg || 0);
      const billable = Math.max(kg, 1);
      let costPerKg = 0;
      if (s.origin === 'USA')    costPerKg = Number(costs.usa_normal    || 0);
      if (s.origin === 'CHINA')  costPerKg = Number(costs.china_normal  || 0);
      if (s.origin === 'EUROPA') costPerKg = Number(costs.europa_normal || 0);
      const cost = Number((billable * costPerKg).toFixed(2));
      return { ...s, cost_per_kg: costPerKg, cost };
    });

    // Agrupar envíos por ORIGEN - FECHA para mostrar como el sheet
    const grouped = {};
    shipments.forEach(s => {
      const dateStr = s.date_in ? new Date(s.date_in).toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit'}) : '-';
      const key = `${s.origin}_${dateStr}`;
      const label = `CARGAS ${s.origin} - CENTRAL LOGISTICS  ${dateStr}`;
      if (!grouped[key]) grouped[key] = { key, label, origin: s.origin, date: dateStr, shipments: [], subtotal: 0 };
      grouped[key].shipments.push(s);
      grouped[key].subtotal = Number((grouped[key].subtotal + s.cost).toFixed(2));
    });

    // Cajas externas asociadas a este cierre
    const bq = await db.query(`
      SELECT b.*,
        COALESCE((SELECT SUM(i.weight_kg) FROM ext_items i WHERE i.box_id=b.id AND i.is_commission=TRUE), 0) AS commission_kg
      FROM ext_boxes b WHERE b.cierre_id=$1
      ORDER BY b.date_received, b.box_number
    `, [req.params.id]);

    // Ítems de cajas (para comisión)
    const iq = await db.query(`
      SELECT i.*
      FROM ext_items i
      JOIN ext_boxes b ON b.id=i.box_id
      WHERE b.cierre_id=$1 AND i.is_commission=TRUE
    `, [req.params.id]);

    // Notas adicionales
    const nq = await db.query(
      `SELECT * FROM ext_additional_notes WHERE cierre_id=$1 ORDER BY id`,
      [req.params.id]
    );

    // Descuentos/adicionales manuales
    const dq = await db.query(
      `SELECT * FROM ext_cierre_deductions WHERE cierre_id=$1 ORDER BY id`,
      [req.params.id]
    );

    // Totales
    const totalCargas     = shipments.reduce((s, sh) => s + sh.cost, 0);
    const totalNotes      = nq.rows.reduce((s, n) => s + Number(n.value || 0), 0);
    const totalCommission = iq.rows.reduce((s, i) => s + Number(i.weight_kg || 0) * COMISION_PER_KG, 0);
    const totalDeductions = dq.rows.reduce((s, d) => s + Number(d.amount || 0), 0);
    const totalFinal      = totalCargas + totalNotes - totalCommission + totalDeductions;

    res.json({
      cierre,
      costs,
      shipments,
      grouped: Object.values(grouped).sort((a,b) => a.origin.localeCompare(b.origin)),
      boxes:   bq.rows,
      notes:   nq.rows,
      deductions: dq.rows,
      summary: {
        total_cargas:     Number(totalCargas.toFixed(2)),
        total_notes:      Number(totalNotes.toFixed(2)),
        total_commission: Number(totalCommission.toFixed(2)),
        total_deductions: Number(totalDeductions.toFixed(2)),
        total_final:      Number(totalFinal.toFixed(2)),
      }
    });
  } catch(e) {
    console.error("[CIERRE GET]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /external/cierres
router.post("/cierres", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { label, date_from, date_to, notes } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: "Label requerido" });
    const q = await db.query(`
      INSERT INTO ext_cierres (label, date_from, date_to, notes)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [label.trim(), date_from||null, date_to||null, notes||null]);
    res.json({ cierre: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /external/cierres/:id — actualizar estado o recalcular totales
router.patch("/cierres/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { label, date_from, date_to, status, notes } = req.body;
    // Normalizar: string vacío → null para fechas
    const normDate = v => (v === "" || v == null) ? null : v;
    const q = await db.query(`
      UPDATE ext_cierres SET
        label     = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE label END,
        date_from = CASE WHEN $7::boolean THEN $2::date ELSE date_from END,
        date_to   = CASE WHEN $8::boolean THEN $3::date ELSE date_to END,
        status    = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE status END,
        notes     = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE notes END,
        updated_at= NOW()
      WHERE id=$6 RETURNING *
    `, [
      label||null,
      normDate(date_from),
      normDate(date_to),
      status||null,
      notes||null,
      req.params.id,
      date_from !== undefined,  // $7: ¿vino date_from en el body?
      date_to   !== undefined,  // $8: ¿vino date_to en el body?
    ]);
    res.json({ cierre: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /external/cierres/:id/deductions — agregar descuento/adicional
router.post("/cierres/:id/deductions", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { description, amount } = req.body;
    if (!description || amount == null) return res.status(400).json({ error: "Descripción y monto requeridos" });
    const q = await db.query(`
      INSERT INTO ext_cierre_deductions (cierre_id, description, amount)
      VALUES ($1,$2,$3) RETURNING *
    `, [req.params.id, description, amount]);
    res.json({ deduction: q.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /external/cierres/deductions/:id
router.delete("/deductions/:id", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    await db.query(`DELETE FROM ext_cierre_deductions WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Asignar cajas a un cierre ──────────────────────────────────
// POST /external/cierres/:id/assign-boxes
router.post("/cierres/:id/assign-boxes", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const { box_ids } = req.body; // array de IDs
    if (!Array.isArray(box_ids) || !box_ids.length)
      return res.status(400).json({ error: "box_ids requerido" });
    await db.query(
      `UPDATE ext_boxes SET cierre_id=$1 WHERE id=ANY($2::int[])`,
      [req.params.id, box_ids]
    );
    res.json({ ok: true, assigned: box_ids.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard summary de cargas externas ──────────────────────
// GET /external/summary
router.get("/summary", authRequired, requireRole(STAFF), async (req, res) => {
  try {
    const boxesQ = await db.query(`SELECT COUNT(*) AS total FROM ext_boxes`);
    const itemsQ = await db.query(`
      SELECT
        COUNT(*)                                           AS total_items,
        SUM(weight_kg)                                     AS total_kg,
        SUM(CASE WHEN status='EN DEPOSITO' THEN 1 ELSE 0 END) AS in_deposit,
        SUM(CASE WHEN status='ENTREGADO'   THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN is_commission=TRUE THEN weight_kg*tariff_per_kg ELSE 0 END) AS commission_earned
      FROM ext_items
    `);
    const cierresQ = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_count
      FROM ext_cierres
    `);
    res.json({
      boxes:    Number(boxesQ.rows[0].total),
      items:    itemsQ.rows[0],
      cierres:  cierresQ.rows[0],
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;