const { Pool } = require("pg");

const isProd = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[PG] Unexpected error on idle client", err);
});

module.exports = pool;