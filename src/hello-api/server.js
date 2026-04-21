const express = require("express");
const client = require("prom-client");

const app = express();
const port = Number(process.env.PORT || 3000);
const serviceName = process.env.SERVICE_NAME || "hello-api";
const environment = process.env.APP_ENV || "unknown";
const metricPrefix = `${serviceName.replace(/[^a-zA-Z0-9]+/g, "_")}_`;

client.collectDefaultMetrics({ prefix: metricPrefix });

const helloRequestsTotal = new client.Counter({
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

  res.on("finish", () => {
    if (req.path === "/health") {
      healthcheckRequestsTotal.inc({
        method: req.method,
        status_code: String(res.statusCode),
      });
      healthcheckUp.set(res.statusCode < 500 ? 1 : 0);
    } else if (req.path !== "/metrics") {
      helloRequestsTotal.inc({
        route: req.path,
        method: req.method,
        status_code: String(res.statusCode),
      });
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        level: "info",
        service: serviceName,
        env: environment,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        message: "request completed",
      }),
    );
  });

  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: serviceName, env: environment });
});

app.get("/hello", (_req, res) => {
  res.json({
    message: "hello world",
    service: serviceName,
    env: environment,
  });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(port, () => {
  healthcheckUp.set(1);
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
