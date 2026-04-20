# Custom Service Guide

This `src/` directory is where custom application images live.

Each service should have its own directory:

- `src/<service-name>/`

Each service directory should contain at least:

- `Dockerfile`
- `.dockerignore`
- `package.json`
- application source files

## Required service contract

Every new service added under `src/` should follow these rules:

1. Expose an HTTP API for the business endpoint.
2. Expose Prometheus metrics on `GET /metrics`.
3. Expose a lightweight health check on `GET /health`.
4. Log to `stdout` and `stderr` so Alloy can ship logs to Loki.
5. Add Prometheus pod annotations so the in-cluster Prometheus instance can scrape metrics.
6. Prefix every metric name with a service-specific prefix.
7. Add a Kubernetes `Deployment` and `Service` in both:
   - `workloads/dev/app/`
   - `workloads/prod/app/`
8. Add a Kong route in both:
   - `workloads/dev/app/kong.yaml`
   - `workloads/prod/app/kong.yaml`

## Directory template

Use this structure for each service:

```text
src/
  <service-name>/
    Dockerfile
    .dockerignore
    package.json
    server.js
```

## Build and load workflow

Argo CD only applies Kubernetes manifests. It does not build local images.

For custom images in this repo:

1. Build the image locally.
2. Load the image into each `kind` cluster.
3. Commit and push the Kubernetes manifest changes.
4. Let Argo CD sync the manifests.

This repo includes `build-custom-images.sh` to handle steps 1 and 2 for known
services.

## Kubernetes deployment pattern

Each service deployment should include:

- `imagePullPolicy: IfNotPresent`
- container port for the app
- liveness or readiness probes where practical
- Prometheus annotations on the pod template:

```yaml
prometheus.io/scrape: "true"
prometheus.io/path: /metrics
prometheus.io/port: "3000"
```

## Kong routing pattern

Expose new services through Kong using a stable external prefix:

- internal service path can stay native to the app
- external path should be namespaced under `/api/...`

Example:

- app endpoint: `/hello`
- Kong public route: `/api/hello`

## Logs and metrics

- Logs: Alloy already collects pod logs from Kubernetes and pushes them to Loki.
- Metrics: Prometheus scrapes annotated pods, and Grafana can query Prometheus.
- Metric names should be prefixed with the service name. For example, a service
  named `orders-api` should emit metrics such as:
  - `orders_api_requests_total`
  - `orders_api_process_cpu_seconds_total`
  - `orders_api_nodejs_eventloop_lag_seconds`

If a service writes structured JSON logs, keep them on `stdout`. Do not write
logs to local files inside the container.

## Example

`src/hello-api/` is the reference implementation for new services in this repo.
