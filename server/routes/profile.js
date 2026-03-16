// server/routes/profile.js — Sistema de perfiles con Lemon Coins
"use strict";
const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { authRequired } = require("../auth");

// ── Auto-migración ────────────────────────────────────────────────────────────
async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS profile_items (
      id          SERIAL PRIMARY KEY,
      key         TEXT UNIQUE NOT NULL,
      type        TEXT NOT NULL,  -- avatar | frame | title | badge
      name        TEXT NOT NULL,
      description TEXT,
      emoji       TEXT,
      data        JSONB DEFAULT '{}',
      cost_coins  INTEGER NOT NULL DEFAULT 0,
      rarity      TEXT DEFAULT 'common', -- common | rare | epic | legendary
      active      BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id       INTEGER PRIMARY KEY REFERENCES users(id),
      avatar_key    TEXT DEFAULT 'default',
      frame_key     TEXT DEFAULT NULL,
      title_key     TEXT DEFAULT NULL,
      badges        TEXT[] DEFAULT '{}',
      bio           TEXT DEFAULT NULL,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_items (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id),
      item_key    TEXT NOT NULL,
      acquired_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, item_key)
    )
  `);
  // Seed items si no hay
  const cnt = await db.query(`SELECT COUNT(*) FROM profile_items`);
  if (Number(cnt.rows[0].count) === 0) {
    await db.query(`
      INSERT INTO profile_items (key, type, name, description, emoji, cost_coins, rarity, data) VALUES
      -- Avatares
      ('avatar_lemon',    'avatar', 'Limón Dorado',    'El clásico de Lemon''s',           '🍋', 0,    'common',    '{"bg":"#f5e03a","emoji":"🍋"}'),
      ('avatar_rocket',   'avatar', 'Rocketero',       'Para los que van rápido',           '🚀', 200,  'common',    '{"bg":"#3b82f6","emoji":"🚀"}'),
      ('avatar_globe',    'avatar', 'Viajero Global',  'Conectado al mundo',                '🌍', 300,  'common',    '{"bg":"#22c55e","emoji":"🌍"}'),
      ('avatar_diamond',  'avatar', 'Diamante',        'Importador de lujo',                '💎', 800,  'rare',      '{"bg":"#a78bfa","emoji":"💎"}'),
      ('avatar_fire',     'avatar', 'On Fire',         'Siempre activo',                    '🔥', 500,  'rare',      '{"bg":"#ff6200","emoji":"🔥"}'),
      ('avatar_crown',    'avatar', 'La Corona',       'Para los reyes del comercio',       '👑', 2000, 'epic',      '{"bg":"#f5e03a","emoji":"👑"}'),
      ('avatar_lemon_fly','avatar', 'Limón Volador',   'Edición especial Lemon''s',         '🍋', 5000, 'legendary', '{"bg":"linear-gradient(135deg,#f5e03a,#ff6200)","emoji":"🍋✈️"}'),
      -- Marcos
      ('frame_gold',      'frame',  'Marco Dorado',    'Un clásico elegante',               '⭐', 400,  'rare',      '{"border":"2px solid #f5e03a","shadow":"0 0 12px rgba(245,224,58,.5)"}'),
      ('frame_fire',      'frame',  'Marco Llamas',    'Ardiente y poderoso',               '🔥', 600,  'rare',      '{"border":"2px solid #ff6200","shadow":"0 0 14px rgba(255,98,0,.6)"}'),
      ('frame_rainbow',   'frame',  'Marco Arcoíris',  'Edición colorida',                  '🌈', 1200, 'epic',      '{"border":"2px solid transparent","gradient":"linear-gradient(45deg,#f5e03a,#ff6200,#a78bfa,#22c55e)"}'),
      ('frame_diamond',   'frame',  'Marco Diamante',  'Solo para los mejores',             '💎', 3000, 'legendary', '{"border":"2px solid #a78bfa","shadow":"0 0 20px rgba(167,139,250,.7)","pulse":true}'),
      -- Títulos
      ('title_importer',  'title',  'Importador Pro',  'Para los que ya tienen experiencia','📦', 300,  'common',    '{"color":"#ede9e0"}'),
      ('title_fast',      'title',  'Velocista',       'Siempre en Express',                '⚡', 500,  'rare',      '{"color":"#f5e03a"}'),
      ('title_global',    'title',  'Global Trader',   'Compra en todo el mundo',           '🌍', 800,  'rare',      '{"color":"#60a5fa"}'),
      ('title_legend',    'title',  'Leyenda Lemon''s','El título más exclusivo',           '🏆', 4000, 'legendary', '{"color":"#f5e03a","gradient":true}'),
      -- Insignias
      ('badge_first',     'badge',  'Primer Envío',    'Completaste tu primer envío',       '🎯', 0,    'common',    '{"color":"#f5e03a"}'),
      ('badge_x10',       'badge',  '10 Envíos',       'Importador frecuente',              '📦', 0,    'rare',      '{"color":"#22c55e"}'),
      ('badge_whale',     'badge',  'Ballena',         'Más de USD 5000 importados',        '🐋', 0,    'epic',      '{"color":"#3b82f6"}'),
      ('badge_loyal',     'badge',  'Cliente Leal',    'Más de 1 año con Lemon''s',         '💛', 0,    'rare',      '{"color":"#f5e03a"}'),
      ('badge_express',   'badge',  'Experto Express', '5 envíos Express completados',      '⚡', 150,  'common',    '{"color":"#f5e03a"}')
      ON CONFLICT (key) DO NOTHING
    `);
  }
}
migrate().catch(e => console.error("[PROFILE MIGRATE]", e));

// ── GET /profile — perfil del usuario actual ──────────────────────────────────
router.get("/", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;

    // Crear perfil si no existe
    await db.query(`
      INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING
    `, [userId]);

    const [profileQ, coinsQ, userQ, itemsQ, statsQ] = await Promise.all([
      db.query(`SELECT * FROM user_profiles WHERE user_id=$1`, [userId]),
      db.query(`SELECT balance, total_earned FROM lemon_coins WHERE user_id=$1`, [userId]),
      db.query(`SELECT id, name, email, client_number, role, created_at FROM users WHERE id=$1`, [userId]),
      db.query(`SELECT item_key FROM user_items WHERE user_id=$1`, [userId]),
      db.query(`
        SELECT
          COUNT(*) AS total_shipments,
          COUNT(*) FILTER (WHERE status='Entregado') AS delivered,
          COALESCE(SUM(estimated_usd) FILTER (WHERE status='Entregado'), 0) AS total_usd
        FROM shipments WHERE user_id=$1
      `, [userId]),
    ]);

    const profile = profileQ.rows[0];
    const coins   = coinsQ.rows[0] || { balance: 0, total_earned: 0 };
    const user    = userQ.rows[0];
    const items   = itemsQ.rows.map(r => r.item_key);
    const stats   = statsQ.rows[0];

    // Calcular nivel
    const balance = Number(coins.balance);
    const level   = balance >= 1500 ? "gold" : balance >= 500 ? "silver" : "bronze";

    // Calcular insignias automáticas
    const autoBadges = [];
    if (Number(stats.delivered) >= 1)  autoBadges.push("badge_first");
    if (Number(stats.delivered) >= 10) autoBadges.push("badge_x10");
    if (Number(stats.total_usd) >= 5000) autoBadges.push("badge_whale");

    // Agregar insignias automáticas al usuario si no las tiene
    for (const badge of autoBadges) {
      await db.query(`
        INSERT INTO user_items (user_id, item_key) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [userId, badge]);
    }

    const allItems = [...new Set([...items, ...autoBadges])];

    res.json({
      user:    { ...user, level },
      profile: { ...profile, owned_items: allItems },
      coins:   { balance, total_earned: Number(coins.total_earned) },
      stats:   {
        total_shipments: Number(stats.total_shipments),
        delivered:       Number(stats.delivered),
        total_usd:       Number(stats.total_usd),
      },
    });
  } catch(e) { console.error("[PROFILE GET]", e); res.status(500).json({ error: e.message }); }
});

