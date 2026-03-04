// src/server.js — SmartLedgr API Server
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const db      = require("./db");

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ─────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ── Health Check ───────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

// ── API Routes ─────────────────────────────────
app.use("/api/auth",                              require("./routes/auth"));
app.use("/api/currency",                          require("./routes/currency"));
app.use("/api/companies/:companyId/contacts",     require("./routes/contacts"));
app.use("/api/companies/:companyId/invoices",     require("./routes/invoices"));
app.use("/api/companies/:companyId/cashbooks",    require("./routes/cashbook"));
app.use("/api/companies/:companyId/journals",     require("./routes/journals"));
app.use("/api/companies/:companyId/reconciliations", require("./routes/reconciliation"));
app.use("/api/companies/:companyId",              require("./routes/master"));

// ── 404 handler ────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ───────────────────────
app.use((err, _req, res, _next) => {
  console.error("❌ Server error:", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// ── Start ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SmartLedgr API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Mode:   ${process.env.NODE_ENV || "development"}\n`);
});

module.exports = app;
