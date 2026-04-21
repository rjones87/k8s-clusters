#!/bin/zsh

set -euo pipefail

argocd_namespace="${ARGOCD_NAMESPACE:-argocd}"
argocd_install_url="${ARGOCD_INSTALL_URL:-https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml}"

clusters=(kind-dev kind-prod)

context_exists() {
  local context_name="$1"
  kubectl config get-contexts "$context_name" >/dev/null 2>&1
}

for context in "${clusters[@]}"; do
  if ! context_exists "$context"; then
    echo "Skipping ${context}; context does not exist"
    continue
  fi

  case "$context" in
    kind-dev)
      argocd_node_port=30180
      ;;
    kind-prod)
      argocd_node_port=30190
      ;;
    *)
      print -u2 "Unknown cluster context: $context"
      exit 1
      ;;
  esac

  kubectl get namespace "$argocd_namespace" --context "$context" >/dev/null 2>&1 \
    || kubectl create namespace "$argocd_namespace" --context "$context"

  kubectl apply \
    --server-side \
    --context "$context" \
    -n "$argocd_namespace" \
    -f "$argocd_install_url"

  kubectl rollout status \
    deployment/argocd-server \
    --context "$context" \
    -n "$argocd_namespace" \
    --timeout=180s

  kubectl patch service argocd-server \
    --context "$context" \
    -n "$argocd_namespace" \
    --type merge \
    -p "{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"name\":\"https\",\"port\":443,\"protocol\":\"TCP\",\"targetPort\":8080,\"nodePort\":${argocd_node_port}}]}}"
done
