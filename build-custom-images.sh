#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cluster_exists() {
  local cluster_name="$1"
  kind get clusters | grep -Fxq "$cluster_name"
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

build_and_load "hello-api:0.1.0" "src/hello-api"
build_and_load "comments-api:0.1.0" "src/comments-api"
build_and_load "api-docs-service:0.1.0" "src/api-docs-service"

echo "Custom images built and loaded into both clusters."
