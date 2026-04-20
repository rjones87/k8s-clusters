#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_and_load() {
  local image="$1"
  local service_dir="$2"

  echo "Building ${image} from ${service_dir}"
  docker build -t "${image}" "${ROOT_DIR}/${service_dir}"

  echo "Loading ${image} into dev"
  kind load docker-image "${image}" --name dev

  echo "Loading ${image} into prod"
  kind load docker-image "${image}" --name prod
}

build_and_load "hello-api:0.1.0" "src/hello-api"

echo "Custom images built and loaded into both clusters."
