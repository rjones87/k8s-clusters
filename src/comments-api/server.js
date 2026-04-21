const { currentTraceFields, startTracing } = require("./tracing");
startTracing();

const express = require("express");
const { Pool } = require("pg");
const client = require("prom-client");

const app = express();
app.use(express.json());

const port = Number(process.env.PORT || 3000);
const serviceName = process.env.SERVICE_NAME || "comments-api";
const environment = process.env.APP_ENV || "unknown";
const metricPrefix = `${serviceName.replace(/[^a-zA-Z0-9]+/g, "_")}_`;

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 5432);
const dbName = process.env.DB_NAME || "comments";
const dbUser = process.env.DB_USER || "commentsuser";
const dbPassword = process.env.DB_PASSWORD || "commentspassword";
const dbSsl = process.env.DB_SSL === "true";

client.collectDefaultMetrics({ prefix: metricPrefix });

const apiRequestsTotal = new client.Counter({
  name: `${metricPrefix}requests_total`,
  help: "Total number of non-health, non-metrics API requests",
  labelNames: ["route", "method", "status_code"],
});

const healthcheckUp = new client.Gauge({
  name: `${metricPrefix}healthcheck_up`,
  help: "Reports 1 when the service is healthy enough to answer health checks",
});

const healthcheckRequestsTotal = new client.Counter({
  name: `${metricPrefix}healthcheck_requests_total`,
  help: "Total number of health check requests",
  labelNames: ["method", "status_code"],
});

const crudOperationsTotal = new client.Counter({
  name: `${metricPrefix}crud_operations_total`,
  help: "Total number of CRUD operations against comments",
  labelNames: ["operation", "status_code"],
});

const apiLatencySeconds = new client.Histogram({
  name: `${metricPrefix}api_latency_seconds`,
  help: "Latency for API requests in seconds",
  labelNames: ["route", "method", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const crudLatencySeconds = new client.Histogram({
  name: `${metricPrefix}crud_latency_seconds`,
  help: "Latency for comment CRUD operations in seconds",
  labelNames: ["operation", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const commentsCount = new client.Gauge({
  name: `${metricPrefix}comments_count`,
  help: "Current number of comments stored in the database",
});

healthcheckUp.set(0);

function baseDbConfig(database) {
  return {
    host: dbHost,
    port: dbPort,
    database,
    user: dbUser,
    password: dbPassword,
    ssl: dbSsl ? { rejectUnauthorized: false } : false,
  };
}

let pool;

function secondsSince(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function observeCrud(operation, statusCode, startedAt) {
  const status = String(statusCode);
  crudOperationsTotal.inc({ operation, status_code: status });
  crudLatencySeconds.observe(
    { operation, status_code: status },
    secondsSince(startedAt),
  );
}

async function ensureDatabaseAndSchema() {
  const adminPool = new Pool(baseDbConfig("postgres"));

  try {
    await adminPool.query(
      `CREATE DATABASE ${dbName.replace(/"/g, "\"\"")}`,
    );
  } catch (error) {
    if (error.code !== "42P04") {
      throw error;
    }
  } finally {
    await adminPool.end();
  }

  pool = new Pool(baseDbConfig(dbName));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function refreshCommentsCount() {
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM comments");
  commentsCount.set(result.rows[0].count);
}

function logRequest(req, res, durationMs) {
  const traceFields = currentTraceFields();

  console.log(
    JSON.stringify({
      level: "info",
      service: serviceName,
      env: environment,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      kongRequestId: req.get("x-kong-request-id") || null,
      traceId: traceFields.traceId,
      spanId: traceFields.spanId,
      message: "request completed",
    }),
  );
}

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = secondsSince(startedAt);
    const statusCode = String(res.statusCode);

    if (req.path === "/health") {
      healthcheckRequestsTotal.inc({
        method: req.method,
        status_code: statusCode,
      });
      healthcheckUp.set(res.statusCode < 500 ? 1 : 0);
    } else if (req.path !== "/metrics") {
      apiRequestsTotal.inc({
        route: req.route?.path || req.path,
        method: req.method,
        status_code: statusCode,
      });

      apiLatencySeconds.observe(
        {
          route: req.route?.path || req.path,
          method: req.method,
          status_code: statusCode,
        },
        durationSeconds,
      );
    }

    logRequest(req, res, durationSeconds * 1000);
  });

  next();
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    healthcheckUp.set(1);
    res.json({ ok: true, service: serviceName, env: environment });
  } catch (error) {
    healthcheckUp.set(0);
    res.status(503).json({
      ok: false,
      service: serviceName,
      env: environment,
      error: "database unavailable",
    });
  }
});

app.get("/comments", async (_req, res, next) => {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(`
      SELECT id, author, message, created_at, updated_at
      FROM comments
      ORDER BY id ASC
    `);
    res.json(result.rows);
    observeCrud("list", 200, startedAt);
  } catch (error) {
    observeCrud("list", 500, startedAt);
    next(error);
  }
});

app.get("/comments/:id", async (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(
      `
        SELECT id, author, message, created_at, updated_at
        FROM comments
        WHERE id = $1
      `,
      [Number(req.params.id)],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "comment not found" });
      observeCrud("get", 404, startedAt);
      return;
    }

    res.json(result.rows[0]);
    observeCrud("get", 200, startedAt);
  } catch (error) {
    observeCrud("get", 500, startedAt);
    next(error);
  }
});

