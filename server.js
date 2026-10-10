"use strict";

/**
 * VidFetch production Node/Express entrypoint.
 * Next handles the React UI and shared API routes, including the backpressure-aware
 * media stream. Keeping a single implementation prevents extractor fixes from
 * diverging between `npm run start` and `node server.js` deployments.
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("node:http");
const next = require("next");

async function main() {
  const port = Number(process.env.PORT || 5000);
  const dev = process.env.NODE_ENV !== "production";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");
  const origins = new Set((process.env.CORS_ORIGIN || "https://vidfetch.io").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
  if (dev) ["http://localhost:3000", "http://localhost:5000", "http://localhost:5173", "http://127.0.0.1:3000"].forEach((origin) => origins.add(origin));
  const frontend = next({ dev, hostname: "0.0.0.0", port });
  await frontend.prepare();
  const handle = frontend.getRequestHandler();
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin.replace(/\/$/, ""))) return callback(null, true);
      const error = new Error("This origin is not allowed to access VidFetch.");
      error.status = 403;
      return callback(error);
    },
    methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"],
    exposedHeaders: ["Content-Disposition", "X-VidFetch-Platform", "X-VidFetch-Transfer"], maxAge: 86400,
  }));
  // Do not parse the request body here: the shared Next API handlers read it once.
  app.use((request, response, nextError) => {
    if (request.path.startsWith("/api/download")) response.setTimeout(0);
    Promise.resolve(handle(request, response)).catch(nextError);
  });
  app.use((error, _request, response, _next) => {
    if (response.headersSent) { response.destroy(error); return; }
    const status = error.status === 403 ? 403 : 500;
    console.error("[vidfetch] HTTP request failed:", error.message);
    response.status(status).json({ ok: false, code: status === 403 ? "FORBIDDEN_ORIGIN" : "SERVER_ERROR", error: status === 403 ? error.message : "The server could not complete this request." });
  });
  const server = http.createServer(app);
  server.requestTimeout = 0;
  server.timeout = 0;
  server.headersTimeout = 60000;
  server.keepAliveTimeout = 65000;
  server.listen(port, "0.0.0.0", () => console.log(`[vidfetch] Listening on port ${port}; allowed origins: ${[...origins].join(", ")}`));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      console.log(`[vidfetch] ${signal}: shutting down.`);
      server.close(() => { void frontend.close().then(() => process.exit(0)); });
      setTimeout(() => process.exit(0), 15000).unref();
    });
  }
}

main().catch((error) => { console.error("[vidfetch] Startup failed:", error); process.exit(1); });
