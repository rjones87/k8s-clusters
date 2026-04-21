#!/usr/bin/env bash

set -euo pipefail

context="${1:-kind-dev}"
namespace="${CHAOS_MESH_NAMESPACE:-chaos-mesh}"
release_name="${CHAOS_MESH_RELEASE:-chaos-mesh}"

if ! command -v helm >/dev/null 2>&1; then
  echo "helm is required but not installed" >&2
  exit 1
fi

if ! kubectl config get-contexts "$context" >/dev/null 2>&1; then
  echo "Kubernetes context not found: $context" >&2
  exit 1
fi

helm repo add chaos-mesh https://charts.chaos-mesh.org >/dev/null 2>&1 || true
helm repo update >/dev/null

kubectl create namespace "$namespace" --context "$context" >/dev/null 2>&1 || true

helm upgrade --install "$release_name" chaos-mesh/chaos-mesh \
  --kube-context "$context" \
  --namespace "$namespace" \
  --set controllerManager.replicaCount=1 \
  --set chaosDaemon.runtime=containerd \
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock

kubectl patch deployment chaos-controller-manager \
  --context "$context" \
  -n "$namespace" \
  --type json \
  --patch "$(cat <<'JSON'
[
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/command",
    "value": [
      "sh",
      "-c",
      "ulimit -n 65535 && exec /usr/local/bin/chaos-controller-manager"
    ]
  }
]
JSON
)"

kubectl rollout status deployment/chaos-dashboard \
  --context "$context" \
  -n "$namespace" \
  --timeout=180s

kubectl rollout status deployment/chaos-dns-server \
  --context "$context" \
  -n "$namespace" \
  --timeout=180s

kubectl rollout status deployment/chaos-controller-manager \
  --context "$context" \
  -n "$namespace" \
  --timeout=180s

echo
echo "Chaos Mesh installed on ${context} in namespace ${namespace}."
echo "Open the dashboard with:"
echo "  kubectl port-forward -n ${namespace} --context ${context} svc/chaos-dashboard 2333:2333"
