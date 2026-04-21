#!/bin/zsh

set -euo pipefail

script_dir=${0:A:h}

argocd_repo_url="${ARGOCD_REPO_URL:-git@github.com:rjones87/k8s-clusters.git}"
argocd_namespace="${ARGOCD_NAMESPACE:-argocd}"
argocd_target_revision="${ARGOCD_TARGET_REVISION:-master}"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

context_exists() {
  local context_name="$1"
  kubectl config get-contexts "$context_name" >/dev/null 2>&1
}

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

  repo_url_escaped=$(escape_for_sed "$argocd_repo_url")
  namespace_escaped=$(escape_for_sed "$argocd_namespace")
  revision_escaped=$(escape_for_sed "$argocd_target_revision")

  sed \
    -e "s|__ARGOCD_REPO_URL__|${repo_url_escaped}|g" \
    -e "s|__ARGOCD_NAMESPACE__|${namespace_escaped}|g" \
    -e "s|__ARGOCD_TARGET_REVISION__|${revision_escaped}|g" \
    "$template_path" > "$output_path"
}

for application in \
  dev-app \
  dev-db \
  dev-obs \
  prod-app \
  prod-db \
  prod-obs
do
  render_application \
    "$script_dir/argocd/${application}-application.yaml" \
    "$tmp_dir/${application}-application.yaml"
done

if context_exists kind-dev; then
  kubectl apply --context kind-dev -f "$tmp_dir/dev-app-application.yaml"
  kubectl apply --context kind-dev -f "$tmp_dir/dev-db-application.yaml"
  kubectl apply --context kind-dev -f "$tmp_dir/dev-obs-application.yaml"
else
  echo "Skipping kind-dev; context does not exist"
fi

if context_exists kind-prod; then
  kubectl apply --context kind-prod -f "$tmp_dir/prod-app-application.yaml"
  kubectl apply --context kind-prod -f "$tmp_dir/prod-db-application.yaml"
  kubectl apply --context kind-prod -f "$tmp_dir/prod-obs-application.yaml"
else
  echo "Skipping kind-prod; context does not exist"
fi
