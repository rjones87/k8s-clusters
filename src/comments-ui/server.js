const { currentTraceFields, startTracing } = require("./tracing");
startTracing();

const http = require("http");
const next = require("next");
const client = require("prom-client");

const dev = false;
const app = next({ dev });
const handle = app.getRequestHandler();

const port = Number(process.env.PORT || 3000);
const serviceName = process.env.SERVICE_NAME || "comments-ui";
const environment = process.env.APP_ENV || "unknown";
const metricPrefix = `${serviceName.replace(/[^a-zA-Z0-9]+/g, "_")}_`;

client.collectDefaultMetrics({ prefix: metricPrefix });

const requestsTotal = new client.Counter({
  name: `${metricPrefix}requests_total`,
  help: "Total number of non-health, non-metrics requests handled by the UI",
  labelNames: ["route", "method", "status_code"],
});

const healthcheckUp = new client.Gauge({
  name: `${metricPrefix}healthcheck_up`,
  help: "Reports 1 when the UI service is healthy enough to answer health checks",
});

const healthcheckRequestsTotal = new client.Counter({
  name: `${metricPrefix}healthcheck_requests_total`,
  help: "Total number of health check requests",
  labelNames: ["method", "status_code"],
});

healthcheckUp.set(1);

app
  .prepare()
  .then(() => {
    const server = http.createServer(async (req, res) => {
      const startedAt = Date.now();
      const kongRequestId = req.headers["x-kong-request-id"] || null;

      const logRequest = () => {
        const traceFields = currentTraceFields();

        console.log(
          JSON.stringify({
            level: "info",
            service: serviceName,
            env: environment,
            method: req.method,
            path: req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            kongRequestId,
            traceId: traceFields.traceId,
            spanId: traceFields.spanId,
            message: "request completed",
          }),
        );
      };

      try {
        if (req.url === "/health") {
          healthcheckRequestsTotal.inc({
            method: req.method || "GET",
            status_code: "200",
          });
          healthcheckUp.set(1);
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(
            JSON.stringify({ ok: true, service: serviceName, env: environment }),
          );
          logRequest();
          return;
        }

        if (req.url === "/metrics") {
          res.setHeader("Content-Type", client.register.contentType);
          res.statusCode = 200;
          res.end(await client.register.metrics());
          logRequest();
          return;
        }

        res.on("finish", () => {
          if (req.url !== "/health" && req.url !== "/metrics") {
            requestsTotal.inc({
              route: req.url || "/",
              method: req.method || "GET",
              status_code: String(res.statusCode),
            });
          }
          logRequest();
        });

        await handle(req, res);
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            service: serviceName,
            env: environment,
            method: req.method,
            path: req.url,
            kongRequestId,
            traceId: currentTraceFields().traceId,
            spanId: currentTraceFields().spanId,
            message: "request failed",
            error: error.message,
          }),
        );
        healthcheckUp.set(0);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "internal server error" }));
      }
    });

    server.listen(port, () => {
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
  })
  .catch((error) => {
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
