const { context, trace } = require("@opentelemetry/api");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  ATTR_DEPLOYMENT_ENVIRONMENT,
  ATTR_SERVICE_NAME,
} = require("@opentelemetry/semantic-conventions");

let sdkStarted = false;

function tracingEndpoint() {
  return (
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://tempo.observability.svc.cluster.local:4318/v1/traces"
  );
}

function startTracing() {
  if (sdkStarted || process.env.OTEL_SDK_DISABLED === "true") {
    return;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ||
        process.env.SERVICE_NAME ||
        "comments-api",
      [ATTR_DEPLOYMENT_ENVIRONMENT]:
        process.env.APP_ENV || process.env.NODE_ENV || "unknown",
    }),
    traceExporter: new OTLPTraceExporter({
      url: tracingEndpoint(),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();
  sdkStarted = true;
}

function currentTraceFields() {
  const span = trace.getSpan(context.active());
  if (!span) {
    return { traceId: null, spanId: null };
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

module.exports = {
  currentTraceFields,
  startTracing,
};
