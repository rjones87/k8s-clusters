#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cluster_exists() {
  local cluster_name="$1"
  kind get clusters | grep -Fxq "$cluster_name"
}

context_exists() {
  local context_name="$1"
  kubectl config get-contexts "$context_name" >/dev/null 2>&1
}

load_into_cluster() {
  local image="$1"
  local cluster_name="$2"

  if cluster_exists "$cluster_name"; then
    echo "Loading ${image} into ${cluster_name}"
    kind load docker-image "${image}" --name "$cluster_name"
  else
    echo "Skipping ${cluster_name}; cluster does not exist"
  fi
}

build_and_load() {
  local image="$1"
  local service_dir="$2"

  echo "Building ${image} from ${service_dir}"
  docker build -t "${image}" "${ROOT_DIR}/${service_dir}"

  load_into_cluster "${image}" dev
  load_into_cluster "${image}" prod
}

restart_custom_workloads() {
  local context_name="$1"
  local environment="$2"

  if ! context_exists "$context_name"; then
    echo "Skipping rollout restarts for ${context_name}; context does not exist"
    return
  fi

  for deployment in \
    "hello-${environment}" \
    "comments-${environment}" \
    "api-docs-${environment}" \
    "comments-ui-${environment}"
  do
    if kubectl get deployment "$deployment" -n default --context "$context_name" >/dev/null 2>&1; then
      echo "Restarting ${deployment} in ${context_name}"
      kubectl rollout restart deployment/"$deployment" -n default --context "$context_name"
    else
      echo "Skipping ${deployment} in ${context_name}; deployment does not exist"
    fi
  done
}

build_and_load "hello-api:0.1.0" "src/hello-api"
build_and_load "comments-api:0.1.0" "src/comments-api"
build_and_load "api-docs-service:0.1.0" "src/api-docs-service"
build_and_load "comments-ui:0.1.0" "src/comments-ui"

restart_custom_workloads kind-dev dev
restart_custom_workloads kind-prod prod

echo "Custom images built and loaded into both clusters."