// ── GET /profile/shop — catálogo de items ─────────────────────────────────────
router.get("/shop", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const [itemsQ, ownedQ] = await Promise.all([
      db.query(`SELECT * FROM profile_items WHERE active=true ORDER BY cost_coins ASC`),
      db.query(`SELECT item_key FROM user_items WHERE user_id=$1`, [userId]),
    ]);
    const owned = ownedQ.rows.map(r => r.item_key);
    res.json({
      items: itemsQ.rows.map(i => ({ ...i, owned: owned.includes(i.key) })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /profile/buy — comprar item con coins ────────────────────────────────
router.post("/buy", authRequired, async (req, res) => {
  try {
    const userId  = req.user.id;
    const { item_key } = req.body;
    if (!item_key) return res.status(400).json({ error: "item_key requerido" });

    // Verificar item
    const itemQ = await db.query(`SELECT * FROM profile_items WHERE key=$1 AND active=true`, [item_key]);
    if (!itemQ.rows[0]) return res.status(404).json({ error: "Item no encontrado" });
    const item = itemQ.rows[0];

    // Verificar que no lo tenga ya
    const ownedQ = await db.query(`SELECT id FROM user_items WHERE user_id=$1 AND item_key=$2`, [userId, item_key]);
    if (ownedQ.rows[0]) return res.status(400).json({ error: "Ya tenés este item" });

    // Verificar coins
    if (item.cost_coins > 0) {
      await db.query(`INSERT INTO lemon_coins (user_id,balance,total_earned) VALUES ($1,0,0) ON CONFLICT (user_id) DO NOTHING`, [userId]);
      const coinsQ = await db.query(`SELECT balance FROM lemon_coins WHERE user_id=$1`, [userId]);
      const balance = Number(coinsQ.rows[0]?.balance || 0);
      if (balance < item.cost_coins) {
        return res.status(400).json({ error: `Coins insuficientes. Tenés ${balance}, necesitás ${item.cost_coins}` });
      }
      // Descontar coins
      await db.query(`UPDATE lemon_coins SET balance=balance-$1, updated_at=NOW() WHERE user_id=$2`, [item.cost_coins, userId]);
      await db.query(`INSERT INTO coin_transactions (user_id,type,amount,reason) VALUES ($1,'redeem',$2,$3)`,
        [userId, -item.cost_coins, `Compra de perfil: ${item.name}`]);
    }

    // Dar item
    await db.query(`INSERT INTO user_items (user_id, item_key) VALUES ($1, $2)`, [userId, item_key]);

    const newBalance = item.cost_coins > 0
      ? (await db.query(`SELECT balance FROM lemon_coins WHERE user_id=$1`, [userId])).rows[0]?.balance
      : null;

    res.json({ ok: true, item, new_balance: newBalance ? Number(newBalance) : null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /profile — actualizar perfil activo ─────────────────────────────────
router.patch("/", authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatar_key, frame_key, title_key, badges, bio } = req.body;

    // Verificar que el usuario tiene los items que quiere equipar
    async function hasItem(key) {
      if (!key) return true;
      const q = await db.query(`SELECT id FROM user_items WHERE user_id=$1 AND item_key=$2`, [userId, key]);
      return !!q.rows[0];
    }

    if (avatar_key && !(await hasItem(avatar_key))) return res.status(403).json({ error: "No tenés ese avatar" });
    if (frame_key  && !(await hasItem(frame_key)))  return res.status(403).json({ error: "No tenés ese marco" });
    if (title_key  && !(await hasItem(title_key)))  return res.status(403).json({ error: "No tenés ese título" });

    await db.query(`
      INSERT INTO user_profiles (user_id, avatar_key, frame_key, title_key, badges, bio, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        avatar_key = COALESCE($2, user_profiles.avatar_key),
        frame_key  = $3,
        title_key  = $4,
        badges     = COALESCE($5, user_profiles.badges),
        bio        = COALESCE($6, user_profiles.bio),
        updated_at = NOW()
    `, [userId, avatar_key||null, frame_key||null, title_key||null,
        badges ? `{${badges.join(",")}}` : null, bio||null]);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /profile/:id — ver perfil de otro usuario (solo staff) ───────────────
router.get("/:id", authRequired, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const targetId    = parseInt(req.params.id);

    // Solo staff puede ver perfiles ajenos
    const requesterQ = await db.query(`SELECT role FROM users WHERE id=$1`, [requesterId]);
    const role = requesterQ.rows[0]?.role;
    if (requesterId !== targetId && role !== "operator" && role !== "admin") {
      return res.status(403).json({ error: "Sin permiso" });
    }

    await db.query(`INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [targetId]);

    const [profileQ, coinsQ, userQ, itemsQ, statsQ] = await Promise.all([
      db.query(`SELECT * FROM user_profiles WHERE user_id=$1`, [targetId]),
      db.query(`SELECT balance, total_earned FROM lemon_coins WHERE user_id=$1`, [targetId]),
      db.query(`SELECT id, name, email, client_number, role, created_at FROM users WHERE id=$1`, [targetId]),
      db.query(`SELECT item_key FROM user_items WHERE user_id=$1`, [targetId]),
      db.query(`SELECT COUNT(*) AS total_shipments, COUNT(*) FILTER (WHERE status='Entregado') AS delivered, COALESCE(SUM(estimated_usd) FILTER (WHERE status='Entregado'),0) AS total_usd FROM shipments WHERE user_id=$1`, [targetId]),
    ]);

    if (!userQ.rows[0]) return res.status(404).json({ error: "Usuario no encontrado" });

    const coins  = coinsQ.rows[0] || { balance:0, total_earned:0 };
    const stats  = statsQ.rows[0];
    const balance = Number(coins.balance);
    const level   = balance >= 1500 ? "gold" : balance >= 500 ? "silver" : "bronze";
    const items   = itemsQ.rows.map(r => r.item_key);

    // Auto-badges
    const autoBadges = [];
    if (Number(stats.delivered) >= 1)    autoBadges.push("badge_first");
    if (Number(stats.delivered) >= 10)   autoBadges.push("badge_x10");
    if (Number(stats.total_usd) >= 5000) autoBadges.push("badge_whale");
    for (const badge of autoBadges) {
      await db.query(`INSERT INTO user_items (user_id,item_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [targetId, badge]);
    }

    res.json({
      user:    { ...userQ.rows[0], level },
      profile: { ...profileQ.rows[0], owned_items: [...new Set([...items,...autoBadges])] },
      coins:   { balance, total_earned: Number(coins.total_earned) },
      stats:   { total_shipments:Number(stats.total_shipments), delivered:Number(stats.delivered), total_usd:Number(stats.total_usd) },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
