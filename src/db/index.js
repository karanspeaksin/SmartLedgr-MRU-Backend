// src/db/index.js — PostgreSQL connection pool
const { Pool } = require("pg");
require("dotenv").config();

// Railway / Render inject DATABASE_URL automatically
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Railway/Render
      max: 20,
      idleTimeoutMillis: 30000,
    })
  : new Pool({
      host:     process.env.DB_HOST     || "localhost",
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || "smartledgr",
      user:     process.env.DB_USER     || "postgres",
      password: process.env.DB_PASSWORD || "password",
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
