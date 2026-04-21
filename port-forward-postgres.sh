#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./port-forward-postgres.sh <dev|prod> <app|comments|all>

Examples:
  ./port-forward-postgres.sh dev app
  ./port-forward-postgres.sh dev comments
  ./port-forward-postgres.sh dev all
  ./port-forward-postgres.sh prod all

Default local ports:
  dev app       -> localhost:15432
  dev comments  -> localhost:15433
  prod app      -> localhost:25432
  prod comments -> localhost:25433

Stop access with Ctrl+C.
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

environment="$1"
database_group="$2"

case "$environment" in
  dev)
    context="kind-dev"
    app_service="postgres-dev"
    comments_service="comments-postgres-dev"
    app_port="15432"
    comments_port="15433"
    ;;
  prod)
    context="kind-prod"
    app_service="postgres-prod"
    comments_service="comments-postgres-prod"
    app_port="25432"
    comments_port="25433"
    ;;
  *)
    echo "Unsupported environment: $environment" >&2
    usage
    exit 1
    ;;
esac

if ! kubectl config get-contexts "$context" >/dev/null 2>&1; then
  echo "Kubernetes context not found: $context" >&2
  exit 1
fi

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}

trap cleanup EXIT INT TERM

start_forward() {
  local service_name="$1"
  local local_port="$2"

  echo "Forwarding ${service_name} on ${context} to localhost:${local_port}"
  kubectl port-forward \
    --context "$context" \
    "svc/${service_name}" \
    "${local_port}:5432" >/tmp/"${service_name}".port-forward.log 2>&1 &

  pids+=("$!")
}

case "$database_group" in
  app)
    start_forward "$app_service" "$app_port"
    ;;
  comments)
    start_forward "$comments_service" "$comments_port"
    ;;
  all)
    start_forward "$app_service" "$app_port"
    start_forward "$comments_service" "$comments_port"
    ;;
  *)
    echo "Unsupported database group: $database_group" >&2
    usage
    exit 1
    ;;
esac

echo
echo "Temporary access is active. Press Ctrl+C to stop."
echo

if [[ "$database_group" == "app" || "$database_group" == "all" ]]; then
  echo "${environment} app postgres:"
  echo "  host=127.0.0.1 port=${app_port}"
fi

if [[ "$database_group" == "comments" || "$database_group" == "all" ]]; then
  echo "${environment} comments postgres:"
  echo "  host=127.0.0.1 port=${comments_port}"
fi

wait