app.post("/comments", async (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const { author, message } = req.body || {};

  if (!author || !message) {
    res.status(400).json({ error: "author and message are required" });
    observeCrud("create", 400, startedAt);
    return;
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO comments (author, message)
        VALUES ($1, $2)
        RETURNING id, author, message, created_at, updated_at
      `,
      [author, message],
    );

    await refreshCommentsCount();
    res.status(201).json(result.rows[0]);
    observeCrud("create", 201, startedAt);
  } catch (error) {
    observeCrud("create", 500, startedAt);
    next(error);
  }
});

app.put("/comments/:id", async (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const { author, message } = req.body || {};

  if (!author || !message) {
    res.status(400).json({ error: "author and message are required" });
    observeCrud("update", 400, startedAt);
    return;
  }

  try {
    const result = await pool.query(
      `
        UPDATE comments
        SET author = $1, message = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, author, message, created_at, updated_at
      `,
      [author, message, Number(req.params.id)],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "comment not found" });
      observeCrud("update", 404, startedAt);
      return;
    }

    await refreshCommentsCount();
    res.json(result.rows[0]);
    observeCrud("update", 200, startedAt);
  } catch (error) {
    observeCrud("update", 500, startedAt);
    next(error);
  }
});

app.delete("/comments/:id", async (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(
      "DELETE FROM comments WHERE id = $1 RETURNING id",
      [Number(req.params.id)],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "comment not found" });
      observeCrud("delete", 404, startedAt);
      return;
    }

    await refreshCommentsCount();
    res.status(204).send();
    observeCrud("delete", 204, startedAt);
  } catch (error) {
    observeCrud("delete", 500, startedAt);
    next(error);
  }
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.use((error, req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    console.error(
      JSON.stringify({
        level: "warn",
        service: serviceName,
        env: environment,
        kongRequestId: req.get("x-kong-request-id") || null,
        traceId: currentTraceFields().traceId,
        spanId: currentTraceFields().spanId,
        message: "invalid json request body",
        error: error.message,
      }),
    );

    res.status(400).json({
      error: "invalid JSON request body",
      details: error.message,
    });
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      service: serviceName,
      env: environment,
      kongRequestId: req.get("x-kong-request-id") || null,
      traceId: currentTraceFields().traceId,
      spanId: currentTraceFields().spanId,
      message: "request failed",
      error: error.message,
    }),
  );

  res.status(500).json({ error: "internal server error" });
});

async function start() {
  let attempts = 0;

  while (attempts < 30) {
    try {
      await ensureDatabaseAndSchema();
      await refreshCommentsCount();
      healthcheckUp.set(1);
      break;
    } catch (error) {
      attempts += 1;
      console.error(
        JSON.stringify({
          level: "warn",
        service: serviceName,
        env: environment,
        attempt: attempts,
        traceId: null,
        spanId: null,
        message: "database setup failed, retrying",
        error: error.message,
        }),
      );

      if (attempts >= 30) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  app.listen(port, () => {
    console.log(
      JSON.stringify({
        level: "info",
        service: serviceName,
        env: environment,
        port,
        traceId: null,
        spanId: null,
        message: "service started",
      }),
    );
  });
}

start().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      service: serviceName,
      env: environment,
      traceId: null,
      spanId: null,
      message: "service failed to start",
      error: error.message,
    }),
  );
  process.exit(1);
});
