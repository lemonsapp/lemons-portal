const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Falta DATABASE_URL en variables de entorno");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};