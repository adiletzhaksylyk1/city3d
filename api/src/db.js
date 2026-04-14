/**
 * db.js — PostgreSQL connection pool (pg library).
 *
 * A single pool is shared across all route handlers.
 * The pool is configured from environment variables so credentials
 * are never committed to source control.
 */

"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME     || "city3d",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max:      10,          // maximum pool size
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/**
 * Execute a parameterised SQL query.
 * @param {string} sql
 * @param {Array}  params
 * @returns {Promise<pg.QueryResult>}
 */
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

module.exports = { pool, query };
