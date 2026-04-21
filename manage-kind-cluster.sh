#!/bin/zsh

set -euo pipefail

script_dir=${0:A:h}

usage() {
  cat <<'EOF'
Usage:
  ./manage-kind-cluster.sh delete <dev|prod>
  ./manage-kind-cluster.sh create <dev|prod>
  ./manage-kind-cluster.sh recreate <dev|prod>

Examples:
  ./manage-kind-cluster.sh delete prod
  ./manage-kind-cluster.sh create prod
  ./manage-kind-cluster.sh recreate dev
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

action="$1"
cluster_name="$2"

case "$cluster_name" in
  dev)
    config_path="$script_dir/kind-dev.yaml"
    ;;
  prod)
    config_path="$script_dir/kind-prod.yaml"
    ;;
  *)
    echo "Unsupported cluster: $cluster_name" >&2
    usage
    exit 1
    ;;
esac

delete_cluster() {
  kind delete cluster --name "$cluster_name"
}

create_cluster() {
  kind create cluster --name "$cluster_name" --config "$config_path"
}

case "$action" in
  delete)
    delete_cluster
    ;;
  create)
    create_cluster
    ;;
  recreate)
    kind delete cluster --name "$cluster_name" || true
    create_cluster
    ;;
  *)
    echo "Unsupported action: $action" >&2
    usage
    exit 1
    ;;
esac
