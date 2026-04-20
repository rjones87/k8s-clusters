#!/bin/zsh

set -euo pipefail

script_dir=${0:A:h}

: "${ARGOCD_REPO_URL:?Set ARGOCD_REPO_URL to the Git repository URL Argo CD should sync from.}"

argocd_namespace="${ARGOCD_NAMESPACE:-argocd}"
argocd_target_revision="${ARGOCD_TARGET_REVISION:-HEAD}"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

escape_for_sed() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//&/\\&}
  value=${value//|/\\|}
  print -r -- "$value"
}

render_application() {
  local template_path="$1"
  local output_path="$2"
  local repo_url_escaped namespace_escaped revision_escaped

  repo_url_escaped=$(escape_for_sed "$ARGOCD_REPO_URL")
  namespace_escaped=$(escape_for_sed "$argocd_namespace")
  revision_escaped=$(escape_for_sed "$argocd_target_revision")

  sed \
    -e "s|__ARGOCD_REPO_URL__|${repo_url_escaped}|g" \
    -e "s|__ARGOCD_NAMESPACE__|${namespace_escaped}|g" \
    -e "s|__ARGOCD_TARGET_REVISION__|${revision_escaped}|g" \
    "$template_path" > "$output_path"
}

render_application \
  "$script_dir/argocd/hello-dev-application.yaml" \
  "$tmp_dir/hello-dev-application.yaml"
render_application \
  "$script_dir/argocd/hello-prod-application.yaml" \
  "$tmp_dir/hello-prod-application.yaml"

kubectl apply --context kind-dev -f "$tmp_dir/hello-dev-application.yaml"
kubectl apply --context kind-prod -f "$tmp_dir/hello-prod-application.yaml"
