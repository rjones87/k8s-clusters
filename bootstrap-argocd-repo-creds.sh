#!/bin/zsh

set -euo pipefail

repo_url="${ARGOCD_REPO_URL:-git@github.com:rjones87/k8s-clusters.git}"
argocd_namespace="${ARGOCD_NAMESPACE:-argocd}"
ssh_key_path="${ARGOCD_SSH_KEY_PATH:-$HOME/.ssh/argocd-k8s-clusters}"

if [[ ! -f "$ssh_key_path" ]]; then
  print -u2 "SSH private key not found: $ssh_key_path"
  print -u2 "Generate it first or set ARGOCD_SSH_KEY_PATH."
  exit 1
fi

ssh_private_key=$(<"$ssh_key_path")

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

  kubectl create secret generic repo-k8s-clusters-ssh \
    --context "$context" \
    -n "$argocd_namespace" \
    --from-literal=type=git \
    --from-literal=url="$repo_url" \
    --from-literal=sshPrivateKey="$ssh_private_key" \
    --dry-run=client -o yaml \
    | kubectl label --local -f - argocd.argoproj.io/secret-type=repository -o yaml \
    | kubectl apply --context "$context" -f -
done
