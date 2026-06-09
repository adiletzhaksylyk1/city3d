/**
 * index.js — Node.js / Express API server entry point.
 *
 * Layer 3 of the 3D city visualisation system.
 *
 * Endpoints:
 *   GET /api/buildings?bbox=minLon,minLat,maxLon,maxLat[&lod=0-4]
 *   GET /api/buildings/extent
 *   GET /api/buildings/count?bbox=...
 *   GET /api/streets?bbox=minLon,minLat,maxLon,maxLat
 *   GET /health
 */

"use strict";

require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const morgan    = require("morgan");

const buildingsRouter = require("./routes/buildings");
const streetsRouter   = require("./routes/streets");
const { pool }        = require("./db");

const app  = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Middleware ─────────────────────────────────────────────────────────────────

// Allow the Three.js client (running on a different port) to call this API
app.use(cors({
  origin: [
    "http://localhost:5173",   // Vite dev server
    "http://localhost:3001",   // alternate client port
  ],
  methods: ["GET"],
}));

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────────

app.use("/api/buildings", buildingsRouter);
app.use("/api/streets",   streetsRouter);

/**
 * GET /health
 * Health check used by Docker Compose and load balancers.
 */
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status:   "ok",
      database: "connected",
      uptime:   process.uptime(),
    });
  } catch (err) {
    res.status(503).json({
      status:   "error",
      database: "disconnected",
      message:  err.message,
    });
  }
});

/**
 * GET /
 * API index — lists available endpoints.
 */
app.get("/", (req, res) => {
  res.json({
    name:    "3D City API",
    version: "1.0.0",
    endpoints: {
      buildings: {
        viewport: "GET /api/buildings?bbox=minLon,minLat,maxLon,maxLat",
        extent:   "GET /api/buildings/extent",
        count:    "GET /api/buildings/count?bbox=...",
      },
      streets: {
        viewport: "GET /api/streets?bbox=minLon,minLat,maxLon,maxLat",
      },
      health: "GET /health",
    },
    example: "/api/buildings?bbox=71.4,51.1,71.5,51.2",
  });
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[app] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[api] 3D City API listening on http://localhost:${PORT}`);
  console.log(`[api] Database: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "city3d"}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[api] ${signal} received — shutting down…`);
  server.close(() => {
    pool.end().then(() => {
      console.log("[api] Database pool closed.");
      process.exit(0);
    });
  });
  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

module.exports = app;
