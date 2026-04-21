const express = require("express");
const client = require("prom-client");
const swaggerUi = require("swagger-ui-express");
const openApiDocument = require("./openapi.json");

const app = express();
const port = Number(process.env.PORT || 3000);
const serviceName = process.env.SERVICE_NAME || "api-docs-service";
const environment = process.env.APP_ENV || "unknown";
const metricPrefix = `${serviceName.replace(/[^a-zA-Z0-9]+/g, "_")}_`;

client.collectDefaultMetrics({ prefix: metricPrefix });

const requestsTotal = new client.Counter({
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

healthcheckUp.set(1);

app.use((req, res, next) => {
  const startedAt = Date.now();
  const kongRequestId = req.get("x-kong-request-id") || null;

  res.on("finish", () => {
    if (req.path === "/health") {
      healthcheckRequestsTotal.inc({
        method: req.method,
        status_code: String(res.statusCode),
      });
      healthcheckUp.set(res.statusCode < 500 ? 1 : 0);
    } else if (req.path !== "/metrics") {
      requestsTotal.inc({
        route: req.route?.path || req.path,
        method: req.method,
        status_code: String(res.statusCode),
      });
    }

    console.log(
      JSON.stringify({
        level: "info",
        service: serviceName,
        env: environment,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        kongRequestId,
        message: "request completed",
      }),
    );
  });

  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: serviceName, env: environment });
});

app.get("/docs/api/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

app.use(
  "/docs/api",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    explorer: true,
    swaggerOptions: {
      docExpansion: "list",
      persistAuthorization: true,
    },
  }),
);

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      service: serviceName,
      env: environment,
      port,
      message: "service started",
    }),
  );
});
