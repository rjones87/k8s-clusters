#!/bin/zsh

set -euo pipefail

script_dir=${0:A:h}

clusters=(
  "dev:$script_dir/kind-dev.yaml"
  "prod:$script_dir/kind-prod.yaml"
)

for entry in "${clusters[@]}"; do
  cluster_name="${entry%%:*}"
  config_path="${entry#*:}"

  kind delete cluster --name "$cluster_name" || true
  kind create cluster --name "$cluster_name" --config "$config_path"
done
